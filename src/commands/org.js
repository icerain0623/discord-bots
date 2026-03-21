import { hasManageGuild, permissionDeniedResponse } from '../utils/permissions.js'
import { getOrgConfig, setOrgConfig, getOrgPanel, setOrgPanel } from '../utils/orgStore.js'
import { buildOrgConfigModal } from '../modals/orgConfigModal.js'
import { buildOrgMessages } from '../utils/orgFormatter.js'

const EPHEMERAL = 64

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

export async function handleOrg(interaction, env, ctx) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const kv = env.SESSION_KV
  const guildId = interaction.guild_id
  const { sub, options } = getSubcommand(interaction)

  if (sub === 'config') {
    return handleConfig(kv, guildId)
  }

  if (sub === 'setup') {
    return handleSetup(kv, guildId, options, interaction, env, ctx)
  }

  if (sub === 'refresh') {
    return handleRefresh(kv, guildId, interaction, env, ctx)
  }

  if (sub === 'debug') {
    return handleDebug(kv, guildId, interaction, env, ctx)
  }

  if (sub === 'dept-add') {
    return handleDeptAdd(kv, guildId, options)
  }

  if (sub === 'dept-remove') {
    return handleDeptRemove(kv, guildId, options)
  }

  if (sub === 'role-add') {
    return handleRoleAdd(kv, guildId, options)
  }

  if (sub === 'role-remove') {
    return handleRoleRemove(kv, guildId, options)
  }

  return ephemeralMsg('不明なサブコマンドです。')
}

async function handleConfig(kv, guildId) {
  const config = await getOrgConfig(kv, guildId)
  return { type: 9, data: buildOrgConfigModal(config) }
}

async function handleSetup(kv, guildId, options, interaction, env, ctx) {
  const config = await getOrgConfig(kv, guildId)
  if (!config) {
    return ephemeralMsg('部門定義が未設定です。先に `/org config` で設定してください。')
  }

  const channelId = options.channel
  const applicationId = interaction.application_id
  const interactionToken = interaction.token

  if (ctx) {
    ctx.waitUntil(doSetup(kv, guildId, channelId, applicationId, interactionToken, env, config))
  }
  return { type: 5, data: { flags: EPHEMERAL } }
}

async function doSetup(kv, guildId, channelId, applicationId, interactionToken, env, config) {
  const { getGuildRoles, getGuildMembers, postMessage, deleteMessage, sendFollowupMessage } = await import('../utils/discordApi.js')

  // Delete old panel messages if exists
  const oldPanel = await getOrgPanel(kv, guildId)
  if (oldPanel) {
    const ids = oldPanel.messageIds || (oldPanel.messageId ? [oldPanel.messageId] : [])
    for (const msgId of ids) {
      await deleteMessage(oldPanel.channelId, msgId, env.DISCORD_TOKEN)
    }
  }

  // Fetch guild data
  const [guildRoles, guildMembers] = await Promise.all([
    getGuildRoles(guildId, env.DISCORD_TOKEN),
    getGuildMembers(guildId, env.DISCORD_TOKEN),
  ])
  console.log(`org setup: ${guildRoles.length} roles, ${guildMembers.length} members`)

  // Build and post messages
  const messages = buildOrgMessages(config, guildRoles, guildMembers)
  const messageIds = []

  for (const content of messages) {
    const res = await postMessage(channelId, env.DISCORD_TOKEN, { content })
    if (!res.ok) {
      const detail = res._errorText || `HTTP ${res.status}`
      await sendFollowupMessage(applicationId, interactionToken, {
        content: `組織図の投稿に失敗しました（${res.status}）。\n\`\`\`${detail.slice(0, 500)}\`\`\``,
        flags: EPHEMERAL,
      })
      return
    }
    const msg = await res.json()
    messageIds.push(msg.id)
  }

  await setOrgPanel(kv, guildId, channelId, messageIds)

  await sendFollowupMessage(applicationId, interactionToken, {
    content: '✅ 組織図パネルを設置しました。',
    flags: EPHEMERAL,
  })
}

async function handleRefresh(kv, guildId, interaction, env, ctx) {
  const config = await getOrgConfig(kv, guildId)
  if (!config) {
    return ephemeralMsg('部門定義が未設定です。先に `/org config` で設定してください。')
  }

  const panel = await getOrgPanel(kv, guildId)
  if (!panel) {
    return ephemeralMsg('パネルが未設置です。先に `/org setup` で設置してください。')
  }

  const applicationId = interaction.application_id
  const interactionToken = interaction.token

  if (ctx) {
    ctx.waitUntil(doRefresh(kv, guildId, panel, applicationId, interactionToken, env, config))
  }
  return { type: 5, data: { flags: EPHEMERAL } }
}

async function doRefresh(kv, guildId, panel, applicationId, interactionToken, env, config) {
  const { getGuildRoles, getGuildMembers, postMessage, deleteMessage, sendFollowupMessage } = await import('../utils/discordApi.js')

  // Delete old messages
  const ids = panel.messageIds || (panel.messageId ? [panel.messageId] : [])
  for (const msgId of ids) {
    await deleteMessage(panel.channelId, msgId, env.DISCORD_TOKEN)
  }

  // Fetch guild data
  const [guildRoles, guildMembers] = await Promise.all([
    getGuildRoles(guildId, env.DISCORD_TOKEN),
    getGuildMembers(guildId, env.DISCORD_TOKEN),
  ])

  // Build and post new messages
  const messages = buildOrgMessages(config, guildRoles, guildMembers)
  const messageIds = []

  for (const content of messages) {
    const res = await postMessage(panel.channelId, env.DISCORD_TOKEN, { content })
    if (!res.ok) {
      const detail = res._errorText || `HTTP ${res.status}`
      await sendFollowupMessage(applicationId, interactionToken, {
        content: `組織図の更新に失敗しました（${res.status}）。\n\`\`\`${detail.slice(0, 500)}\`\`\``,
        flags: EPHEMERAL,
      })
      return
    }
    const msg = await res.json()
    messageIds.push(msg.id)
  }

  await setOrgPanel(kv, guildId, panel.channelId, messageIds)

  await sendFollowupMessage(applicationId, interactionToken, {
    content: `✅ 組織図を更新しました。（${guildRoles.length}ロール, ${guildMembers.length}メンバー取得）`,
    flags: EPHEMERAL,
  })
}

async function handleDebug(kv, guildId, interaction, env, ctx) {
  const config = await getOrgConfig(kv, guildId)
  if (!config) {
    return ephemeralMsg('部門定義が未設定です。先に `/org config` で設定してください。')
  }

  const applicationId = interaction.application_id
  const interactionToken = interaction.token

  if (ctx) {
    ctx.waitUntil(doDebug(guildId, applicationId, interactionToken, env, config))
  }
  return { type: 5, data: { flags: EPHEMERAL } }
}

async function doDebug(guildId, applicationId, interactionToken, env, config) {
  const { getGuildRoles, getGuildMembers, sendFollowupMessage } = await import('../utils/discordApi.js')

  const [guildRoles, guildMembers] = await Promise.all([
    getGuildRoles(guildId, env.DISCORD_TOKEN),
    getGuildMembers(guildId, env.DISCORD_TOKEN),
  ])

  const messages = buildOrgMessages(config, guildRoles, guildMembers, { debug: true })

  for (const content of messages) {
    await sendFollowupMessage(applicationId, interactionToken, {
      content,
      flags: EPHEMERAL,
    })
  }

  await sendFollowupMessage(applicationId, interactionToken, {
    content: `📊 ${guildRoles.length}ロール, ${guildMembers.length}メンバー取得`,
    flags: EPHEMERAL,
  })
}

async function handleDeptAdd(kv, guildId, options) {
  const name = options.name
  const config = await getOrgConfig(kv, guildId) || { departments: [] }

  if (config.departments.some(d => d.name === name)) {
    return ephemeralMsg(`部門「${name}」は既に存在します。`)
  }

  config.departments.push({ name, roles: [] })
  await setOrgConfig(kv, guildId, config)
  return ephemeralMsg(`✅ 部門「${name}」を追加しました。`)
}

async function handleDeptRemove(kv, guildId, options) {
  const name = options.name
  const config = await getOrgConfig(kv, guildId)
  if (!config) return ephemeralMsg('部門定義が未設定です。')

  const idx = config.departments.findIndex(d => d.name === name)
  if (idx === -1) {
    return ephemeralMsg(`部門「${name}」が見つかりません。`)
  }

  config.departments.splice(idx, 1)
  await setOrgConfig(kv, guildId, config)
  return ephemeralMsg(`✅ 部門「${name}」を削除しました。`)
}

async function handleRoleAdd(kv, guildId, options) {
  const deptName = options.dept
  const roleName = options.role
  const config = await getOrgConfig(kv, guildId)
  if (!config) return ephemeralMsg('部門定義が未設定です。先に `/org dept-add` で部門を追加してください。')

  const dept = config.departments.find(d => d.name === deptName)
  if (!dept) {
    return ephemeralMsg(`部門「${deptName}」が見つかりません。`)
  }

  if (dept.roles.includes(roleName)) {
    return ephemeralMsg(`ロール「${roleName}」は部門「${deptName}」に既に存在します。`)
  }

  dept.roles.push(roleName)
  await setOrgConfig(kv, guildId, config)
  return ephemeralMsg(`✅ ロール「${roleName}」を部門「${deptName}」に追加しました。`)
}

async function handleRoleRemove(kv, guildId, options) {
  const deptName = options.dept
  const roleName = options.role
  const config = await getOrgConfig(kv, guildId)
  if (!config) return ephemeralMsg('部門定義が未設定です。')

  const dept = config.departments.find(d => d.name === deptName)
  if (!dept) {
    return ephemeralMsg(`部門「${deptName}」が見つかりません。`)
  }

  const idx = dept.roles.indexOf(roleName)
  if (idx === -1) {
    return ephemeralMsg(`ロール「${roleName}」は部門「${deptName}」に存在しません。`)
  }

  dept.roles.splice(idx, 1)
  await setOrgConfig(kv, guildId, config)
  return ephemeralMsg(`✅ ロール「${roleName}」を部門「${deptName}」から削除しました。`)
}
