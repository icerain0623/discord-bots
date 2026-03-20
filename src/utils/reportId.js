const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function generateReportId() {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => CHARS[b % CHARS.length]).join('')
}
