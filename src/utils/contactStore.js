const TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days

export async function createContact(kv, reportId, userId, body) {
  const now = new Date().toISOString()
  const data = {
    userId,
    messages: [{ from: 'sender', body, timestamp: now }],
    createdAt: now,
    updatedAt: now,
  }
  await kv.put(`contact_${reportId}`, JSON.stringify(data), {
    expirationTtl: TTL_SECONDS,
  })
  return data
}

export async function getContact(kv, reportId) {
  const raw = await kv.get(`contact_${reportId}`)
  if (!raw) return null
  return JSON.parse(raw)
}

export async function setThreadId(kv, reportId, threadId) {
  const contact = await getContact(kv, reportId)
  if (!contact) return null
  contact.threadId = threadId
  await kv.put(`contact_${reportId}`, JSON.stringify(contact), {
    expirationTtl: TTL_SECONDS,
  })
  return contact
}

export async function addMessage(kv, reportId, from, body) {
  const contact = await getContact(kv, reportId)
  if (!contact) return null
  contact.messages.push({ from, body, timestamp: new Date().toISOString() })
  contact.updatedAt = new Date().toISOString()
  await kv.put(`contact_${reportId}`, JSON.stringify(contact), {
    expirationTtl: TTL_SECONDS,
  })
  return contact
}
