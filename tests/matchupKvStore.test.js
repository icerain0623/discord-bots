import {
  getTopics, setTopics, addTopic, removeTopic,
  getActive, setActive, deleteActive,
} from '../src/utils/matchupKvStore.js'

function createMockKV() {
  const store = new Map()
  return {
    async get(key) { return store.get(key) ?? null },
    async put(key, value) { store.set(key, value) },
    async delete(key) { store.delete(key) },
  }
}

const GUILD = 'g123'

describe('matchupKvStore — topics', () => {
  let kv
  beforeEach(() => { kv = createMockKV() })

  test('getTopics returns empty array when none set', async () => {
    expect(await getTopics(kv, GUILD)).toEqual([])
  })

  test('setTopics and getTopics roundtrip', async () => {
    await setTopics(kv, GUILD, ['ゲーム', '音楽'])
    expect(await getTopics(kv, GUILD)).toEqual(['ゲーム', '音楽'])
  })

  test('addTopic appends to list', async () => {
    await setTopics(kv, GUILD, ['ゲーム'])
    await addTopic(kv, GUILD, '音楽')
    expect(await getTopics(kv, GUILD)).toEqual(['ゲーム', '音楽'])
  })

  test('addTopic rejects duplicates', async () => {
    await setTopics(kv, GUILD, ['ゲーム'])
    const result = await addTopic(kv, GUILD, 'ゲーム')
    expect(result).toEqual({ error: 'duplicate' })
  })

  test('addTopic rejects when at 25 limit', async () => {
    await setTopics(kv, GUILD, Array.from({ length: 25 }, (_, i) => `t${i}`))
    const result = await addTopic(kv, GUILD, 'overflow')
    expect(result).toEqual({ error: 'limit' })
  })

  test('removeTopic removes existing', async () => {
    await setTopics(kv, GUILD, ['ゲーム', '音楽'])
    await removeTopic(kv, GUILD, 'ゲーム')
    expect(await getTopics(kv, GUILD)).toEqual(['音楽'])
  })

  test('removeTopic returns error for nonexistent', async () => {
    await setTopics(kv, GUILD, ['ゲーム'])
    const result = await removeTopic(kv, GUILD, '映画')
    expect(result).toEqual({ error: 'not_found' })
  })
})

describe('matchupKvStore — active event', () => {
  let kv
  beforeEach(() => { kv = createMockKV() })

  test('getActive returns null when no event', async () => {
    expect(await getActive(kv, GUILD)).toBeNull()
  })

  test('setActive and getActive roundtrip', async () => {
    const data = { status: 'recruiting', groupSize: 2, participants: [] }
    await setActive(kv, GUILD, data)
    expect(await getActive(kv, GUILD)).toEqual(data)
  })

  test('deleteActive removes event', async () => {
    await setActive(kv, GUILD, { status: 'recruiting' })
    await deleteActive(kv, GUILD)
    expect(await getActive(kv, GUILD)).toBeNull()
  })
})
