const API_BASE = 'https://discord.com/api/v10'
const MAX_CHANNELS = 45
const MAX_PAGES_PER_CHANNEL = 3
const BATCH_SIZE = 5

async function discordFetch(path, token, options = {}) {
  const { headers: extraHeaders, ...restOptions } = options
  const headers = { 'Content-Type': 'application/json', ...extraHeaders }
  if (token) headers.Authorization = `Bot ${token}`

  let res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...restOptions,
  })

  // 429 retry
  if (res.status === 429) {
    const retryAfter = parseFloat(res.headers.get('retry-after') || '5')
    await new Promise(r => setTimeout(r, retryAfter * 1000))
    res = await fetch(`${API_BASE}${path}`, { headers, ...restOptions })
  }

  // Rate limit preemptive wait
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

export async function getAllMessagesSince(channelId, token, afterId) {
  const allMessages = []
  let after = afterId || null

  for (;;) {
    const params = new URLSearchParams({ limit: '100' })
    if (after) params.set('after', after)

    const res = await discordFetch(`/channels/${channelId}/messages?${params}`, token)
    if (!res.ok) return allMessages

    const messages = await res.json()
    if (messages.length === 0) break

    // Ensure chronological order for consistent `after` pagination
    messages.sort((a, b) => a.id.localeCompare(b.id))
    allMessages.push(...messages)
    after = messages[messages.length - 1].id
    if (messages.length < 100) break
  }

  return allMessages
}

export async function fetchAllChannelMessages(channels, token) {
  const limited = channels.slice(0, MAX_CHANNELS)
  const allMessages = []
  for (let i = 0; i < limited.length; i += BATCH_SIZE) {
    const batch = limited.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(ch => getAllMessages(ch.id, token))
    )
    for (const messages of results) {
      allMessages.push(...messages)
    }
  }
  return allMessages
}

export async function getForumChannels(guildId, token) {
  const res = await discordFetch(`/guilds/${guildId}/channels`, token)
  if (!res.ok) return []
  const channels = await res.json()
  return channels.filter(ch => ch.type === 15)
}

export async function getForumThreads(guildId, forumChannels, token) {
  const forumIds = new Set(forumChannels.map(ch => ch.id))
  const threads = []

  // Active threads (1 API call for entire guild)
  const activeRes = await discordFetch(`/guilds/${guildId}/threads/active`, token)
  if (activeRes.ok) {
    const data = await activeRes.json()
    for (const thread of data.threads) {
      if (forumIds.has(thread.parent_id)) {
        threads.push(thread)
      }
    }
  }

  // Archived threads per forum channel
  const activeIds = new Set(threads.map(t => t.id))
  for (const forum of forumChannels) {
    const res = await discordFetch(
      `/channels/${forum.id}/threads/archived/public?limit=100`,
      token
    )
    if (!res.ok) continue
    const data = await res.json()
    for (const thread of data.threads) {
      if (activeIds.has(thread.id)) continue
      threads.push(thread)
    }
  }

  return threads
}

export async function createChannel(guildId, token, payload) {
  const res = await discordFetch(`/guilds/${guildId}/channels`, token, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`createChannel failed (${res.status}):`, text)
    return null
  }
  return res.json()
}

export async function deleteChannel(channelId, token) {
  const res = await discordFetch(`/channels/${channelId}`, token, {
    method: 'DELETE',
  })
  if (!res.ok) {
    console.error(`deleteChannel failed (${res.status}):`, await res.text())
  }
}

export async function createCategory(guildId, token, name) {
  return createChannel(guildId, token, { name, type: 4 })
}

export async function postMessage(channelId, token, payload) {
  const body = typeof payload === 'string' ? { content: payload } : payload
  const res = await discordFetch(`/channels/${channelId}/messages`, token, {
    method: 'POST',
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errorText = await res.text()
    console.error(`postMessage failed (${res.status}):`, errorText)
    res._errorText = errorText
  }
  return res
}

export async function editMessage(channelId, messageId, token, data) {
  const res = await discordFetch(`/channels/${channelId}/messages/${messageId}`, token, {
    method: 'PATCH',
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const errorText = await res.text()
    console.error(`editMessage failed (${res.status}):`, errorText)
    res._errorText = errorText
  }
  return res
}

export async function sendFollowupMessage(applicationId, interactionToken, payload) {
  const res = await discordFetch(`/webhooks/${applicationId}/${interactionToken}`, null, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const text = await res.text()
    console.error(`sendFollowupMessage failed (${res.status}):`, text)
  }
}

export async function getGuildRoles(guildId, token) {
  const res = await discordFetch(`/guilds/${guildId}/roles`, token)
  if (!res.ok) return []
  return res.json()
}

export async function getGuildMembers(guildId, token) {
  const allMembers = []
  let after = '0'

  for (;;) {
    const params = new URLSearchParams({ limit: '1000', after })
    const res = await discordFetch(`/guilds/${guildId}/members?${params}`, token)
    if (!res.ok) return allMembers

    const members = await res.json()
    if (members.length === 0) break

    allMembers.push(...members)
    after = members[members.length - 1].user.id
    if (members.length < 1000) break
  }

  return allMembers
}

export async function deleteMessage(channelId, messageId, token) {
  const res = await discordFetch(`/channels/${channelId}/messages/${messageId}`, token, {
    method: 'DELETE',
  })
  if (!res.ok) {
    console.error(`deleteMessage failed (${res.status}):`, await res.text())
  }
  return res
}

export async function addMemberRole(guildId, userId, roleId, token) {
  const res = await discordFetch(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, token, {
    method: 'PUT',
  })
  if (!res.ok) {
    console.error(`addMemberRole failed (${res.status}):`, await res.text())
  }
  return res
}

export async function removeMemberRole(guildId, userId, roleId, token) {
  const res = await discordFetch(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, token, {
    method: 'DELETE',
  })
  if (!res.ok) {
    console.error(`removeMemberRole failed (${res.status}):`, await res.text())
  }
  return res
}
