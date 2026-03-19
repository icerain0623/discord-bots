import { formatEmojiStats } from '../src/utils/formatEmojiStats.js'

describe('formatEmojiStats', () => {
  test('Top 10 ランキングを Embed 形式で返す', () => {
    const counts = { '😂': 128, '🔥': 95, '❤️': 72 }
    const result = formatEmojiStats(counts, { channelCount: 20, messageCount: 3456 })
    expect(result.title).toBe('📊 絵文字ランキング（過去7日間）')
    expect(result.description).toContain('🥇 😂 × 128')
    expect(result.description).toContain('🥈 🔥 × 95')
    expect(result.description).toContain('🥉 ❤️ × 72')
    expect(result.footer.text).toContain('20チャンネル')
    expect(result.footer.text).toContain('3,456メッセージ')
  })

  test('10件を超える場合は Top 10 のみ表示', () => {
    const counts = {}
    for (let i = 0; i < 15; i++) {
      counts[`emoji${i}`] = 100 - i
    }
    const result = formatEmojiStats(counts, { channelCount: 1, messageCount: 100 })
    const lines = result.description.split('\n').filter(l => l.trim())
    expect(lines).toHaveLength(10)
  })

  test('絵文字がない場合はメッセージを表示', () => {
    const result = formatEmojiStats({}, { channelCount: 5, messageCount: 50 })
    expect(result.description).toContain('絵文字が見つかりませんでした')
  })
})
