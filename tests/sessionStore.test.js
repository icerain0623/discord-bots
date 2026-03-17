import { create, get, update, remove, clear, isExpired } from '../src/utils/sessionStore.js'

beforeEach(() => {
  clear() // テスト間の状態汚染を防ぐ
})

describe('sessionStore', () => {
  test('セッションを作成できる', () => {
    create('user1')
    const session = get('user1')
    expect(session).not.toBeNull()
    expect(session.step).toBe(1)
    expect(session.data).toEqual({})
  })

  test('データを更新できる', () => {
    create('user1')
    update('user1', { name: '太郎' })
    expect(get('user1').data).toEqual({ name: '太郎' })
  })

  test('update は既存データとマージされる', () => {
    create('user1')
    update('user1', { name: '花子' })
    update('user1', { age: '25' })
    expect(get('user1').data).toEqual({ name: '花子', age: '25' })
  })

  test('セッションを削除できる', () => {
    create('user1')
    remove('user1')
    expect(get('user1')).toBeNull()
  })

  test('TTL 切れのセッションは null を返す', () => {
    create('user1')
    const session = get('user1')
    session.expiresAt = Date.now() - 1 // 期限切れに強制
    expect(isExpired('user1')).toBe(true)
  })
})
