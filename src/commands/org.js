import { hasManageGuild, permissionDeniedResponse } from '../utils/permissions.js'
import { getOrgConfig, getOrgPanel, setOrgPanel, deleteOrgPanel } from '../utils/orgStore.js'
import { buildOrgConfigModal } from '../modals/orgConfigModal.js'
import { buildOrgEmbeds } from '../utils/orgFormatter.js'

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

  // Delete old panel if exists
  const oldPanel = await getOrgPanel(kv, guildId)
  if (oldPanel) {
    await deleteMessage(oldPanel.channelId, oldPanel.messageId, env.DISCORD_TOKEN)
  }

  // Fetch guild data
  const [guildRoles, guildMembers] = await Promise.all([
    getGuildRoles(guildId, env.DISCORD_TOKEN),
    getGuildMembers(guildId, env.DISCORD_TOKEN),
  ])

  // Build and post embed
  const embeds = buildOrgEmbeds(config, guildRoles, guildMembers)
  const res = await postMessage(channelId, env.DISCORD_TOKEN, { embeds })

  if (!res.ok) {
    await sendFollowupMessage(applicationId, interactionToken, {
      content: '組織図の投稿に失敗しました。Botの送信権限を確認してください。',
      flags: EPHEMERAL,
    })
    return
  }

  const message = await res.json()
  await setOrgPanel(kv, guildId, channelId, message.id)

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
  const { getGuildRoles, getGuildMembers, editMessage, sendFollowupMessage } = await import('../utils/discordApi.js')

  const [guildRoles, guildMembers] = await Promise.all([
    getGuildRoles(guildId, env.DISCORD_TOKEN),
    getGuildMembers(guildId, env.DISCORD_TOKEN),
  ])

  const embeds = buildOrgEmbeds(config, guildRoles, guildMembers)
  const res = await editMessage(panel.channelId, panel.messageId, env.DISCORD_TOKEN, { embeds })

  if (!res.ok && res.status === 404) {
    await deleteOrgPanel(kv, guildId)
    await sendFollowupMessage(applicationId, interactionToken, {
      content: 'パネルが見つかりません。`/org setup` で再設置してください。',
      flags: EPHEMERAL,
    })
    return
  }

  await sendFollowupMessage(applicationId, interactionToken, {
    content: '✅ 組織図を更新しました。',
    flags: EPHEMERAL,
  })
}
