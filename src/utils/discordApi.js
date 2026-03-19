const API_BASE = 'https://discord.com/api/v10'
const MAX_PAGES_PER_CHANNEL = 10
const BATCH_SIZE = 5

async function discordFetch(path, token, options = {}) {
  const { headers: extraHeaders, ...restOptions } = options
  const headers = { 'Content-Type': 'application/json', ...extraHeaders }
  if (token) headers.Authorization = `Bot ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...restOptions,
  })

  // Rate limit handling
  const remaining = res.headers.get('x-ratelimit-remaining')
  if (remaining === '0') {
    const retryAfter = parseFloat(res.headers.get('x-ratelimit-reset-after') || '1')
    await new Promise(r => setTimeout(r, retryAfter * 1000))
  }

  return res
}

export async function getTextChannels(guildId, token) {
  const res = await discordFetch(`/guilds/${guildId}/channels`, token)
  if (!res.ok) return []
  const channels = await res.json()
  return channels.filter(ch => ch.type === 0)
}

export async function getAllMessages(channelId, token) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const allMessages = []
  let before = null

  for (let page = 0; page < MAX_PAGES_PER_CHANNEL; page++) {
    const params = new URLSearchParams({ limit: '100' })
    if (before) params.set('before', before)

    const res = await discordFetch(`/channels/${channelId}/messages?${params}`, token)
    if (!res.ok) return allMessages

    const messages = await res.json()
    if (messages.length === 0) break

    for (const msg of messages) {
      if (new Date(msg.timestamp).getTime() < sevenDaysAgo) {
        return allMessages
      }
      allMessages.push(msg)
    }

    before = messages[messages.length - 1].id
    if (messages.length < 100) break
  }

  return allMessages
}

export async function fetchAllChannelMessages(channels, token) {
  const allMessages = []
  for (let i = 0; i < channels.length; i += BATCH_SIZE) {
    const batch = channels.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(ch => getAllMessages(ch.id, token))
    )
    for (const messages of results) {
      allMessages.push(...messages)
    }
  }
  return allMessages
}

export async function sendFollowup(applicationId, interactionToken, embed) {
  await discordFetch(`/webhooks/${applicationId}/${interactionToken}`, null, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  })
}
