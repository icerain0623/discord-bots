const TTL_SECONDS = 30 * 60 // 30分

export async function create(kv, userId) {
  await kv.put(userId, JSON.stringify({ step: 1, data: {} }), {
    expirationTtl: TTL_SECONDS,
  })
}

export async function get(kv, userId) {
  const raw = await kv.get(userId)
  if (!raw) return null
  return JSON.parse(raw)
}

export async function update(kv, userId, newData) {
  const session = await get(kv, userId)
  if (!session) return
  session.data = { ...session.data, ...newData }
  await kv.put(userId, JSON.stringify(session), { expirationTtl: TTL_SECONDS })
}

export async function setStep(kv, userId, step) {
  const session = await get(kv, userId)
  if (!session) return
  session.step = step
  await kv.put(userId, JSON.stringify(session), { expirationTtl: TTL_SECONDS })
}

export async function remove(kv, userId) {
  await kv.delete(userId)
}
