const UNICODE_EMOJI_RE = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu
const CUSTOM_EMOJI_RE = /<a?:\w+:\d+>/g

export function extractEmojisFromText(text) {
  const counts = {}
  if (!text) return counts
  const customMatches = text.match(CUSTOM_EMOJI_RE)
  if (customMatches) {
    for (const emoji of customMatches) {
      counts[emoji] = (counts[emoji] || 0) + 1
    }
  }
  const textWithoutCustom = text.replace(CUSTOM_EMOJI_RE, '')
  const unicodeMatches = textWithoutCustom.match(UNICODE_EMOJI_RE)
  if (unicodeMatches) {
    for (const emoji of unicodeMatches) {
      counts[emoji] = (counts[emoji] || 0) + 1
    }
  }
  return counts
}

export function countReactions(reactions) {
  const counts = {}
  if (!reactions || reactions.length === 0) return counts
  for (const r of reactions) {
    const emoji = r.emoji
    let key
    if (emoji.id) {
      const prefix = emoji.animated ? '<a:' : '<:'
      key = `${prefix}${emoji.name}:${emoji.id}>`
    } else {
      key = emoji.name
    }
    counts[key] = (counts[key] || 0) + r.count
  }
  return counts
}

function mergeCounts(target, source) {
  for (const [key, count] of Object.entries(source)) {
    target[key] = (target[key] || 0) + count
  }
}

export function countEmojis(messages) {
  const total = {}
  for (const msg of messages) {
    if (msg.author?.bot) continue
    mergeCounts(total, extractEmojisFromText(msg.content))
    mergeCounts(total, countReactions(msg.reactions))
  }
  return total
}
