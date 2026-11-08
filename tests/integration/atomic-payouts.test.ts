/**
 * Integration tests for supabase/migrations/20261108000000_atomic_payouts.sql against the
 * real local database:
 *  - pay_fix_reward: pays a post's STORED reward exactly once (also under concurrency),
 *    with the documented errors, rolling back on failure;
 *  - credit_deposit: pending -> completed + balance credit exactly once, NULL otherwise;
 *  - both are service_role only;
 *  - protect_post_financial_fields pins payout / funding / ownership columns for user sessions;
 *  - a funding invoice (funding_r_hash) can fund only one (new) post;
 *  - lib/payouts.ts payFixReward / isPostRewardFunded map real PostgREST results correctly.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect, afterEach } from 'vitest'
import { seedUser, queryDB, queryOne } from './helpers'
import { getServiceClient, getAuthenticatedClient, getAnonClient } from './helpers/db-client'
import { payFixReward, isPostRewardFunded } from '@/lib/payouts'

const createdPostIds: string[] = []

async function seedPost(overrides: Record<string, any> = {}) {
  const id = overrides.id ?? crypto.randomUUID()
  const row = {
    id,
    title: 'Payout test post',
    description: 'Payout test post',
    reward: 1000,
    fixed: false,
    ...overrides,
  }
  const cols = Object.keys(row)
  await queryDB(
    `INSERT INTO posts (${cols.join(', ')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
    cols.map(c => (row as any)[c])
  )
  createdPostIds.push(id)
  return id
}

async function seedDeposit(userId: string, amount: number, status = 'pending') {
  const row = await queryOne<{ id: string }>(
    `INSERT INTO transactions (user_id, type, amount, status, r_hash_str, memo)
     VALUES ($1, 'deposit', $2, $3, $4, 'test deposit') RETURNING id`,
    [userId, amount, status, crypto.randomUUID().replace(/-/g, '')]
  )
  return row.id
}

const profile = (id: string) =>
  queryOne<{ balance: number; pet_coins: number; fixed_issues_count: number }>(
    'SELECT balance, pet_coins, fixed_issues_count FROM profiles WHERE id = $1',
    [id]
  )
const post = (id: string) =>
  queryOne<Record<string, any>>('SELECT * FROM posts WHERE id = $1', [id])
const rewardTxs = (userId: string) =>
  queryDB<{ id: string; amount: number; type: string; status: string; memo: string }>(
    `SELECT id, amount, type, status, memo FROM transactions WHERE user_id = $1 AND type = 'internal'`,
    [userId]
  )

afterEach(async () => {
  if (createdPostIds.length) {
    // Posts may reference tracked users via reward_paid_to / fixed_by; delete them first
    await queryDB('DELETE FROM posts WHERE id = ANY($1::uuid[])', [createdPostIds])
    createdPostIds.length = 0
  }
})

// ============================================================================
describe('pay_fix_reward', () => {
  it('credits the stored reward once, records the payout and returns the new balance', async () => {
    const owner = await seedUser({ balance: 0 })
    const fixer = await seedUser({ balance: 500, petCoins: 200 })
    const before = await profile(fixer.id)
    const postId = await seedPost({ user_id: owner.id, reward: 1000 })

    const { data, error } = await getServiceClient().rpc('pay_fix_reward' as any, {
      p_post_id: postId,
      p_fixer_id: fixer.id,
      p_memo: 'Fix reward earned: test',
    })

    expect(error).toBeNull()
    const row = (data as any[])[0]
    expect(row).toMatchObject({ amount: 1000, new_balance: 1500 })
    expect(await profile(fixer.id)).toEqual({ balance: 1500, pet_coins: 1200, fixed_issues_count: before.fixed_issues_count + 1 })
    const p = await post(postId)
    expect(p.reward_paid_at).toBeTruthy()
    expect(p.reward_paid_to).toBe(fixer.id)
    expect(await rewardTxs(fixer.id)).toEqual([
      { id: row.transaction_id, amount: 1000, type: 'internal', status: 'completed', memo: 'Fix reward earned: test' },
    ])
  })

  it('refuses to pay twice (reward_already_paid) and changes nothing the second time', async () => {
    const fixer = await seedUser({ balance: 0 })
    const postId = await seedPost({ reward: 700 })
    const service = getServiceClient()

    await service.rpc('pay_fix_reward' as any, { p_post_id: postId, p_fixer_id: fixer.id, p_memo: 'first' })
    const { data, error } = await service.rpc('pay_fix_reward' as any, { p_post_id: postId, p_fixer_id: fixer.id, p_memo: 'second' })

    expect(data).toBeNull()
    expect(error?.message).toContain('reward_already_paid')
    expect((await profile(fixer.id)).balance).toBe(700)
    expect(await rewardTxs(fixer.id)).toHaveLength(1)
  })

  it('pays exactly once when many calls race (row lock)', async () => {
    const fixerA = await seedUser({ balance: 0 })
    const fixerB = await seedUser({ balance: 0 })
    const postId = await seedPost({ reward: 400 })
    const service = getServiceClient()

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        service.rpc('pay_fix_reward' as any, { p_post_id: postId, p_fixer_id: i % 2 ? fixerA.id : fixerB.id, p_memo: `race ${i}` })
      )
    )

    expect(results.filter(r => !r.error)).toHaveLength(1)
    results.filter(r => r.error).forEach(r => expect(r.error!.message).toContain('reward_already_paid'))
    const total = (await profile(fixerA.id)).balance + (await profile(fixerB.id)).balance
    expect(total).toBe(400)
    expect((await rewardTxs(fixerA.id)).length + (await rewardTxs(fixerB.id)).length).toBe(1)
  })

  it('refuses a reward already paid out to an anonymous fixer over Lightning', async () => {
    const fixer = await seedUser({ balance: 0 })
    const postId = await seedPost({ reward: 300, anonymous_reward_paid_at: new Date().toISOString() })

    const { error } = await getServiceClient().rpc('pay_fix_reward' as any, { p_post_id: postId, p_fixer_id: fixer.id, p_memo: 'x' })

    expect(error?.message).toContain('reward_already_paid')
    expect((await profile(fixer.id)).balance).toBe(0)
  })

  it.each([
    ['post_not_found', async () => crypto.randomUUID()],
    ['post_deleted', async () => seedPost({ deleted_at: new Date().toISOString() })],
    ['no_reward', async () => seedPost({ reward: 0 })],
  ])('raises %s without paying', async (code, makePost) => {
    const fixer = await seedUser({ balance: 0 })
    const postId = await makePost()

    const { data, error } = await getServiceClient().rpc('pay_fix_reward' as any, { p_post_id: postId, p_fixer_id: fixer.id, p_memo: 'x' })

    expect(data).toBeNull()
    expect(error?.message).toContain(code)
    expect((await profile(fixer.id)).balance).toBe(0)
    expect(await rewardTxs(fixer.id)).toHaveLength(0)
  })

  it('fails and rolls back the paid marker when the fixer does not exist', async () => {
    const postId = await seedPost({ reward: 900 })

    const { data, error } = await getServiceClient().rpc('pay_fix_reward' as any, { p_post_id: postId, p_fixer_id: crypto.randomUUID(), p_memo: 'x' })

    expect(data).toBeNull()
    expect(error).toBeTruthy()
    const p = await post(postId)
    expect(p.reward_paid_at).toBeNull()
    expect(p.reward_paid_to).toBeNull()
  })

  // REAL BUG? (minor) supabase/migrations/20261108000000_atomic_payouts.sql:75-76 sets
  // posts.reward_paid_to = p_fixer_id BEFORE checking the fixer exists (L84-94), and
  // reward_paid_to REFERENCES profiles(id), so an unknown fixer raises a foreign-key violation
  // (23503) instead of the documented 'fixer_not_found'. Everything still rolls back, but
  // lib/payouts.ts can't map it ("Failed to pay reward.", no code). Remove `.fails` once fixed.
  it.fails('reports fixer_not_found for an unknown fixer', async () => {
    const postId = await seedPost({ reward: 900 })

    const { error } = await getServiceClient().rpc('pay_fix_reward' as any, { p_post_id: postId, p_fixer_id: crypto.randomUUID(), p_memo: 'x' })

    expect(error?.message).toContain('fixer_not_found')
  })

  // REAL BUG? supabase/seed.sql:619 (`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,
  // authenticated, service_role`) runs AFTER the migrations on `supabase db reset` (local and CI),
  // undoing the migration's REVOKE: in a DB built from this repo any signed-in user (or anon)
  // can call pay_fix_reward / credit_deposit and credit themselves. Verified locally: proacl
  // includes anon=X and authenticated=X, and this test's attacker was paid. Production (no seed)
  // should be checked with `SELECT proacl FROM pg_proc WHERE proname IN ('pay_fix_reward',
  // 'credit_deposit')`; tests/security/hacker-script.test.ts (Attack 9) checks it there.
  // Remove `.fails` once the seed no longer re-grants these functions.
  it.fails('cannot be called from a user session or anonymously', async () => {
    const attacker = await seedUser({ balance: 0 })
    const postId = await seedPost({ reward: 5000 })

    for (const client of [getAuthenticatedClient(attacker.id), getAnonClient()]) {
      const { data, error } = await client.rpc('pay_fix_reward' as any, { p_post_id: postId, p_fixer_id: attacker.id, p_memo: 'steal' })
      expect(data).toBeNull()
      expect(error?.message).toMatch(/permission denied/i)
    }
    expect((await profile(attacker.id)).balance).toBe(0)
    expect((await post(postId)).reward_paid_at).toBeNull()
  })
})

// ============================================================================
describe('lib/payouts payFixReward / isPostRewardFunded (real PostgREST)', () => {
  it('maps a successful payout and then reward_already_paid', async () => {
    const fixer = await seedUser({ balance: 10 })
    const postId = await seedPost({ reward: 250 })
    const admin = getServiceClient() as any

    const first = await payFixReward(admin, { postId, fixerId: fixer.id, memo: 'm' })
    const second = await payFixReward(admin, { postId, fixerId: fixer.id, memo: 'm' })

    expect(first).toMatchObject({ success: true, amount: 250, newBalance: 260 })
    expect(second).toEqual({ success: false, error: 'This reward has already been paid.', code: 'reward_already_paid' })
    expect((await profile(fixer.id)).balance).toBe(260)
  })

  it('maps post_deleted, and reports failure for an unknown fixer', async () => {
    const admin = getServiceClient() as any
    const deleted = await seedPost({ deleted_at: new Date().toISOString() })
    const live = await seedPost({ reward: 10 })

    expect(await payFixReward(admin, { postId: deleted, fixerId: crypto.randomUUID(), memo: 'm' })).toMatchObject({ success: false, code: 'post_deleted' })
    // (code is not 'fixer_not_found' today; see the it.fails above)
    expect(await payFixReward(admin, { postId: live, fixerId: crypto.randomUUID(), memo: 'm' })).toMatchObject({ success: false })
    expect((await post(live)).reward_paid_at).toBeNull()
  })

  it('treats a post as funded only with a matching funding transaction or verified invoice', async () => {
    const owner = await seedUser({ balance: 0 })
    const admin = getServiceClient() as any
    const unfundedId = await seedPost({ user_id: owner.id, reward: 600 })
    const fundedId = await seedPost({ user_id: owner.id, reward: 600 })
    await queryDB(
      `INSERT INTO transactions (user_id, type, amount, status, memo) VALUES ($1, 'internal', -600, 'completed', $2)`,
      [owner.id, `Posted issue ${fundedId.substring(0, 8)}`]
    )
    const anonPaidId = await seedPost({ user_id: null, reward: 600, funding_status: 'paid', funding_r_hash: crypto.randomUUID() })
    const anonNoHashId = await seedPost({ user_id: null, reward: 600, funding_status: 'paid' })

    expect(await isPostRewardFunded(admin, { id: unfundedId, user_id: owner.id, reward: 600 })).toBe(false)
    expect(await isPostRewardFunded(admin, { id: fundedId, user_id: owner.id, reward: 600 })).toBe(true)
    expect(await isPostRewardFunded(admin, await post(anonPaidId) as any)).toBe(true)
    expect(await isPostRewardFunded(admin, await post(anonNoHashId) as any)).toBe(false)
  })
})

// ============================================================================
describe('credit_deposit', () => {
  it('completes a pending deposit and credits balance and pet_coins once', async () => {
    const user = await seedUser({ balance: 100, petCoins: 50 })
    const txId = await seedDeposit(user.id, 1000)
    const service = getServiceClient()

    const first = await service.rpc('credit_deposit' as any, { p_transaction_id: txId, p_user_id: user.id, p_amount: 1200 })
    const second = await service.rpc('credit_deposit' as any, { p_transaction_id: txId, p_user_id: user.id, p_amount: 1200 })

    expect(first).toMatchObject({ data: 1300, error: null })
    expect(second).toMatchObject({ data: null, error: null })
    expect(await profile(user.id)).toMatchObject({ balance: 1300, pet_coins: 1250 })
    expect(await queryOne('SELECT status, amount FROM transactions WHERE id = $1', [txId])).toEqual({ status: 'completed', amount: 1200 })
  })

  it("returns NULL and credits nothing for another user's deposit", async () => {
    const owner = await seedUser({ balance: 0 })
    const attacker = await seedUser({ balance: 0 })
    const txId = await seedDeposit(owner.id, 1000)

    const { data, error } = await getServiceClient().rpc('credit_deposit' as any, { p_transaction_id: txId, p_user_id: attacker.id, p_amount: 1000 })

    expect(error).toBeNull()
    expect(data).toBeNull()
    expect((await profile(attacker.id)).balance).toBe(0)
    expect((await profile(owner.id)).balance).toBe(0)
    expect((await queryOne<{ status: string }>('SELECT status FROM transactions WHERE id = $1', [txId])).status).toBe('pending')
  })

  it('credits exactly once when many checks race', async () => {
    const user = await seedUser({ balance: 0, petCoins: 0 })
    const txId = await seedDeposit(user.id, 500)
    const service = getServiceClient()

    const results = await Promise.all(
      Array.from({ length: 6 }, () => service.rpc('credit_deposit' as any, { p_transaction_id: txId, p_user_id: user.id, p_amount: 500 }))
    )

    expect(results.filter(r => r.data !== null)).toEqual([expect.objectContaining({ data: 500 })])
    expect(await profile(user.id)).toMatchObject({ balance: 500, pet_coins: 500 })
  })

  it('rejects a negative amount', async () => {
    const user = await seedUser({ balance: 1000 })
    const txId = await seedDeposit(user.id, 100)

    const { error } = await getServiceClient().rpc('credit_deposit' as any, { p_transaction_id: txId, p_user_id: user.id, p_amount: -100 })

    expect(error?.message).toContain('invalid_amount')
    expect((await profile(user.id)).balance).toBe(1000)
  })

  // REAL BUG? same seed.sql:619 re-grant as for pay_fix_reward above. Remove `.fails` once fixed.
  it.fails('cannot be called from a user session', async () => {
    const user = await seedUser({ balance: 0 })
    const txId = await seedDeposit(user.id, 100000)

    const { data, error } = await getAuthenticatedClient(user.id).rpc('credit_deposit' as any, {
      p_transaction_id: txId,
      p_user_id: user.id,
      p_amount: 100000,
    })

    expect(data).toBeNull()
    expect(error?.message).toMatch(/permission denied/i)
    expect((await profile(user.id)).balance).toBe(0)
  })
})

// ============================================================================
describe('protect_post_financial_fields', () => {
  it('pins payout, funding and ownership fields for the post owner session', async () => {
    const owner = await seedUser({ balance: 0 })
    const paidAt = new Date('2026-01-01T00:00:00Z').toISOString()
    const postId = await seedPost({
      user_id: owner.id,
      reward_paid_at: paidAt,
      anonymous_claim_token_hash: 'a'.repeat(64),
      funding_status: 'pending',
      submitted_fix_lightning_address: 'fixer@wallet.com',
    })

    await getAuthenticatedClient(owner.id)
      .from('posts')
      .update({
        reward_paid_at: null,
        reward_paid_to: owner.id,
        anonymous_claim_token_hash: 'b'.repeat(64),
        anonymous_reward_payment_lock: null,
        funding_status: 'paid',
        funding_r_hash: 'attacker-hash',
        submitted_fix_lightning_address: 'owner@evil.com',
        deleted_at: new Date().toISOString(),
        user_id: null,
        description: 'edited description',
      } as any)
      .eq('id', postId)

    const p = await post(postId)
    expect(new Date(p.reward_paid_at).toISOString()).toBe(paidAt)
    expect(p.reward_paid_to).toBeNull()
    expect(p.anonymous_claim_token_hash).toBe('a'.repeat(64))
    expect(p.funding_status).toBe('pending')
    expect(p.funding_r_hash).toBeNull()
    expect(p.submitted_fix_lightning_address).toBe('fixer@wallet.com')
    expect(p.deleted_at).toBeNull()
    expect(p.user_id).toBe(owner.id)
  })

  it('still lets the service role update those fields', async () => {
    const owner = await seedUser({ balance: 0 })
    const postId = await seedPost({ user_id: owner.id })

    const { error } = await getServiceClient()
      .from('posts')
      .update({ anonymous_claim_token_hash: 'c'.repeat(64), deleted_at: new Date().toISOString() } as any)
      .eq('id', postId)

    expect(error).toBeNull()
    const p = await post(postId)
    expect(p.anonymous_claim_token_hash).toBe('c'.repeat(64))
    expect(p.deleted_at).toBeTruthy()
  })
})

// ============================================================================
describe('funding_r_hash uniqueness', () => {
  it('lets a paid funding invoice fund only one new post', async () => {
    const hash = `test-funding-${crypto.randomUUID()}`
    await seedPost({ user_id: null, funding_status: 'paid', funding_r_hash: hash })

    const { error } = await getServiceClient()
      .from('posts')
      .insert({ title: 'dup', description: 'dup', reward: 1000, funding_status: 'paid', funding_r_hash: hash } as any)
      .select('id')

    expect(error?.code).toBe('23505')
    expect((await queryDB('SELECT id FROM posts WHERE funding_r_hash = $1', [hash])).length).toBe(1)
  })
})
