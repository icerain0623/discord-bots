import { handleButton } from '../src/interactions/buttons.js'

function createMockDO(_store = {}) {
  return {
    idFromName(name) { return `id:${name}` },
    get(_id) {
      return {
        async fetch(request) {
          const url = new URL(request.url)
          const path = url.pathname
          if (path === '/janken/escrow') return Response.json({ ok: true })
          if (path === '/janken/payout') return Response.json({ ok: true })
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
    _seed(key, val) { store.set(key, val) },
    _dump() { return store },
  }
}

let fetchCalls = []
const originalFetch = globalThis.fetch

beforeEach(() => {
  fetchCalls = []
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts })
    return new Response(JSON.stringify({}), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'x-ratelimit-remaining': '10' },
    })
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function makeButtonInteraction(customId, userId) {
  return {
    guild_id: 'g1',
    channel_id: 'ch1',
    message: { id: 'msg1' },
    data: { custom_id: customId },
    member: {
      permissions: '0',
      user: { id: userId, global_name: userId },
    },
  }
}

function seedSession(kv, challengerId, overrides = {}) {
  const session = {
    messageId: null,
    channelId: null,
    challengerId,
    targetId: 'u2',
    bet: 100,
    status: 'pending',
    choices: { [challengerId]: null, u2: null },
    createdAt: new Date().toISOString(),
    ...overrides,
  }
  kv._seed(`janken:g1:${challengerId}`, JSON.stringify(session))
}

describe('janken button handlers', () => {
  test('accept updates message and escrows coins', async () => {
    const kv = createMockKV()
    seedSession(kv, 'u1')
    const env = { SESSION_KV: kv, ECONOMY_DO: createMockDO() }
    const result = await handleButton(makeButtonInteraction('janken_accept_u1', 'u2'), env)
    expect(result.type).toBe(7)
    expect(result.data.content).toContain('両者が手を選んで')
    expect(result.data.components[0].components).toHaveLength(3)
    const saved = kv._dump().get('janken:g1:u1')
    expect(JSON.parse(saved).status).toBe('selecting')
  })

  test('accept by non-target is rejected', async () => {
    const kv = createMockKV()
    seedSession(kv, 'u1')
    const env = { SESSION_KV: kv, ECONOMY_DO: createMockDO() }
    const result = await handleButton(makeButtonInteraction('janken_accept_u1', 'u3'), env)
    expect(result.data.content).toContain('対象ではありません')
  })

  test('reject removes session and updates message', async () => {
    const kv = createMockKV()
    seedSession(kv, 'u1')
    const env = { SESSION_KV: kv, ECONOMY_DO: createMockDO() }
    const result = await handleButton(makeButtonInteraction('janken_reject_u1', 'u2'), env)
    expect(result.type).toBe(7)
    expect(result.data.content).toContain('拒否')
    expect(kv._dump().has('janken:g1:u1')).toBe(false)
  })

  test('first hand pick returns ephemeral waiting message', async () => {
    const kv = createMockKV()
    seedSession(kv, 'u1', { status: 'selecting' })
    const env = { SESSION_KV: kv, ECONOMY_DO: createMockDO() }
    const result = await handleButton(makeButtonInteraction('janken_hand_u1_rock', 'u1'), env)
    expect(result.type).toBe(4)
    expect(result.data.flags).toBe(64)
    expect(result.data.content).toContain('相手の選択')
    const saved = JSON.parse(kv._dump().get('janken:g1:u1'))
    expect(saved.choices.u1).toBe('rock')
  })

  test('second hand pick resolves and shows result (challenger wins)', async () => {
    const kv = createMockKV()
    seedSession(kv, 'u1', { status: 'selecting', choices: { u1: 'rock', u2: null } })
    const env = { SESSION_KV: kv, ECONOMY_DO: createMockDO() }
    const result = await handleButton(makeButtonInteraction('janken_hand_u1_scissors', 'u2'), env)
    expect(result.type).toBe(7)
    expect(result.data.content).toContain('<@u1>')
    expect(result.data.content).toContain('勝利')
    expect(kv._dump().has('janken:g1:u1')).toBe(false)
  })

  test('draw result shows draw message', async () => {
    const kv = createMockKV()
    seedSession(kv, 'u1', { status: 'selecting', choices: { u1: 'rock', u2: null } })
    const env = { SESSION_KV: kv, ECONOMY_DO: createMockDO() }
    const result = await handleButton(makeButtonInteraction('janken_hand_u1_rock', 'u2'), env)
    expect(result.type).toBe(7)
    expect(result.data.content).toContain('引き分け')
  })

  test('hand pick by non-participant rejected', async () => {
    const kv = createMockKV()
    seedSession(kv, 'u1', { status: 'selecting' })
    const env = { SESSION_KV: kv, ECONOMY_DO: createMockDO() }
    const result = await handleButton(makeButtonInteraction('janken_hand_u1_rock', 'u3'), env)
    expect(result.data.content).toContain('参加者ではありません')
  })
})
