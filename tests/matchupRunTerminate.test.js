import { handleMatchup } from '../src/commands/matchup.js'

function createMockKV() {
  const store = new Map()
  return {
    async get(key) { return store.get(key) ?? null },
    async put(key, value) { store.set(key, value) },
    async delete(key) { store.delete(key) },
  }
}

function makeRunInteraction() {
  return {
    guild_id: 'g123',
    application_id: 'app123',
    token: 'tok',
    data: {
      name: 'matchup',
      options: [{ name: 'run', type: 1, options: [] }],
    },
  }
}

function makeTerminateInteraction() {
  return {
    guild_id: 'g123',
    application_id: 'app123',
    token: 'tok',
    data: {
      name: 'matchup',
      options: [{ name: 'terminate', type: 1, options: [] }],
    },
  }
}

describe('matchup run', () => {
  test('rejects when no active event', async () => {
    const kv = createMockKV()
    const env = { MATCHUP_KV: kv }
    const result = await handleMatchup(makeRunInteraction(), env)
    expect(result.data.content).toContain('アクティブな')
  })

  test('rejects when already matched', async () => {
    const kv = createMockKV()
    await kv.put('matchup-active:g123', JSON.stringify({ status: 'matched', participants: [] }))
    const env = { MATCHUP_KV: kv }
    const result = await handleMatchup(makeRunInteraction(), env)
    expect(result.data.content).toContain('マッチング済み')
  })

  test('rejects when fewer than 2 participants', async () => {
    const kv = createMockKV()
    await kv.put('matchup-active:g123', JSON.stringify({
      status: 'recruiting',
      participants: [{ userId: '1', topics: [], freeTopics: [] }],
    }))
    const env = { MATCHUP_KV: kv }
    const result = await handleMatchup(makeRunInteraction(), env)
    expect(result.data.content).toContain('最低2人')
  })

  test('returns deferred response when valid', async () => {
    const kv = createMockKV()
    await kv.put('matchup-active:g123', JSON.stringify({
      status: 'recruiting',
      groupSize: 2,
      participants: [
        { userId: '1', topics: [], freeTopics: [] },
        { userId: '2', topics: [], freeTopics: [] },
      ],
    }))
    const env = { MATCHUP_KV: kv }
    const result = await handleMatchup(makeRunInteraction(), env, { waitUntil: () => {} })
    expect(result.type).toBe(5)
  })
})

describe('matchup terminate', () => {
  test('rejects when no active event', async () => {
    const kv = createMockKV()
    const env = { MATCHUP_KV: kv }
    const result = await handleMatchup(makeTerminateInteraction(), env)
    expect(result.data.content).toContain('アクティブな')
  })

  test('returns deferred response when active', async () => {
    const kv = createMockKV()
    await kv.put('matchup-active:g123', JSON.stringify({ status: 'recruiting', participants: [] }))
    const env = { MATCHUP_KV: kv }
    const result = await handleMatchup(makeTerminateInteraction(), env, { waitUntil: () => {} })
    expect(result.type).toBe(5)
  })
})
