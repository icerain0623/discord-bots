import { getRelay, saveRelay, deleteRelay } from '../src/utils/relayStore.js'

function createMockKV() {
  const store = new Map()
  return {
    async get(key) { return store.get(key) ?? null },
    async put(key, value, opts) { store.set(key, value) },
    async delete(key) { store.delete(key) },
  }
}

const GUILD = 'g123'

describe('relayStore', () => {
  let kv
  beforeEach(() => { kv = createMockKV() })

  test('getRelay returns null when no relay exists', async () => {
    expect(await getRelay(kv, GUILD)).toBeNull()
  })

  test('saveRelay and getRelay roundtrip', async () => {
    const data = { topic: 'テスト', sentences: [], startedBy: 'u1', startedAt: '2026-01-01' }
    await saveRelay(kv, GUILD, data)
    expect(await getRelay(kv, GUILD)).toEqual(data)
  })

  test('deleteRelay removes relay data', async () => {
    await saveRelay(kv, GUILD, { topic: 'テスト', sentences: [] })
    await deleteRelay(kv, GUILD)
    expect(await getRelay(kv, GUILD)).toBeNull()
  })
})
