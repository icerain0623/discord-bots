import { describe, test, expect } from '@jest/globals'
import { buildOrgEmbeds } from '../src/utils/orgFormatter.js'

describe('buildOrgEmbeds', () => {
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
    { user: { id: 'u1' }, roles: ['r1'] },
    { user: { id: 'u2' }, roles: ['r2'] },
    { user: { id: 'u3' }, roles: ['r3'] },
    { user: { id: 'u4' }, roles: ['r4'] },
    { user: { id: 'u5' }, roles: ['r5'] },
  ]

  test('builds embed with departments and mentions', () => {
    const embeds = buildOrgEmbeds(config, guildRoles, guildMembers)
    expect(embeds.length).toBe(1)
    const desc = embeds[0].description
    expect(desc).toContain('【三役】')
    expect(desc).toContain('幹事長：<@u1>')
    expect(desc).toContain('副幹事長：<@u2>')
    expect(desc).toContain('【企画部】')
    expect(desc).toContain('企画事務局長：<@u4>')
    expect(desc).toContain('未来設計室長：<@u5>')
  })

  test('shows （空席） for roles with no members', () => {
    const embeds = buildOrgEmbeds(config, guildRoles, [])
    const desc = embeds[0].description
    expect(desc).toContain('幹事長：（空席）')
  })

  test('shows multiple members comma-separated', () => {
    const members = [
      { user: { id: 'u1' }, roles: ['r1'] },
      { user: { id: 'u6' }, roles: ['r1'] },
    ]
    const embeds = buildOrgEmbeds(config, guildRoles, members)
    const desc = embeds[0].description
    expect(desc).toContain('幹事長：<@u1>, <@u6>')
  })

  test('includes JST timestamp in footer', () => {
    const embeds = buildOrgEmbeds(config, guildRoles, guildMembers)
    expect(embeds[0].footer.text).toMatch(/最終更新: .+ \(JST\)/)
  })

  test('skips roles not found in guild', () => {
    const configWithUnknown = {
      departments: [{ name: 'テスト', roles: ['存在しないロール'] }],
    }
    const embeds = buildOrgEmbeds(configWithUnknown, guildRoles, guildMembers)
    const desc = embeds[0].description
    expect(desc).toContain('存在しないロール：（空席）')
  })

  test('splits into multiple embeds when description exceeds 4096 chars', () => {
    const manyRoles = Array.from({ length: 100 }, (_, i) => `ロール${i}`)
    const bigConfig = {
      departments: [
        { name: '部門A', roles: manyRoles.slice(0, 50) },
        { name: '部門B', roles: manyRoles.slice(50) },
      ],
    }
    const roles = manyRoles.map((name, i) => ({ id: `r${i}`, name }))
    const members = manyRoles.map((_, i) => ({ user: { id: `u${i}` }, roles: [`r${i}`] }))
    const embeds = buildOrgEmbeds(bigConfig, roles, members)
    for (const embed of embeds) {
      expect(embed.description.length).toBeLessThanOrEqual(4096)
    }
  })
})
