import { describe, test, expect } from '@jest/globals'

import { RelayObject } from '../src/relay/RelayObject.js'

function createMockState() {
  const db = new Map()
  return {
    storage: {
      sql: {
        exec(query, ...bindings) {
          if (query.includes('CREATE TABLE')) return
          if (query.includes('SELECT')) {
            const guildId = bindings[0]
            const row = db.get(guildId)
            const items = row ? [row] : []
            return { [Symbol.iterator]: () => items[Symbol.iterator]() }
          }
          if (query.includes('INSERT OR REPLACE')) {
            db.set(bindings[0], { guild_id: bindings[0], data: bindings[1] })
            return
          }
          if (query.includes('DELETE')) {
            db.delete(bindings[0])
            return
          }
        },
      },
    },
  }
}

describe('RelayObject', () => {
  test('GET returns null when no data', async () => {
    const obj = new RelayObject(createMockState(), {})
    const res = await obj.fetch(new Request('https://do/'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toBeNull()
  })

  test('PUT saves data and GET retrieves it', async () => {
    const obj = new RelayObject(createMockState(), {})
    const relayData = { topic: 'テスト', sentences: [{ text: '一文目', userId: 'u1', displayName: 'A' }] }

    const putRes = await obj.fetch(new Request('https://do/', {
      method: 'PUT',
      body: JSON.stringify(relayData),
    }))
    expect(putRes.status).toBe(200)

    const getRes = await obj.fetch(new Request('https://do/'))
    const body = await getRes.json()
    expect(body).toEqual(relayData)
  })

  test('DELETE removes data', async () => {
    const obj = new RelayObject(createMockState(), {})
    const relayData = { topic: 'テスト', sentences: [] }
    await obj.fetch(new Request('https://do/', {
      method: 'PUT',
      body: JSON.stringify(relayData),
    }))

    const delRes = await obj.fetch(new Request('https://do/', { method: 'DELETE' }))
    expect(delRes.status).toBe(200)

    const getRes = await obj.fetch(new Request('https://do/'))
    const body = await getRes.json()
    expect(body).toBeNull()
  })

  test('returns 405 for unsupported methods', async () => {
    const obj = new RelayObject(createMockState(), {})
    const res = await obj.fetch(new Request('https://do/', { method: 'PATCH' }))
    expect(res.status).toBe(405)
  })
})
