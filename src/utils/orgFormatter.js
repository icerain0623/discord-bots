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

const LINE_LIMIT = 1600

function formatRoleLines(roleName, members, userNameMap, debug) {
  if (members.length === 0) return [`${roleName}：（空席）`]
  const prefix = `${roleName}：`
  const contPrefix = '　　'
  const lines = []
  let currentNames = []
  let currentLen = prefix.length

  for (const m of members) {
    const name = formatMember(m, userNameMap, debug)
    const addition = currentNames.length === 0 ? name.length : name.length + 2
    if (currentLen + addition > LINE_LIMIT && currentNames.length > 0) {
      const p = lines.length === 0 ? prefix : contPrefix
      lines.push(`${p}${currentNames.join(', ')}`)
      currentNames = [name]
      currentLen = contPrefix.length + name.length
    } else {
      currentNames.push(name)
      currentLen += addition
    }
  }
  if (currentNames.length > 0) {
    const p = lines.length === 0 ? prefix : contPrefix
    lines.push(`${p}${currentNames.join(', ')}`)
  }
  return lines
}

function buildDepartmentSection(dept, roleNameToId, membersByRoleId, userNameMap, debug) {
  const lines = [`【${dept.name}】`]
  for (const roleName of dept.roles) {
    const roleId = roleNameToId.get(roleName)
    const members = roleId ? (membersByRoleId.get(roleId) || []) : []
    lines.push(...formatRoleLines(roleName, members, userNameMap, debug))
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
    unassignedLines.push(...formatRoleLines(role.name, members, userNameMap, debug))
  }

  // Also find members with no roles at all
  const noRoleMembers = guildMembers.filter(m => m.roles.length === 0)
  if (noRoleMembers.length > 0) {
    const memberIds = noRoleMembers.map(m => m.user.id)
    unassignedLines.push(...formatRoleLines('ロールなし', memberIds, userNameMap, debug))
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
