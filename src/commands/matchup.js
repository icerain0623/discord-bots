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
  // Stub — implemented in Task 6
  return ephemeralMsg('（未実装）')
}

async function handleRun(kv, guildId, interaction, env, ctx) {
  // Stub — implemented in Task 8
  return ephemeralMsg('（未実装）')
}

async function handleTerminate(kv, guildId, interaction, env, ctx) {
  // Stub — implemented in Task 9
  return ephemeralMsg('（未実装）')
}
