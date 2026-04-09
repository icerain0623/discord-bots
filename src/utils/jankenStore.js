const TTL_SECONDS = 300 // 5 minutes

function key(guildId, challengerId) {
  return `janken:${guildId}:${challengerId}`
}

/**
 * Create a new janken session.
 */
export async function createSession(kv, guildId, challengerId, session) {
  await kv.put(key(guildId, challengerId), JSON.stringify(session), { expirationTtl: TTL_SECONDS })
}

/**
 * Get an existing janken session.
 * @returns {object|null}
 */
export async function getSession(kv, guildId, challengerId) {
  const raw = await kv.get(key(guildId, challengerId))
  if (!raw) return null
  return JSON.parse(raw)
}

/**
 * Update an existing janken session (preserves TTL if KV supports it — here we re-put with TTL).
 */
export async function updateSession(kv, guildId, challengerId, session) {
  await kv.put(key(guildId, challengerId), JSON.stringify(session), { expirationTtl: TTL_SECONDS })
}

/**
 * Delete a janken session.
 */
export async function deleteSession(kv, guildId, challengerId) {
  await kv.delete(key(guildId, challengerId))
}
