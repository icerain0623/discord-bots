import {
  getTopics, addTopic, removeTopic,
  getActive, setActive, deleteActive,
} from '../utils/matchupKvStore.js'
import { hasManageGuild, permissionDeniedResponse } from '../utils/permissions.js'

const EPHEMERAL = 64

function ephemeralMsg(content) {
  return { type: 4, data: { content, flags: EPHEMERAL } }
}

function ephemeralEmbed(embed) {
  return { type: 4, data: { embeds: [embed], flags: EPHEMERAL } }
}

function getSubcommand(interaction) {
  const top = interaction.data.options?.[0]
  if (!top) return { group: null, sub: null, options: {} }

  // Subcommand group (topics add/remove/list)
  if (top.type === 2) {
    const sub = top.options?.[0]
    const options = {}
    for (const opt of sub?.options ?? []) {
      options[opt.name] = opt.value
    }
    return { group: top.name, sub: sub?.name, options }
  }

  // Direct subcommand (start/run/terminate)
  const options = {}
  for (const opt of top.options ?? []) {
    options[opt.name] = opt.value
  }
  return { group: null, sub: top.name, options }
}

export async function handleMatchup(interaction, env, ctx) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const kv = env.MATCHUP_KV
  const guildId = interaction.guild_id
  const { group, sub, options } = getSubcommand(interaction)

  if (group === 'topics') {
    return handleTopics(kv, guildId, sub, options)
  }

  if (sub === 'start') {
    return handleStart(kv, guildId, options, interaction, env, ctx)
  }

  if (sub === 'run') {
    return handleRun(kv, guildId, interaction, env, ctx)
  }

  if (sub === 'terminate') {
    return handleTerminate(kv, guildId, interaction, env, ctx)
  }

  return ephemeralMsg('不明なサブコマンドです。')
}

async function handleTopics(kv, guildId, sub, options) {
  if (sub === 'add') {
    const { sanitizeTopicName } = await import('../utils/matchupLogic.js')
    const safeName = sanitizeTopicName(options.name)
    if (!safeName) return ephemeralMsg('無効なトピック名です。')
    const result = await addTopic(kv, guildId, safeName)
    if (result.error === 'duplicate') return ephemeralMsg(`「${safeName}」は既に登録されています。`)
    if (result.error === 'limit') return ephemeralMsg('トピックは最大25個までです。')
    return ephemeralMsg(`✅ トピック「${safeName}」を追加しました。`)
  }

  if (sub === 'remove') {
    const result = await removeTopic(kv, guildId, options.name)
    if (result.error === 'not_found') return ephemeralMsg(`「${options.name}」は登録されていません。`)
    return ephemeralMsg(`✅ トピック「${options.name}」を削除しました。`)
  }

  if (sub === 'list') {
    const topics = await getTopics(kv, guildId)
    const description = topics.length > 0
      ? topics.map((t, i) => `${i + 1}. ${t}`).join('\n')
      : 'トピックが未登録です。`/matchup topics add` で追加してください。'
    return ephemeralEmbed({
      title: '📋 トピック一覧',
      description,
      color: 0x5865f2,
    })
  }

  return ephemeralMsg('不明なサブコマンドです。')
}

async function handleStart(kv, guildId, options, interaction, env, ctx) {
  const existing = await getActive(kv, guildId)
  if (existing) {
    return ephemeralMsg('既にアクティブなマッチングイベントがあります。先に `/matchup terminate` で終了してください。')
  }

  const groupSize = options.group_size
  const categoryId = options.category || null
  const channelId = interaction.channel_id
  const applicationId = interaction.application_id
  const interactionToken = interaction.token

  if (ctx) {
    ctx.waitUntil(doStart(kv, guildId, groupSize, categoryId, channelId, applicationId, interactionToken, env))
  }
  return { type: 5, data: { flags: EPHEMERAL } }
}

async function doStart(kv, guildId, groupSize, categoryId, channelId, applicationId, interactionToken, env) {
  const { postMessage, sendFollowupMessage, createCategory } = await import('../utils/discordApi.js')

  let finalCategoryId = categoryId
  if (!finalCategoryId) {
    const cat = await createCategory(guildId, env.DISCORD_TOKEN, '🎲 Matchup')
    if (cat) finalCategoryId = cat.id
  }

  const res = await postMessage(channelId, env.DISCORD_TOKEN, {
    embeds: [{
      title: '🎲 交流マッチング募集中！',
      description: `グループサイズ: ${groupSize}人\n現在の参加者: 0人`,
      color: 0x5865f2,
    }],
    components: [{
      type: 1,
      components: [{
        type: 2,
        custom_id: 'matchup_join',
        label: '参加する ✋',
        style: 1,
      }],
    }],
  })

  if (!res.ok) {
    await sendFollowupMessage(applicationId, interactionToken, {
      embeds: [{ title: 'エラー', description: '募集メッセージの投稿に失敗しました。', color: 0xed4245 }],
      flags: 64,
    })
    return
  }

  const message = await res.json()

  await setActive(kv, guildId, {
    status: 'recruiting',
    messageId: message.id,
    channelId,
    groupSize,
    categoryId: finalCategoryId,
    participants: [],
    createdChannels: [],
  })

  await sendFollowupMessage(applicationId, interactionToken, {
    embeds: [{ title: '✅ 募集開始', description: 'マッチング募集を開始しました。', color: 0x57f287 }],
    flags: 64,
  })
}

async function handleRun(kv, guildId, interaction, env, ctx) {
  const active = await getActive(kv, guildId)

  if (!active) {
    return ephemeralMsg('アクティブなマッチングイベントがありません。')
  }

  if (active.status === 'matched') {
    return ephemeralMsg('既にマッチング済みです。')
  }

  if (active.participants.length < 2) {
    return ephemeralMsg(`参加者が${active.participants.length}人です。最低2人必要です。`)
  }

  if (ctx) {
    ctx.waitUntil(doRun(kv, guildId, active, interaction, env))
  }
  return { type: 5, data: { flags: EPHEMERAL } }
}

async function doRun(kv, guildId, active, interaction, env) {
  const { shuffleAndGroup, findCommonTopics } = await import('../utils/matchupLogic.js')
  const { buildChannelPayload, buildGreetingMessage } = await import('../utils/matchupChannelUtils.js')
  const { createChannel, postMessage, editMessage, sendFollowupMessage, createCategory } = await import('../utils/discordApi.js')

  const applicationId = interaction.application_id
  const interactionToken = interaction.token
  const botId = applicationId

  let categoryId = active.categoryId
  if (!categoryId) {
    const cat = await createCategory(guildId, env.DISCORD_TOKEN, '🎲 Matchup')
    if (cat) categoryId = cat.id
  }

  const groups = shuffleAndGroup(active.participants, active.groupSize)
  const createdChannels = []

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i]
    const memberIds = group.map(p => p.userId)
    const payload = buildChannelPayload({
      name: `matchup-${i + 1}`,
      categoryId,
      guildId,
      memberIds,
      botId,
    })

    const channel = await createChannel(guildId, env.DISCORD_TOKEN, payload)
    if (!channel) continue

    createdChannels.push(channel.id)

    const commonTopics = findCommonTopics(group)
    const greeting = buildGreetingMessage(group, commonTopics)
    await postMessage(channel.id, env.DISCORD_TOKEN, greeting)
  }

  active.status = 'matched'
  active.createdChannels = createdChannels
  active.categoryId = categoryId
  delete active._pendingTopics
  await setActive(kv, guildId, active)

  await editMessage(active.channelId, active.messageId, env.DISCORD_TOKEN, {
    embeds: [{
      title: '🎲 マッチング完了！',
      description: `${createdChannels.length}グループが作成されました。`,
      color: 0x57f287,
    }],
    components: [],
  })

  await sendFollowupMessage(applicationId, interactionToken, {
    embeds: [{ title: '✅ マッチング完了', description: `${createdChannels.length}個のチャンネルを作成しました。`, color: 0x57f287 }],
    flags: 64,
  })
}

async function handleTerminate(kv, guildId, interaction, env, ctx) {
  const active = await getActive(kv, guildId)

  if (!active) {
    return ephemeralMsg('アクティブなマッチングイベントがありません。')
  }

  if (ctx) {
    ctx.waitUntil(doTerminate(kv, guildId, active, interaction, env))
  }
  return { type: 5, data: { flags: EPHEMERAL } }
}

async function doTerminate(kv, guildId, active, interaction, env) {
  const { deleteChannel, editMessage, sendFollowupMessage } = await import('../utils/discordApi.js')
  const applicationId = interaction.application_id
  const interactionToken = interaction.token

  if (active.status === 'matched' && active.createdChannels?.length > 0) {
    for (const channelId of active.createdChannels) {
      await deleteChannel(channelId, env.DISCORD_TOKEN)
    }
  }

  await editMessage(active.channelId, active.messageId, env.DISCORD_TOKEN, {
    embeds: [{
      title: '🎲 このマッチングイベントは終了しました。',
      color: 0x95a5a6,
    }],
    components: [],
  })

  await deleteActive(kv, guildId)

  const action = active.status === 'matched' ? 'チャンネルを削除し、' : ''
  await sendFollowupMessage(applicationId, interactionToken, {
    embeds: [{ title: '✅ 終了', description: `${action}マッチングイベントを終了しました。`, color: 0x57f287 }],
    flags: 64,
  })
}
