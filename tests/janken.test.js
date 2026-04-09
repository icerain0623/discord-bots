import { handleJanken } from '../src/commands/janken.js'

function createMockDO(store = {}) {
  return {
    idFromName(name) { return `id:${name}` },
    get(_id) {
      return {
        async fetch(request) {
          const url = new URL(request.url)
          const path = url.pathname
          if (path.startsWith('/members/get/')) {
            const userId = path.split('/')[3]
            const member = store.members?.[userId]
            return Response.json(member ?? null)
          }
          if (path.startsWith('/bank/balance/')) {
            const userId = path.split('/')[3]
            return Response.json({ amount: store.balances?.[userId] ?? 0 })
          }
          return Response.json({ ok: true })
        },
      }
    },
  }
}

function createMockKV() {
  const store = new Map()
  return {
    async get(key) { return store.get(key) ?? null },
    async put(key, value, _opts) { store.set(key, value) },
    async delete(key) { store.delete(key) },
    _dump() { return store },
  }
}

let fetchCalls = []
const originalFetch = globalThis.fetch

beforeEach(() => {
  fetchCalls = []
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts })
    return new Response(JSON.stringify({ id: 'msg1', channel_id: 'ch1' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'x-ratelimit-remaining': '10' },
    })
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function makeInteraction(sub, options = {}, userId = 'u1') {
  const opts = Object.entries(options).map(([name, value]) => ({ name, value }))
  return {
    guild_id: 'g1',
    application_id: 'app1',
    token: 'tok1',
    channel_id: 'ch1',
    member: {
      permissions: '0',
      user: { id: userId, global_name: 'User1' },
    },
    data: {
      name: 'janken',
      options: [{ name: sub, type: 1, options: opts }],
    },
  }
}

describe('handleJanken', () => {
  test('challenge returns deferred response and creates session', async () => {
    const doNs = createMockDO({
      members: { u1: { user_id: 'u1', active: 1 }, u2: { user_id: 'u2', active: 1 } },
      balances: { u1: 500, u2: 500 },
    })
    const kv = createMockKV()
    const env = { ECONOMY_DO: doNs, SESSION_KV: kv, DISCORD_TOKEN: 'tok' }
    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }

    const result = await handleJanken(makeInteraction('challenge', { user: 'u2', bet: 100 }), env, ctx)
    expect(result.type).toBe(5)

    await bgPromise
    const session = kv._dump().get('janken:g1:u1')
    expect(session).toBeDefined()
    const parsed = JSON.parse(session)
    expect(parsed.challengerId).toBe('u1')
    expect(parsed.targetId).toBe('u2')
    expect(parsed.bet).toBe(100)
    expect(parsed.status).toBe('pending')
  })

  test('rejects challenging self', async () => {
    const doNs = createMockDO({
      members: { u1: { user_id: 'u1', active: 1 } },
      balances: { u1: 500 },
    })
    const kv = createMockKV()
    const env = { ECONOMY_DO: doNs, SESSION_KV: kv }
    const result = await handleJanken(makeInteraction('challenge', { user: 'u1', bet: 100 }), env, { waitUntil: () => {} })
    expect(result.type).toBe(4)
    expect(result.data.content).toContain('自分自身')
  })

  test('rejects non-member challenger', async () => {
    const doNs = createMockDO({
      members: {},
      balances: {},
    })
    const kv = createMockKV()
    const env = { ECONOMY_DO: doNs, SESSION_KV: kv }
    const result = await handleJanken(makeInteraction('challenge', { user: 'u2', bet: 100 }), env, { waitUntil: () => {} })
    expect(result.data.content).toContain('join')
  })

  test('rejects non-member target', async () => {
    const doNs = createMockDO({
      members: { u1: { user_id: 'u1', active: 1 } },
      balances: { u1: 500 },
    })
    const kv = createMockKV()
    const env = { ECONOMY_DO: doNs, SESSION_KV: kv }
    const result = await handleJanken(makeInteraction('challenge', { user: 'u2', bet: 100 }), env, { waitUntil: () => {} })
    expect(result.data.content).toContain('参加していません')
  })

  test('rejects insufficient challenger balance', async () => {
    const doNs = createMockDO({
      members: { u1: { user_id: 'u1', active: 1 }, u2: { user_id: 'u2', active: 1 } },
      balances: { u1: 50, u2: 500 },
    })
    const kv = createMockKV()
    const env = { ECONOMY_DO: doNs, SESSION_KV: kv }
    const result = await handleJanken(makeInteraction('challenge', { user: 'u2', bet: 100 }), env, { waitUntil: () => {} })
    expect(result.data.content).toContain('残高が不足')
  })

  test('rejects insufficient target balance', async () => {
    const doNs = createMockDO({
      members: { u1: { user_id: 'u1', active: 1 }, u2: { user_id: 'u2', active: 1 } },
      balances: { u1: 500, u2: 50 },
    })
    const kv = createMockKV()
    const env = { ECONOMY_DO: doNs, SESSION_KV: kv }
    const result = await handleJanken(makeInteraction('challenge', { user: 'u2', bet: 100 }), env, { waitUntil: () => {} })
    expect(result.data.content).toContain('相手の残高')
  })

  test('rejects when existing session', async () => {
    const doNs = createMockDO({
      members: { u1: { user_id: 'u1', active: 1 }, u2: { user_id: 'u2', active: 1 } },
      balances: { u1: 500, u2: 500 },
    })
    const kv = createMockKV()
    await kv.put('janken:g1:u1', JSON.stringify({ status: 'pending' }))
    const env = { ECONOMY_DO: doNs, SESSION_KV: kv }
    const result = await handleJanken(makeInteraction('challenge', { user: 'u2', bet: 100 }), env, { waitUntil: () => {} })
    expect(result.data.content).toContain('進行中')
  })
})
