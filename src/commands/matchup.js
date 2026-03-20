import {
  getTopics, addTopic, removeTopic,
  getActive, setActive, deleteActive,
} from '../utils/matchupKvStore.js'

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
    const result = await addTopic(kv, guildId, options.name)
    if (result.error === 'duplicate') return ephemeralMsg(`「${options.name}」は既に登録されています。`)
    if (result.error === 'limit') return ephemeralMsg('トピックは最大25個までです。')
    return ephemeralMsg(`✅ トピック「${options.name}」を追加しました。`)
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
  // Stub — implemented in Task 8
  return ephemeralMsg('（未実装）')
}

async function handleTerminate(kv, guildId, interaction, env, ctx) {
  // Stub — implemented in Task 9
  return ephemeralMsg('（未実装）')
}
