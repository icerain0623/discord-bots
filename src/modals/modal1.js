export function buildModal1() {
  return {
    custom_id: 'intro_modal_1',
    title: '自己紹介 (1/4) 【基本①】',
    components: [
      textRow('name',     '名前',   '例：山田太郎（ニックネームでもOK）'),
      textRow('gender',   '性別',   '男性 / 女性 / その他 / 回答しない'),
      textRow('age',      '年齢',   '例：25'),
      textRow('title',    '肩書き', '例：エンジニア / 学生 / 主婦'),
      textRow('hometown', '出身地', '例：東京都 / 北海道'),
    ],
  }
}

function textRow(custom_id, label, placeholder) {
  return {
    type: 1,
    components: [{ type: 4, custom_id, label, placeholder, style: 1, required: false }],
  }
}
