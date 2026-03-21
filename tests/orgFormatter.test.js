import { describe, test, expect } from '@jest/globals'
import { buildOrgMessages } from '../src/utils/orgFormatter.js'

describe('buildOrgMessages', () => {
  const config = {
    departments: [
      { name: '三役', roles: ['幹事長', '副幹事長', '会計担当'] },
      { name: '企画部', roles: ['企画事務局長', '未来設計室長'] },
    ],
  }

  const guildRoles = [
    { id: 'r1', name: '幹事長' },
    { id: 'r2', name: '副幹事長' },
    { id: 'r3', name: '会計担当' },
    { id: 'r4', name: '企画事務局長' },
    { id: 'r5', name: '未来設計室長' },
  ]

  const guildMembers = [
    { user: { id: 'u1', username: 'user1' }, roles: ['r1'] },
    { user: { id: 'u2', username: 'user2' }, roles: ['r2'] },
    { user: { id: 'u3', username: 'user3' }, roles: ['r3'] },
    { user: { id: 'u4', username: 'user4' }, roles: ['r4'] },
    { user: { id: 'u5', username: 'user5' }, roles: ['r5'] },
  ]

  test('builds messages with departments and mentions', () => {
    const messages = buildOrgMessages(config, guildRoles, guildMembers)
    const text = messages.join('\n')
    expect(text).toContain('【三役】')
    expect(text).toContain('幹事長：<@u1>')
    expect(text).toContain('副幹事長：<@u2>')
    expect(text).toContain('【企画部】')
    expect(text).toContain('企画事務局長：<@u4>')
    expect(text).toContain('未来設計室長：<@u5>')
  })

  test('shows （空席） for roles with no members', () => {
    const messages = buildOrgMessages(config, guildRoles, [])
    const text = messages.join('\n')
    expect(text).toContain('幹事長：（空席）')
  })

  test('shows multiple members comma-separated', () => {
    const members = [
      { user: { id: 'u1', username: 'user1' }, roles: ['r1'] },
      { user: { id: 'u6', username: 'user6' }, roles: ['r1'] },
    ]
    const messages = buildOrgMessages(config, guildRoles, members)
    const text = messages.join('\n')
    expect(text).toContain('幹事長：<@u1>, <@u6>')
  })

  test('includes JST timestamp', () => {
    const messages = buildOrgMessages(config, guildRoles, guildMembers)
    const text = messages.join('\n')
    expect(text).toMatch(/最終更新: .+ \(JST\)/)
  })

  test('skips roles not found in guild', () => {
    const configWithUnknown = {
      departments: [{ name: 'テスト', roles: ['存在しないロール'] }],
    }
    const messages = buildOrgMessages(configWithUnknown, guildRoles, guildMembers)
    const text = messages.join('\n')
    expect(text).toContain('存在しないロール：（空席）')
  })

  test('splits into multiple messages when content exceeds limit', () => {
    const manyRoles = Array.from({ length: 200 }, (_, i) => `ロール名が長いテスト${i}`)
    const bigConfig = {
      departments: [
        { name: '部門A', roles: manyRoles.slice(0, 100) },
        { name: '部門B', roles: manyRoles.slice(100) },
      ],
    }
    const roles = manyRoles.map((name, i) => ({ id: `r${i}`, name }))
    const members = manyRoles.map((_, i) => ({ user: { id: `u${i}`, username: `user${i}` }, roles: [`r${i}`] }))
    const messages = buildOrgMessages(bigConfig, roles, members)
    expect(messages.length).toBeGreaterThan(1)
    for (const msg of messages) {
      expect(msg.length).toBeLessThanOrEqual(1800)
    }
  })

  test('debug mode uses usernames instead of mentions', () => {
    const messages = buildOrgMessages(config, guildRoles, guildMembers, { debug: true })
    const text = messages.join('\n')
    expect(text).toContain('user1')
    expect(text).not.toContain('<@u1>')
    expect(text).toContain('デバッグモード')
  })

  test('shows unassigned roles in 未分類 section', () => {
    const rolesWithExtra = [
      ...guildRoles,
      { id: 'r6', name: 'モデレータ' },
    ]
    const membersWithExtra = [
      ...guildMembers,
      { user: { id: 'u6', username: 'user6' }, roles: ['r6'] },
    ]
    const messages = buildOrgMessages(config, rolesWithExtra, membersWithExtra)
    const text = messages.join('\n')
    expect(text).toContain('【未分類】')
    expect(text).toContain('モデレータ：<@u6>')
  })
})
