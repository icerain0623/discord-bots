// Discord Permission Bits
// https://discord.com/developers/docs/topics/permissions#permissions-bitwise-permission-flags
const ADMINISTRATOR = 1n << 3n
const MANAGE_GUILD = 1n << 5n
const MANAGE_MESSAGES = 1n << 13n

/**
 * interaction.member.permissions から指定ビットを持つか判定する
 * ADMINISTRATOR 権限を持つユーザーは常に true を返す
 */
export function hasPermission(interaction, permissionBit) {
  const memberPerms = BigInt(interaction.member?.permissions || '0')
  if ((memberPerms & ADMINISTRATOR) === ADMINISTRATOR) return true
  return (memberPerms & permissionBit) === permissionBit
}

export function hasManageGuild(interaction) {
  return hasPermission(interaction, MANAGE_GUILD)
}

export function hasManageMessages(interaction) {
  return hasPermission(interaction, MANAGE_MESSAGES)
}

/**
 * 権限不足時のエフェメラル応答を返す
 */
export function permissionDeniedResponse(permissionName) {
  return {
    type: 4,
    data: {
      content: `この操作には「${permissionName}」権限が必要です。`,
      flags: 64,
    },
  }
}
