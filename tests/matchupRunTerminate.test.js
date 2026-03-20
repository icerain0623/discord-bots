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
    member: { permissions: '32' },
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
    member: { permissions: '32' },
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
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      ok: true, status: 200, headers: new Headers(),
      json: async () => ({ id: 'x' }), text: async () => '',
    })
    let bgPromise
    const result = await handleMatchup(makeRunInteraction(), env, { waitUntil: (p) => { bgPromise = p } })
    expect(result.type).toBe(5)
    await bgPromise
    globalThis.fetch = originalFetch
  })
})

describe('doRun background processing', () => {
  const originalFetch = globalThis.fetch
  let fetchCalls
  let channelCounter

  beforeEach(() => {
    fetchCalls = []
    channelCounter = 0
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetch() {
    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, options })

      // createCategory: POST guild channels with type:4
      if (url.includes('/guilds/') && url.endsWith('/channels') && options?.method === 'POST') {
        const body = JSON.parse(options.body)
        if (body.type === 4) {
          return {
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => ({ id: 'cat-auto-123' }),
          }
        }
        // createChannel: POST guild channels with type:0
        channelCounter++
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ id: `created-ch-${channelCounter}` }),
        }
      }

      // postMessage: POST channel messages (not webhooks)
      if (url.includes('/channels/') && url.includes('/messages') && options?.method === 'POST'
          && !url.includes('/webhooks/')) {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ id: 'msg-posted' }),
        }
      }

      // editMessage: PATCH channel messages
      if (url.includes('/channels/') && url.includes('/messages') && options?.method === 'PATCH') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({}),
        }
      }

      // sendFollowupMessage: POST webhooks
      if (url.includes('/webhooks/') && options?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => 'ok',
        }
      }

      // deleteChannel: DELETE
      if (options?.method === 'DELETE') {
        return {
          ok: true,
          status: 204,
          headers: new Headers(),
          text: async () => '',
        }
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
        text: async () => '',
      }
    }
  }

  function makeActiveState(participantCount, groupSize, extras = {}) {
    const participants = Array.from({ length: participantCount }, (_, i) => ({
      userId: `user-${i + 1}`,
      topics: ['ゲーム'],
      freeTopics: [],
    }))
    return {
      status: 'recruiting',
      messageId: 'recruit-msg-1',
      channelId: 'recruit-ch-1',
      groupSize,
      categoryId: 'cat-existing',
      participants,
      createdChannels: [],
      ...extras,
    }
  }

  test('creates channels for each group with correct permissions', async () => {
    mockFetch()
    const kv = createMockKV()
    const active = makeActiveState(4, 2)
    await kv.put('matchup-active:g123', JSON.stringify(active))
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeRunInteraction(), env, ctx)
    await bgPromise

    // 4 participants, group size 2 -> 2 groups -> 2 channel creations
    const createChannelCalls = fetchCalls.filter(c => {
      if (!c.url.includes('/guilds/g123/channels') || c.options?.method !== 'POST') return false
      const body = JSON.parse(c.options.body)
      return body.type === 0
    })
    expect(createChannelCalls).toHaveLength(2)

    // Verify permission overwrites include guild deny + member allows + bot allow
    const firstPayload = JSON.parse(createChannelCalls[0].options.body)
    expect(firstPayload.parent_id).toBe('cat-existing')
    expect(firstPayload.name).toBe('matchup-1')
    // @everyone deny + 2 members allow + bot allow = 4 overwrites
    expect(firstPayload.permission_overwrites).toHaveLength(4)
    // @everyone deny
    expect(firstPayload.permission_overwrites[0]).toEqual({ id: 'g123', type: 0, deny: '1024' })
    // bot allow (applicationId = botId)
    const botOverwrite = firstPayload.permission_overwrites.find(o => o.id === 'app123')
    expect(botOverwrite).toEqual({ id: 'app123', type: 1, allow: '1024' })
  })

  test('posts greeting messages in created channels', async () => {
    mockFetch()
    const kv = createMockKV()
    const active = makeActiveState(4, 2)
    await kv.put('matchup-active:g123', JSON.stringify(active))
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeRunInteraction(), env, ctx)
    await bgPromise

    // Should post a greeting to each of the 2 created channels
    const greetingCalls = fetchCalls.filter(c =>
      c.url.includes('/channels/created-ch-') && c.url.includes('/messages') && c.options?.method === 'POST'
    )
    expect(greetingCalls).toHaveLength(2)

    // Verify greeting content contains member mentions
    const firstGreeting = JSON.parse(greetingCalls[0].options.body)
    expect(firstGreeting.content).toContain('マッチングされました')
    expect(firstGreeting.content).toContain('<@')
  })

  test('updates active state to matched with createdChannels list', async () => {
    mockFetch()
    const kv = createMockKV()
    const active = makeActiveState(4, 2)
    await kv.put('matchup-active:g123', JSON.stringify(active))
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeRunInteraction(), env, ctx)
    await bgPromise

    const raw = await kv.get('matchup-active:g123')
    const updated = JSON.parse(raw)
    expect(updated.status).toBe('matched')
    expect(updated.createdChannels).toHaveLength(2)
    expect(updated.createdChannels).toContain('created-ch-1')
    expect(updated.createdChannels).toContain('created-ch-2')
    expect(updated.categoryId).toBe('cat-existing')
  })

  test('edits the recruitment message to show completion', async () => {
    mockFetch()
    const kv = createMockKV()
    const active = makeActiveState(4, 2)
    await kv.put('matchup-active:g123', JSON.stringify(active))
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeRunInteraction(), env, ctx)
    await bgPromise

    const editCalls = fetchCalls.filter(c =>
      c.url.includes('/channels/recruit-ch-1/messages/recruit-msg-1') && c.options?.method === 'PATCH'
    )
    expect(editCalls).toHaveLength(1)
    const body = JSON.parse(editCalls[0].options.body)
    expect(body.embeds[0].title).toContain('マッチング完了')
    expect(body.embeds[0].description).toContain('2グループ')
    expect(body.components).toEqual([])
  })

  test('sends a followup message with channel count', async () => {
    mockFetch()
    const kv = createMockKV()
    const active = makeActiveState(4, 2)
    await kv.put('matchup-active:g123', JSON.stringify(active))
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeRunInteraction(), env, ctx)
    await bgPromise

    const followupCalls = fetchCalls.filter(c =>
      c.url.includes('/webhooks/app123/tok') && c.options?.method === 'POST'
    )
    expect(followupCalls).toHaveLength(1)
    const body = JSON.parse(followupCalls[0].options.body)
    expect(body.embeds[0].title).toContain('マッチング完了')
    expect(body.embeds[0].description).toContain('2個のチャンネル')
    expect(body.flags).toBe(64)
  })

  test('cleans up _pendingTopics from active state', async () => {
    mockFetch()
    const kv = createMockKV()
    const active = makeActiveState(2, 2, { _pendingTopics: { 'user-1': ['topic1'] } })
    await kv.put('matchup-active:g123', JSON.stringify(active))
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeRunInteraction(), env, ctx)
    await bgPromise

    const raw = await kv.get('matchup-active:g123')
    const updated = JSON.parse(raw)
    expect(updated._pendingTopics).toBeUndefined()
    expect(updated.status).toBe('matched')
  })

  test('creates a category when active state has no categoryId', async () => {
    mockFetch()
    const kv = createMockKV()
    const active = makeActiveState(2, 2, { categoryId: null })
    await kv.put('matchup-active:g123', JSON.stringify(active))
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeRunInteraction(), env, ctx)
    await bgPromise

    const createCategoryCalls = fetchCalls.filter(c => {
      if (!c.url.includes('/guilds/g123/channels') || c.options?.method !== 'POST') return false
      const body = JSON.parse(c.options.body)
      return body.type === 4
    })
    expect(createCategoryCalls).toHaveLength(1)

    const updated = JSON.parse(await kv.get('matchup-active:g123'))
    expect(updated.categoryId).toBe('cat-auto-123')
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
    await kv.put('matchup-active:g123', JSON.stringify({
      status: 'recruiting', participants: [], messageId: 'msg-1', channelId: 'ch-1', createdChannels: [],
    }))
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      ok: true, status: 200, headers: new Headers(),
      json: async () => ({}), text: async () => '',
    })
    let bgPromise
    const result = await handleMatchup(makeTerminateInteraction(), env, { waitUntil: (p) => { bgPromise = p } })
    expect(result.type).toBe(5)
    await bgPromise
    globalThis.fetch = originalFetch
  })
})

describe('doTerminate background processing', () => {
  const originalFetch = globalThis.fetch
  let fetchCalls

  beforeEach(() => {
    fetchCalls = []
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetch() {
    globalThis.fetch = async (url, options) => {
      fetchCalls.push({ url, options })

      // deleteChannel: DELETE
      if (url.includes('/channels/') && options?.method === 'DELETE') {
        return {
          ok: true,
          status: 204,
          headers: new Headers(),
          text: async () => '',
        }
      }

      // editMessage: PATCH channel messages
      if (url.includes('/channels/') && url.includes('/messages') && options?.method === 'PATCH') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({}),
        }
      }

      // sendFollowupMessage: POST webhooks
      if (url.includes('/webhooks/') && options?.method === 'POST') {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          text: async () => 'ok',
        }
      }

      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({}),
        text: async () => '',
      }
    }
  }

  test('deletes created channels when status is matched', async () => {
    mockFetch()
    const kv = createMockKV()
    await kv.put('matchup-active:g123', JSON.stringify({
      status: 'matched',
      messageId: 'msg-1',
      channelId: 'ch-1',
      createdChannels: ['ch-a', 'ch-b', 'ch-c'],
    }))
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeTerminateInteraction(), env, ctx)
    await bgPromise

    const deleteCalls = fetchCalls.filter(c => c.options?.method === 'DELETE')
    expect(deleteCalls).toHaveLength(3)
    const deletedUrls = deleteCalls.map(c => c.url)
    expect(deletedUrls).toContain('https://discord.com/api/v10/channels/ch-a')
    expect(deletedUrls).toContain('https://discord.com/api/v10/channels/ch-b')
    expect(deletedUrls).toContain('https://discord.com/api/v10/channels/ch-c')
  })

  test('does not delete channels when status is recruiting', async () => {
    mockFetch()
    const kv = createMockKV()
    await kv.put('matchup-active:g123', JSON.stringify({
      status: 'recruiting',
      messageId: 'msg-1',
      channelId: 'ch-1',
      createdChannels: [],
    }))
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeTerminateInteraction(), env, ctx)
    await bgPromise

    const deleteCalls = fetchCalls.filter(c => c.options?.method === 'DELETE')
    expect(deleteCalls).toHaveLength(0)
  })

  test('edits the recruitment message to show termination', async () => {
    mockFetch()
    const kv = createMockKV()
    await kv.put('matchup-active:g123', JSON.stringify({
      status: 'recruiting',
      messageId: 'msg-1',
      channelId: 'ch-1',
      createdChannels: [],
    }))
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeTerminateInteraction(), env, ctx)
    await bgPromise

    const editCalls = fetchCalls.filter(c =>
      c.url.includes('/channels/ch-1/messages/msg-1') && c.options?.method === 'PATCH'
    )
    expect(editCalls).toHaveLength(1)
    const body = JSON.parse(editCalls[0].options.body)
    expect(body.embeds[0].title).toContain('終了')
    expect(body.components).toEqual([])
  })

  test('deletes the active state from KV', async () => {
    mockFetch()
    const kv = createMockKV()
    await kv.put('matchup-active:g123', JSON.stringify({
      status: 'recruiting',
      messageId: 'msg-1',
      channelId: 'ch-1',
      createdChannels: [],
    }))
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeTerminateInteraction(), env, ctx)
    await bgPromise

    const raw = await kv.get('matchup-active:g123')
    expect(raw).toBeNull()
  })

  test('sends a followup termination message for recruiting status', async () => {
    mockFetch()
    const kv = createMockKV()
    await kv.put('matchup-active:g123', JSON.stringify({
      status: 'recruiting',
      messageId: 'msg-1',
      channelId: 'ch-1',
      createdChannels: [],
    }))
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeTerminateInteraction(), env, ctx)
    await bgPromise

    const followupCalls = fetchCalls.filter(c =>
      c.url.includes('/webhooks/app123/tok') && c.options?.method === 'POST'
    )
    expect(followupCalls).toHaveLength(1)
    const body = JSON.parse(followupCalls[0].options.body)
    expect(body.embeds[0].title).toContain('終了')
    expect(body.embeds[0].description).toContain('マッチングイベントを終了しました')
    // For recruiting status, should NOT mention channel deletion
    expect(body.embeds[0].description).not.toContain('チャンネルを削除')
    expect(body.flags).toBe(64)
  })

  test('sends a followup message mentioning channel deletion for matched status', async () => {
    mockFetch()
    const kv = createMockKV()
    await kv.put('matchup-active:g123', JSON.stringify({
      status: 'matched',
      messageId: 'msg-1',
      channelId: 'ch-1',
      createdChannels: ['ch-a', 'ch-b'],
    }))
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeTerminateInteraction(), env, ctx)
    await bgPromise

    const followupCalls = fetchCalls.filter(c =>
      c.url.includes('/webhooks/app123/tok') && c.options?.method === 'POST'
    )
    expect(followupCalls).toHaveLength(1)
    const body = JSON.parse(followupCalls[0].options.body)
    expect(body.embeds[0].description).toContain('チャンネルを削除')
  })
})
