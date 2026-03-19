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
