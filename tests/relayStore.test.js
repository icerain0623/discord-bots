import { getRelay, saveRelay, deleteRelay } from '../src/utils/relayStore.js'

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

const GUILD = 'g123'

describe('relayStore (DO)', () => {
  let doNs
  beforeEach(() => { doNs = createMockDO() })

  test('getRelay returns null when no relay exists', async () => {
    expect(await getRelay(doNs, GUILD)).toBeNull()
  })

  test('saveRelay and getRelay roundtrip', async () => {
    const data = { topic: 'テスト', sentences: [], startedBy: 'u1', startedAt: '2026-01-01' }
    await saveRelay(doNs, GUILD, data)
    expect(await getRelay(doNs, GUILD)).toEqual(data)
  })

  test('deleteRelay removes relay data', async () => {
    await saveRelay(doNs, GUILD, { topic: 'テスト', sentences: [] })
    await deleteRelay(doNs, GUILD)
    expect(await getRelay(doNs, GUILD)).toBeNull()
  })
})

describe('relayStore (KV migration fallback)', () => {
  test('getRelay migrates data from KV to DO when DO is empty', async () => {
    const doNs = createMockDO()
    const kv = createMockKV()
    const data = { topic: '移行テスト', sentences: [{ text: 'a', userId: 'u1', displayName: 'A' }] }
    await kv.put('relay-active:g123', JSON.stringify(data))

    const result = await getRelay(doNs, 'g123', kv)
    expect(result).toEqual(data)

    // KV からは削除されている
    expect(await kv.get('relay-active:g123')).toBeNull()

    // DO には保存されている
    const result2 = await getRelay(doNs, 'g123')
    expect(result2).toEqual(data)
  })

  test('getRelay returns null when both DO and KV are empty', async () => {
    const doNs = createMockDO()
    const kv = createMockKV()
    const result = await getRelay(doNs, 'g123', kv)
    expect(result).toBeNull()
  })

  test('getRelay ignores KV when DO has data', async () => {
    const doNs = createMockDO()
    const kv = createMockKV()
    const doData = { topic: 'DO側', sentences: [] }
    const kvData = { topic: 'KV側', sentences: [] }
    await saveRelay(doNs, 'g123', doData)
    await kv.put('relay-active:g123', JSON.stringify(kvData))

    const result = await getRelay(doNs, 'g123', kv)
    expect(result).toEqual(doData)
  })
})
