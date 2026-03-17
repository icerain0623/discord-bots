export function buildModal3() {
  return {
    custom_id: 'intro_modal_3',
    title: '自己紹介 (3/4) 【好きな物②＋もっと①】',
    components: [
      textRow('place', '好きな場所',         '例：秋葉原、海辺'),
      textRow('oshi',  '推し・キャラクター', '例：〇〇（アニメ）のキャラ'),
      textRow('music', '好きな音楽',         '例：ロック、J-POP'),
      textRow('book',  '好きな本',           '例：技術書、小説'),
      textRow('want',  'いま欲しいもの',     '例：広いモニター'),
    ],
  }
}

function textRow(custom_id, label, placeholder) {
  return {
    type: 1,
    components: [{ type: 4, custom_id, label, placeholder, style: 1, required: false }],
  }
}
