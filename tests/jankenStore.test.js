import { createSession, getSession, updateSession, deleteSession } from '../src/utils/jankenStore.js'

function createMockKV() {
  const store = new Map()
  return {
    async put(key, value, _opts) { store.set(key, value) },
    async get(key) { return store.get(key) ?? null },
    async delete(key) { store.delete(key) },
    _dump() { return store },
  }
}

describe('jankenStore', () => {
  test('createSession stores with correct key', async () => {
    const kv = createMockKV()
    const session = { challengerId: 'u1', targetId: 'u2', bet: 100, status: 'pending' }
    await createSession(kv, 'g1', 'u1', session)
    const stored = kv._dump().get('janken:g1:u1')
    expect(stored).toBeDefined()
    expect(JSON.parse(stored).bet).toBe(100)
  })

  test('getSession retrieves a session', async () => {
    const kv = createMockKV()
    await createSession(kv, 'g1', 'u1', { bet: 50, status: 'pending' })
    const session = await getSession(kv, 'g1', 'u1')
    expect(session).toBeDefined()
    expect(session.bet).toBe(50)
  })

  test('getSession returns null when no session', async () => {
    const kv = createMockKV()
    const session = await getSession(kv, 'g1', 'u1')
    expect(session).toBeNull()
  })

  test('updateSession overwrites existing session', async () => {
    const kv = createMockKV()
    await createSession(kv, 'g1', 'u1', { bet: 100, status: 'pending' })
    await updateSession(kv, 'g1', 'u1', { bet: 100, status: 'selecting' })
    const session = await getSession(kv, 'g1', 'u1')
    expect(session.status).toBe('selecting')
  })

  test('deleteSession removes session', async () => {
    const kv = createMockKV()
    await createSession(kv, 'g1', 'u1', { bet: 100 })
    await deleteSession(kv, 'g1', 'u1')
    const session = await getSession(kv, 'g1', 'u1')
    expect(session).toBeNull()
  })
})
