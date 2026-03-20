import { handleButton } from '../src/interactions/buttons.js'

function createMockKV() {
  const store = new Map()
  return {
    async get(key) { return store.get(key) ?? null },
    async put(key, value, _options) { store.set(key, value) },
    async delete(key) { store.delete(key) },
  }
}

function makeButtonInteraction(customId, userId = 'user1', guildId = 'g123') {
  return {
    guild_id: guildId,
    member: { user: { id: userId, username: 'TestUser' } },
    data: { custom_id: customId },
  }
}

function makeSelectInteraction(customId, values, userId = 'user1', guildId = 'g123') {
  return {
    guild_id: guildId,
    member: { user: { id: userId, username: 'TestUser' } },
    data: { custom_id: customId, values },
  }
}

describe('matchup_join button', () => {
  test('returns error when no active event', async () => {
    const sessionKV = createMockKV()
    const matchupKV = createMockKV()
    const env = { SESSION_KV: sessionKV, MATCHUP_KV: matchupKV }
    const result = await handleButton(makeButtonInteraction('matchup_join'), env)
    expect(result.data.content).toContain('募集中')
  })

  test('shows cancel option when already registered', async () => {
    const sessionKV = createMockKV()
    const matchupKV = createMockKV()
    await matchupKV.put('matchup-active:g123', JSON.stringify({
      status: 'recruiting',
      participants: [{ userId: 'user1', topics: [], freeTopics: [] }],
    }))
    await matchupKV.put('matchup-topics:g123', JSON.stringify(['ゲーム']))
    const env = { SESSION_KV: sessionKV, MATCHUP_KV: matchupKV }
    const result = await handleButton(makeButtonInteraction('matchup_join'), env)
    expect(result.data.content).toContain('既に参加')
  })

  test('shows select menu when topics exist', async () => {
    const sessionKV = createMockKV()
    const matchupKV = createMockKV()
    await matchupKV.put('matchup-active:g123', JSON.stringify({
      status: 'recruiting',
      participants: [],
    }))
    await matchupKV.put('matchup-topics:g123', JSON.stringify(['ゲーム', '音楽']))
    const env = { SESSION_KV: sessionKV, MATCHUP_KV: matchupKV }
    const result = await handleButton(makeButtonInteraction('matchup_join'), env)
    expect(result.data.components[0].components[0].type).toBe(3)
  })
})

describe('matchup_topic_select', () => {
  test('stores pending topics and shows free input choice', async () => {
    const sessionKV = createMockKV()
    const matchupKV = createMockKV()
    await matchupKV.put('matchup-active:g123', JSON.stringify({
      status: 'recruiting',
      participants: [],
    }))
    const env = { SESSION_KV: sessionKV, MATCHUP_KV: matchupKV }
    const result = await handleButton(
      makeSelectInteraction('matchup_topic_select', ['ゲーム', '音楽']),
      env,
    )
    expect(result.data.content).toContain('自由入力')

    const active = JSON.parse(await matchupKV.get('matchup-active:g123'))
    expect(active._pendingTopics['user1'].topics).toEqual(['ゲーム', '音楽'])
  })
})
