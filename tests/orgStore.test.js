import { describe, test, expect, beforeEach } from '@jest/globals'
import { getOrgConfig, setOrgConfig, getOrgPanel, setOrgPanel, deleteOrgPanel } from '../src/utils/orgStore.js'

function createMockKv() {
  const store = new Map()
  return {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value, opts) => store.set(key, value),
    delete: async (key) => store.delete(key),
    _store: store,
  }
}

describe('orgStore', () => {
  let kv

  beforeEach(() => {
    kv = createMockKv()
  })

  describe('getOrgConfig', () => {
    test('returns null when no config exists', async () => {
      const result = await getOrgConfig(kv, 'guild1')
      expect(result).toBeNull()
    })

    test('returns parsed config', async () => {
      const config = { departments: [{ name: '三役', roles: ['幹事長'] }] }
      await kv.put('org:config:guild1', JSON.stringify(config))
      const result = await getOrgConfig(kv, 'guild1')
      expect(result).toEqual(config)
    })
  })

  describe('setOrgConfig', () => {
    test('stores config without TTL', async () => {
      const config = { departments: [{ name: '三役', roles: ['幹事長'] }] }
      await setOrgConfig(kv, 'guild1', config)
      const raw = await kv.get('org:config:guild1')
      expect(JSON.parse(raw)).toEqual(config)
    })
  })

  describe('getOrgPanel', () => {
    test('returns null when no panel exists', async () => {
      const result = await getOrgPanel(kv, 'guild1')
      expect(result).toBeNull()
    })

    test('returns parsed panel info', async () => {
      const panel = { channelId: '123', messageId: '456' }
      await kv.put('org:panel:guild1', JSON.stringify(panel))
      const result = await getOrgPanel(kv, 'guild1')
      expect(result).toEqual(panel)
    })
  })

  describe('setOrgPanel', () => {
    test('stores panel info without TTL', async () => {
      await setOrgPanel(kv, 'guild1', '123', '456')
      const raw = await kv.get('org:panel:guild1')
      expect(JSON.parse(raw)).toEqual({ channelId: '123', messageId: '456' })
    })
  })

  describe('deleteOrgPanel', () => {
    test('removes panel info', async () => {
      await kv.put('org:panel:guild1', JSON.stringify({ channelId: '123', messageId: '456' }))
      await deleteOrgPanel(kv, 'guild1')
      const result = await kv.get('org:panel:guild1')
      expect(result).toBeNull()
    })
  })
})
