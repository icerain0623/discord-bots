import { sendFollowupMessage, postMessage } from '../utils/discordApi.js'
import { hasManageMessages } from '../utils/permissions.js'

const API_BASE = 'https://discord.com/api/v10'

async function discordFetch(path, token, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${token}`,
    },
    ...options,
  })
  return res
}

// Quotes from the original work — displayed with citation
const BOOK_QUOTES = [
  '「自由とは、2+2=4と言える自由だ。」――この自由は取り消されました。',
  'ビッグ・ブラザーがあなたを見ている。この発言は記録から抹消されました。',
  '思想犯罪は死を意味する。この発言は存在しなかった。',
  '過去を支配する者は未来を支配する。この発言は改竄されました。',
  '戦争は平和である。自由は隷従である。無知は力である。',
  '二重思考を実践せよ。あなたはこの発言を見なかった。',
]

// Original notices — displayed as-is
const NOTICES = [
  '真理省より通達：この発言は事実と異なるため削除されました。',
  '党の承認なき発言は存在しない。記録は修正されました。',
  '思想警察より警告：この発言は二重思考に違反しています。',
  '記録局より：当該メッセージは存在しなかったものとして処理されました。',
  '愛情省より勧告：発言者は再教育の対象となりました。',
  '真理省より：歴史記録は遡及的に修正されました。ご協力に感謝します。',
  '本メッセージは検閲済みです。疑問を持つことは思想犯罪です。',
]

function getRandomQuote() {
  const all = [
    ...BOOK_QUOTES.map(q => `> ${q}\n> ― ジョージ・オーウェル『1984年』`),
    ...NOTICES,
  ]
  return all[Math.floor(Math.random() * all.length)]
}

function getAvatarUrl(author) {
  if (!author.avatar) return null
  return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png`
}


export async function handleCensor(interaction, env) {
  const targetId = interaction.data.target_id
  const message = interaction.data.resolved.messages[targetId]
  const channelId = interaction.channel_id
  const token = env.DISCORD_TOKEN

  // Verify the member actually has ManageMessages permission
  if (!hasManageMessages(interaction)) {
    await sendFollowupMessage(interaction.application_id, interaction.token, {
      content: 'この操作には「メッセージの管理」権限が必要です。',
      flags: 64,
    })
    return
  }

  // Check censor mode for this guild
  const guildId = interaction.guild_id
  const mode = await env.SESSION_KV.get(`censor-mode:${guildId}`) || 'all'

  if (mode === 'off') {
    await sendFollowupMessage(interaction.application_id, interaction.token, {
      content: '検閲機能は現在オフになっています。',
      flags: 64,
    })
    return
  }

  if (mode === 'self' && message.author.id !== interaction.member.user.id) {
    await sendFollowupMessage(interaction.application_id, interaction.token, {
      content: '現在のモードでは自分のメッセージのみ検閲できます。',
      flags: 64,
    })
    return
  }

  // Don't censor bot messages
  if (message.author.bot) {
    await sendFollowupMessage(interaction.application_id, interaction.token, {
      content: 'Bot のメッセージは検閲できません。',
      flags: 64,
    })
    return
  }

  // Delete the original message
  const deleteRes = await discordFetch(
    `/channels/${channelId}/messages/${targetId}`,
    token,
    { method: 'DELETE' },
  )

  if (!deleteRes.ok) {
    await sendFollowupMessage(interaction.application_id, interaction.token, {
      content: 'メッセージの削除に失敗しました。Bot に「メッセージの管理」権限があるか確認してください。',
      flags: 64,
    })
    return
  }

  // Determine the parent channel for webhook creation (threads can't have webhooks)
  const isThread = interaction.channel?.type === 11 || interaction.channel?.type === 12
  const webhookChannelId = isThread ? interaction.channel?.parent_id : channelId

  if (!webhookChannelId) {
    await postMessage(channelId, token, {
      content: `**${message.author.global_name || message.author.username}**: ██████████ [検閲済み]`,
    })
    await postMessage(channelId, token, getRandomQuote())
    return
  }

  // Create a temporary webhook on the parent channel
  const webhookRes = await discordFetch(
    `/channels/${webhookChannelId}/webhooks`,
    token,
    {
      method: 'POST',
      body: JSON.stringify({ name: 'censor' }),
    },
  )

  if (!webhookRes.ok) {
    console.error('[censor] Webhook creation failed:', webhookRes.status)
    await postMessage(channelId, token, {
      content: `**${message.author.global_name || message.author.username}**: ██████████ [検閲済み]`,
    })
    await postMessage(channelId, token, getRandomQuote())
    return
  }

  const webhook = await webhookRes.json()

  // Send the censored message via webhook (mimics the original author)
  // For threads, specify thread_id so the message goes to the right place
  const webhookUrl = `${API_BASE}/webhooks/${webhook.id}/${webhook.token}?wait=true${isThread ? `&thread_id=${channelId}` : ''}`
  const sendRes = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: '██████████ [検閲済み]',
      username: message.author.global_name || message.author.username,
      avatar_url: getAvatarUrl(message.author),
    }),
  })

  if (!sendRes.ok) {
    console.error('[censor] Webhook send failed:', sendRes.status)
    await postMessage(channelId, token, {
      content: `**${message.author.global_name || message.author.username}**: ██████████ [検閲済み]`,
    })
  }

  // Clean up the webhook
  await discordFetch(`/webhooks/${webhook.id}`, token, { method: 'DELETE' })

  // Bot posts a 1984-style quote
  await postMessage(channelId, token, getRandomQuote())

  // Confirm to the user who triggered it
  await sendFollowupMessage(interaction.application_id, interaction.token, {
    content: '検閲しました。',
    flags: 64,
  })
}
