import { buildModal1 } from '../modals/modal1.js'
import { buildModal2 } from '../modals/modal2.js'
import { buildModal3 } from '../modals/modal3.js'
import { buildModal4 } from '../modals/modal4.js'
import { buildModal5 } from '../modals/modal5.js'
import { create, get, remove } from '../utils/kvStore.js'
import { formatIntro } from '../utils/formatIntro.js'
import { SESSION_EXPIRED_MSG, getDisplayName, getUserId } from '../utils/interactionHelpers.js'

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

  return ephemeralMsg('不明なインタラクションです。')
}
