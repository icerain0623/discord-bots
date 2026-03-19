import { getTextChannels, getAllMessages, fetchAllChannelMessages, sendFollowup } from '../src/utils/discordApi.js'

const mockFetch = (responses) => {
  let callIndex = 0
  globalThis.fetch = async (_url, _options) => {
    const res = responses[callIndex] ?? responses[responses.length - 1]
    callIndex++
    return res
  }
}

const jsonResponse = (data, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  headers: new Map(Object.entries({
    'x-ratelimit-remaining': '10',
    'x-ratelimit-reset-after': '0',
    ...headers,
  })),
})

const TOKEN = 'test-token'

afterEach(() => {
  delete globalThis.fetch
})

describe('getTextChannels', () => {
  test('テキストチャンネルのみ返す', async () => {
    mockFetch([
      jsonResponse([
        { id: '1', type: 0, name: 'general' },
        { id: '2', type: 2, name: 'voice' },
        { id: '3', type: 0, name: 'random' },
        { id: '4', type: 5, name: 'announcements' },
      ]),
    ])
    const channels = await getTextChannels('guild1', TOKEN)
    expect(channels.map(c => c.id)).toEqual(['1', '3'])
  })
})

describe('getAllMessages', () => {
  test('7日以内のメッセージを取得する', async () => {
    const now = new Date()
    const recent = new Date(now - 1000 * 60 * 60).toISOString()
    mockFetch([
      jsonResponse([
        { id: '100', content: 'hi', timestamp: recent, author: { bot: false } },
      ]),
      jsonResponse([]),
    ])
    const messages = await getAllMessages('ch1', TOKEN)
    expect(messages).toHaveLength(1)
  })

  test('403 エラーの場合は空配列を返す', async () => {
    mockFetch([jsonResponse(null, 403)])
    const messages = await getAllMessages('ch1', TOKEN)
    expect(messages).toEqual([])
  })
})

describe('sendFollowup', () => {
  test('webhook URL に Authorization ヘッダーなしで送信する', async () => {
    let capturedUrl, capturedHeaders, capturedBody
    globalThis.fetch = async (url, options) => {
      capturedUrl = url
      capturedHeaders = options.headers
      capturedBody = JSON.parse(options.body)
      return jsonResponse({ id: 'msg1' })
    }
    await sendFollowup('app1', 'token1', { title: 'test' })
    expect(capturedUrl).toBe('https://discord.com/api/v10/webhooks/app1/token1')
    expect(capturedHeaders.Authorization).toBeUndefined()
    expect(capturedBody.embeds[0].title).toBe('test')
  })
})

describe('fetchAllChannelMessages', () => {
  test('5チャンネルずつバッチで並列取得する', async () => {
    const now = new Date()
    const recent = new Date(now - 1000 * 60 * 60).toISOString()
    globalThis.fetch = async (url, _options) => {
      if (url.includes('/messages')) {
        return jsonResponse([
          { id: '1', content: 'hi', timestamp: recent, author: { bot: false } },
        ])
      }
      return jsonResponse([])
    }
    const channels = Array.from({ length: 7 }, (_, i) => ({ id: `ch${i}` }))
    const messages = await fetchAllChannelMessages(channels, TOKEN)
    expect(messages).toHaveLength(7)
  })
})
