import { getRelay, saveRelay, deleteRelay } from '../utils/relayStore.js'
import { hasManageGuild, permissionDeniedResponse } from '../utils/permissions.js'
import { getDisplayName, getUserId } from '../utils/interactionHelpers.js'

const EPHEMERAL = 64
const MSG_LIMIT = 2000

function ephemeralMsg(content) {
  return { type: 4, data: { content, flags: EPHEMERAL } }
}

function getSubcommand(interaction) {
  const top = interaction.data.options?.[0]
  if (!top) return { sub: null, options: {} }
  const options = {}
  for (const opt of top.options ?? []) {
    options[opt.name] = opt.value
  }
  return { sub: top.name, options }
}

export async function handleRelay(interaction, env, ctx) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const kv = env.SESSION_KV
  const guildId = interaction.guild_id
  const { sub, options } = getSubcommand(interaction)

  if (sub === 'start') return handleStart(kv, guildId, options, interaction, env, ctx)
  if (sub === 'status') return handleStatus(kv, guildId)
  if (sub === 'delete') return handleDelete(kv, guildId, options)
  if (sub === 'end') return handleEnd(kv, guildId, options, interaction, env, ctx)
  if (sub === 'reveal') return handleReveal(kv, guildId, options, interaction, env, ctx)
  if (sub === 'cancel') return handleCancel(kv, guildId, interaction, env, ctx)

  return ephemeralMsg('不明なサブコマンドです。')
}

async function handleStart(kv, guildId, options, interaction, env, ctx) {
  const existing = await getRelay(kv, guildId)
  if (existing) {
    return ephemeralMsg('既にリレーが進行中です。先に `/relay cancel` で中止してください。')
  }

  const topic = options.topic
  const firstSentence = options.first_sentence
  const channelId = interaction.channel_id
  const applicationId = interaction.application_id
  const interactionToken = interaction.token
  const userId = getUserId(interaction)
  const displayName = getDisplayName(interaction)

  if (ctx) {
    ctx.waitUntil(doStart(kv, guildId, topic, firstSentence, channelId, userId, displayName, applicationId, interactionToken, env))
  }
  return { type: 5, data: { flags: EPHEMERAL } }
}

async function doStart(kv, guildId, topic, firstSentence, channelId, userId, displayName, applicationId, interactionToken, env) {
  const { postMessage, sendFollowupMessage } = await import('../utils/discordApi.js')

  const res = await postMessage(channelId, env.DISCORD_TOKEN, {
    content: `**📝 1文リレー開始！**\nお題：**${topic}**\n\n現在 1 文目`,
    components: [{
      type: 1,
      components: [{
        type: 2,
        custom_id: 'relay_add',
        label: '一文を追加する ✏️',
        style: 1,
      }],
    }],
  })

  if (!res.ok) {
    await sendFollowupMessage(applicationId, interactionToken, {
      content: 'パネルメッセージの投稿に失敗しました。Botのチャンネル権限を確認してください。',
      flags: EPHEMERAL,
    })
    return
  }

  const message = await res.json()

  await saveRelay(kv, guildId, {
    topic,
    channelId,
    messageId: message.id,
    sentences: [{ text: firstSentence, userId, displayName }],
    startedBy: userId,
    startedAt: new Date().toISOString(),
  })

  await sendFollowupMessage(applicationId, interactionToken, {
    content: '✅ リレーを開始しました！',
    flags: EPHEMERAL,
  })
}

async function handleStatus(kv, guildId) {
  const relay = await getRelay(kv, guildId)
  if (!relay) return ephemeralMsg('リレーは開催されていません。')

  const lines = relay.sentences.map((s, i) => `${i + 1}. ${s.text} — ${s.displayName}`)
  let content = `**お題：${relay.topic}（全${relay.sentences.length}文）**\n${lines.join('\n')}`
  if (content.length > MSG_LIMIT) {
    content = content.slice(0, MSG_LIMIT - 3) + '…'
  }
  return ephemeralMsg(content)
}

async function handleDelete(kv, guildId, options) {
  const relay = await getRelay(kv, guildId)
  if (!relay) return ephemeralMsg('リレーは開催されていません。')

  const num = options.number
  if (num < 1 || num > relay.sentences.length) {
    return ephemeralMsg(`番号が範囲外です。1〜${relay.sentences.length} の範囲で指定してください。`)
  }

  relay.sentences.splice(num - 1, 1)
  await saveRelay(kv, guildId, relay)
  return ephemeralMsg(`${num}番目の文を削除しました（残り${relay.sentences.length}文）`)
}

async function handleEnd(kv, guildId, options, interaction, env, ctx) {
  const relay = await getRelay(kv, guildId)
  if (!relay) return ephemeralMsg('リレーは開催されていません。')

  const targetChannelId = options.channel
  const applicationId = interaction.application_id
  const interactionToken = interaction.token

  if (ctx) {
    ctx.waitUntil(doEnd(kv, guildId, relay, targetChannelId, applicationId, interactionToken, env))
  }
  return { type: 5, data: { flags: EPHEMERAL } }
}

async function doEnd(kv, guildId, relay, targetChannelId, applicationId, interactionToken, env) {
  const { postMessage, editMessage, sendFollowupMessage } = await import('../utils/discordApi.js')

  const fullText = relay.sentences.map(s => s.text).join('')
  const header = `**お題：${relay.topic}**\n\n`
  const messages = splitMessages(header + fullText, MSG_LIMIT)

  let postOk = true
  for (const msg of messages) {
    const res = await postMessage(targetChannelId, env.DISCORD_TOKEN, { content: msg })
    if (!res.ok) { postOk = false; break }
  }

  if (!postOk) {
    await sendFollowupMessage(applicationId, interactionToken, {
      content: '全文の投稿に失敗しました。Botのチャンネル権限を確認してください。',
      flags: EPHEMERAL,
    })
    return
  }

  await editMessage(relay.channelId, relay.messageId, env.DISCORD_TOKEN, {
    content: `**📝 1文リレー終了**\nお題：**${relay.topic}**\n\n全${relay.sentences.length}文で完成しました！`,
    components: [],
  })

  await sendFollowupMessage(applicationId, interactionToken, {
    content: '✅ 全文を投稿しました！',
    flags: EPHEMERAL,
  })
}

async function handleReveal(kv, guildId, options, interaction, env, ctx) {
  const relay = await getRelay(kv, guildId)
  if (!relay) return ephemeralMsg('リレーは開催されていません。')

  const targetChannelId = options.channel
  const applicationId = interaction.application_id
  const interactionToken = interaction.token

  if (ctx) {
    ctx.waitUntil(doReveal(kv, guildId, relay, targetChannelId, applicationId, interactionToken, env))
  }
  return { type: 5, data: { flags: EPHEMERAL } }
}

async function doReveal(kv, guildId, relay, targetChannelId, applicationId, interactionToken, env) {
  const { postMessage, sendFollowupMessage } = await import('../utils/discordApi.js')

  const lines = relay.sentences.map((s, i) => `${i + 1}. ${s.text} — ${s.displayName}`)
  const header = `**お題：${relay.topic} — 執筆者一覧**\n\n`
  const messages = splitMessages(header + lines.join('\n'), MSG_LIMIT)

  let postOk = true
  for (const msg of messages) {
    const res = await postMessage(targetChannelId, env.DISCORD_TOKEN, { content: msg })
    if (!res.ok) { postOk = false; break }
  }

  if (!postOk) {
    await sendFollowupMessage(applicationId, interactionToken, {
      content: 'ネタバレの投稿に失敗しました。Botのチャンネル権限を確認してください。',
      flags: EPHEMERAL,
    })
    return
  }

  await deleteRelay(kv, guildId)

  await sendFollowupMessage(applicationId, interactionToken, {
    content: '✅ ネタバレを投稿しました。リレーデータを削除しました。',
    flags: EPHEMERAL,
  })
}

async function handleCancel(kv, guildId, interaction, env, ctx) {
  const relay = await getRelay(kv, guildId)
  if (!relay) return ephemeralMsg('リレーは開催されていません。')

  const applicationId = interaction.application_id
  const interactionToken = interaction.token

  if (ctx) {
    ctx.waitUntil(doCancel(kv, guildId, relay, applicationId, interactionToken, env))
  }
  return { type: 5, data: { flags: EPHEMERAL } }
}

async function doCancel(kv, guildId, relay, applicationId, interactionToken, env) {
  const { editMessage, sendFollowupMessage } = await import('../utils/discordApi.js')

  await editMessage(relay.channelId, relay.messageId, env.DISCORD_TOKEN, {
    content: `**📝 1文リレー中止**\nお題：**${relay.topic}**`,
    components: [],
  })

  await deleteRelay(kv, guildId)

  await sendFollowupMessage(applicationId, interactionToken, {
    content: '✅ リレーを中止しました。',
    flags: EPHEMERAL,
  })
}

function splitMessages(text, maxLen) {
  if (text.length <= maxLen) return [text]
  const chunks = []
  let remaining = text
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining)
      break
    }
    let splitAt = remaining.lastIndexOf('\n', maxLen)
    if (splitAt <= 0) splitAt = maxLen
    chunks.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).replace(/^\n/, '')
  }
  return chunks
}
