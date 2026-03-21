import { describe, test, expect, beforeEach } from '@jest/globals'
import { handleOrg } from '../src/commands/org.js'

function createMockKv() {
  const store = new Map()
  return {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => store.set(key, value),
    delete: async (key) => store.delete(key),
  }
}

function buildInteraction(subName, options = {}) {
  const opts = Object.entries(options).map(([name, value]) => ({ name, value }))
  return {
    guild_id: 'guild1',
    channel_id: 'ch1',
    application_id: 'app1',
    token: 'tok1',
    member: { permissions: String(1n << 5n) }, // MANAGE_GUILD
    data: {
      name: 'org',
      options: [{ name: subName, type: 1, options: opts }],
    },
  }
}

describe('handleOrg', () => {
  let kv, env

  beforeEach(() => {
    kv = createMockKv()
    env = { SESSION_KV: kv, DISCORD_TOKEN: 'test-token' }
  })

  test('denies access without MANAGE_GUILD', async () => {
    const interaction = buildInteraction('config')
    interaction.member.permissions = '0'
    const result = await handleOrg(interaction, env)
    expect(result.data.content).toContain('権限')
  })

  test('config shows modal with type 9', async () => {
    const interaction = buildInteraction('config')
    const result = await handleOrg(interaction, env)
    expect(result.type).toBe(9)
    expect(result.data.custom_id).toBe('org_config_modal')
  })

  test('config shows modal with existing config', async () => {
    const config = { departments: [{ name: '三役', roles: ['幹事長'] }] }
    await kv.put('org:config:guild1', JSON.stringify(config))
    const interaction = buildInteraction('config')
    const result = await handleOrg(interaction, env)
    expect(result.type).toBe(9)
    const textInput = result.data.components[0].components[0]
    expect(textInput.value).toContain('三役')
  })

  test('refresh returns error when no config', async () => {
    const interaction = buildInteraction('refresh')
    const result = await handleOrg(interaction, env)
    expect(result.data.content).toContain('部門定義')
  })

  test('refresh returns error when no panel', async () => {
    await kv.put('org:config:guild1', JSON.stringify({ departments: [] }))
    const interaction = buildInteraction('refresh')
    const result = await handleOrg(interaction, env)
    expect(result.data.content).toContain('パネル')
  })

  test('setup returns error when no config', async () => {
    const interaction = buildInteraction('setup', { channel: 'ch_target' })
    const result = await handleOrg(interaction, env)
    expect(result.data.content).toContain('部門定義')
  })

  test('setup returns deferred response when config exists', async () => {
    await kv.put('org:config:guild1', JSON.stringify({ departments: [] }))
    const interaction = buildInteraction('setup', { channel: 'ch_target' })
    interaction.data.options[0].options = [{ name: 'channel', value: 'ch_target', type: 7 }]
    const ctx = { waitUntil: () => {} }
    const result = await handleOrg(interaction, env, ctx)
    expect(result.type).toBe(5)
  })

  test('setup deletes old panel before creating new one', async () => {
    await kv.put('org:config:guild1', JSON.stringify({ departments: [] }))
    await kv.put('org:panel:guild1', JSON.stringify({ channelId: 'old_ch', messageId: 'old_msg' }))
    const interaction = buildInteraction('setup', { channel: 'ch_new' })
    interaction.data.options[0].options = [{ name: 'channel', value: 'ch_new', type: 7 }]
    const waitUntilFn = []
    const ctx = { waitUntil: (p) => waitUntilFn.push(p) }
    const result = await handleOrg(interaction, env, ctx)
    expect(result.type).toBe(5)
    expect(waitUntilFn.length).toBe(1)
  })

  test('refresh returns deferred response when config and panel exist', async () => {
    await kv.put('org:config:guild1', JSON.stringify({ departments: [] }))
    await kv.put('org:panel:guild1', JSON.stringify({ channelId: 'ch1', messageId: 'msg1' }))
    const interaction = buildInteraction('refresh')
    const ctx = { waitUntil: () => {} }
    const result = await handleOrg(interaction, env, ctx)
    expect(result.type).toBe(5)
  })
})
