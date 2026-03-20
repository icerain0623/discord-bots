import { hasManageGuild, permissionDeniedResponse } from '../utils/permissions.js'

const EPHEMERAL = 64

export async function execute(interaction, env) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const row = {
    type: 1,
    components: [{
      type: 2,
      custom_id: 'intro_start',
      label: '✏️ 自己紹介を書く',
      style: 1,
    }],
  }

  const res = await fetch(
    `https://discord.com/api/v10/channels/${interaction.channel_id}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: '**📝 自己紹介**\nボタンを押して自己紹介を投稿しましょう！',
        components: [row],
      }),
    },
  )

  if (!res.ok) {
    return { type: 4, data: { content: 'パネルの設置に失敗しました。', flags: EPHEMERAL } }
  }

  return { type: 4, data: { content: 'パネルを設置しました！', flags: EPHEMERAL } }
}
