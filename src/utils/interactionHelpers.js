export const SESSION_EXPIRED_MSG = 'セッションが切れました。最初からやり直してください。'

export function getDisplayName(interaction) {
  return interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username
}
