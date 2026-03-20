const VIEW_CHANNEL = '1024' // 0x400

export function buildChannelPayload({ name, categoryId, guildId, memberIds, botId }) {
  const permission_overwrites = [
    { id: guildId, type: 0, deny: VIEW_CHANNEL },
    ...memberIds.map(id => ({ id, type: 1, allow: VIEW_CHANNEL })),
    { id: botId, type: 1, allow: VIEW_CHANNEL },
  ]

  return {
    name,
    type: 0,
    parent_id: categoryId,
    permission_overwrites,
  }
}

export function buildGreetingMessage(group, commonTopics) {
  const mentions = group.map(p => `<@${p.userId}>`).join(' ')

  let lines = [
    '🎲 マッチングされました！',
    `メンバー: ${mentions}`,
    '',
  ]

  if (commonTopics.length > 0) {
    lines.push(`💬 共通の話題: ${commonTopics.join(', ')}`)
  }

  for (const p of group) {
    const allTopics = [...p.topics, ...p.freeTopics.map(t => `「${t}」`)]
    if (allTopics.length > 0) {
      lines.push(`📝 <@${p.userId}>のトピック: ${allTopics.join(', ')}`)
    }
  }

  lines.push('', '楽しく交流してください！')
  return lines.join('\n')
}
