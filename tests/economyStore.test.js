import { jankenEscrow, jankenPayout } from '../src/utils/economyStore.js'

function createMockDO() {
  const store = new Map()
  const requestHandlers = new Map()

  return {
    idFromName(name) {
      return `id:${name}`
    },
    get(id) {
      return {
        async fetch(request) {
          const method = request.method
          const path = new URL(request.url).pathname

          // Try to find a registered handler for this method + path
          const handlerKey = `${method}:${path}`
          if (requestHandlers.has(handlerKey)) {
            const handler = requestHandlers.get(handlerKey)
            return await handler(request)
          }

          // Default behavior (GET returns from store, PUT stores)
          if (method === 'GET') {
            const data = store.get(id) ?? null
            return Response.json(data)
          }
          if (method === 'PUT') {
            const body = await request.json()
            store.set(id, body)
            return Response.json({ ok: true })
          }
          if (method === 'DELETE') {
            store.delete(id)
            return Response.json({ ok: true })
          }

          return Response.json({ error: 'Not found' }, { status: 404 })
        },
      }
    },
    _onRequest(method, path, handler) {
      const key = `${method}:${path}`
      requestHandlers.set(key, handler)
    },
    _dump() {
      return store
    },
  }
}

describe('economyStore', () => {
  test('jankenEscrow sends POST /janken/escrow', async () => {
    const doNs = createMockDO()
    doNs._onRequest('POST', '/janken/escrow', async (req) => {
      const body = await req.json()
      expect(body.challengerId).toBe('u1')
      expect(body.targetId).toBe('u2')
      expect(body.amount).toBe(100)
      return Response.json({ ok: true })
    })
    const result = await jankenEscrow(doNs, 'g1', 'u1', 'u2', 100)
    expect(result.ok).toBe(true)
  })

  test('jankenPayout sends POST /janken/payout with winner', async () => {
    const doNs = createMockDO()
    doNs._onRequest('POST', '/janken/payout', async (req) => {
      const body = await req.json()
      expect(body.winnerId).toBe('u1')
      return Response.json({ ok: true })
    })
    const result = await jankenPayout(doNs, 'g1', 'u1', 'u2', 100, 'u1')
    expect(result.ok).toBe(true)
  })

  test('jankenPayout sends POST /janken/payout with null winner (draw)', async () => {
    const doNs = createMockDO()
    doNs._onRequest('POST', '/janken/payout', async (req) => {
      const body = await req.json()
      expect(body.winnerId).toBeNull()
      return Response.json({ ok: true })
    })
    const result = await jankenPayout(doNs, 'g1', 'u1', 'u2', 100, null)
    expect(result.ok).toBe(true)
  })
})
