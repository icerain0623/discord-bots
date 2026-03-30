function relayKey(guildId) { return `relay-active:${guildId}` }

function getStub(doNamespace, guildId) {
  const id = doNamespace.idFromName(guildId)
  return doNamespace.get(id)
}

export async function getRelay(doNamespace, guildId, kvFallback) {
  const stub = getStub(doNamespace, guildId)
  const res = await stub.fetch(new Request('https://relay-do/', { method: 'GET' }))
  const data = await res.json()

  if (data !== null) return data

  // DO にデータがない場合、KV からフォールバック読み取り
  if (kvFallback) {
    const raw = await kvFallback.get(relayKey(guildId), 'text')
    if (raw) {
      const kvData = JSON.parse(raw)
      await saveRelay(doNamespace, guildId, kvData)
      await kvFallback.delete(relayKey(guildId))
      return kvData
    }
  }

  return null
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
