import { jest } from '@jest/globals'
import { handleContactModalSubmit } from '../src/interactions/contactModals.js'

function createMockKV() {
  const store = new Map()
  return {
    async get(key) { return store.get(key) ?? null },
    async put(key, value, _options) { store.set(key, value) },
    async delete(key) { store.delete(key) },
  }
}

function buildInteraction(customId, fieldId, value) {
  return {
    data: {
      custom_id: customId,
      components: [{
        components: [{ custom_id: fieldId, value }],
      }],
    },
    member: { user: { id: 'user123' }, permissions: '8192' },
  }
}

describe('handleContactModalSubmit', () => {
  let kv
  let env

  beforeEach(() => {
    kv = createMockKV()
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'dm_channel_1' }), text: () => Promise.resolve('') })
    )
    env = {
      SESSION_KV: kv,
      DISCORD_TOKEN: 'test-token',
      CONTACT_CHANNEL_ID: 'mod-channel-123',
    }
  })

  afterEach(() => {
    delete global.fetch
  })

  test('初回送信でKVに保存されエフェメラル確認が返る', async () => {
    const interaction = buildInteraction('contact_modal', 'contact_body', 'Help me please')
    const result = await handleContactModalSubmit(interaction, env)

    expect(result.type).toBe(4)
    expect(result.data.flags).toBe(64)
    expect(result.data.content).toContain('匿名で送信しました')
    expect(global.fetch).toHaveBeenCalled()
  })

  test('空の本文はエラーを返す', async () => {
    const interaction = buildInteraction('contact_modal', 'contact_body', '')
    const result = await handleContactModalSubmit(interaction, env)

    expect(result.data.content).toContain('内容を入力してください')
  })

  test('期限切れレポートへの返信はエラーを返す', async () => {
    const interaction = buildInteraction('contact_reply_modal_expired123', 'contact_reply_body', 'Reply')
    const result = await handleContactModalSubmit(interaction, env)

    expect(result.data.content).toContain('期限切れ')
  })
})
