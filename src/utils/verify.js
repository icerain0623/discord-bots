function hexToBytes(hex) {
  if (hex.length % 2 !== 0) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16)
    if (isNaN(byte)) return null
    bytes[i / 2] = byte
  }
  return bytes
}

export async function verifyDiscordRequest(request, body, publicKey) {
  const signature = request.headers.get('X-Signature-Ed25519')
  const timestamp = request.headers.get('X-Signature-Timestamp')
  if (!signature || !timestamp) return false

  const sigBytes = hexToBytes(signature)
  const keyBytes = hexToBytes(publicKey)
  if (!sigBytes || !keyBytes) return false

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
    const encoder = new TextEncoder()
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      sigBytes,
      encoder.encode(timestamp + body),
    )
  } catch {
    return false
  }
}
