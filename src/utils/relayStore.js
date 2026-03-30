function getStub(doNamespace, guildId) {
  const id = doNamespace.idFromName(guildId)
  return doNamespace.get(id)
}

export async function getRelay(doNamespace, guildId) {
  const stub = getStub(doNamespace, guildId)
  const res = await stub.fetch(new Request('https://relay-do/', { method: 'GET' }))
  return res.json()
}

export async function saveRelay(doNamespace, guildId, data) {
  const stub = getStub(doNamespace, guildId)
  await stub.fetch(new Request('https://relay-do/', {
    method: 'PUT',
    body: JSON.stringify(data),
    headers: { 'Content-Type': 'application/json' },
  }))
}

export async function deleteRelay(doNamespace, guildId) {
  const stub = getStub(doNamespace, guildId)
  await stub.fetch(new Request('https://relay-do/', { method: 'DELETE' }))
}
