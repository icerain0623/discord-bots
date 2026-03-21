import { describe, test, expect, beforeEach } from '@jest/globals'
import { getGuildRoles, getGuildMembers } from '../src/utils/discordApi.js'

let fetchMock
beforeEach(() => {
  fetchMock = null
})

function mockFetch(responses) {
  let callIndex = 0
  globalThis.fetch = async (url, opts) => {
    const res = responses[callIndex++]
    return {
      ok: res.ok ?? true,
      status: res.status ?? 200,
      json: async () => res.body,
      text: async () => JSON.stringify(res.body),
      headers: new Map([
        ['x-ratelimit-remaining', '10'],
        ['retry-after', '1'],
      ]),
    }
  }
}

describe('getGuildRoles', () => {
  test('returns guild roles', async () => {
    const roles = [{ id: 'r1', name: '幹事長' }, { id: 'r2', name: '副幹事長' }]
    mockFetch([{ body: roles }])
    const result = await getGuildRoles('guild1', 'token')
    expect(result).toEqual(roles)
  })

  test('returns empty array on error', async () => {
    mockFetch([{ ok: false, status: 403, body: {} }])
    const result = await getGuildRoles('guild1', 'token')
    expect(result).toEqual([])
  })
})

describe('getGuildMembers', () => {
  test('returns all members with pagination', async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      user: { id: `u${i}` },
      roles: ['r1'],
    }))
    const page2 = [{ user: { id: 'u1000' }, roles: ['r2'] }]
    mockFetch([{ body: page1 }, { body: page2 }])
    const result = await getGuildMembers('guild1', 'token')
    expect(result.length).toBe(1001)
  })

  test('returns empty array on error', async () => {
    mockFetch([{ ok: false, status: 403, body: {} }])
    const result = await getGuildMembers('guild1', 'token')
    expect(result).toEqual([])
  })
})
