const EMBED_DESC_LIMIT = 4096

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

function buildDepartmentSection(dept, roleNameToId, membersByRoleId) {
  const lines = [`\n【${dept.name}】`]
  for (const roleName of dept.roles) {
    const roleId = roleNameToId.get(roleName)
    const members = roleId ? (membersByRoleId.get(roleId) || []) : []
    if (members.length === 0) {
      lines.push(`${roleName}：（空席）`)
    } else {
      const mentions = members.map(m => `<@${m}>`).join(', ')
      lines.push(`${roleName}：${mentions}`)
    }
  }
  return lines.join('\n')
}

export function buildOrgEmbeds(config, guildRoles, guildMembers) {
  const roleNameToId = new Map()
  for (const role of guildRoles) {
    roleNameToId.set(role.name, role.id)
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
    buildDepartmentSection(dept, roleNameToId, membersByRoleId)
  )

  const header = '📋 組織図\n━━━━━━━━━━━━━━━'
  const timestamp = formatJstTimestamp()
  const embeds = []
  let currentDesc = header

  for (const section of sections) {
    if (currentDesc.length + section.length > EMBED_DESC_LIMIT && currentDesc !== header) {
      embeds.push({
        description: currentDesc,
        color: 0x5865f2,
      })
      currentDesc = section
    } else {
      currentDesc += section
    }
  }

  embeds.push({
    description: currentDesc,
    color: 0x5865f2,
    footer: { text: `最終更新: ${timestamp}` },
  })

  return embeds
}
