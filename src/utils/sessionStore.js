const TTL_MS = 30 * 60 * 1000 // 30分
const store = new Map()

export function create(userId) {
  store.set(userId, {
    step: 1,
    data: {},
    expiresAt: Date.now() + TTL_MS,
  })
}

export function get(userId) {
  const session = store.get(userId)
  if (!session) return null
  if (isExpired(userId)) {
    store.delete(userId)
    return null
  }
  return session
}

export function update(userId, newData) {
  const session = get(userId)
  if (!session) return
  session.data = { ...session.data, ...newData }
  session.expiresAt = Date.now() + TTL_MS // TTL リセット
}

export function setStep(userId, step) {
  const session = get(userId)
  if (!session) return
  session.step = step
  session.expiresAt = Date.now() + TTL_MS
}

export function remove(userId) {
  store.delete(userId)
}

export function clear() {
  store.clear()
}

export function isExpired(userId) {
  const session = store.get(userId)
  if (!session) return true
  return Date.now() > session.expiresAt
}
