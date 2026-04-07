import { hasManageGuild, permissionDeniedResponse } from '../utils/permissions.js'
import { getUserId } from '../utils/interactionHelpers.js'
import {
  memberJoin, memberLeaveRequest, memberApproveLeave, memberRejectLeave,
  memberStatus, getBalance, grantCoins, revokeCoins,
} from '../utils/economyStore.js'

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

export async function handleEconomy(interaction, env) {
  const doNs = env.ECONOMY_DO
  const guildId = interaction.guild_id
  const userId = getUserId(interaction)
  const { sub, options } = getSubcommand(interaction)

  if (sub === 'join') {
    const result = await memberJoin(doNs, guildId, userId)
    if (result.error) return ephemeralMsg(result.error)
    const { addMemberRole } = await import('../utils/discordApi.js')
    await addMemberRole(guildId, userId, env.ECONOMY_ROLE_ID, env.DISCORD_TOKEN)
    return ephemeralMsg(`参加しました！ **${result.balance} 肩書コイン** を受け取りました。`)
  }

  if (sub === 'leave') {
    const result = await memberLeaveRequest(doNs, guildId, userId)
    if (result.error) return ephemeralMsg(result.error)
    const bal = await getBalance(doNs, guildId, userId)
    const { postMessage } = await import('../utils/discordApi.js')
    await postMessage(env.ECONOMY_ADMIN_CHANNEL_ID, env.DISCORD_TOKEN, {
      content: `<@${userId}> が肩書コイン経済からの離脱を申請しました（残高: **${bal.amount} 肩書コイン**）`,
      components: [{
        type: 1,
        components: [
          { type: 2, custom_id: `economy_approve_keep_${userId}`, label: '残高を保持して承認', style: 1 },
          { type: 2, custom_id: `economy_approve_confiscate_${userId}`, label: '残高を回収して承認', style: 4 },
          { type: 2, custom_id: `economy_reject_leave_${userId}`, label: '却下', style: 2 },
        ],
      }],
    })
    return ephemeralMsg('離脱申請を送信しました。管理者の承認をお待ちください。')
  }

  if (sub === 'status') {
    const status = await memberStatus(doNs, guildId)
    const activeCount = status.active.length
    const pendingCount = status.pendingLeaves.length
    let content = `**肩書コイン経済 参加者状況**\n`
    content += `参加者: ${activeCount}人\n`
    if (pendingCount > 0) {
      content += `離脱申請中: ${pendingCount}人\n`
    }
    if (activeCount > 0) {
      content += `\n**参加者一覧:**\n`
      for (const m of status.active) {
        content += `- <@${m.user_id}>`
        if (m.leave_requested) content += ` ⚠️ 離脱申請中`
        content += `\n`
      }
    }
    return { type: 4, data: { content, flags: EPHEMERAL } }
  }

  // Admin-only commands below
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  if (sub === 'approve-leave') {
    const targetUserId = options.user
    const confiscate = options.confiscate ?? false
    const result = await memberApproveLeave(doNs, guildId, targetUserId, confiscate)
    if (result.error) return ephemeralMsg(result.error)
    const { removeMemberRole } = await import('../utils/discordApi.js')
    await removeMemberRole(guildId, targetUserId, env.ECONOMY_ROLE_ID, env.DISCORD_TOKEN)
    const msg = confiscate
      ? `<@${targetUserId}> の離脱を承認しました（残高を回収しました）。`
      : `<@${targetUserId}> の離脱を承認しました（残高を保持しました）。`
    return ephemeralMsg(msg)
  }

  if (sub === 'reject-leave') {
    const targetUserId = options.user
    const result = await memberRejectLeave(doNs, guildId, targetUserId)
    if (result.error) return ephemeralMsg(result.error)
    return ephemeralMsg(`<@${targetUserId}> の離脱申請を却下しました。`)
  }

  if (sub === 'grant') {
    const targetUserId = options.user
    const amount = options.amount
    const result = await grantCoins(doNs, guildId, targetUserId, amount)
    if (result.error) return ephemeralMsg(result.error)
    return ephemeralMsg(`<@${targetUserId}> に **${amount} 肩書コイン** を付与しました（残高: ${result.balance}）。`)
  }

  if (sub === 'revoke') {
    const targetUserId = options.user
    const amount = options.amount
    const result = await revokeCoins(doNs, guildId, targetUserId, amount)
    if (result.error) return ephemeralMsg(result.error)
    return ephemeralMsg(`<@${targetUserId}> から **${amount} 肩書コイン** を回収しました（残高: ${result.balance}）。`)
  }

  return ephemeralMsg('不明なサブコマンドです。')
}
