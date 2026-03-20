const MEDALS = ['🥇', '🥈', '🥉']

export function formatEmojiStats(counts, { sourceLabel, messageCount, periodLabel, collectedAt }) {
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

  let footerText = `集計対象: ${sourceLabel} / ${messageCount.toLocaleString()}メッセージ`
  if (collectedAt) {
    const jst = new Date(new Date(collectedAt).getTime() + 9 * 60 * 60 * 1000)
    const dateStr = `${jst.getUTCFullYear()}/${String(jst.getUTCMonth() + 1).padStart(2, '0')}/${String(jst.getUTCDate()).padStart(2, '0')} ${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`
    footerText += `（最終集計: ${dateStr} JST）`
  }

  return {
    title: `📊 絵文字ランキング（${periodLabel}）`,
    description,
    color: 0x5865f2,
    footer: { text: footerText },
  }
}
