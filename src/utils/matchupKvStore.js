const MAX_TOPICS = 25

function topicsKey(guildId) { return `matchup-topics:${guildId}` }
function activeKey(guildId) { return `matchup-active:${guildId}` }

export async function getTopics(kv, guildId) {
  const raw = await kv.get(topicsKey(guildId))
  return raw ? JSON.parse(raw) : []
}

export async function setTopics(kv, guildId, topics) {
  await kv.put(topicsKey(guildId), JSON.stringify(topics))
}

export async function addTopic(kv, guildId, name) {
  const topics = await getTopics(kv, guildId)
  if (topics.includes(name)) return { error: 'duplicate' }
  if (topics.length >= MAX_TOPICS) return { error: 'limit' }
  topics.push(name)
  await setTopics(kv, guildId, topics)
  return { ok: true }
}

export async function removeTopic(kv, guildId, name) {
  const topics = await getTopics(kv, guildId)
  const idx = topics.indexOf(name)
  if (idx === -1) return { error: 'not_found' }
  topics.splice(idx, 1)
  await setTopics(kv, guildId, topics)
  return { ok: true }
}

export async function getActive(kv, guildId) {
  const raw = await kv.get(activeKey(guildId))
  return raw ? JSON.parse(raw) : null
}

export async function setActive(kv, guildId, data) {
  await kv.put(activeKey(guildId), JSON.stringify(data))
}

export async function deleteActive(kv, guildId) {
  await kv.delete(activeKey(guildId))
}
