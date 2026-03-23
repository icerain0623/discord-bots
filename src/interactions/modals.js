import { handleContactModalSubmit } from './contactModals.js'
import { handleOrgConfigModal } from './orgConfigHandler.js'
import { get, update, setStep } from '../utils/kvStore.js'
import { formatIntro } from '../utils/formatIntro.js'
import { SESSION_EXPIRED_MSG, getDisplayName, getUserId } from '../utils/interactionHelpers.js'

const EPHEMERAL = 64
const ephemeralMsg = (content, components) => ({
  type: 4,
  data: { content, flags: EPHEMERAL, ...(components ? { components } : {}) },
})

function nextRow(nextButtonId) {
  return {
    type: 1,
    components: [
      { type: 2, custom_id: nextButtonId, label: '次へ →', style: 1 },
      { type: 2, custom_id: 'intro_cancel', label: 'キャンセル', style: 2 },
    ],
  }
}

function moreRow() {
  return {
    type: 1,
    components: [
      { type: 2, custom_id: 'intro_more', label: 'もっと回答する ➕', style: 1 },
      { type: 2, custom_id: 'intro_skip_confirm', label: '確認へ進む →', style: 3 },
      { type: 2, custom_id: 'intro_cancel', label: 'キャンセル', style: 2 },
    ],
  }
}

function confirmRow() {
  return {
    type: 1,
    components: [
      { type: 2, custom_id: 'intro_confirm', label: '✅ 投稿する', style: 3 },
      { type: 2, custom_id: 'intro_cancel', label: 'キャンセル', style: 2 },
    ],
  }
}

// raw モーダル送信の data.components から指定キーのフィールドを抽出
function extractFields(interaction, keys) {
  const fields = {}
  for (const row of interaction.data.components ?? []) {
    for (const component of row.components ?? []) {
      if (keys.includes(component.custom_id)) {
        fields[component.custom_id] = component.value?.trim() || undefined
      }
    }
  }
  return fields
}

export async function handleModalSubmit(interaction, env, ctx) {
  const userId = getUserId(interaction)
  const customId = interaction.data.custom_id

  // Route contact modals before intro session check
  if (customId.startsWith('contact_')) {
    return await handleContactModalSubmit(interaction, env)
  }

  // Route matchup modals before intro session check
  if (customId === 'matchup_free_topics') {
    return handleMatchupFreeTopics(interaction, env, userId)
  }

  // Route org config modal
  if (customId === 'org_config_modal') {
    return handleOrgConfigModal(interaction, env)
  }

  // Route relay modal
  if (customId === 'relay_modal') {
    return handleRelayModal(interaction, env, userId, ctx)
  }

  const kv = env.SESSION_KV
  const session = await get(kv, userId)
  if (!session) return ephemeralMsg(SESSION_EXPIRED_MSG)

  if (customId === 'intro_modal_1') {
    await update(kv, userId, extractFields(interaction, ['name', 'title', 'hometown']))
    await setStep(kv, userId, 2)
    return ephemeralMsg('**ステップ 1/3 完了！** 次は趣味・特技などを入力します。', [nextRow('intro_next_2')])
  }

  if (customId === 'intro_modal_2') {
    await update(kv, userId, extractFields(interaction, ['hobby', 'skill', 'myboom', 'food', 'drink']))
    await setStep(kv, userId, 3)
    return ephemeralMsg('**ステップ 2/3 完了！** 次は好きな場所・音楽などを入力します。', [nextRow('intro_next_3')])
  }

  if (customId === 'intro_modal_3') {
    await update(kv, userId, extractFields(interaction, ['place', 'oshi', 'music', 'book', 'oneword']))
    return ephemeralMsg('**ステップ 3/3 完了！** 追加の質問に回答することもできます。', [moreRow()])
  }

  if (customId === 'intro_modal_4') {
    await update(kv, userId, extractFields(interaction, ['want', 'pet', 'brand', 'holiday']))
    return ephemeralMsg('**もっと！① 完了！** あと少しだけ質問があります。', [nextRow('intro_next_5')])
  }

  if (customId === 'intro_modal_5') {
    await update(kv, userId, extractFields(interaction, ['reply_speed', 'kinoko_takenoko', 'taiyaki']))
    const updated = await get(kv, userId)
    if (!updated) return ephemeralMsg(SESSION_EXPIRED_MSG)
    const preview = formatIntro(getDisplayName(interaction), userId, updated.data)
    return ephemeralMsg(`**入力完了！** 以下の内容で投稿します。\n\n${preview}`, [confirmRow()])
  }

  return ephemeralMsg('不明なインタラクションです。')
}

async function handleMatchupFreeTopics(interaction, env, userId) {
  const { getActive, setActive } = await import('../utils/matchupKvStore.js')
  const { editMessage } = await import('../utils/discordApi.js')
  const matchupKv = env.MATCHUP_KV
  const guildId = interaction.guild_id

  const active = await getActive(matchupKv, guildId)
  if (!active || active.status !== 'recruiting') {
    return ephemeralMsg('現在募集中のマッチングイベントはありません。')
  }

  if (active.participants.some(p => p.userId === userId)) {
    return ephemeralMsg('既に参加登録済みです。')
  }

  const freeText = extractFields(interaction, ['free_topics']).free_topics || ''
  const { sanitizeTopicName } = await import('../utils/matchupLogic.js')
  const freeTopics = freeText.split(/[,、]/).map(s => sanitizeTopicName(s.trim())).filter(Boolean)

  const pending = active._pendingTopics?.[userId] || { topics: [], freeTopics: [] }
  pending.freeTopics = freeTopics

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

  const allTopics = [...pending.topics, ...freeTopics.map(t => `「${t}」`)]
  const topicDisplay = allTopics.length > 0 ? allTopics.join(', ') : 'なし'
  return ephemeralMsg(`✅ 参加登録しました！ トピック: ${topicDisplay}`)
}

async function handleRelayModal(interaction, env, userId, ctx) {
  const sentence = extractFields(interaction, ['relay_sentence']).relay_sentence
  if (!sentence) return ephemeralMsg('文が空です。')

  const guildId = interaction.guild_id
  const displayName = getDisplayName(interaction)
  const applicationId = interaction.application_id
  const interactionToken = interaction.token

  if (ctx) {
    ctx.waitUntil(doRelayModalSubmit(env, guildId, sentence, userId, displayName, applicationId, interactionToken))
  }
  return { type: 5, data: { flags: 64 } }
}

async function doRelayModalSubmit(env, guildId, sentence, userId, displayName, applicationId, interactionToken) {
  const { getRelay, saveRelay } = await import('../utils/relayStore.js')
  const { editMessage, sendFollowupMessage } = await import('../utils/discordApi.js')

  try {
    const relay = await getRelay(env.SESSION_KV, guildId)
    if (!relay) {
      await sendFollowupMessage(applicationId, interactionToken, {
        content: 'リレーは開催されていません。',
        flags: 64,
      })
      return
    }

    const lastSentence = relay.sentences[relay.sentences.length - 1]
    if (lastSentence && lastSentence.userId === userId) {
      await sendFollowupMessage(applicationId, interactionToken, {
        content: '連続で投稿することはできません。他の人の投稿を待ってください。',
        flags: 64,
      })
      return
    }

    relay.sentences.push({ text: sentence, userId, displayName })
    await saveRelay(env.SESSION_KV, guildId, relay)

    const count = relay.sentences.length

    await editMessage(relay.channelId, relay.messageId, env.DISCORD_TOKEN, {
      content: `**📝 1文リレー開催中！**\nお題：**${relay.topic}**\n\n現在 ${count} 文目`,
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

    await sendFollowupMessage(applicationId, interactionToken, {
      content: `✅ 追加しました！（${count}文目）`,
      flags: 64,
    })
  } catch (err) {
    console.error('doRelayModalSubmit error:', err)
    await sendFollowupMessage(applicationId, interactionToken, {
      content: 'エラーが発生しました。もう一度お試しください。',
      flags: 64,
    })
  }
}
