import { hasManageGuild, permissionDeniedResponse } from '../utils/permissions.js'

const MODE_LABELS = {
  all: '全メッセージ対象',
  self: '自分のメッセージのみ',
  off: 'オフ',
}

export async function handleCensorSettings(interaction, env) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const mode = interaction.data.options.find(o => o.name === 'mode')?.value
  const guildId = interaction.guild_id

  await env.SESSION_KV.put(`censor-mode:${guildId}`, mode)

  return {
    type: 4,
    data: {
      content: `検閲モードを **${MODE_LABELS[mode]}** に設定しました。`,
      flags: 64,
    },
  }
}
