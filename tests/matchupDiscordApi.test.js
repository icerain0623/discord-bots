import { buildChannelPayload, buildGreetingMessage } from '../src/utils/matchupChannelUtils.js'

describe('buildChannelPayload', () => {
  test('creates correct payload with permission overwrites', () => {
    const payload = buildChannelPayload({
      name: 'matchup-1',
      categoryId: 'cat123',
      guildId: 'guild123',
      memberIds: ['user1', 'user2'],
      botId: 'bot123',
    })

    expect(payload.name).toBe('matchup-1')
    expect(payload.parent_id).toBe('cat123')
    expect(payload.type).toBe(0)
    expect(payload.permission_overwrites).toHaveLength(4)

    const everyoneDeny = payload.permission_overwrites.find(o => o.id === 'guild123')
    expect(everyoneDeny.deny).toBe('1024')

    const memberAllow = payload.permission_overwrites.find(o => o.id === 'user1')
    expect(memberAllow.allow).toBe('1024')
  })
})

describe('buildGreetingMessage', () => {
  test('includes common topics when present', () => {
    const group = [
      { userId: '111', topics: ['ゲーム', '音楽'], freeTopics: ['猫の話'] },
      { userId: '222', topics: ['音楽', '映画'], freeTopics: [] },
    ]
    const msg = buildGreetingMessage(group, ['音楽'])
    expect(msg).toContain('<@111>')
    expect(msg).toContain('<@222>')
    expect(msg).toContain('共通の話題')
    expect(msg).toContain('音楽')
  })

  test('omits common topics line when none', () => {
    const group = [
      { userId: '111', topics: ['ゲーム'], freeTopics: [] },
      { userId: '222', topics: ['映画'], freeTopics: [] },
    ]
    const msg = buildGreetingMessage(group, [])
    expect(msg).not.toContain('共通の話題')
    expect(msg).toContain('<@111>')
  })
})
