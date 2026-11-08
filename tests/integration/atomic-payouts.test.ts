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

  // Fixed (was REAL BUG, minor): the fixer is now credited/checked before reward_paid_to
  // (a FK to profiles) is written, so an unknown fixer reports 'fixer_not_found'.
  it('reports fixer_not_found for an unknown fixer', async () => {
    const postId = await seedPost({ reward: 900 })

    const { error } = await getServiceClient().rpc('pay_fix_reward' as any, { p_post_id: postId, p_fixer_id: crypto.randomUUID(), p_memo: 'x' })

    expect(error?.message).toContain('fixer_not_found')
  })

  // Fixed (was REAL BUG): supabase/seed.sql's blanket GRANT EXECUTE ON ALL FUNCTIONS used to
  // undo the migration's REVOKE locally/CI; the seed now re-revokes these two functions.
  it('cannot be called from a user session or anonymously', async () => {
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

  it('maps post_deleted and fixer_not_found', async () => {
    const admin = getServiceClient() as any
    const deleted = await seedPost({ deleted_at: new Date().toISOString() })
    const live = await seedPost({ reward: 10 })

    expect(await payFixReward(admin, { postId: deleted, fixerId: crypto.randomUUID(), memo: 'm' })).toMatchObject({ success: false, code: 'post_deleted' })
    expect(await payFixReward(admin, { postId: live, fixerId: crypto.randomUUID(), memo: 'm' })).toEqual({
      success: false,
      error: 'Fixer profile not found.',
      code: 'fixer_not_found',
    })
    expect((await post(live)).reward_paid_at).toBeNull()
  })

  it('treats a post as funded only via its funding link, the legacy fallback, or a verified invoice', async () => {
    const owner = await seedUser({ balance: 0 })
    const admin = getServiceClient() as any
    const deduction = async (createdAt: string) =>
      (await queryOne<{ id: string }>(
        `INSERT INTO transactions (user_id, type, amount, status, memo, created_at)
         VALUES ($1, 'internal', -600, 'completed', 'Post reward for: x', $2) RETURNING id`,
        [owner.id, createdAt]
      )).id

    // Linked (create_post_atomic)
    const linkedTx = await deduction(new Date().toISOString())
    const linkedId = await seedPost({ user_id: owner.id, reward: 600, funding_transaction_id: linkedTx })
    // New post without a link (e.g. inserted from the browser), even with a matching deduction nearby
    await deduction(new Date().toISOString())
    const unlinkedNewId = await seedPost({ user_id: owner.id, reward: 600 })
    // Legacy post with an unlinked deduction at creation time
    const legacyAt = '2026-10-01T12:00:00.000Z'
    await deduction('2026-10-01T12:00:20.000Z')
    const legacyId = await seedPost({ user_id: owner.id, reward: 600, created_at: legacyAt })
    // Legacy post whose only candidate deduction already funds another post
    const takenAt = '2026-09-01T12:00:00.000Z'
    const takenTx = await deduction('2026-09-01T12:00:20.000Z')
    await seedPost({ user_id: owner.id, reward: 600, created_at: takenAt, funding_transaction_id: takenTx })
    const legacyTakenId = await seedPost({ user_id: owner.id, reward: 600, created_at: takenAt })
    // Ownerless
    const anonPaidId = await seedPost({ user_id: null, reward: 600, funding_status: 'paid', funding_r_hash: crypto.randomUUID() })
    const anonNoHashId = await seedPost({ user_id: null, reward: 600, funding_status: 'paid' })

    expect(await isPostRewardFunded(admin, { id: linkedId })).toBe(true)
    expect(await isPostRewardFunded(admin, { id: unlinkedNewId })).toBe(false)
    expect(await isPostRewardFunded(admin, { id: legacyId })).toBe(true)
    expect(await isPostRewardFunded(admin, { id: legacyTakenId })).toBe(false)
    expect(await isPostRewardFunded(admin, { id: anonPaidId })).toBe(true)
    expect(await isPostRewardFunded(admin, { id: anonNoHashId })).toBe(false)
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

  // Fixed (was REAL BUG): see the seed.sql note for pay_fix_reward above.
  it('cannot be called from a user session', async () => {
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

// ============================================================================
describe('create_post_atomic funding link', () => {
  const createPost = (userId: string, postId: string, reward: number) =>
    getAuthenticatedClient(userId).rpc('create_post_atomic' as any, {
      p_post_id: postId,
      p_user_id: userId,
      p_title: 'Atomic post',
      p_description: 'Atomic post description',
      p_reward: reward,
    })

  it("links the post to the owner's reward deduction, and that post counts as funded", async () => {
    const user = await seedUser({ balance: 2000 })
    const postId = crypto.randomUUID()

    const { data, error } = await createPost(user.id, postId, 700)

    expect(error).toBeNull()
    const txId = (data as any).transaction_id
    expect(txId).toBeTruthy()
    const p = await post(postId)
    expect(p.funding_transaction_id).toBe(txId)
    expect(await queryOne('SELECT user_id, type, status, amount FROM transactions WHERE id = $1', [txId])).toEqual({
      user_id: user.id, type: 'internal', status: 'completed', amount: -700,
    })
    expect((await profile(user.id)).balance).toBe(1300)
    expect(await isPostRewardFunded(getServiceClient() as any, { id: postId })).toBe(true)
  })

  it('does not create a funding link for a zero-reward post', async () => {
    const user = await seedUser({ balance: 0 })
    const postId = crypto.randomUUID()

    const { error } = await createPost(user.id, postId, 0)

    expect(error).toBeNull()
    expect((await post(postId)).funding_transaction_id).toBeNull()
  })

  it('end to end: a create_post_atomic post can be paid out once to the fixer', async () => {
    const owner = await seedUser({ balance: 1000 })
    const fixer = await seedUser({ balance: 0 })
    const postId = crypto.randomUUID()
    await createPost(owner.id, postId, 400)

    const admin = getServiceClient() as any
    expect(await isPostRewardFunded(admin, { id: postId })).toBe(true)
    expect(await payFixReward(admin, { postId, fixerId: fixer.id, memo: 'm' })).toMatchObject({ success: true, amount: 400 })
    expect((await payFixReward(admin, { postId, fixerId: fixer.id, memo: 'm' })).success).toBe(false)
    expect((await profile(fixer.id)).balance).toBe(400)
  })
})

// ============================================================================
describe('protect_post_insert_fields (browser-session inserts)', () => {
  it('strips forged funding, payout, fixed and timestamp fields from an authenticated insert', async () => {
    const attacker = await seedUser({ balance: 0 })
    const otherTx = (await queryOne<{ id: string }>(
      `INSERT INTO transactions (user_id, type, amount, status, memo) VALUES ($1, 'internal', -50000, 'completed', 'x') RETURNING id`,
      [attacker.id]
    )).id
    const postId = crypto.randomUUID()

    const { error } = await getAuthenticatedClient(attacker.id)
      .from('posts')
      .insert({
        id: postId,
        user_id: attacker.id,
        title: 'Forged',
        description: 'Forged',
        reward: 50000,
        created_at: '2026-01-01T00:00:00Z', // backdated (legacy funding window)
        fixed: true,
        fixed_by: attacker.id,
        fixed_at: '2026-01-02T00:00:00Z',
        deleted_at: null,
        funding_transaction_id: otherTx,
        funding_status: 'paid',
        funding_r_hash: 'forged-hash',
        funding_payment_request: 'lnbcforged',
        reward_paid_at: '2026-01-03T00:00:00Z',
        reward_paid_to: attacker.id,
        anonymous_claim_token_hash: 'f'.repeat(64),
        anonymous_reward_paid_at: '2026-01-03T00:00:00Z',
        anonymous_reward_payment_hash: 'forged',
        anonymous_reward_payment_lock: 'forged-lock',
      } as any)
    createdPostIds.push(postId)

    expect(error).toBeNull()
    const p = await post(postId)
    expect(new Date(p.created_at).getTime()).toBeGreaterThan(Date.now() - 60_000)
    expect(p).toMatchObject({
      fixed: false,
      fixed_by: null,
      fixed_at: null,
      funding_transaction_id: null,
      funding_status: null,
      funding_r_hash: null,
      funding_payment_request: null,
      reward_paid_at: null,
      reward_paid_to: null,
      anonymous_claim_token_hash: null,
      anonymous_reward_paid_at: null,
      anonymous_reward_payment_hash: null,
      anonymous_reward_payment_lock: null,
    })
    // ...so the forged reward can be neither paid out nor refunded
    expect(await isPostRewardFunded(getServiceClient() as any, { id: postId })).toBe(false)
  })

  it('does not let an authenticated update set funding_transaction_id', async () => {
    const owner = await seedUser({ balance: 0 })
    const tx = (await queryOne<{ id: string }>(
      `INSERT INTO transactions (user_id, type, amount, status, memo) VALUES ($1, 'internal', -1000, 'completed', 'x') RETURNING id`,
      [owner.id]
    )).id
    const postId = await seedPost({ user_id: owner.id, reward: 1000 })

    await getAuthenticatedClient(owner.id).from('posts').update({ funding_transaction_id: tx } as any).eq('id', postId)

    expect((await post(postId)).funding_transaction_id).toBeNull()
  })

  it('does not restrict service-role inserts', async () => {
    const postId = crypto.randomUUID()
    const hash = `svc-${crypto.randomUUID()}`

    const { error } = await getServiceClient()
      .from('posts')
      .insert({ id: postId, title: 'svc', description: 'svc', reward: 10, funding_status: 'paid', funding_r_hash: hash } as any)
    createdPostIds.push(postId)

    expect(error).toBeNull()
    expect(await post(postId)).toMatchObject({ funding_status: 'paid', funding_r_hash: hash })
  })
})
