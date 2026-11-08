/**
 * Integration: connected_accounts can only be written by the server.
 *
 * A connected account lets the primary user act as the connected user
 * (switch profiles, spend their balance). Browsers must not be able to create
 * or re-point these links (see 20261108010000_connected_accounts_lockdown).
 */
import { describe, it, expect } from 'vitest'
import { getAuthenticatedClient, getServiceClient, seedUser, seedConnectedAccount, queryDB } from './helpers'

describe('connected_accounts lockdown', () => {
  it('a signed-in user cannot link themselves to another user', async () => {
    const attacker = await seedUser()
    const victim = await seedUser({ balance: 5000 })

    const { error } = await getAuthenticatedClient(attacker.id)
      .from('connected_accounts')
      .insert({ primary_user_id: attacker.id, connected_user_id: victim.id })

    expect(error).not.toBeNull()
    const rows = await queryDB(
      'SELECT id FROM connected_accounts WHERE primary_user_id = $1 AND connected_user_id = $2',
      [attacker.id, victim.id]
    )
    expect(rows).toHaveLength(0)
  })

  it('a parent cannot re-point an existing link at another user', async () => {
    const parent = await seedUser()
    const child = await seedUser()
    const victim = await seedUser({ balance: 5000 })
    const { id } = await seedConnectedAccount(parent.id, child.id)

    await getAuthenticatedClient(parent.id)
      .from('connected_accounts')
      .update({ connected_user_id: victim.id })
      .eq('id', id)

    const rows = await queryDB<{ connected_user_id: string }>(
      'SELECT connected_user_id FROM connected_accounts WHERE id = $1',
      [id]
    )
    expect(rows[0].connected_user_id).toBe(child.id)
  })

  it('a parent can still see and remove their own links', async () => {
    const parent = await seedUser()
    const child = await seedUser()
    const { id } = await seedConnectedAccount(parent.id, child.id)
    const client = getAuthenticatedClient(parent.id)

    const { data } = await client.from('connected_accounts').select('id').eq('id', id)
    expect(data).toHaveLength(1)

    await client.from('connected_accounts').delete().eq('id', id)
    const rows = await queryDB('SELECT id FROM connected_accounts WHERE id = $1', [id])
    expect(rows).toHaveLength(0)
  })

  it('the server (service role) can still create child-account links', async () => {
    const parent = await seedUser()
    const child = await seedUser()

    const { data, error } = await getServiceClient()
      .from('connected_accounts')
      .insert({ primary_user_id: parent.id, connected_user_id: child.id })
      .select('id')
      .single()

    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
    await queryDB('DELETE FROM connected_accounts WHERE id = $1', [data!.id])
  })
})
