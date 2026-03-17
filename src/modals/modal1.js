import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'

export function buildModal1() {
  return new ModalBuilder()
    .setCustomId('intro_modal_1')
    .setTitle('自己紹介 (1/4) 【基本①】')
    .addComponents(
      row('name',     '名前',   '例：山田太郎（ニックネームでもOK）'),
      row('gender',   '性別',   '男性 / 女性 / その他 / 回答しない'),
      row('age',      '年齢',   '例：25'),
      row('title',    '肩書き', '例：エンジニア / 学生 / 主婦'),
      row('hometown', '出身地', '例：東京都 / 北海道'),
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
