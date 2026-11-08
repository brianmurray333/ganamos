/**
 * Integration: post_funding_overrides can only be written by the server.
 *
 * A row here makes a legacy post's reward payable (and refundable), so
 * browsers must not be able to create or read them
 * (see 20261108020000_post_funding_overrides).
 */
import { describe, it, expect } from 'vitest'
import { getAuthenticatedClient, seedUser, queryDB } from './helpers'

describe('post_funding_overrides lockdown', () => {
  it('a signed-in user cannot vouch for their own post', async () => {
    const owner = await seedUser()
    const post = { id: crypto.randomUUID() }
    await queryDB(
      `INSERT INTO posts (id, user_id, title, description, reward, fixed, created_at)
       VALUES ($1, $2, 'legacy', 'legacy', 1000, false, '2026-10-01T12:00:00Z')`,
      [post.id, owner.id]
    )

    const client = getAuthenticatedClient(owner.id)
    const { error } = await client.from('post_funding_overrides').insert({ post_id: post.id, amount: 1000 })
    expect(error).not.toBeNull()

    const rows = await queryDB('SELECT post_id FROM post_funding_overrides WHERE post_id = $1', [post.id])
    expect(rows).toHaveLength(0)

    await queryDB('INSERT INTO post_funding_overrides (post_id, amount) VALUES ($1, 1000)', [post.id])
    const { data } = await client.from('post_funding_overrides').select('post_id').eq('post_id', post.id)
    expect(data ?? []).toHaveLength(0)

    await queryDB('DELETE FROM posts WHERE id = $1', [post.id])
  })
})
