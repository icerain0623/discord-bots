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

export async function handleModalSubmit(interaction, env) {
  const userId = getUserId(interaction)
  const customId = interaction.data.custom_id

  // Route matchup modals before intro session check
  if (customId === 'matchup_free_topics') {
    return handleMatchupFreeTopics(interaction, env, userId)
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
    const userId = getUserId(interaction)
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

  const freeText = extractFields(interaction, ['free_topics']).free_topics || ''
  const freeTopics = freeText.split(/[,、]/).map(s => s.trim()).filter(Boolean)

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
