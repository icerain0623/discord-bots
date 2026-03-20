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
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }
    const originalFetch = globalThis.fetch
    globalThis.fetch = async () => ({
      ok: true, status: 200, headers: new Headers(),
      json: async () => ({ id: 'x' }), text: async () => '',
    })
    let bgPromise
    const result = await handleMatchup(makeStartInteraction(2), env, { waitUntil: (p) => { bgPromise = p } })
    expect(result.type).toBe(5)
    await bgPromise
    globalThis.fetch = originalFetch
  })
})

describe('doStart background processing', () => {
  const originalFetch = globalThis.fetch
  let fetchCalls

  beforeEach(() => {
    fetchCalls = []
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  function mockFetch(overrides = {}) {
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
            json: async () => ({ id: 'cat-new-123' }),
          }
        }
      }

      // postMessage: POST channel messages
      if (url.includes('/channels/') && url.includes('/messages') && options?.method === 'POST'
          && !url.includes('/webhooks/')) {
        if (overrides.postMessageFail) {
          return {
            ok: false,
            status: 500,
            headers: new Headers(),
            text: async () => 'Internal Server Error',
          }
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ id: 'msg-001' }),
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

  test('creates a category when no categoryId is provided', async () => {
    mockFetch()
    const kv = createMockKV()
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeStartInteraction(3), env, ctx)
    await bgPromise

    const createCategoryCalls = fetchCalls.filter(c => {
      if (!c.url.includes('/guilds/g123/channels') || c.options?.method !== 'POST') return false
      const body = JSON.parse(c.options.body)
      return body.type === 4
    })
    expect(createCategoryCalls).toHaveLength(1)
    const body = JSON.parse(createCategoryCalls[0].options.body)
    expect(body.name).toBe('🎲 Matchup')
  })

  test('does not create a category when categoryId is provided', async () => {
    mockFetch()
    const kv = createMockKV()
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeStartInteraction(3, 'existing-cat-id'), env, ctx)
    await bgPromise

    const createCategoryCalls = fetchCalls.filter(c => {
      if (!c.url.includes('/guilds/') || c.options?.method !== 'POST') return false
      const body = JSON.parse(c.options.body)
      return body.type === 4
    })
    expect(createCategoryCalls).toHaveLength(0)
  })

  test('posts the recruitment message to the channel', async () => {
    mockFetch()
    const kv = createMockKV()
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeStartInteraction(3), env, ctx)
    await bgPromise

    const postCalls = fetchCalls.filter(c =>
      c.url.includes('/channels/ch123/messages') && c.options?.method === 'POST'
    )
    expect(postCalls).toHaveLength(1)
    const body = JSON.parse(postCalls[0].options.body)
    expect(body.embeds[0].title).toContain('募集中')
    expect(body.embeds[0].description).toContain('グループサイズ: 3人')
    expect(body.components[0].components[0].custom_id).toBe('matchup_join')
  })

  test('saves active state to KV with correct fields', async () => {
    mockFetch()
    const kv = createMockKV()
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeStartInteraction(4), env, ctx)
    await bgPromise

    const raw = await kv.get('matchup-active:g123')
    expect(raw).not.toBeNull()
    const active = JSON.parse(raw)
    expect(active.status).toBe('recruiting')
    expect(active.messageId).toBe('msg-001')
    expect(active.channelId).toBe('ch123')
    expect(active.groupSize).toBe(4)
    expect(active.categoryId).toBe('cat-new-123')
    expect(active.participants).toEqual([])
    expect(active.createdChannels).toEqual([])
  })

  test('saves provided categoryId to KV when one is given', async () => {
    mockFetch()
    const kv = createMockKV()
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeStartInteraction(2, 'my-cat-id'), env, ctx)
    await bgPromise

    const active = JSON.parse(await kv.get('matchup-active:g123'))
    expect(active.categoryId).toBe('my-cat-id')
  })

  test('sends a followup success message', async () => {
    mockFetch()
    const kv = createMockKV()
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeStartInteraction(2), env, ctx)
    await bgPromise

    const followupCalls = fetchCalls.filter(c =>
      c.url.includes('/webhooks/app123/interaction-token') && c.options?.method === 'POST'
    )
    expect(followupCalls).toHaveLength(1)
    const body = JSON.parse(followupCalls[0].options.body)
    expect(body.embeds[0].title).toContain('募集開始')
    expect(body.flags).toBe(64)
  })

  test('sends a followup error message when postMessage fails', async () => {
    mockFetch({ postMessageFail: true })
    const kv = createMockKV()
    const env = { MATCHUP_KV: kv, DISCORD_TOKEN: 'test-token' }

    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    await handleMatchup(makeStartInteraction(2), env, ctx)
    await bgPromise

    const followupCalls = fetchCalls.filter(c =>
      c.url.includes('/webhooks/app123/interaction-token') && c.options?.method === 'POST'
    )
    expect(followupCalls).toHaveLength(1)
    const body = JSON.parse(followupCalls[0].options.body)
    expect(body.embeds[0].title).toContain('エラー')
    expect(body.embeds[0].description).toContain('失敗')

    // Should NOT save active state on failure
    const raw = await kv.get('matchup-active:g123')
    expect(raw).toBeNull()
  })
})
