export const SESSION_EXPIRED_MSG = 'セッションが切れました。最初からやり直してください。'

// raw Discord interaction JSON からユーザー表示名を取得
// 優先順位: サーバーニックネーム → グローバル表示名 → ユーザー名
export function getDisplayName(interaction) {
  return (
    interaction.member?.nick ??
    interaction.member?.user?.global_name ??
    interaction.member?.user?.username ??
    interaction.user?.global_name ??
    interaction.user?.username ??
    'Unknown'
  )
}

// raw interaction から userId を取得
export function getUserId(interaction) {
  return interaction.member?.user?.id ?? interaction.user?.id
}
