/**
 * 1文リレー入力モーダルを生成する。
 * @param {string} previousSentence - 前の一文（表示用入力欄に全文表示）
 */
export function buildRelayModal(previousSentence) {
  const components = []

  // 前の文章がある場合、表示用の入力欄を追加
  if (previousSentence) {
    components.push({
      type: 1,
      components: [{
        type: 4,
        custom_id: 'relay_prev',
        label: '前の文章',
        style: 2,
        value: previousSentence,
        required: false,
      }],
    })
  }

  // 入力用の入力欄
  components.push({
    type: 1,
    components: [{
      type: 4,
      custom_id: 'relay_sentence',
      label: 'あなたの一文を入力してください',
      style: 2,
      required: true,
      max_length: 500,
      placeholder: '一文を入力…',
    }],
  })

  return {
    custom_id: 'relay_modal',
    title: '一文リレー',
    components,
  }
}
