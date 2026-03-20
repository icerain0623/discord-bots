export function shuffleAndGroup(participants, groupSize) {
  const shuffled = [...participants]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }

  const groups = []
  for (let i = 0; i < shuffled.length; i += groupSize) {
    groups.push(shuffled.slice(i, i + groupSize))
  }

  // Absorb remainder into last full group
  if (groups.length > 1 && groups[groups.length - 1].length < groupSize) {
    const remainder = groups.pop()
    groups[groups.length - 1].push(...remainder)
  }

  return groups
}

export function findCommonTopics(group) {
  const allTopicSets = group.map(p => new Set([...p.topics, ...p.freeTopics]))
  if (allTopicSets.length === 0) return []

  const first = allTopicSets[0]
  return [...first].filter(topic => allTopicSets.every(s => s.has(topic)))
}
