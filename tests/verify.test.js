import { verifyDiscordRequest } from '../src/utils/verify.js'

describe('verifyDiscordRequest', () => {
  test('署名ヘッダーがない場合は false を返す', async () => {
    const request = { headers: { get: () => null } }
    const result = await verifyDiscordRequest(request, 'body', 'a'.repeat(64))
    expect(result).toBe(false)
  })

  test('不正な hex 文字列の署名は false を返す', async () => {
    const request = {
      headers: {
        get: (key) =>
          key === 'X-Signature-Ed25519' ? 'invalid-hex' : '1234567890',
      },
    }
    const result = await verifyDiscordRequest(request, 'body', 'a'.repeat(64))
    expect(result).toBe(false)
  })

  test('有効な形式だが間違った署名は false を返す', async () => {
    const request = {
      headers: {
        get: (key) =>
          key === 'X-Signature-Ed25519' ? 'a'.repeat(128) : '1234567890',
      },
    }
    // 正しい鍵でないので false になる
    const result = await verifyDiscordRequest(request, 'body', 'a'.repeat(64))
    expect(result).toBe(false)
  })
})
