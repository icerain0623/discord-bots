const MESSAGE_LIMIT = 1800

function formatJstTimestamp() {
  const now = new Date()
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const y = jst.getUTCFullYear()
  const m = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const d = String(jst.getUTCDate()).padStart(2, '0')
  const h = String(jst.getUTCHours()).padStart(2, '0')
  const min = String(jst.getUTCMinutes()).padStart(2, '0')
  return `${y}-${m}-${d} ${h}:${min} (JST)`
}

function formatMember(userId, userNameMap, debug) {
  if (debug) return userNameMap.get(userId) || userId
  return `<@${userId}>`
}

function buildDepartmentSection(dept, roleNameToId, membersByRoleId, userNameMap, debug) {
  const lines = [`【${dept.name}】`]
  for (const roleName of dept.roles) {
    const roleId = roleNameToId.get(roleName)
    const members = roleId ? (membersByRoleId.get(roleId) || []) : []
    if (members.length === 0) {
      lines.push(`${roleName}：（空席）`)
    } else {
      const names = members.map(m => formatMember(m, userNameMap, debug)).join(', ')
      lines.push(`${roleName}：${names}`)
    }
  }
  return lines.join('\n')
}

export function buildOrgMessages(config, guildRoles, guildMembers, { debug = false } = {}) {
  const roleNameToId = new Map()
  for (const role of guildRoles) {
    roleNameToId.set(role.name, role.id)
  }

  const userNameMap = new Map()
  for (const member of guildMembers) {
    const name = member.nick || member.user.global_name || member.user.username
    userNameMap.set(member.user.id, name)
  }

  const membersByRoleId = new Map()
  for (const member of guildMembers) {
    for (const roleId of member.roles) {
      if (!membersByRoleId.has(roleId)) {
        membersByRoleId.set(roleId, [])
      }
      membersByRoleId.get(roleId).push(member.user.id)
    }
  }

  const sections = config.departments.map(dept =>
    buildDepartmentSection(dept, roleNameToId, membersByRoleId, userNameMap, debug)
  )

  // Collect role IDs already covered by department config
  const assignedRoleIds = new Set()
  for (const dept of config.departments) {
    for (const roleName of dept.roles) {
      const roleId = roleNameToId.get(roleName)
      if (roleId) assignedRoleIds.add(roleId)
    }
  }

  // Build "未分類" section: roles with members but not in any department
  const unassignedLines = []
  for (const role of guildRoles) {
    if (assignedRoleIds.has(role.id)) continue
    if (role.name === '@everyone') continue
    const members = membersByRoleId.get(role.id) || []
    if (members.length === 0) continue
    const names = members.map(m => formatMember(m, userNameMap, debug)).join(', ')
    unassignedLines.push(`${role.name}：${names}`)
  }

  // Also find members with no roles at all
  const noRoleMembers = guildMembers.filter(m => m.roles.length === 0)
  if (noRoleMembers.length > 0) {
    const names = noRoleMembers.map(m => formatMember(m.user.id, userNameMap, debug)).join(', ')
    unassignedLines.push(`ロールなし：${names}`)
  }

  if (unassignedLines.length > 0) {
    sections.push(`【未分類】\n${unassignedLines.join('\n')}`)
  }

  const header = debug ? '📋 組織図（デバッグモード）\n━━━━━━━━━━━━━━━\n' : '📋 組織図\n━━━━━━━━━━━━━━━\n'
  const timestamp = `\n最終更新: ${formatJstTimestamp()}`

  // Split into multiple messages, respecting MESSAGE_LIMIT
  const messages = []
  let current = header

  for (const section of sections) {
    const lines = section.split('\n')

    for (const line of lines) {
      const candidate = current + (current.endsWith('\n') ? '' : '\n') + line + '\n'
      if (candidate.length > MESSAGE_LIMIT && current !== header) {
        messages.push(current.trimEnd())
        current = line + '\n'
      } else {
        current = candidate
      }
    }
    current += '\n'
  }

  current += timestamp
  messages.push(current.trimEnd())

  return messages
}
