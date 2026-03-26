import { getTasks, saveTasks, getTaskConfig, saveTaskConfig } from '../src/utils/taskStore.js'

function createMockKV() {
  const store = new Map()
  return {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => store.set(key, value),
    delete: async (key) => store.delete(key),
  }
}

describe('taskStore', () => {
  test('getTasks returns default when empty', async () => {
    const kv = createMockKV()
    const data = await getTasks(kv, 'g1')
    expect(data).toEqual({ tasks: [], nextId: 1 })
  })

  test('saveTasks and getTasks round-trip', async () => {
    const kv = createMockKV()
    const data = { tasks: [{ id: 1, name: 'test' }], nextId: 2 }
    await saveTasks(kv, 'g1', data)
    const result = await getTasks(kv, 'g1')
    expect(result).toEqual(data)
  })

  test('getTaskConfig returns default when empty', async () => {
    const kv = createMockKV()
    const config = await getTaskConfig(kv, 'g1')
    expect(config).toEqual({ allowedRoles: [] })
  })

  test('saveTaskConfig and getTaskConfig round-trip', async () => {
    const kv = createMockKV()
    const config = { allowedRoles: ['r1', 'r2'] }
    await saveTaskConfig(kv, 'g1', config)
    const result = await getTaskConfig(kv, 'g1')
    expect(result).toEqual(config)
  })

  test('migrates legacy allowedUsers to allowedRoles', async () => {
    const kv = createMockKV()
    await kv.put('task-config:g1', JSON.stringify({ allowedUsers: ['u1'] }))
    const config = await getTaskConfig(kv, 'g1')
    expect(config).toEqual({ allowedRoles: [] })
    expect(config.allowedUsers).toBeUndefined()
  })
})
