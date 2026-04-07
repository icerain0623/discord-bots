import { describe, test, expect, beforeEach, afterEach } from '@jest/globals'
import { handleEconomy } from '../src/commands/economy.js'

function createMockDO() {
  const store = {}
  return {
    idFromName(name) { return `id:${name}` },
    get(_id) {
      return {
        async fetch(request) {
          const url = new URL(request.url)
          const path = url.pathname
          if (request.method === 'POST' && path === '/members/join') {
            const body = await request.json()
            store[body.userId] = { active: 1, balance: 100 }
            return Response.json({ ok: true, balance: 100 })
          }
          if (request.method === 'POST' && path === '/members/leave-request') {
            return Response.json({ ok: true })
          }
          if (request.method === 'GET' && path === '/members/status') {
            return Response.json({ active: [], pendingLeaves: [] })
          }
          if (request.method === 'GET' && path.startsWith('/bank/balance/')) {
            const userId = path.split('/')[3]
            const user = store[userId]
            return Response.json({ amount: user?.balance ?? 0 })
          }
          if (request.method === 'POST' && path === '/bank/grant') {
            const body = await request.json()
            return Response.json({ ok: true, balance: (store[body.userId]?.balance ?? 0) + body.amount })
          }
          if (request.method === 'POST' && path === '/bank/revoke') {
            const body = await request.json()
            return Response.json({ ok: true, balance: Math.max(0, (store[body.userId]?.balance ?? 0) - body.amount) })
          }
          return Response.json({ ok: true })
        },
      }
    },
  }
}

let fetchCalls = []
const originalFetch = globalThis.fetch

beforeEach(() => {
  fetchCalls = []
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts })
    return new Response(null, {
      status: 204,
      headers: { 'x-ratelimit-remaining': '10' },
    })
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function makeInteraction(sub, options = {}) {
  const opts = Object.entries(options).map(([name, value]) => {
    if (typeof value === 'object' && value.type) return { name, ...value }
    return { name, value }
  })
  return {
    guild_id: 'g1',
    application_id: 'app1',
    token: 'tok1',
    member: {
      permissions: '32',
      user: { id: 'u-admin', global_name: 'Admin' },
    },
    data: {
      name: 'economy',
      options: [{ name: sub, type: 1, options: opts }],
    },
  }
}

function makeNonAdminInteraction(sub, options = {}) {
  const i = makeInteraction(sub, options)
  i.member.permissions = '0'
  i.member.user = { id: 'u-user', global_name: 'User' }
  return i
}

describe('handleEconomy', () => {
  const env = {
    ECONOMY_DO: createMockDO(),
    ECONOMY_ROLE_ID: 'role-123',
    ECONOMY_ADMIN_CHANNEL_ID: 'ch-admin',
    DISCORD_TOKEN: 'test-tok',
  }

  test('join returns ephemeral success', async () => {
    const result = await handleEconomy(makeNonAdminInteraction('join'), env)
    expect(result.type).toBe(4)
    expect(result.data.content).toContain('100')
    expect(result.data.flags).toBe(64)
  })

  test('leave returns ephemeral confirmation', async () => {
    const result = await handleEconomy(makeNonAdminInteraction('leave'), env)
    expect(result.type).toBe(4)
    expect(result.data.content).toContain('離脱申請')
  })

  test('status returns member list', async () => {
    const result = await handleEconomy(makeInteraction('status'), env)
    expect(result.type).toBe(4)
  })

  test('grant requires ManageGuild', async () => {
    const result = await handleEconomy(makeNonAdminInteraction('grant', {
      user: { type: 'user', value: 'u1' }, amount: 100,
    }), env)
    expect(result.data.content).toContain('権限')
  })

  test('grant adds coins', async () => {
    const result = await handleEconomy(makeInteraction('grant', {
      user: { type: 'user', value: 'u1' }, amount: 100,
    }), env)
    expect(result.type).toBe(4)
    expect(result.data.content).toContain('付与')
  })
})
