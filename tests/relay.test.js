import { describe, test, expect, afterEach } from '@jest/globals'
import { handleRelay } from '../src/commands/relay.js'

function createMockKV() {
  const store = new Map()
  return {
    async get(key) { return store.get(key) ?? null },
    async put(key, value, _opts) { store.set(key, value) },
    async delete(key) { store.delete(key) },
  }
}

function makeInteraction(sub, options = {}) {
  const opts = Object.entries(options).map(([name, value]) => ({ name, value }))
  return {
    guild_id: 'g123',
    application_id: 'app1',
    token: 'tok1',
    channel_id: 'ch1',
    member: {
      permissions: '32',
      user: { id: 'u-admin', global_name: 'Admin' },
    },
    data: {
      name: 'relay',
      options: [{ name: sub, type: 1, options: opts }],
    },
  }
}

function makeNoPermInteraction(sub) {
  const i = makeInteraction(sub)
  i.member.permissions = '0'
  return i
}

const originalFetch = globalThis.fetch
let fetchCalls

function mockFetch() {
  fetchCalls = []
  globalThis.fetch = async (url, options) => {
    fetchCalls.push({ url, options })
    if (url.includes('/channels/') && url.includes('/messages') && options?.method === 'POST'
        && !url.includes('/webhooks/')) {
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({ id: 'msg-001' }), text: async () => '' }
    }
    if (url.includes('/channels/') && url.includes('/messages/') && options?.method === 'PATCH') {
      return { ok: true, status: 200, headers: new Headers(), json: async () => ({}), text: async () => '' }
    }
    if (url.includes('/webhooks/') && options?.method === 'POST') {
      return { ok: true, status: 200, headers: new Headers(), text: async () => 'ok' }
    }
    return { ok: true, status: 200, headers: new Headers(), json: async () => ({}), text: async () => '' }
  }
}

afterEach(() => { globalThis.fetch = originalFetch })

describe('relay — permission check', () => {
  test('rejects without ManageGuild', async () => {
    const result = await handleRelay(makeNoPermInteraction('start'), { SESSION_KV: createMockKV() })
    expect(result.data.content).toContain('権限')
  })
})

describe('relay help', () => {
  test('returns ephemeral help text with all commands', async () => {
    const result = await handleRelay(makeInteraction('help'), { SESSION_KV: createMockKV() })
    expect(result.type).toBe(4)
    expect(result.data.flags).toBe(64)
    expect(result.data.content).toContain('/relay start')
    expect(result.data.content).toContain('/relay status')
    expect(result.data.content).toContain('/relay delete')
    expect(result.data.content).toContain('/relay end')
    expect(result.data.content).toContain('/relay post')
    expect(result.data.content).toContain('/relay reveal')
    expect(result.data.content).toContain('/relay terminate')
    expect(result.data.content).toContain('基本の流れ')
  })
})

describe('relay start', () => {
  test('rejects if relay already active', async () => {
    const kv = createMockKV()
    await kv.put('relay-active:g123', JSON.stringify({ topic: 'x', sentences: [] }))
    const result = await handleRelay(makeInteraction('start', { topic: 'テスト', first_sentence: '最初の文' }), { SESSION_KV: kv })
    expect(result.data.content).toContain('既に')
  })

  test('returns deferred response and saves state', async () => {
    mockFetch()
    const kv = createMockKV()
    const env = { SESSION_KV: kv, DISCORD_TOKEN: 'test-tok' }
    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    const result = await handleRelay(makeInteraction('start', { topic: 'お題', first_sentence: '最初の一文です。' }), env, ctx)
    expect(result.type).toBe(5)
    await bgPromise

    const relay = JSON.parse(await kv.get('relay-active:g123'))
    expect(relay.topic).toBe('お題')
    expect(relay.sentences).toHaveLength(1)
    expect(relay.sentences[0].text).toBe('最初の一文です。')
    expect(relay.channelId).toBe('ch1')
    expect(relay.messageId).toBe('msg-001')
  })
})

describe('relay status', () => {
  test('returns error when no relay active', async () => {
    const result = await handleRelay(makeInteraction('status'), { SESSION_KV: createMockKV() })
    expect(result.data.content).toContain('開催されていません')
  })

  test('returns numbered sentences', async () => {
    const kv = createMockKV()
    await kv.put('relay-active:g123', JSON.stringify({
      topic: 'テスト',
      sentences: [
        { text: '一文目', userId: 'u1', displayName: 'Alice' },
        { text: '二文目', userId: 'u2', displayName: 'Bob' },
      ],
    }))
    const result = await handleRelay(makeInteraction('status'), { SESSION_KV: kv })
    expect(result.data.content).toContain('1.')
    expect(result.data.content).toContain('Alice')
    expect(result.data.content).toContain('2.')
    expect(result.data.content).toContain('Bob')
  })
})

describe('relay delete', () => {
  test('rejects out-of-range number', async () => {
    const kv = createMockKV()
    await kv.put('relay-active:g123', JSON.stringify({
      topic: 'テスト',
      sentences: [{ text: 'a', userId: 'u1', displayName: 'A' }],
    }))
    const result = await handleRelay(makeInteraction('delete', { number: 5 }), { SESSION_KV: kv })
    expect(result.data.content).toContain('範囲外')
  })

  test('deletes the specified sentence', async () => {
    const kv = createMockKV()
    await kv.put('relay-active:g123', JSON.stringify({
      topic: 'テスト',
      sentences: [
        { text: 'a', userId: 'u1', displayName: 'A' },
        { text: 'b', userId: 'u2', displayName: 'B' },
      ],
    }))
    const result = await handleRelay(makeInteraction('delete', { number: 1 }), { SESSION_KV: kv })
    expect(result.data.content).toContain('削除しました')
    const relay = JSON.parse(await kv.get('relay-active:g123'))
    expect(relay.sentences).toHaveLength(1)
    expect(relay.sentences[0].text).toBe('b')
  })
})

describe('relay end', () => {
  test('rejects when no relay active', async () => {
    const result = await handleRelay(makeInteraction('end'), { SESSION_KV: createMockKV() })
    expect(result.data.content).toContain('開催されていません')
  })

  test('disables button and keeps data', async () => {
    mockFetch()
    const kv = createMockKV()
    await kv.put('relay-active:g123', JSON.stringify({
      topic: 'お題',
      channelId: 'ch1',
      messageId: 'msg-panel',
      sentences: [
        { text: '一文目', userId: 'u1', displayName: 'A' },
        { text: '二文目', userId: 'u2', displayName: 'B' },
      ],
    }))
    const env = { SESSION_KV: kv, DISCORD_TOKEN: 'test-tok' }
    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    const result = await handleRelay(makeInteraction('end'), env, ctx)
    expect(result.type).toBe(5)
    await bgPromise

    const editCalls = fetchCalls.filter(c =>
      c.url.includes('/channels/ch1/messages/msg-panel') && c.options?.method === 'PATCH'
    )
    expect(editCalls).toHaveLength(1)
    const editBody = JSON.parse(editCalls[0].options.body)
    expect(editBody.components).toEqual([])

    expect(await kv.get('relay-active:g123')).not.toBeNull()
  })
})

describe('relay post', () => {
  test('posts full text anonymously and keeps data', async () => {
    mockFetch()
    const kv = createMockKV()
    await kv.put('relay-active:g123', JSON.stringify({
      topic: 'お題',
      channelId: 'ch1',
      messageId: 'msg-panel',
      sentences: [
        { text: '一文目', userId: 'u1', displayName: 'A' },
        { text: '二文目', userId: 'u2', displayName: 'B' },
      ],
    }))
    const env = { SESSION_KV: kv, DISCORD_TOKEN: 'test-tok' }
    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    const result = await handleRelay(makeInteraction('post', { channel: 'ch-out' }), env, ctx)
    expect(result.type).toBe(5)
    await bgPromise

    const postCalls = fetchCalls.filter(c =>
      c.url.includes('/channels/ch-out/messages') && c.options?.method === 'POST'
    )
    expect(postCalls.length).toBeGreaterThanOrEqual(1)
    const body = JSON.parse(postCalls[0].options.body)
    expect(body.content).toContain('一文目')
    expect(body.content).toContain('二文目')

    expect(await kv.get('relay-active:g123')).not.toBeNull()
  })
})

describe('relay reveal', () => {
  test('posts spoiler and keeps data', async () => {
    mockFetch()
    const kv = createMockKV()
    await kv.put('relay-active:g123', JSON.stringify({
      topic: 'お題',
      channelId: 'ch1',
      messageId: 'msg-panel',
      sentences: [
        { text: '一文目', userId: 'u1', displayName: 'A' },
        { text: '二文目', userId: 'u2', displayName: 'B' },
      ],
    }))
    const env = { SESSION_KV: kv, DISCORD_TOKEN: 'test-tok' }
    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    const result = await handleRelay(makeInteraction('reveal', { channel: 'ch-out' }), env, ctx)
    expect(result.type).toBe(5)
    await bgPromise

    const postCalls = fetchCalls.filter(c =>
      c.url.includes('/channels/ch-out/messages') && c.options?.method === 'POST'
    )
    expect(postCalls.length).toBeGreaterThanOrEqual(1)
    const body = JSON.parse(postCalls[0].options.body)
    expect(body.content).toContain('A')
    expect(body.content).toContain('B')

    expect(await kv.get('relay-active:g123')).not.toBeNull()
  })
})

describe('relay terminate', () => {
  test('edits panel and deletes KV', async () => {
    mockFetch()
    const kv = createMockKV()
    await kv.put('relay-active:g123', JSON.stringify({
      topic: 'テスト',
      channelId: 'ch1',
      messageId: 'msg-panel',
      sentences: [],
    }))
    const env = { SESSION_KV: kv, DISCORD_TOKEN: 'test-tok' }
    let bgPromise
    const ctx = { waitUntil: (p) => { bgPromise = p } }
    const result = await handleRelay(makeInteraction('terminate'), env, ctx)
    expect(result.type).toBe(5)
    await bgPromise

    const editCalls = fetchCalls.filter(c =>
      c.url.includes('/channels/ch1/messages/msg-panel') && c.options?.method === 'PATCH'
    )
    expect(editCalls).toHaveLength(1)

    expect(await kv.get('relay-active:g123')).toBeNull()
  })
})
