export function buildModal4() {
  return {
    custom_id: 'intro_modal_4',
    title: '自己紹介 (4/4) 【もっと！＋一言】',
    components: [
      textRow('pet',     'ペットを飼うなら',   '例：ねこ、いぬ'),
      textRow('holiday', '休日はどう過ごす？', '例：ゲーム、外出、ゴロゴロ'),
      textRow('reply',   '返信は早い？',       '早い / 普通 / 遅め'),
      textRow('game',    'ゲームやってる？',   'やってる / たまに / やってない'),
      textRow('oneword', '一言！',             'よろしくお願いします！'),
    ],
  }
}

function textRow(custom_id, label, placeholder) {
  return {
    type: 1,
    components: [{ type: 4, custom_id, label, placeholder, style: 1, required: false }],
  }
}
