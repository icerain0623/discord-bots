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
