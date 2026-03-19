export function buildModal4() {
  return {
    custom_id: 'intro_modal_4',
    title: '自己紹介 【もっと！①】',
    components: [
      textRow('want', 'いま欲しいもの', '例：PS5、時間'),
      textRow('pet', 'ペットを飼うなら', '例：柴犬、猫'),
      textRow('brand', '好きなブランド', '例：UNIQLO、Supreme'),
      textRow('holiday', '休日はどう過ごす？', '例：ゲーム、散歩'),
    ],
  }
}

function textRow(custom_id, label, placeholder) {
  return {
    type: 1,
    components: [{ type: 4, custom_id, label, placeholder, style: 1, required: false }],
  }
}
