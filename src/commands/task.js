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
  if (sub === 'allow-user') return handleAllowUser(kv, guildId, options, interaction)
  if (sub === 'remove-user') return handleRemoveUser(kv, guildId, options, interaction)
  if (sub === 'allowed-users') return handleAllowedUsers(kv, guildId, interaction)

  return ephemeralMsg('不明なサブコマンドです。')
}

async function canAddTask(interaction, kv, guildId) {
  if (hasManageMessages(interaction)) return true
  const userId = getUserId(interaction)
  const config = await getTaskConfig(kv, guildId)
  return config.allowedUsers.includes(userId)
}

async function handleAdd(kv, guildId, options, interaction) {
  if (!(await canAddTask(interaction, kv, guildId))) {
    return permissionDeniedResponse('メッセージの管理（または許可ユーザー）')
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

// Stubs for Task 3 and Task 4
async function handleComplete() { return ephemeralMsg('未実装') }
async function handleDelete() { return ephemeralMsg('未実装') }
async function handleAllowUser() { return ephemeralMsg('未実装') }
async function handleRemoveUser() { return ephemeralMsg('未実装') }
async function handleAllowedUsers() { return ephemeralMsg('未実装') }
