const RELAY_TTL = 30 * 24 * 60 * 60 // 30日

function relayKey(guildId) { return `relay-active:${guildId}` }

export async function getRelay(kv, guildId) {
  const raw = await kv.get(relayKey(guildId), 'text')
  return raw ? JSON.parse(raw) : null
}

export async function saveRelay(kv, guildId, data) {
  await kv.put(relayKey(guildId), JSON.stringify(data), { expirationTtl: RELAY_TTL })
}

export async function deleteRelay(kv, guildId) {
  await kv.delete(relayKey(guildId))
}
