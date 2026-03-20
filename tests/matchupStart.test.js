import { handleMatchup } from '../src/commands/matchup.js'

function createMockKV() {
  const store = new Map()
  return {
    async get(key) { return store.get(key) ?? null },
    async put(key, value) { store.set(key, value) },
    async delete(key) { store.delete(key) },
  }
}

function makeStartInteraction(groupSize, categoryId) {
  const options = [{ name: 'group_size', value: groupSize }]
  if (categoryId) options.push({ name: 'category', value: categoryId })
  return {
    guild_id: 'g123',
    application_id: 'app123',
    token: 'interaction-token',
    channel_id: 'ch123',
    data: {
      name: 'matchup',
      options: [{ name: 'start', type: 1, options }],
    },
  }
}

describe('matchup start', () => {
  test('rejects if an event is already active', async () => {
    const kv = createMockKV()
    await kv.put('matchup-active:g123', JSON.stringify({ status: 'recruiting' }))
    const env = { MATCHUP_KV: kv }
    const result = await handleMatchup(makeStartInteraction(2), env)
    expect(result.data.content).toContain('既に')
  })

  test('returns deferred response for valid start', async () => {
    const kv = createMockKV()
    const env = { MATCHUP_KV: kv }
    const result = await handleMatchup(makeStartInteraction(2), env, { waitUntil: () => {} })
    expect(result.type).toBe(5)
  })
})
