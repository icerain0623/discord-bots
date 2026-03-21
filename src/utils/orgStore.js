export async function getOrgConfig(kv, guildId) {
  const raw = await kv.get(`org:config:${guildId}`)
  return raw ? JSON.parse(raw) : null
}

export async function setOrgConfig(kv, guildId, config) {
  await kv.put(`org:config:${guildId}`, JSON.stringify(config))
}

export async function getOrgPanel(kv, guildId) {
  const raw = await kv.get(`org:panel:${guildId}`)
  return raw ? JSON.parse(raw) : null
}

export async function setOrgPanel(kv, guildId, channelId, messageId) {
  await kv.put(`org:panel:${guildId}`, JSON.stringify({ channelId, messageId }))
}

export async function deleteOrgPanel(kv, guildId) {
  await kv.delete(`org:panel:${guildId}`)
}
