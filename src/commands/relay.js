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

  if (sub === 'help') return handleHelp()
  if (sub === 'start') return handleStart(kv, guildId, options, interaction, env, ctx)
  if (sub === 'status') return handleStatus(kv, guildId)
  if (sub === 'last') return handleLast(kv, guildId)
  if (sub === 'delete') return handleDelete(kv, guildId, options)
  if (sub === 'end') return handleEnd(kv, guildId, interaction, env, ctx)
  if (sub === 'post') return handlePost(kv, guildId, options, interaction, env, ctx)
  if (sub === 'reveal') return handleReveal(kv, guildId, options, interaction, env, ctx)
  if (sub === 'terminate') return handleTerminate(kv, guildId, interaction, env, ctx)

  return ephemeralMsg('不明なサブコマンドです。')
}

function handleHelp() {
  const text = [
    '**📖 /relay コマンドの使い方**',
    '',
    '`/relay start topic:<お題> first_sentence:<最初の一文>`',
    '　リレーを開始します。パネルが投稿され、参加者がボタンで一文を追加できます。',
    '',
    '`/relay status`',
    '　現在の全文と執筆者を確認します（自分だけに表示）。',
    '',
    '`/relay last`',
    '　最後の一文と執筆者を確認します（自分だけに表示）。',
    '',
    '`/relay delete number:<番号>`',
    '　指定した番号の文を削除します。',
    '',
    '`/relay end`',
    '　リレーを終了します。追記ボタンが無効になりますが、データは残ります。',
    '',
    '`/relay post channel:<チャンネル>`',
    '　全文を匿名で指定チャンネルに投稿します。',
    '',
    '`/relay reveal channel:<チャンネル>`',
    '　執筆者一覧（ネタバレ）を指定チャンネルに投稿します。',
    '',
    '`/relay terminate`',
    '　リレーのデータを完全に削除します。',
    '',
    '**💡 基本の流れ:** `start` → ボタンで参加 → `end` → `post` → `reveal` → `terminate`',
  ].join('\n')
  return ephemeralMsg(text)
}

async function handleStart(kv, guildId, options, interaction, env, ctx) {
  const existing = await getRelay(kv, guildId)
  if (existing) {
    return ephemeralMsg('既にリレーが進行中です。先に `/relay terminate` で終了してください。')
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

async function handleLast(kv, guildId) {
  const relay = await getRelay(kv, guildId)
  if (!relay) return ephemeralMsg('リレーは開催されていません。')

  const last = relay.sentences[relay.sentences.length - 1]
  return ephemeralMsg(`**最後の一文（${relay.sentences.length}文目）**\n${last.text} — ${last.displayName}`)
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

async function handleEnd(kv, guildId, interaction, env, ctx) {
  const relay = await getRelay(kv, guildId)
  if (!relay) return ephemeralMsg('リレーは開催されていません。')

  const applicationId = interaction.application_id
  const interactionToken = interaction.token

  if (ctx) {
    ctx.waitUntil(doEnd(kv, guildId, relay, applicationId, interactionToken, env))
  }
  return { type: 5, data: { flags: EPHEMERAL } }
}

async function doEnd(kv, guildId, relay, applicationId, interactionToken, env) {
  const { editMessage, sendFollowupMessage } = await import('../utils/discordApi.js')

  await editMessage(relay.channelId, relay.messageId, env.DISCORD_TOKEN, {
    content: `**📝 1文リレー終了**\nお題：**${relay.topic}**\n\n全${relay.sentences.length}文で完成しました！`,
    components: [],
  })

  await sendFollowupMessage(applicationId, interactionToken, {
    content: '✅ リレーを終了しました。追記はできなくなりました。',
    flags: EPHEMERAL,
  })
}

async function handlePost(kv, guildId, options, interaction, env, ctx) {
  const relay = await getRelay(kv, guildId)
  if (!relay) return ephemeralMsg('リレーは開催されていません。')

  const targetChannelId = options.channel
  const applicationId = interaction.application_id
  const interactionToken = interaction.token

  if (ctx) {
    ctx.waitUntil(doPost(relay, targetChannelId, applicationId, interactionToken, env))
  }
  return { type: 5, data: { flags: EPHEMERAL } }
}

async function doPost(relay, targetChannelId, applicationId, interactionToken, env) {
  const { postMessage, sendFollowupMessage } = await import('../utils/discordApi.js')

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
    ctx.waitUntil(doReveal(relay, targetChannelId, applicationId, interactionToken, env))
  }
  return { type: 5, data: { flags: EPHEMERAL } }
}

async function doReveal(relay, targetChannelId, applicationId, interactionToken, env) {
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

  await sendFollowupMessage(applicationId, interactionToken, {
    content: '✅ ネタバレを投稿しました。',
    flags: EPHEMERAL,
  })
}

async function handleTerminate(kv, guildId, interaction, env, ctx) {
  const relay = await getRelay(kv, guildId)
  if (!relay) return ephemeralMsg('リレーは開催されていません。')

  const applicationId = interaction.application_id
  const interactionToken = interaction.token

  if (ctx) {
    ctx.waitUntil(doTerminate(kv, guildId, relay, applicationId, interactionToken, env))
  }
  return { type: 5, data: { flags: EPHEMERAL } }
}

async function doTerminate(kv, guildId, relay, applicationId, interactionToken, env) {
  const { editMessage, sendFollowupMessage } = await import('../utils/discordApi.js')

  await editMessage(relay.channelId, relay.messageId, env.DISCORD_TOKEN, {
    content: `**📝 1文リレー終了**\nお題：**${relay.topic}**\n\nデータは削除されました。`,
    components: [],
  })

  await deleteRelay(kv, guildId)

  await sendFollowupMessage(applicationId, interactionToken, {
    content: '✅ リレーデータを削除しました。',
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
