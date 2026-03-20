import { handleEmojiStats } from '../src/commands/emojiStats.js'

function makeInteraction(target, period) {
  return {
    data: {
      options: [
        { name: '対象', value: target },
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
      makeInteraction('channel', 'this_week'),
      makeEnv({})
    )
    expect(result.type).toBe(4)
    expect(result.data.embeds[0].description).toContain('まだ集計データがありません')
  })

  test('今週のデータを正しく返す', async () => {
    const env = makeEnv({
      'emoji-stats-channel': {
        weeks: {
          '2026-W12': { counts: { '😂': 50 }, messageCount: 100, channelCount: 10 },
          '2026-W11': { counts: { '😂': 30 }, messageCount: 80, channelCount: 10 },
        },
        lastRun: '2026-03-20T10:00:00Z',
      },
    })
    const result = await handleEmojiStats(
      makeInteraction('channel', 'all'),
      env
    )
    expect(result.type).toBe(4)
    expect(result.data.embeds[0].description).toContain('😂')
    expect(result.data.embeds[0].footer.text).toContain('10チャンネル')
  })

  test('全期間で複数週のカウントが合算される', async () => {
    const env = makeEnv({
      'emoji-stats-forum': {
        weeks: {
          '2026-W12': { counts: { '😂': 50, '🔥': 10 }, messageCount: 100, channelCount: 5 },
          '2026-W11': { counts: { '😂': 30, '❤️': 20 }, messageCount: 80, channelCount: 5 },
        },
        lastRun: '2026-03-20T10:00:00Z',
      },
    })
    const result = await handleEmojiStats(
      makeInteraction('forum', 'all'),
      env
    )
    expect(result.data.embeds[0].description).toContain('😂 × 80')
    expect(result.data.embeds[0].footer.text).toContain('5スレッド')
    expect(result.data.embeds[0].footer.text).toContain('180メッセージ')
  })

  test('該当する週がない場合は絵文字なしメッセージ', async () => {
    const env = makeEnv({
      'emoji-stats-channel': {
        weeks: {
          '2020-W01': { counts: { '😂': 50 }, messageCount: 100, channelCount: 10 },
        },
        lastRun: '2026-03-20T10:00:00Z',
      },
    })
    const result = await handleEmojiStats(
      makeInteraction('channel', 'this_week'),
      env
    )
    expect(result.data.embeds[0].description).toContain('絵文字が見つかりませんでした')
  })
})
