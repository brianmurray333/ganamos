/**
 * Security integration tests: Balance protection
 *
 * Verifies that the prevent_direct_balance_update trigger is deployed
 * and working. These tests reproduce the exact attack from 2026-03-06
 * where an attacker used the Supabase client to directly SET balance
 * on their own profile row.
 *
 * Run: npm run test:integration
 */
import { describe, it, expect } from 'vitest'
import { seedUser, queryDB, queryOne } from './helpers'
import { getAuthenticatedClient } from './helpers/db-client'

describe('Security: Balance protection trigger', () => {
  it('trigger prevent_balance_update exists and is enabled', async () => {
    const rows = await queryDB<{ tgname: string; tgenabled: string }>(
      `SELECT tgname, tgenabled FROM pg_trigger WHERE tgname = 'prevent_balance_update'`
    )
    expect(rows.length).toBe(1)
    expect(rows[0].tgenabled).toBe('O')
  })

  it('BLOCKS direct balance update via authenticated client', async () => {
    const user = await seedUser({ balance: 1000 })
    const client = getAuthenticatedClient(user.id)

    await client
      .from('profiles')
      .update({ balance: 999999 })
      .eq('id', user.id)

    const row = await queryOne<{ balance: number }>(
      'SELECT balance FROM profiles WHERE id = $1',
      [user.id]
    )
    expect(row.balance).toBe(1000)
  })

  it('BLOCKS direct pet_coins update via authenticated client', async () => {
    const user = await seedUser({ balance: 1000, petCoins: 500 })
    const client = getAuthenticatedClient(user.id)

    await client
      .from('profiles')
      .update({ pet_coins: 999999 })
      .eq('id', user.id)

    const row = await queryOne<{ pet_coins: number }>(
      'SELECT pet_coins FROM profiles WHERE id = $1',
      [user.id]
    )
    expect(row.pet_coins).toBe(500)
  })

  it('BLOCKS setting balance to 0 via authenticated client', async () => {
    const user = await seedUser({ balance: 5000 })
    const client = getAuthenticatedClient(user.id)

    await client
      .from('profiles')
      .update({ balance: 0 })
      .eq('id', user.id)

    const row = await queryOne<{ balance: number }>(
      'SELECT balance FROM profiles WHERE id = $1',
      [user.id]
    )
    expect(row.balance).toBe(5000)
  })

  it('BLOCKS balance update even when bundled with legitimate profile changes', async () => {
    const user = await seedUser({ balance: 1000 })
    const client = getAuthenticatedClient(user.id)

    await client
      .from('profiles')
      .update({ name: 'Hacker McHackface', balance: 999999 })
      .eq('id', user.id)

    const row = await queryOne<{ name: string; balance: number }>(
      'SELECT name, balance FROM profiles WHERE id = $1',
      [user.id]
    )
    // Name change should go through, balance should not
    expect(row.name).toBe('Hacker McHackface')
    expect(row.balance).toBe(1000)
  })

  it('ALLOWS non-balance profile updates (name, username, avatar)', async () => {
    const user = await seedUser({ balance: 1000 })
    const client = getAuthenticatedClient(user.id)

    await client
      .from('profiles')
      .update({ name: 'New Name', avatar_url: 'https://example.com/avatar.png' })
      .eq('id', user.id)

    const row = await queryOne<{ name: string; avatar_url: string; balance: number }>(
      'SELECT name, avatar_url, balance FROM profiles WHERE id = $1',
      [user.id]
    )
    expect(row.name).toBe('New Name')
    expect(row.avatar_url).toBe('https://example.com/avatar.png')
    expect(row.balance).toBe(1000)
  })

  it('BLOCKS updating another user\'s balance', async () => {
    const victim = await seedUser({ balance: 5000, username: 'victim_user' })
    const attacker = await seedUser({ balance: 100, username: 'attacker_user' })
    const client = getAuthenticatedClient(attacker.id)

    await client
      .from('profiles')
      .update({ balance: 0 })
      .eq('id', victim.id)

    const row = await queryOne<{ balance: number }>(
      'SELECT balance FROM profiles WHERE id = $1',
      [victim.id]
    )
    expect(row.balance).toBe(5000)
  })
})

describe('Security: Transaction insertion protection', () => {
  it('BLOCKS inserting a completed deposit via authenticated client', async () => {
    const user = await seedUser({ balance: 1000 })
    const client = getAuthenticatedClient(user.id)

    const { error } = await client
      .from('transactions')
      .insert({
        user_id: user.id,
        type: 'deposit',
        amount: 1000000,
        status: 'completed',
        memo: 'Fake deposit',
      })

    expect(error).toBeTruthy()
  })

  it('BLOCKS inserting a transaction for another user', async () => {
    const victim = await seedUser({ balance: 5000, username: 'tx_victim' })
    const attacker = await seedUser({ balance: 100, username: 'tx_attacker' })
    const client = getAuthenticatedClient(attacker.id)

    const { error } = await client
      .from('transactions')
      .insert({
        user_id: victim.id,
        type: 'deposit',
        amount: 1000000,
        status: 'completed',
        memo: 'Stealing via fake tx',
      })

    expect(error).toBeTruthy()
  })
})
