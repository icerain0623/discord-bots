export function buildMatchupFreeTopicsModal() {
  return {
    custom_id: 'matchup_free_topics',
    title: '追加トピック（自由入力）',
    components: [
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'free_topics',
          label: '話したいトピック（カンマ区切りで複数可）',
          placeholder: '例：猫の話, 最近見た映画',
          style: 2,
          required: false,
        }],
      },
    ],
  }
}
