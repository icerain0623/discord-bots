export function buildModal5() {
  return {
    custom_id: 'intro_modal_5',
    title: '自己紹介 【もっと！②】',
    components: [
      textRow('reply_speed', '返信は早い？', '例：早い、気分による'),
      textRow('kinoko_takenoko', 'きのこ派 or たけのこ派', '例：たけのこ派！'),
      textRow('taiyaki', 'たい焼きの食べ方', '例：頭から、しっぽから'),
    ],
  }
}

function textRow(custom_id, label, placeholder) {
  return {
    type: 1,
    components: [{ type: 4, custom_id, label, placeholder, style: 1, required: false }],
  }
}
