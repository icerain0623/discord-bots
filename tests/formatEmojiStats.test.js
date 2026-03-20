import { formatEmojiStats } from '../src/utils/formatEmojiStats.js'

describe('formatEmojiStats', () => {
  test('Top 10 ランキングを Embed 形式で返す', () => {
    const counts = { '😂': 128, '🔥': 95, '❤️': 72 }
    const result = formatEmojiStats(counts, {
      sourceLabel: '20チャンネル',
      messageCount: 3456,
      periodLabel: '今週',
    })
    expect(result.title).toBe('📊 絵文字ランキング（今週）')
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
    const result = formatEmojiStats(counts, {
      sourceLabel: '1チャンネル',
      messageCount: 100,
      periodLabel: '全期間',
    })
    const lines = result.description.split('\n').filter(l => l.trim())
    expect(lines).toHaveLength(10)
  })

  test('絵文字がない場合はメッセージを表示', () => {
    const result = formatEmojiStats({}, {
      sourceLabel: '5チャンネル',
      messageCount: 50,
      periodLabel: '今週',
    })
    expect(result.description).toContain('絵文字が見つかりませんでした')
  })

  test('collectedAt が指定された場合はフッターに集計日時を表示', () => {
    const counts = { '😂': 10 }
    const result = formatEmojiStats(counts, {
      sourceLabel: '15スレッド',
      messageCount: 200,
      periodLabel: '今月',
      collectedAt: '2026-03-20T10:00:00Z',
    })
    expect(result.footer.text).toContain('15スレッド')
    expect(result.footer.text).toContain('200メッセージ')
    expect(result.footer.text).toContain('最終集計:')
    expect(result.footer.text).toContain('JST')
  })

  test('collectedAt がない場合は集計日時を表示しない', () => {
    const counts = { '😂': 10 }
    const result = formatEmojiStats(counts, {
      sourceLabel: '10チャンネル',
      messageCount: 100,
      periodLabel: '先週',
    })
    expect(result.footer.text).not.toContain('最終集計')
  })
})
