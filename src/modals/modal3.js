import { ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js'

export function buildModal3() {
  return new ModalBuilder()
    .setCustomId('intro_modal_3')
    .setTitle('自己紹介 (3/4) 【好きな物②＋もっと①】')
    .addComponents(
      row('place', '好きな場所',         '例：秋葉原、海辺'),
      row('oshi',  '推し・キャラクター', '例：〇〇（アニメ）のキャラ'),
      row('music', '好きな音楽',         '例：ロック、J-POP'),
      row('book',  '好きな本',           '例：技術書、小説'),
      row('want',  'いま欲しいもの',     '例：広いモニター'),
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
