import { handleEmojiStats } from '../src/commands/emojiStats.js'

function makeInteraction(period) {
  return {
    data: {
      options: [
        { name: '期間', value: period },
      ],
    },
  }
}

function makeEnv(kvData) {
  return {
    SESSION_KV: {
      get: async (key) => kvData[key] ? JSON.stringify(kvData[key]) : null,
    },
  }
}

describe('handleEmojiStats', () => {
  test('KV が空の場合はエラーメッセージを返す', async () => {
    const result = await handleEmojiStats(
      makeInteraction('this_week'),
      makeEnv({})
    )
    expect(result.type).toBe(4)
    expect(result.data.embeds[0].description).toContain('まだ集計データがありません')
  })

  test('全期間で複数週のカウントが合算される', async () => {
    const env = makeEnv({
      'emoji-stats': {
        weeks: {
          '2026-W12': { counts: { '😂': 50, '🔥': 10 }, messageCount: 100, channelCount: 92 },
          '2026-W11': { counts: { '😂': 30, '❤️': 20 }, messageCount: 80, channelCount: 92 },
        },
        lastRun: '2026-03-20T10:00:00Z',
      },
    })
    const result = await handleEmojiStats(
      makeInteraction('all'),
      env
    )
    expect(result.data.embeds[0].description).toContain('😂 × 80')
    expect(result.data.embeds[0].footer.text).toContain('92チャンネル+スレッド')
    expect(result.data.embeds[0].footer.text).toContain('180メッセージ')
  })

  test('該当する週がない場合は絵文字なしメッセージ', async () => {
    const env = makeEnv({
      'emoji-stats': {
        weeks: {
          '2020-W01': { counts: { '😂': 50 }, messageCount: 100, channelCount: 10 },
        },
        lastRun: '2026-03-20T10:00:00Z',
      },
    })
    const result = await handleEmojiStats(
      makeInteraction('this_week'),
      env
    )
    expect(result.data.embeds[0].description).toContain('絵文字が見つかりませんでした')
  })
})
