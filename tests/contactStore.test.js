import { createContact, getContact, addMessage } from '../src/utils/contactStore.js'

function createMockKV() {
  const store = new Map()
  return {
    async get(key) { return store.get(key) ?? null },
    async put(key, value, _options) { store.set(key, value) },
    async delete(key) { store.delete(key) },
  }
}

describe('contactStore', () => {
  let kv

  beforeEach(() => {
    kv = createMockKV()
  })

  test('コンタクトを作成できる', async () => {
    await createContact(kv, 'report123', 'user456', 'Help me')
    const contact = await getContact(kv, 'report123')
    expect(contact).not.toBeNull()
    expect(contact.userId).toBe('user456')
    expect(contact.messages).toHaveLength(1)
    expect(contact.messages[0].from).toBe('sender')
    expect(contact.messages[0].body).toBe('Help me')
  })

  test('存在しないコンタクトは null を返す', async () => {
    expect(await getContact(kv, 'nonexistent')).toBeNull()
  })

  test('メッセージを追加できる', async () => {
    await createContact(kv, 'report123', 'user456', 'Help me')
    await addMessage(kv, 'report123', 'moderator', 'How can we help?')
    const contact = await getContact(kv, 'report123')
    expect(contact.messages).toHaveLength(2)
    expect(contact.messages[1].from).toBe('moderator')
    expect(contact.messages[1].body).toBe('How can we help?')
  })

  test('メッセージ追加時にupdatedAtが更新される', async () => {
    await createContact(kv, 'report123', 'user456', 'Help me')
    const before = (await getContact(kv, 'report123')).updatedAt
    await new Promise(r => setTimeout(r, 10))
    await addMessage(kv, 'report123', 'moderator', 'Reply')
    const after = (await getContact(kv, 'report123')).updatedAt
    expect(after).not.toBe(before)
  })
})
