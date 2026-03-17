import { create, get, update, setStep, remove } from '../src/utils/kvStore.js'

// Cloudflare KV のモック（Map ベース）
function createMockKV() {
  const store = new Map()
  return {
    async get(key) { return store.get(key) ?? null },
    async put(key, value, _options) { store.set(key, value) },
    async delete(key) { store.delete(key) },
  }
}

describe('kvStore', () => {
  let kv

  beforeEach(() => {
    kv = createMockKV()
  })

  test('セッションを作成できる', async () => {
    await create(kv, 'user1')
    const session = await get(kv, 'user1')
    expect(session).not.toBeNull()
    expect(session.step).toBe(1)
    expect(session.data).toEqual({})
  })

  test('データを更新できる', async () => {
    await create(kv, 'user1')
    await update(kv, 'user1', { name: '太郎' })
    const session = await get(kv, 'user1')
    expect(session.data).toEqual({ name: '太郎' })
  })

  test('update は既存データとマージされる', async () => {
    await create(kv, 'user1')
    await update(kv, 'user1', { name: '花子' })
    await update(kv, 'user1', { age: '25' })
    const session = await get(kv, 'user1')
    expect(session.data).toEqual({ name: '花子', age: '25' })
  })

  test('セッションを削除できる', async () => {
    await create(kv, 'user1')
    await remove(kv, 'user1')
    expect(await get(kv, 'user1')).toBeNull()
  })

  test('存在しないセッションは null を返す', async () => {
    expect(await get(kv, 'nonexistent')).toBeNull()
  })

  test('ステップを更新できる', async () => {
    await create(kv, 'user1')
    await setStep(kv, 'user1', 3)
    const session = await get(kv, 'user1')
    expect(session.step).toBe(3)
  })
})
