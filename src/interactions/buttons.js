import { buildModal1 } from '../modals/modal1.js'
import { buildModal2 } from '../modals/modal2.js'
import { buildModal3 } from '../modals/modal3.js'
import { buildModal4 } from '../modals/modal4.js'
import { buildModal5 } from '../modals/modal5.js'
import { buildReplyModal, buildFollowupModal } from '../modals/contactModal.js'
import { create, get, remove } from '../utils/kvStore.js'
import { formatIntro } from '../utils/formatIntro.js'
import { SESSION_EXPIRED_MSG, getDisplayName, getUserId } from '../utils/interactionHelpers.js'
import { hasManageGuild, hasManageMessages, permissionDeniedResponse } from '../utils/permissions.js'

const EPHEMERAL = 64
const ephemeralMsg = (content, components) => ({
  type: 4,
  data: { content, flags: EPHEMERAL, ...(components ? { components } : {}) },
})
const updateMsg = (content) => ({ type: 7, data: { content, components: [] } })
const showModal = (data) => ({ type: 9, data })

export async function handleButton(interaction, env) {
  const kv = env.SESSION_KV
  const userId = getUserId(interaction)
  const customId = interaction.data.custom_id
  console.log(`[button] customId=${customId} userId=${userId}`)

  if (customId === 'intro_start') {
    const existing = await get(kv, userId)
    if (existing) {
      return ephemeralMsg('自己紹介の入力が途中です。最初からやり直すか、キャンセルできます。', [
        {
          type: 1,
          components: [
            { type: 2, custom_id: 'intro_restart', label: '最初からやり直す', style: 1 },
            { type: 2, custom_id: 'intro_cancel', label: 'キャンセル', style: 2 },
          ],
        },
      ])
    }
    await create(kv, userId)
    return showModal(buildModal1())
  }

  if (customId === 'intro_restart') {
    await create(kv, userId)          // 上書きで十分（remove 不要）
    console.log(`[button] intro_restart: session recreated, showing modal`)
    return showModal(buildModal1())
  }

  if (customId === 'intro_next_2') {
    if (!await get(kv, userId)) return ephemeralMsg(SESSION_EXPIRED_MSG)
    return showModal(buildModal2())
  }

  if (customId === 'intro_next_3') {
    if (!await get(kv, userId)) return ephemeralMsg(SESSION_EXPIRED_MSG)
    return showModal(buildModal3())
  }

  if (customId === 'intro_skip_confirm') {
    const session = await get(kv, userId)
    if (!session) return ephemeralMsg(SESSION_EXPIRED_MSG)
    const preview = formatIntro(getDisplayName(interaction), userId, session.data)
    return ephemeralMsg(`**入力完了！** 以下の内容で投稿します。\n\n${preview}`, [
      {
        type: 1,
        components: [
          { type: 2, custom_id: 'intro_confirm', label: '✅ 投稿する', style: 3 },
          { type: 2, custom_id: 'intro_cancel', label: 'キャンセル', style: 2 },
        ],
      },
    ])
  }

  if (customId === 'intro_more') {
    if (!await get(kv, userId)) return ephemeralMsg(SESSION_EXPIRED_MSG)
    return showModal(buildModal4())
  }

  if (customId === 'intro_next_5') {
    if (!await get(kv, userId)) return ephemeralMsg(SESSION_EXPIRED_MSG)
    return showModal(buildModal5())
  }

  if (customId === 'intro_confirm') {
    const session = await get(kv, userId)
    if (!session) return ephemeralMsg(SESSION_EXPIRED_MSG)

    const text = formatIntro(getDisplayName(interaction), userId, session.data)
    const res = await fetch(
      `https://discord.com/api/v10/channels/${env.INTRO_CHANNEL_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bot ${env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: text }),
      },
    )

    if (!res.ok) {
      return ephemeralMsg('投稿に失敗しました。Botのチャンネル権限を確認してください。')
    }

    await remove(kv, userId)
    return updateMsg('✅ 自己紹介を投稿しました！')
  }

  if (customId === 'intro_cancel') {
    await remove(kv, userId)
    console.log(`[button] intro_cancel: session removed`)
    return updateMsg('キャンセルしました。')
  }

  // --- Matchup handlers ---
  if (customId === 'matchup_topic_select') {
    const { getActive, setActive } = await import('../utils/matchupKvStore.js')
    const matchupKv = env.MATCHUP_KV
    const guildId = interaction.guild_id

    const active = await getActive(matchupKv, guildId)
    if (!active) return ephemeralMsg('マッチングイベントが見つかりません。')

    const selectedTopics = interaction.data.values || []
    if (!active._pendingTopics) active._pendingTopics = {}
    active._pendingTopics[userId] = { topics: selectedTopics, freeTopics: [] }
    await setActive(matchupKv, guildId, active)

    return ephemeralMsg('自由入力のトピックも追加しますか？', [{
      type: 1,
      components: [
        { type: 2, custom_id: 'matchup_free_yes', label: 'はい', style: 1 },
        { type: 2, custom_id: 'matchup_free_skip', label: 'スキップ', style: 2 },
      ],
    }])
  }

  if (customId === 'matchup_join') {
    const { getActive, getTopics } = await import('../utils/matchupKvStore.js')
    const matchupKv = env.MATCHUP_KV
    const guildId = interaction.guild_id

    const active = await getActive(matchupKv, guildId)
    if (!active || active.status !== 'recruiting') {
      return ephemeralMsg('現在募集中のマッチングイベントはありません。')
    }

    const existing = active.participants.find(p => p.userId === userId)
    if (existing) {
      return ephemeralMsg('既に参加しています。取り消しますか？', [{
        type: 1,
        components: [
          { type: 2, custom_id: 'matchup_cancel_confirm', label: '参加を取り消す', style: 4 },
          { type: 2, custom_id: 'matchup_cancel_deny', label: 'そのまま', style: 2 },
        ],
      }])
    }

    const topics = await getTopics(matchupKv, guildId)
    if (topics.length === 0) {
      const { buildMatchupFreeTopicsModal } = await import('../modals/matchupFreeTopics.js')
      return showModal(buildMatchupFreeTopicsModal())
    }

    return {
      type: 4,
      data: {
        content: '参加するトピックを選んでください（複数選択可）：',
        flags: EPHEMERAL,
        components: [{
          type: 1,
          components: [{
            type: 3,
            custom_id: 'matchup_topic_select',
            placeholder: 'トピックを選択...',
            min_values: 0,
            max_values: topics.length,
            options: topics.map(t => ({ label: t, value: t })),
          }],
        }],
      },
    }
  }

  if (customId === 'matchup_free_yes') {
    const { buildMatchupFreeTopicsModal } = await import('../modals/matchupFreeTopics.js')
    return showModal(buildMatchupFreeTopicsModal())
  }

  if (customId === 'matchup_free_skip') {
    const { getActive, setActive } = await import('../utils/matchupKvStore.js')
    const { editMessage } = await import('../utils/discordApi.js')
    const matchupKv = env.MATCHUP_KV
    const guildId = interaction.guild_id

    const active = await getActive(matchupKv, guildId)
    if (!active || active.status !== 'recruiting') {
      return ephemeralMsg('現在募集中のマッチングイベントはありません。')
    }

    if (active.participants.some(p => p.userId === userId)) {
      return updateMsg('既に参加登録済みです。')
    }

    const pending = active._pendingTopics?.[userId] || { topics: [], freeTopics: [] }
    active.participants.push({
      userId,
      topics: pending.topics,
      freeTopics: pending.freeTopics,
    })
    if (active._pendingTopics) delete active._pendingTopics[userId]
    await setActive(matchupKv, guildId, active)

    const count = active.participants.length
    await editMessage(active.channelId, active.messageId, env.DISCORD_TOKEN, {
      embeds: [{
        title: '🎲 交流マッチング募集中！',
        description: `グループサイズ: ${active.groupSize}人\n現在の参加者: ${count}人`,
        color: 0x5865f2,
      }],
    })

    const allTopics = [...pending.topics, ...pending.freeTopics.map(t => `「${t}」`)]
    const topicDisplay = allTopics.length > 0 ? allTopics.join(', ') : 'なし'
    return updateMsg(`✅ 参加登録しました！ トピック: ${topicDisplay}`)
  }

  if (customId === 'matchup_cancel_confirm') {
    const { getActive, setActive } = await import('../utils/matchupKvStore.js')
    const { editMessage } = await import('../utils/discordApi.js')
    const matchupKv = env.MATCHUP_KV
    const guildId = interaction.guild_id

    const active = await getActive(matchupKv, guildId)
    if (!active) return ephemeralMsg('マッチングイベントが見つかりません。')

    active.participants = active.participants.filter(p => p.userId !== userId)
    if (active._pendingTopics) delete active._pendingTopics[userId]
    await setActive(matchupKv, guildId, active)

    const count = active.participants.length
    await editMessage(active.channelId, active.messageId, env.DISCORD_TOKEN, {
      embeds: [{
        title: '🎲 交流マッチング募集中！',
        description: `グループサイズ: ${active.groupSize}人\n現在の参加者: ${count}人`,
        color: 0x5865f2,
      }],
    })

    return updateMsg('参加を取り消しました。')
  }

  if (customId === 'matchup_cancel_deny') {
    return updateMsg('参加登録はそのままです。')
  }

  if (customId.startsWith('contact_reply_')) {
    if (!hasManageMessages(interaction)) {
      return permissionDeniedResponse('メッセージの管理')
    }
    const reportId = customId.replace('contact_reply_', '')
    return showModal(buildReplyModal(reportId))
  }

  if (customId.startsWith('contact_followup_')) {
    const reportId = customId.replace('contact_followup_', '')
    return showModal(buildFollowupModal(reportId))
  }

  // --- Relay handlers ---
  if (customId === 'relay_add') {
    const { getRelay } = await import('../utils/relayStore.js')
    const { buildRelayModal } = await import('../modals/relayModal.js')
    const guildId = interaction.guild_id

    const relay = await getRelay(env.RELAY_DO, guildId, kv)
    if (!relay) return ephemeralMsg('リレーは開催されていません。')

    const lastSentence = relay.sentences[relay.sentences.length - 1]
    if (lastSentence && lastSentence.userId === userId) {
      return ephemeralMsg('連続で投稿することはできません。他の人の投稿を待ってください。')
    }

    const prevText = lastSentence?.text || '（まだ一文もありません）'
    return showModal(buildRelayModal(prevText))
  }

  // --- Economy leave approval handlers ---
  if (customId.startsWith('economy_approve_keep_')) {
    if (!hasManageGuild(interaction)) return permissionDeniedResponse('サーバーの管理')
    const targetUserId = customId.replace('economy_approve_keep_', '')
    const { memberApproveLeave } = await import('../utils/economyStore.js')
    const { removeMemberRole } = await import('../utils/discordApi.js')
    await memberApproveLeave(env.ECONOMY_DO, interaction.guild_id, targetUserId, false)
    await removeMemberRole(interaction.guild_id, targetUserId, env.ECONOMY_ROLE_ID, env.DISCORD_TOKEN)
    return updateMsg(`✅ <@${targetUserId}> の離脱を承認しました（残高を保持）。`)
  }

  if (customId.startsWith('economy_approve_confiscate_')) {
    if (!hasManageGuild(interaction)) return permissionDeniedResponse('サーバーの管理')
    const targetUserId = customId.replace('economy_approve_confiscate_', '')
    const { memberApproveLeave } = await import('../utils/economyStore.js')
    const { removeMemberRole } = await import('../utils/discordApi.js')
    await memberApproveLeave(env.ECONOMY_DO, interaction.guild_id, targetUserId, true)
    await removeMemberRole(interaction.guild_id, targetUserId, env.ECONOMY_ROLE_ID, env.DISCORD_TOKEN)
    return updateMsg(`✅ <@${targetUserId}> の離脱を承認しました（残高を回収）。`)
  }

  if (customId.startsWith('economy_reject_leave_')) {
    if (!hasManageGuild(interaction)) return permissionDeniedResponse('サーバーの管理')
    const targetUserId = customId.replace('economy_reject_leave_', '')
    const { memberRejectLeave } = await import('../utils/economyStore.js')
    await memberRejectLeave(env.ECONOMY_DO, interaction.guild_id, targetUserId)
    return updateMsg(`❌ <@${targetUserId}> の離脱申請を却下しました。`)
  }

  return ephemeralMsg('不明なインタラクションです。')
}
