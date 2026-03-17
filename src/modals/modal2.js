export function buildModal2() {
  return {
    custom_id: 'intro_modal_2',
    title: '自己紹介 (2/4) 【基本②＋好きな物①】',
    components: [
      textRow('hobby',  '趣味',         '例：ゲーム、映画鑑賞'),
      textRow('skill',  '特技',         '例：料理、プログラミング'),
      textRow('myboom', 'マイブーム',   '例：朝のストレッチ'),
      textRow('food',   '好きな食べ物', '例：ラーメン'),
      textRow('drink',  '好きな飲み物', '例：コーヒー'),
    ],
  }
}

function textRow(custom_id, label, placeholder) {
  return {
    type: 1,
    components: [{ type: 4, custom_id, label, placeholder, style: 1, required: false }],
  }
}
