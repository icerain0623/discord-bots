import { handleMatchup } from '../src/commands/matchup.js'

function createMockKV() {
  const store = new Map()
  return {
    async get(key) { return store.get(key) ?? null },
    async put(key, value) { store.set(key, value) },
    async delete(key) { store.delete(key) },
  }
}

function makeInteraction(subgroup, subcommand, options = {}) {
  const optionEntries = Object.entries(options).map(([name, value]) => ({ name, value }))
  return {
    guild_id: 'g123',
    member: { permissions: '32' },
    data: {
      name: 'matchup',
      options: [{
        name: subgroup,
        type: 2,
        options: [{
          name: subcommand,
          type: 1,
          options: optionEntries,
        }],
      }],
    },
  }
}

describe('matchup topics add', () => {
  test('adds a topic successfully', async () => {
    const kv = createMockKV()
    const env = { MATCHUP_KV: kv }
    const interaction = makeInteraction('topics', 'add', { name: 'ゲーム' })
    const result = await handleMatchup(interaction, env)
    expect(result.data.content).toContain('ゲーム')
    expect(result.data.content).toContain('追加')
  })

  test('rejects duplicate topic', async () => {
    const kv = createMockKV()
    const env = { MATCHUP_KV: kv }
    await handleMatchup(makeInteraction('topics', 'add', { name: 'ゲーム' }), env)
    const result = await handleMatchup(makeInteraction('topics', 'add', { name: 'ゲーム' }), env)
    expect(result.data.content).toContain('既に')
  })
})

describe('matchup topics remove', () => {
  test('removes an existing topic', async () => {
    const kv = createMockKV()
    const env = { MATCHUP_KV: kv }
    await handleMatchup(makeInteraction('topics', 'add', { name: 'ゲーム' }), env)
    const result = await handleMatchup(makeInteraction('topics', 'remove', { name: 'ゲーム' }), env)
    expect(result.data.content).toContain('削除')
  })
})

describe('matchup topics list', () => {
  test('shows empty message when no topics', async () => {
    const kv = createMockKV()
    const env = { MATCHUP_KV: kv }
    const interaction = makeInteraction('topics', 'list')
    const result = await handleMatchup(interaction, env)
    expect(result.data.embeds[0].description).toContain('未登録')
  })

  test('lists registered topics', async () => {
    const kv = createMockKV()
    const env = { MATCHUP_KV: kv }
    await handleMatchup(makeInteraction('topics', 'add', { name: 'ゲーム' }), env)
    await handleMatchup(makeInteraction('topics', 'add', { name: '音楽' }), env)
    const result = await handleMatchup(makeInteraction('topics', 'list'), env)
    expect(result.data.embeds[0].description).toContain('ゲーム')
    expect(result.data.embeds[0].description).toContain('音楽')
  })
})
