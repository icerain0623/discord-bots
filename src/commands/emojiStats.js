import { formatEmojiStats } from '../utils/formatEmojiStats.js'
import { getWeekKeysForPeriod } from '../utils/weekUtils.js'

const PERIOD_MAP = {
  this_week: '今週',
  last_week: '先週',
  this_month: '今月',
  last_month: '先月',
  all: '全期間',
}

const KV_KEYS = {
  channel: 'emoji-stats-channel',
  forum: 'emoji-stats-forum',
}

export async function handleEmojiStats(interaction, env) {
  const target = interaction.data.options?.find(o => o.name === '対象')?.value || 'channel'
  const period = interaction.data.options?.find(o => o.name === '期間')?.value || 'this_week'

  const kvKey = KV_KEYS[target]
  const raw = await env.SESSION_KV.get(kvKey)

  if (!raw) {
    return {
      type: 4,
      data: {
        embeds: [{
          title: '📊 絵文字ランキング',
          description: 'まだ集計データがありません。`npm run collect` を実行してください。',
          color: 0xed4245,
        }],
        flags: 64,
      },
    }
  }

  const data = JSON.parse(raw)
  const weekKeys = getWeekKeysForPeriod(period, Object.keys(data.weeks))

  const mergedCounts = {}
  let totalMessages = 0
  let maxChannels = 0
  for (const key of weekKeys) {
    const week = data.weeks[key]
    if (!week) continue
    for (const [emoji, count] of Object.entries(week.counts)) {
      mergedCounts[emoji] = (mergedCounts[emoji] || 0) + count
    }
    totalMessages += week.messageCount
    if (week.channelCount > maxChannels) maxChannels = week.channelCount
  }

  const sourceLabel = target === 'forum'
    ? `${maxChannels}スレッド`
    : `${maxChannels}チャンネル`

  const embed = formatEmojiStats(mergedCounts, {
    sourceLabel,
    messageCount: totalMessages,
    periodLabel: PERIOD_MAP[period],
    collectedAt: data.lastRun,
  })

  return {
    type: 4,
    data: { embeds: [embed] },
  }
}
