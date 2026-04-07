import { describe, test, expect } from '@jest/globals'
import { handleBank } from '../src/commands/bank.js'

// ---------------------------------------------------------------------------
// Mock Durable Object namespace backed by controllable stubs
// ---------------------------------------------------------------------------

function createMockDO(stubs) {
  return {
    idFromName(name) { return `id:${name}` },
    get(id) {
      return stubs[id] ?? stubs['*']
    },
  }
}

function makeStub(handlers) {
  return {
    async fetch(request) {
      const url = new URL(request.url)
      const path = url.pathname
      const method = request.method

      let body = null
      if (method === 'POST') {
        try { body = await request.json() } catch { /* ignore */ }
      }

      const key = `${method} ${path}`
      if (handlers[key]) return handlers[key](body)
      // Wildcard handler
      if (handlers['*']) return handlers['*'](method, path, body)
      return Response.json({ error: 'Not Found' }, { status: 404 })
    },
  }
}

// ---------------------------------------------------------------------------
// Interaction factory
// ---------------------------------------------------------------------------

function makeInteraction(sub, options = []) {
  return {
    guild_id: 'g1',
    member: { permissions: '0', user: { id: 'u1', global_name: 'User1' } },
    data: {
      name: 'bank',
      options: [{ name: sub, type: 1, options }],
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

const activeMemberStub = () => Response.json({ user_id: 'u1', active: 1, leave_requested: 0 })

describe('handleBank - balance', () => {
  test('returns ephemeral balance message', async () => {
    const stub = makeStub({
      'GET /members/get/u1': activeMemberStub,
      'GET /bank/balance/u1': () => Response.json({ user_id: 'u1', amount: 1500 }),
    })
    const env = { ECONOMY_DO: createMockDO({ 'id:g1': stub }) }
    const res = await handleBank(makeInteraction('balance'), env)
    expect(res.type).toBe(4)
    expect(res.data.flags).toBe(64)
    expect(res.data.content).toContain('1,500')
    expect(res.data.content).toContain('肩書コイン')
  })
})

describe('handleBank - send', () => {
  test('sends coins and returns ephemeral confirmation', async () => {
    const stub = makeStub({
      'GET /members/get/u1': activeMemberStub,
      'POST /bank/send': () => Response.json({ ok: true, fromBalance: 70, toBalance: 130 }),
    })
    const env = { ECONOMY_DO: createMockDO({ 'id:g1': stub }) }
    const interaction = makeInteraction('send', [
      { name: 'user', value: 'u2' },
      { name: 'amount', value: 30 },
    ])
    const res = await handleBank(interaction, env)
    expect(res.type).toBe(4)
    expect(res.data.flags).toBe(64)
    expect(res.data.content).toContain('<@u2>')
    expect(res.data.content).toContain('30')
    expect(res.data.content).toContain('70')
  })

  test('returns error if amount is 0 (no DO call)', async () => {
    const stub = makeStub({ 'GET /members/get/u1': activeMemberStub })
    const env = { ECONOMY_DO: createMockDO({ 'id:g1': stub }) }
    const interaction = makeInteraction('send', [
      { name: 'user', value: 'u2' },
      { name: 'amount', value: 0 },
    ])
    const res = await handleBank(interaction, env)
    expect(res.data.flags).toBe(64)
    expect(res.data.content).toContain('1以上')
  })

  test('returns error if sending to self (no DO call)', async () => {
    const stub = makeStub({ 'GET /members/get/u1': activeMemberStub })
    const env = { ECONOMY_DO: createMockDO({ 'id:g1': stub }) }
    const interaction = makeInteraction('send', [
      { name: 'user', value: 'u1' }, // same as sender
      { name: 'amount', value: 10 },
    ])
    const res = await handleBank(interaction, env)
    expect(res.data.flags).toBe(64)
    expect(res.data.content).toContain('自分自身')
  })

  test('returns store error message', async () => {
    const stub = makeStub({
      'GET /members/get/u1': activeMemberStub,
      'POST /bank/send': () => Response.json({ error: '残高が不足しています。' }),
    })
    const env = { ECONOMY_DO: createMockDO({ 'id:g1': stub }) }
    const interaction = makeInteraction('send', [
      { name: 'user', value: 'u2' },
      { name: 'amount', value: 9999 },
    ])
    const res = await handleBank(interaction, env)
    expect(res.data.flags).toBe(64)
    expect(res.data.content).toContain('残高が不足')
  })
})

describe('handleBank - history', () => {
  test('returns ephemeral history message', async () => {
    const stub = makeStub({
      'GET /members/get/u1': activeMemberStub,
      'GET /bank/history/u1': () => Response.json([
        { type: 'send', amount: 50, to_user: 'u2', from_user: 'u1', created_at: '2026-04-01T00:00:00Z' },
        { type: 'daily', amount: 50, to_user: 'u1', from_user: null, created_at: '2026-04-02T00:00:00Z' },
      ]),
    })
    const env = { ECONOMY_DO: createMockDO({ 'id:g1': stub }) }
    const res = await handleBank(makeInteraction('history'), env)
    expect(res.type).toBe(4)
    expect(res.data.flags).toBe(64)
    expect(res.data.content).toContain('取引履歴')
    expect(res.data.content).toContain('2026-04-01')
  })

  test('returns ephemeral message when no history', async () => {
    const stub = makeStub({
      'GET /members/get/u1': activeMemberStub,
      'GET /bank/history/u1': () => Response.json([]),
    })
    const env = { ECONOMY_DO: createMockDO({ 'id:g1': stub }) }
    const res = await handleBank(makeInteraction('history'), env)
    expect(res.data.flags).toBe(64)
    expect(res.data.content).toContain('取引履歴がありません')
  })
})

describe('handleBank - ranking', () => {
  test('returns public (no flags) ranking message', async () => {
    const stub = makeStub({
      'GET /bank/ranking': () => Response.json([
        { user_id: 'u1', amount: 500 },
        { user_id: 'u2', amount: 300 },
        { user_id: 'u3', amount: 100 },
        { user_id: 'u4', amount: 50 },
      ]),
    })
    const env = { ECONOMY_DO: createMockDO({ 'id:g1': stub }) }
    const res = await handleBank(makeInteraction('ranking'), env)
    expect(res.type).toBe(4)
    expect(res.data.flags).toBeUndefined()
    expect(res.data.content).toContain('ランキング')
    expect(res.data.content).toContain('<@u1>')
    expect(res.data.content).toContain('🥇')
    expect(res.data.content).toContain('🥈')
    expect(res.data.content).toContain('🥉')
    expect(res.data.content).toContain('4.')
  })

  test('returns ephemeral message when no participants', async () => {
    const stub = makeStub({
      'GET /bank/ranking': () => Response.json([]),
    })
    const env = { ECONOMY_DO: createMockDO({ 'id:g1': stub }) }
    const res = await handleBank(makeInteraction('ranking'), env)
    expect(res.data.flags).toBe(64)
    expect(res.data.content).toContain('参加者がいません')
  })
})

describe('handleBank - daily', () => {
  test('returns ephemeral bonus message', async () => {
    const stub = makeStub({
      'GET /members/get/u1': activeMemberStub,
      'POST /bank/daily': () => Response.json({ ok: true, balance: 150 }),
    })
    const env = { ECONOMY_DO: createMockDO({ 'id:g1': stub }) }
    const res = await handleBank(makeInteraction('daily'), env)
    expect(res.type).toBe(4)
    expect(res.data.flags).toBe(64)
    expect(res.data.content).toContain('デイリーボーナス')
    expect(res.data.content).toContain('50')
    expect(res.data.content).toContain('150')
  })

  test('returns error if already claimed', async () => {
    const stub = makeStub({
      'GET /members/get/u1': activeMemberStub,
      'POST /bank/daily': () => Response.json({ error: 'Already claimed today' }),
    })
    const env = { ECONOMY_DO: createMockDO({ 'id:g1': stub }) }
    const res = await handleBank(makeInteraction('daily'), env)
    expect(res.data.flags).toBe(64)
    expect(res.data.content).toContain('Already claimed today')
  })
})

describe('handleBank - unknown subcommand', () => {
  test('returns ephemeral error for unknown sub', async () => {
    const stub = makeStub({ 'GET /members/get/u1': activeMemberStub })
    const env = { ECONOMY_DO: createMockDO({ 'id:g1': stub }) }
    const res = await handleBank(makeInteraction('unknown'), env)
    expect(res.data.flags).toBe(64)
    expect(res.data.content).toContain('不明なサブコマンド')
  })
})
