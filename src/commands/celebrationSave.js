import { sendFollowupMessage, postMessage } from '../utils/discordApi.js'

const EMBED_COLOR = 0xFFD700

function getAvatarUrl(author) {
  if (!author.avatar) return null
  return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png`
}

export async function handleCelebrationSave(interaction, env) {
  const guildId = interaction.guild_id
  const applicationId = interaction.application_id
  const interactionToken = interaction.token

  // KVから設定を取得
  const raw = await env.SESSION_KV.get(`celebration-config:${guildId}`)
  if (!raw) {
    await sendFollowupMessage(applicationId, interactionToken, {
      content: 'お祝い保存が設定されていません。先に `/celebration-setup` を実行してください。',
      flags: 64,
    })
    return
  }

  const config = JSON.parse(raw)

  // ロールチェック（ロールIDの直接比較）
  if (!interaction.member.roles.includes(config.roleId)) {
    await sendFollowupMessage(applicationId, interactionToken, {
      content: 'この操作に必要なロールがありません。',
      flags: 64,
    })
    return
  }

  // 対象メッセージを取得
  const targetId = interaction.data.target_id
  const message = interaction.data.resolved.messages[targetId]
  const sourceChannelId = interaction.channel_id

  // Embed構築
  const embed = {
    color: EMBED_COLOR,
    author: {
      name: message.author.global_name || message.author.username,
      icon_url: getAvatarUrl(message.author),
    },
    description: message.content || '（テキストなし）',
    fields: [
      {
        name: '元メッセージ',
        value: `[リンク](https://discord.com/channels/${guildId}/${sourceChannelId}/${targetId})`,
        inline: false,
      },
    ],
    timestamp: message.timestamp,
    footer: {
      text: `保存者: ${interaction.member.user.global_name || interaction.member.user.username}`,
    },
  }

  // 画像添付の処理
  const imageAttachments = Object.values(message.attachments || {})
    .filter(a => a.content_type?.startsWith('image/'))

  if (imageAttachments.length > 0) {
    embed.image = { url: imageAttachments[0].url }
  }

  // postMessage用のpayload
  const payload = { embeds: [embed] }

  // 2枚目以降の画像はcontentにURLを記載
  if (imageAttachments.length > 1) {
    payload.content = imageAttachments
      .slice(1)
      .map(a => a.url)
      .join('\n')
  }

  // アーカイブチャンネルに送信
  const res = await postMessage(config.channelId, env.DISCORD_TOKEN, payload)

  if (!res.ok) {
    await sendFollowupMessage(applicationId, interactionToken, {
      content: 'アーカイブチャンネルへの送信に失敗しました。チャンネルが存在するか、Bot に送信権限があるか確認してください。',
      flags: 64,
    })
    return
  }

  await sendFollowupMessage(applicationId, interactionToken, {
    content: `お祝いメッセージを <#${config.channelId}> に保存しました。`,
    flags: 64,
  })
}
