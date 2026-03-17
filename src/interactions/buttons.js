import { buildModal1 } from '../modals/modal1.js'
import { buildModal2 } from '../modals/modal2.js'
import { buildModal3 } from '../modals/modal3.js'
import { buildModal4 } from '../modals/modal4.js'
import { create, get, remove } from '../utils/sessionStore.js'
import { formatIntro } from '../utils/formatIntro.js'

const SESSION_EXPIRED_MSG = 'セッションが切れました。最初からやり直してください。'

// ユーザー表示名を取得（GuildMember のニックネーム優先、なければグローバル表示名、なければユーザー名）
function getDisplayName(interaction) {
  return interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username
}

export async function handleButton(interaction) {
  const { customId, user } = interaction

  if (customId === 'intro_start') {
    create(user.id)
    await interaction.showModal(buildModal1())
    return
  }

  if (customId === 'intro_next_2') {
    if (!get(user.id)) {
      await interaction.reply({ content: SESSION_EXPIRED_MSG, ephemeral: true })
      return
    }
    await interaction.showModal(buildModal2())
    return
  }

  if (customId === 'intro_next_3') {
    if (!get(user.id)) {
      await interaction.reply({ content: SESSION_EXPIRED_MSG, ephemeral: true })
      return
    }
    await interaction.showModal(buildModal3())
    return
  }

  if (customId === 'intro_next_4') {
    if (!get(user.id)) {
      await interaction.reply({ content: SESSION_EXPIRED_MSG, ephemeral: true })
      return
    }
    await interaction.showModal(buildModal4())
    return
  }

  if (customId === 'intro_confirm') {
    const session = get(user.id)
    if (!session) {
      await interaction.reply({ content: SESSION_EXPIRED_MSG, ephemeral: true })
      return
    }
    const channelId = process.env.INTRO_CHANNEL_ID
    const channel = interaction.client.channels.cache.get(channelId)
    if (!channel) {
      await interaction.reply({ content: '投稿先チャンネルが見つかりませんでした。', ephemeral: true })
      return
    }
    const text = formatIntro(getDisplayName(interaction), session.data)
    await channel.send(text)
    remove(user.id)
    await interaction.update({ content: '✅ 自己紹介を投稿しました！', components: [] })
    return
  }

  if (customId === 'intro_cancel') {
    remove(user.id)
    await interaction.update({ content: 'キャンセルしました。', components: [] })
    return
  }
}
