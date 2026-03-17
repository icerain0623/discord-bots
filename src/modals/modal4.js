import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'

export function buildModal4() {
  return new ModalBuilder()
    .setCustomId('intro_modal_4')
    .setTitle('自己紹介 (4/4) 【もっと！＋一言】')
    .addComponents(
      row('pet',     'ペットを飼うなら',   '例：ねこ、いぬ'),
      row('holiday', '休日はどう過ごす？', '例：ゲーム、外出、ゴロゴロ'),
      row('reply',   '返信は早い？',       '早い / 普通 / 遅め'),
      row('game',    'ゲームやってる？',   'やってる / たまに / やってない'),
      row('oneword', '一言！',             'よろしくお願いします！'),
    )
}

function row(id, label, placeholder) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setPlaceholder(placeholder)
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
  )
}
