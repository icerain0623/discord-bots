const UNICODE_EMOJI_RE = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu

export function extractEmojisFromText(text) {
  const counts = {}
  if (!text) return counts
  const matches = text.match(UNICODE_EMOJI_RE)
  if (!matches) return counts
  for (const emoji of matches) {
    counts[emoji] = (counts[emoji] || 0) + 1
  }
  return counts
}
