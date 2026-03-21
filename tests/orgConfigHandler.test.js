import { describe, test, expect, beforeEach } from '@jest/globals'
import { handleOrgConfigModal } from '../src/interactions/orgConfigHandler.js'

function createMockKv() {
  const store = new Map()
  return {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => store.set(key, value),
    delete: async (key) => store.delete(key),
  }
}

function buildModalInteraction(jsonStr) {
  return {
    guild_id: 'guild1',
    data: {
      custom_id: 'org_config_modal',
      components: [{
        type: 1,
        components: [{
          type: 4,
          custom_id: 'org_config_json',
          value: jsonStr,
        }],
      }],
    },
  }
}

describe('handleOrgConfigModal', () => {
  let kv, env

  beforeEach(() => {
    kv = createMockKv()
    env = { SESSION_KV: kv }
  })

  test('saves valid config', async () => {
    const config = { departments: [{ name: '三役', roles: ['幹事長'] }] }
    const interaction = buildModalInteraction(JSON.stringify(config))
    const result = await handleOrgConfigModal(interaction, env)
    expect(result.type).toBe(4)
    expect(result.data.content).toContain('保存しました')
    const stored = JSON.parse(await kv.get('org:config:guild1'))
    expect(stored).toEqual(config)
  })

  test('returns error for invalid JSON', async () => {
    const interaction = buildModalInteraction('{invalid}')
    const result = await handleOrgConfigModal(interaction, env)
    expect(result.data.content).toContain('JSON解析エラー')
  })

  test('returns error when departments missing', async () => {
    const interaction = buildModalInteraction('{"foo": "bar"}')
    const result = await handleOrgConfigModal(interaction, env)
    expect(result.data.content).toContain('departments')
  })

  test('returns error when department has no name', async () => {
    const interaction = buildModalInteraction('{"departments": [{"roles": []}]}')
    const result = await handleOrgConfigModal(interaction, env)
    expect(result.data.content).toContain('name')
  })
})
