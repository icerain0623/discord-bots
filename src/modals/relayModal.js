/**
 * 1文リレー入力モーダルを生成する。
 * @param {string} previousSentence - 前の一文（45文字超は切り詰め）
 */
export function buildRelayModal(previousSentence) {
  const maxTitleLen = 45
  let title = previousSentence || '最初の一文に続けてください'
  if (title.length > maxTitleLen) {
    title = title.slice(0, maxTitleLen - 1) + '…'
  }

  return {
    custom_id: 'relay_modal',
    title,
    components: [
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'relay_sentence',
          label: 'あなたの一文を入力してください',
          style: 1,
          required: true,
          max_length: 200,
          placeholder: '一文を入力…',
        }],
      },
    ],
  }
}
