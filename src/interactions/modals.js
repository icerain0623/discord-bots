import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js'
import { get, update, setStep } from '../utils/sessionStore.js'
import { formatIntro } from '../utils/formatIntro.js'
import { SESSION_EXPIRED_MSG, getDisplayName } from '../utils/interactionHelpers.js'

function nextRow(nextButtonId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(nextButtonId)
      .setLabel('次へ →')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('intro_cancel')
      .setLabel('キャンセル')
      .setStyle(ButtonStyle.Secondary),
  )
}

function confirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('intro_confirm')
      .setLabel('✅ 投稿する')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('intro_cancel')
      .setLabel('キャンセル')
      .setStyle(ButtonStyle.Secondary),
  )
}

// モーダルのフィールドを取得（空文字は undefined に正規化）
function extractFields(interaction, keys) {
  return Object.fromEntries(
    keys.map((key) => {
      const val = interaction.fields.getTextInputValue(key)
      return [key, val?.trim() || undefined]
    })
  )
}

export async function handleModalSubmit(interaction) {
  const { customId, user } = interaction

  if (!get(user.id)) {
    await interaction.reply({ content: SESSION_EXPIRED_MSG, ephemeral: true })
    return
  }

  if (customId === 'intro_modal_1') {
    update(user.id, extractFields(interaction, ['name', 'gender', 'age', 'title', 'hometown']))
    setStep(user.id, 2)
    await interaction.reply({
      content: '**ステップ 1/4 完了！** 次は趣味・特技などを入力します。',
      components: [nextRow('intro_next_2')],
      ephemeral: true,
    })
    return
  }

  if (customId === 'intro_modal_2') {
    update(user.id, extractFields(interaction, ['hobby', 'skill', 'myboom', 'food', 'drink']))
    setStep(user.id, 3)
    await interaction.reply({
      content: '**ステップ 2/4 完了！** 次は好きな場所・音楽などを入力します。',
      components: [nextRow('intro_next_3')],
      ephemeral: true,
    })
    return
  }

  if (customId === 'intro_modal_3') {
    update(user.id, extractFields(interaction, ['place', 'oshi', 'music', 'book', 'want']))
    setStep(user.id, 4)
    await interaction.reply({
      content: '**ステップ 3/4 完了！** 最後の質問です。',
      components: [nextRow('intro_next_4')],
      ephemeral: true,
    })
    return
  }

  if (customId === 'intro_modal_4') {
    update(user.id, extractFields(interaction, ['pet', 'holiday', 'reply', 'game', 'oneword']))
    const session = get(user.id)
    if (!session) {
      await interaction.reply({ content: SESSION_EXPIRED_MSG, ephemeral: true })
      return
    }
    const preview = formatIntro(getDisplayName(interaction), session.data)
    await interaction.reply({
      content: `**入力完了！** 以下の内容で投稿します。\n\n${preview}`,
      components: [confirmRow()],
      ephemeral: true,
    })
    return
  }
}
