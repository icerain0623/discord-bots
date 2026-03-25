import { hasManageGuild, permissionDeniedResponse } from '../utils/permissions.js'

export async function handleCelebrationSetup(interaction, env) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const channelId = interaction.data.options.find(o => o.name === 'channel')?.value
  const roleId = interaction.data.options.find(o => o.name === 'role')?.value
  const guildId = interaction.guild_id

  await env.SESSION_KV.put(
    `celebration-config:${guildId}`,
    JSON.stringify({ channelId, roleId })
  )

  return {
    type: 4,
    data: {
      content: `お祝い保存の設定が完了しました。\nアーカイブ先: <#${channelId}>\n許可ロール: <@&${roleId}>`,
      flags: 64,
    },
  }
}
