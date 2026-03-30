import { describe, test, expect, afterEach } from '@jest/globals'
import { handleButton } from '../src/interactions/buttons.js'
import { handleModalSubmit } from '../src/interactions/modals.js'

function createMockDO() {
  const store = new Map()
  return {
    idFromName(name) { return `id:${name}` },
    get(id) {
      return {
        async fetch(request) {
          const key = id
          if (request.method === 'GET') {
            const data = store.get(key) ?? null
            return Response.json(data)
          }
          if (request.method === 'PUT') {
            const body = await request.json()
            store.set(key, body)
            return Response.json({ ok: true })
          }
          if (request.method === 'DELETE') {
            store.delete(key)
            return Response.json({ ok: true })
          }
        },
      }
    },
    async _seed(guildId, data) {
      store.set(`id:${guildId}`, data)
    },
  }
}

function createMockKV() {
  const store = new Map()
  return {
    async get(key, _opts) { return store.get(key) ?? null },
    async put(key, value, _opts) { store.set(key, value) },
    async delete(key) { store.delete(key) },
  }
}

function makeButtonInteraction(customId, userId = 'u1') {
  return {
    guild_id: 'g123',
    data: { custom_id: customId },
    member: { user: { id: userId, global_name: 'TestUser' } },
  }
}

function makeModalInteraction(sentence, userId = 'u1') {
  return {
    guild_id: 'g123',
    channel_id: 'ch1',
    application_id: 'app1',
    token: 'tok1',
    data: {
      custom_id: 'relay_modal',
      components: [{
        type: 1,
        components: [{ custom_id: 'relay_sentence', value: sentence }],
      }],
    },
    member: { user: { id: userId, global_name: 'TestUser' } },
  }
}

const originalFetch = globalThis.fetch
let fetchCalls

function mockFetch() {
  fetchCalls = []
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options })
    if (url.includes('/messages') && options?.method === 'PATCH') {
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}), text: async () => '' }
    }
    if (url.includes('/webhooks/') && options?.method === 'POST') {
      return { ok: true, status: 200, headers: new Headers(), text: async () => '' }
    }
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({}), text: async () => '' }
  }
}

afterEach(() => { globalThis.fetch = originalFetch })

describe('relay_add button', () => {
  test('returns error when no relay active', async () => {
    const doNs = createMockDO()
    const result = await handleButton(makeButtonInteraction('relay_add'), { RELAY_DO: doNs, SESSION_KV: createMockKV() })
    expect(result.data.content).toContain('開催されていません')
  })

  test('returns error when same user as last sentence', async () => {
    const doNs = createMockDO()
    await doNs._seed('g123', {
      topic: 'テスト',
      sentences: [{ text: 'a', userId: 'u1', displayName: 'A' }],
    })
    const result = await handleButton(makeButtonInteraction('relay_add', 'u1'), { RELAY_DO: doNs, SESSION_KV: createMockKV() })
    expect(result.data.content).toContain('連続')
  })

  test('shows modal with previous sentence display', async () => {
    const doNs = createMockDO()
    await doNs._seed('g123', {
      topic: 'テスト',
      sentences: [{ text: '前の一文です', userId: 'u-other', displayName: 'Other' }],
    })
    const result = await handleButton(makeButtonInteraction('relay_add', 'u1'), { RELAY_DO: doNs, SESSION_KV: createMockKV() })
    expect(result.type).toBe(9) // MODAL
    expect(result.data.custom_id).toBe('relay_modal')
    expect(result.data.title).toBe('一文リレー')
    // 2 components: prev sentence display + input
    expect(result.data.components).toHaveLength(2)
    expect(result.data.components[0].components[0].custom_id).toBe('relay_prev')
    expect(result.data.components[0].components[0].value).toBe('前の一文です')
    expect(result.data.components[1].components[0].custom_id).toBe('relay_sentence')
    expect(result.data.components[1].components[0].max_length).toBe(140)
  })
})

describe('relay_modal submit', () => {
  test('returns deferred immediately and saves sentence in background', async () => {
    mockFetch()
    const doNs = createMockDO()
    await doNs._seed('g123', {
      topic: 'テスト',
      channelId: 'ch-panel',
      messageId: 'msg-panel',
      sentences: [{ text: '前の文', userId: 'u-other', displayName: 'Other' }],
    })
    const env = { RELAY_DO: doNs, SESSION_KV: createMockKV(), DISCORD_TOKEN: 'test-tok' }
    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    const result = await handleModalSubmit(makeModalInteraction('新しい文'), env, ctx)
    expect(result.type).toBe(5)
    await bgPromise

    const stub = doNs.get(doNs.idFromName('g123'))
    const res = await stub.fetch(new Request('https://relay-do/'))
    const relay = await res.json()
    expect(relay.sentences).toHaveLength(2)
    expect(relay.sentences[1].text).toBe('新しい文')
  })

  test('rejects consecutive post from same user via followup', async () => {
    mockFetch()
    const doNs = createMockDO()
    await doNs._seed('g123', {
      topic: 'テスト',
      channelId: 'ch-panel',
      messageId: 'msg-panel',
      sentences: [{ text: '前の文', userId: 'u1', displayName: 'A' }],
    })
    const env = { RELAY_DO: doNs, SESSION_KV: createMockKV(), DISCORD_TOKEN: 'test-tok' }
    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    const result = await handleModalSubmit(makeModalInteraction('新しい文', 'u1'), env, ctx)
    // Returns deferred immediately
    expect(result.type).toBe(5)
    await bgPromise

    // Sentence should NOT be added
    const stub = doNs.get(doNs.idFromName('g123'))
    const res = await stub.fetch(new Request('https://relay-do/'))
    const relay = await res.json()
    expect(relay.sentences).toHaveLength(1)

    // Followup with rejection message was sent
    const followup = fetchCalls.find(c => c.url.includes('/webhooks/') && c.options?.method === 'POST')
    expect(followup).toBeDefined()
    const body = JSON.parse(followup.options.body)
    expect(body.content).toContain('連続')
  })

  test('sends error followup when relay not found', async () => {
    mockFetch()
    const doNs = createMockDO()
    const env = { RELAY_DO: doNs, SESSION_KV: createMockKV(), DISCORD_TOKEN: 'test-tok' }
    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    const result = await handleModalSubmit(makeModalInteraction('新しい文'), env, ctx)
    expect(result.type).toBe(5)
    await bgPromise

    const followup = fetchCalls.find(c => c.url.includes('/webhooks/') && c.options?.method === 'POST')
    expect(followup).toBeDefined()
    const body = JSON.parse(followup.options.body)
    expect(body.content).toContain('開催されていません')
  })

  test('sends error followup on unexpected error', async () => {
    mockFetch()
    const doNs = createMockDO()
    // Simulate DO failure by making the stub's fetch throw
    doNs.get = (_id) => {
      return {
        async fetch() { throw new Error('DO failure') }
      }
    }
    const env = { RELAY_DO: doNs, SESSION_KV: createMockKV(), DISCORD_TOKEN: 'test-tok' }
    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    const result = await handleModalSubmit(makeModalInteraction('新しい文'), env, ctx)
    expect(result.type).toBe(5)
    await bgPromise

    const followup = fetchCalls.find(c => c.url.includes('/webhooks/') && c.options?.method === 'POST')
    expect(followup).toBeDefined()
    const body = JSON.parse(followup.options.body)
    expect(body.content).toContain('エラーが発生しました')
  })
})
