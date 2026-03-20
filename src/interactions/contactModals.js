import { createContact, getContact, addMessage } from '../utils/contactStore.js'
import { generateReportId } from '../utils/reportId.js'
import { getUserId, getDisplayName } from '../utils/interactionHelpers.js'

const EPHEMERAL = 64

function extractBody(interaction, fieldId) {
  for (const row of interaction.data.components ?? []) {
    for (const component of row.components ?? []) {
      if (component.custom_id === fieldId) {
        return component.value?.trim() || ''
      }
    }
  }
  return ''
}

export async function handleContactModalSubmit(interaction, env) {
  const customId = interaction.data.custom_id

  if (customId === 'contact_modal') {
    return await handleInitialContact(interaction, env)
  }

  if (customId.startsWith('contact_reply_modal_')) {
    const reportId = customId.replace('contact_reply_modal_', '')
    return await handleModeratorReply(interaction, env, reportId)
  }

  if (customId.startsWith('contact_followup_modal_')) {
    const reportId = customId.replace('contact_followup_modal_', '')
    return await handleSenderFollowup(interaction, env, reportId)
  }

  return { type: 4, data: { content: '不明なインタラクションです。', flags: EPHEMERAL } }
}

async function handleInitialContact(interaction, env) {
  const kv = env.SESSION_KV
  const userId = getUserId(interaction)
  const body = extractBody(interaction, 'contact_body')

  if (!body) {
    return { type: 4, data: { content: '内容を入力してください。', flags: EPHEMERAL } }
  }

  const reportId = generateReportId()
  await createContact(kv, reportId, userId, body)

  const embed = {
    title: '📩 新しい匿名メッセージ',
    description: body,
    fields: [{ name: 'レポートID', value: reportId, inline: true }],
    color: 0x5865f2,
    timestamp: new Date().toISOString(),
  }

  const messagePayload = {
    embeds: [embed],
    components: [{
      type: 1,
      components: [{
        type: 2,
        custom_id: `contact_reply_${reportId}`,
        label: '返信する',
        style: 1,
      }],
    }],
  }

  const res = await fetch(
    `https://discord.com/api/v10/channels/${env.CONTACT_CHANNEL_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    },
  )

  if (!res.ok) {
    console.error('Failed to post to contact channel:', await res.text())
    return {
      type: 4,
      data: { content: '送信に失敗しました。管理者にお問い合わせください。', flags: EPHEMERAL },
    }
  }

  return {
    type: 4,
    data: { content: `✅ 匿名で送信しました（レポートID: ${reportId}）`, flags: EPHEMERAL },
  }
}

async function handleModeratorReply(interaction, env, reportId) {
  const kv = env.SESSION_KV
  const body = extractBody(interaction, 'contact_reply_body')

  const contact = await getContact(kv, reportId)
  if (!contact) {
    return {
      type: 4,
      data: { content: 'このレポートは期限切れです。', flags: EPHEMERAL },
    }
  }

  await addMessage(kv, reportId, 'moderator', body)

  const dmChannelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: contact.userId }),
  })

  if (!dmChannelRes.ok) {
    return {
      type: 4,
      data: {
        content: '⚠️ DMの送信に失敗しました。相手がDMを無効にしている可能性があります。',
        flags: EPHEMERAL,
      },
    }
  }

  const dmChannel = await dmChannelRes.json()

  const dmPayload = {
    embeds: [{
      title: '📬 モデレーターからの返信',
      description: body,
      fields: [{ name: 'レポートID', value: reportId, inline: true }],
      color: 0x57f287,
      timestamp: new Date().toISOString(),
    }],
    components: [{
      type: 1,
      components: [{
        type: 2,
        custom_id: `contact_followup_${reportId}`,
        label: '返信する',
        style: 1,
      }],
    }],
  }

  const dmRes = await fetch(
    `https://discord.com/api/v10/channels/${dmChannel.id}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dmPayload),
    },
  )

  if (!dmRes.ok) {
    return {
      type: 4,
      data: {
        content: '⚠️ DMの送信に失敗しました。相手がDMを無効にしている可能性があります。',
        flags: EPHEMERAL,
      },
    }
  }

  // モデレーターチャンネルにも返信内容を投稿（他のモデレーターが対応状況を把握できるように）
  const moderatorName = getDisplayName(interaction)
  const modNotify = {
    embeds: [{
      title: '📬 モデレーターが返信しました',
      description: body,
      fields: [
        { name: '返信者', value: moderatorName, inline: true },
        { name: 'レポートID', value: reportId, inline: true },
      ],
      color: 0x57f287,
      timestamp: new Date().toISOString(),
    }],
    components: [{
      type: 1,
      components: [{
        type: 2,
        custom_id: `contact_reply_${reportId}`,
        label: '返信する',
        style: 1,
      }],
    }],
  }

  await fetch(
    `https://discord.com/api/v10/channels/${env.CONTACT_CHANNEL_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(modNotify),
    },
  )

  return {
    type: 4,
    data: { content: '✅ 返信を送信しました。', flags: EPHEMERAL },
  }
}

async function handleSenderFollowup(interaction, env, reportId) {
  const kv = env.SESSION_KV
  const body = extractBody(interaction, 'contact_followup_body')

  const contact = await getContact(kv, reportId)
  if (!contact) {
    return {
      type: 4,
      data: { content: 'このレポートは期限切れです。', flags: EPHEMERAL },
    }
  }

  await addMessage(kv, reportId, 'sender', body)

  const embed = {
    title: '📩 匿名フォローアップ',
    description: body,
    fields: [{ name: 'レポートID', value: reportId, inline: true }],
    color: 0x5865f2,
    timestamp: new Date().toISOString(),
  }

  const messagePayload = {
    embeds: [embed],
    components: [{
      type: 1,
      components: [{
        type: 2,
        custom_id: `contact_reply_${reportId}`,
        label: '返信する',
        style: 1,
      }],
    }],
  }

  const res = await fetch(
    `https://discord.com/api/v10/channels/${env.CONTACT_CHANNEL_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    },
  )

  if (!res.ok) {
    console.error('Failed to post followup:', await res.text())
  }

  return {
    type: 4,
    data: { content: '✅ 返信を送信しました。', flags: EPHEMERAL },
  }
}
