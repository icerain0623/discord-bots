import { buildModal1 } from '../modals/modal1.js'
import { buildModal2 } from '../modals/modal2.js'
import { buildModal3 } from '../modals/modal3.js'
import { buildModal4 } from '../modals/modal4.js'
import { create, get, remove } from '../utils/sessionStore.js'
import { formatIntro } from '../utils/formatIntro.js'
import { SESSION_EXPIRED_MSG, getDisplayName } from '../utils/interactionHelpers.js'

export async function handleButton(interaction) {
  const { customId, user } = interaction

  if (customId === 'intro_start') {
    if (get(user.id)) {
      await interaction.reply({
        content: '自己紹介の入力が途中です。続きから入力するか、キャンセルしてから再度お試しください。',
        ephemeral: true,
      })
      return
    }
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
    try {
      const text = formatIntro(getDisplayName(interaction), session.data)
      await channel.send(text)
    } catch {
      await interaction.reply({ content: '投稿に失敗しました。Botのチャンネル権限を確認してください。', ephemeral: true })
      return
    }
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
