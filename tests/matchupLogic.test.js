import { shuffleAndGroup, findCommonTopics } from '../src/utils/matchupLogic.js'

describe('shuffleAndGroup', () => {
  test('divides 4 participants into 2 groups of 2', () => {
    const participants = [
      { userId: '1', topics: [], freeTopics: [] },
      { userId: '2', topics: [], freeTopics: [] },
      { userId: '3', topics: [], freeTopics: [] },
      { userId: '4', topics: [], freeTopics: [] },
    ]
    const groups = shuffleAndGroup(participants, 2)
    expect(groups).toHaveLength(2)
    expect(groups[0]).toHaveLength(2)
    expect(groups[1]).toHaveLength(2)
  })

  test('absorbs remainder into last group (7 people, size 2 → 2,2,3)', () => {
    const participants = Array.from({ length: 7 }, (_, i) => ({
      userId: String(i), topics: [], freeTopics: [],
    }))
    const groups = shuffleAndGroup(participants, 2)
    expect(groups).toHaveLength(3)
    expect(groups[0]).toHaveLength(2)
    expect(groups[1]).toHaveLength(2)
    expect(groups[2]).toHaveLength(3)
  })

  test('all participants appear exactly once', () => {
    const participants = Array.from({ length: 5 }, (_, i) => ({
      userId: String(i), topics: [], freeTopics: [],
    }))
    const groups = shuffleAndGroup(participants, 2)
    const allIds = groups.flat().map(p => p.userId).sort()
    expect(allIds).toEqual(['0', '1', '2', '3', '4'])
  })

  test('single group when participants <= group_size', () => {
    const participants = [
      { userId: '1', topics: [], freeTopics: [] },
      { userId: '2', topics: [], freeTopics: [] },
    ]
    const groups = shuffleAndGroup(participants, 4)
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(2)
  })
})

describe('findCommonTopics', () => {
  test('finds common topics between participants', () => {
    const group = [
      { userId: '1', topics: ['ゲーム', '音楽'], freeTopics: ['猫'] },
      { userId: '2', topics: ['音楽', '映画'], freeTopics: [] },
    ]
    const common = findCommonTopics(group)
    expect(common).toEqual(['音楽'])
  })

  test('includes free topics in common check', () => {
    const group = [
      { userId: '1', topics: ['ゲーム'], freeTopics: ['猫'] },
      { userId: '2', topics: [], freeTopics: ['猫'] },
    ]
    const common = findCommonTopics(group)
    expect(common).toEqual(['猫'])
  })

  test('returns empty when no common topics', () => {
    const group = [
      { userId: '1', topics: ['ゲーム'], freeTopics: [] },
      { userId: '2', topics: ['映画'], freeTopics: [] },
    ]
    const common = findCommonTopics(group)
    expect(common).toEqual([])
  })

  test('works with 3+ members (intersection of all)', () => {
    const group = [
      { userId: '1', topics: ['ゲーム', '音楽'], freeTopics: [] },
      { userId: '2', topics: ['音楽', '映画'], freeTopics: [] },
      { userId: '3', topics: ['音楽', 'アニメ'], freeTopics: [] },
    ]
    const common = findCommonTopics(group)
    expect(common).toEqual(['音楽'])
  })
})
