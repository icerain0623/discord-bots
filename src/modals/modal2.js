import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'

export function buildModal2() {
  return new ModalBuilder()
    .setCustomId('intro_modal_2')
    .setTitle('自己紹介 (2/4) 【基本②＋好きな物①】')
    .addComponents(
      row('hobby',   '趣味',         '例：ゲーム、映画鑑賞'),
      row('skill',   '特技',         '例：料理、プログラミング'),
      row('myboom',  'マイブーム',   '例：朝のストレッチ'),
      row('food',    '好きな食べ物', '例：ラーメン'),
      row('drink',   '好きな飲み物', '例：コーヒー'),
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
