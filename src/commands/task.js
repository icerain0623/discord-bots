import { hasManageGuild, hasManageMessages, permissionDeniedResponse } from '../utils/permissions.js'
import { getUserId } from '../utils/interactionHelpers.js'
import { getTasks, saveTasks, getTaskConfig, saveTaskConfig } from '../utils/taskStore.js'

const TASK_LIMIT = 100
const PRIORITY_ICONS = { high: '🔴', medium: '🟡', low: '🟢' }
const DEADLINE_RE = /^\d{4}-\d{2}-\d{2}$/

function ephemeralMsg(content) {
  return { type: 4, data: { content, flags: 64 } }
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

export async function handleTask(interaction, env) {
  const kv = env.SESSION_KV
  const guildId = interaction.guild_id
  const { sub, options } = getSubcommand(interaction)

  if (sub === 'add') return handleAdd(kv, guildId, options, interaction)
  if (sub === 'list') return handleList(kv, guildId)
  if (sub === 'complete') return handleComplete(kv, guildId, options, interaction)
  if (sub === 'delete') return handleDelete(kv, guildId, options, interaction)
  if (sub === 'allow-role') return handleAllowRole(kv, guildId, options, interaction)
  if (sub === 'remove-role') return handleRemoveRole(kv, guildId, options, interaction)
  if (sub === 'allowed-roles') return handleAllowedRoles(kv, guildId, interaction)

  return ephemeralMsg('不明なサブコマンドです。')
}

async function canAddTask(interaction, kv, guildId) {
  if (hasManageMessages(interaction)) return true
  const memberRoles = interaction.member?.roles ?? []
  const config = await getTaskConfig(kv, guildId)
  return config.allowedRoles.some(roleId => memberRoles.includes(roleId))
}

async function handleAdd(kv, guildId, options, interaction) {
  if (!(await canAddTask(interaction, kv, guildId))) {
    return permissionDeniedResponse('メッセージの管理（または許可ロール）')
  }

  const name = options.name
  const deadline = options.deadline ?? null
  const priority = options.priority ?? 'medium'

  if (deadline && !DEADLINE_RE.test(deadline)) {
    return ephemeralMsg('期限は YYYY-MM-DD 形式で入力してください。')
  }

  const data = await getTasks(kv, guildId)

  if (data.tasks.length >= TASK_LIMIT) {
    return ephemeralMsg(`タスクが上限（${TASK_LIMIT}件）に達しています。不要なタスクを削除してください。`)
  }

  const task = {
    id: data.nextId,
    name,
    priority,
    deadline,
    createdBy: getUserId(interaction),
    createdAt: new Date().toISOString(),
    completed: false,
  }
  data.tasks.push(task)
  data.nextId++
  await saveTasks(kv, guildId, data)

  const icon = PRIORITY_ICONS[priority]
  const deadlineLine = deadline ? `\n📅 期限: ${deadline}` : ''
  return ephemeralMsg(`✅ タスクを追加しました\n${icon} #${task.id} ${name}${deadlineLine}`)
}

async function handleList(kv, guildId) {
  const data = await getTasks(kv, guildId)
  if (data.tasks.length === 0) {
    return {
      type: 4,
      data: { content: '📋 タスクリスト\n─────────────────\nタスクはありません。' },
    }
  }

  const lines = data.tasks.map(t => {
    if (t.completed) return `✅ #${t.id} ${t.name}（完了）`
    const icon = PRIORITY_ICONS[t.priority] || '🟡'
    const dl = `\n   📅 期限: ${t.deadline ?? 'なし'}`
    return `${icon} #${t.id} ${t.name}${dl}`
  })

  const incomplete = data.tasks.filter(t => !t.completed).length
  const complete = data.tasks.filter(t => t.completed).length

  const content = [
    '📋 タスクリスト',
    '─────────────────',
    ...lines,
    '─────────────────',
    `未完了: ${incomplete}件 / 完了: ${complete}件`,
  ].join('\n')

  return { type: 4, data: { content } }
}

async function handleComplete(kv, guildId, options, interaction) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const data = await getTasks(kv, guildId)
  const task = data.tasks.find(t => t.id === options.id)
  if (!task) return ephemeralMsg(`タスク #${options.id} が見つかりません。`)

  task.completed = true
  await saveTasks(kv, guildId, data)
  return ephemeralMsg(`✅ タスク #${task.id} を完了しました。`)
}

async function handleDelete(kv, guildId, options, interaction) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const data = await getTasks(kv, guildId)
  const idx = data.tasks.findIndex(t => t.id === options.id)
  if (idx === -1) return ephemeralMsg(`タスク #${options.id} が見つかりません。`)

  data.tasks.splice(idx, 1)
  await saveTasks(kv, guildId, data)
  return ephemeralMsg(`🗑️ タスク #${options.id} を削除しました。`)
}

async function handleAllowRole(kv, guildId, options, interaction) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const roleId = options.role
  const config = await getTaskConfig(kv, guildId)
  if (config.allowedRoles.includes(roleId)) {
    return ephemeralMsg(`<@&${roleId}> は既に登録されています。`)
  }

  config.allowedRoles.push(roleId)
  await saveTaskConfig(kv, guildId, config)
  return ephemeralMsg(`✅ <@&${roleId}> にタスク追加を許可しました。`)
}

async function handleRemoveRole(kv, guildId, options, interaction) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const roleId = options.role
  const config = await getTaskConfig(kv, guildId)
  const idx = config.allowedRoles.indexOf(roleId)
  if (idx === -1) {
    return ephemeralMsg(`<@&${roleId}> は登録されていません。`)
  }

  config.allowedRoles.splice(idx, 1)
  await saveTaskConfig(kv, guildId, config)
  return ephemeralMsg(`✅ <@&${roleId}> の許可を取り消しました。`)
}

async function handleAllowedRoles(kv, guildId, interaction) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const config = await getTaskConfig(kv, guildId)
  if (config.allowedRoles.length === 0) {
    return ephemeralMsg('許可ロールはありません。')
  }

  const list = config.allowedRoles.map(id => `・<@&${id}>`).join('\n')
  return ephemeralMsg(`📋 タスク追加許可ロール\n${list}`)
}
