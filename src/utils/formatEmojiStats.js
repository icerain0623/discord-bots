const MEDALS = ['🥇', '🥈', '🥉']

export function formatEmojiStats(counts, { channelCount, messageCount }) {
  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  let description
  if (sorted.length === 0) {
    description = '絵文字が見つかりませんでした'
  } else {
    description = sorted
      .map(([emoji, count], i) => {
        const rank = i < 3 ? MEDALS[i] : `${i + 1}.`
        return `${rank} ${emoji} × ${count.toLocaleString()}`
      })
      .join('\n')
  }

  return {
    title: '📊 絵文字ランキング（過去7日間）',
    description,
    color: 0x5865f2,
    footer: {
      text: `集計対象: ${channelCount}チャンネル / ${messageCount.toLocaleString()}メッセージ`,
    },
  }
}
