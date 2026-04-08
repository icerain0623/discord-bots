import { describe, test, expect, beforeEach } from '@jest/globals'

import { EconomyObject } from '../src/economy/EconomyObject.js'

// ---------------------------------------------------------------------------
// Mock SQLite state
// ---------------------------------------------------------------------------

function createMockState() {
  const members = new Map()     // user_id -> { user_id, joined_at, active, leave_requested }
  const balances = new Map()    // user_id -> { user_id, amount }
  const transactions = []       // array of tx rows
  const dailyClaims = new Map() // user_id -> { user_id, last_claimed }
  let txIdSeq = 0

  const sql = {
    exec(query, ...bindings) {
      if (query.includes('CREATE TABLE')) return makeIter([])

      // -----------------------------------------------------------------------
      // members
      // -----------------------------------------------------------------------
      if (query.includes('FROM members WHERE user_id')) {
        const userId = bindings[0]
        const row = members.get(userId)
        return makeIter(row ? [row] : [])
      }
      if (query.includes('FROM members WHERE active = 1')) {
        const rows = [...members.values()].filter(r => r.active === 1)
        return makeIter(rows)
      }
      if (query.includes('FROM members WHERE leave_requested = 1')) {
        const rows = [...members.values()].filter(r => r.leave_requested === 1)
        return makeIter(rows)
      }
      if (query.includes('INSERT INTO members') || query.includes('INSERT OR REPLACE INTO members')) {
        members.set(bindings[0], {
          user_id: bindings[0],
          joined_at: bindings[1],
          active: bindings[2],
          leave_requested: bindings[3],
        })
        return makeIter([])
      }
      if (query.includes('UPDATE members SET leave_requested = 1')) {
        const row = members.get(bindings[0])
        if (row) row.leave_requested = 1
        return makeIter([])
      }
      if (query.includes('UPDATE members SET active = 0')) {
        const row = members.get(bindings[0])
        if (row) { row.active = 0; row.leave_requested = 0 }
        return makeIter([])
      }
      if (query.includes('UPDATE members SET leave_requested = 0')) {
        const row = members.get(bindings[0])
        if (row) row.leave_requested = 0
        return makeIter([])
      }
      if (query.includes('UPDATE members SET active = 1')) {
        const row = members.get(bindings[0])
        if (row) { row.active = 1; row.leave_requested = 0 }
        return makeIter([])
      }

      // -----------------------------------------------------------------------
      // balances
      // -----------------------------------------------------------------------
      if (query.includes('FROM balances WHERE user_id')) {
        const userId = bindings[0]
        const row = balances.get(userId)
        return makeIter(row ? [row] : [])
      }
      if (query.includes('FROM balances ORDER BY amount DESC')) {
        const rows = [...balances.values()]
          .sort((a, b) => b.amount - a.amount)
          .slice(0, 20)
        return makeIter(rows)
      }
      if (query.includes('INSERT OR REPLACE INTO balances')) {
        balances.set(bindings[0], { user_id: bindings[0], amount: bindings[1] })
        return makeIter([])
      }
      if (query.includes('UPDATE balances SET amount = amount -') && query.includes('WHERE user_id = ?')) {
        const row = balances.get(bindings[1])
        if (row) row.amount -= bindings[0]
        return makeIter([])
      }
      if (query.includes('UPDATE balances SET amount = amount +') && query.includes('WHERE user_id = ?')) {
        const row = balances.get(bindings[1])
        if (row) row.amount += bindings[0]
        return makeIter([])
      }

      // -----------------------------------------------------------------------
      // transactions
      // -----------------------------------------------------------------------
      if (query.includes('INSERT INTO transactions')) {
        txIdSeq++
        transactions.push({
          id: txIdSeq,
          from_user: bindings[0],
          to_user: bindings[1],
          amount: bindings[2],
          type: bindings[3],
          created_at: bindings[4],
        })
        return makeIter([])
      }
      if (query.includes('FROM transactions WHERE')) {
        const userId = bindings[0]
        const rows = transactions
          .filter(r => r.from_user === userId || r.to_user === userId)
          .sort((a, b) => b.id - a.id)
          .slice(0, 20)
        return makeIter(rows)
      }

      // -----------------------------------------------------------------------
      // daily_claims
      // -----------------------------------------------------------------------
      if (query.includes('FROM daily_claims WHERE user_id')) {
        const row = dailyClaims.get(bindings[0])
        return makeIter(row ? [row] : [])
      }
      if (query.includes('INSERT OR REPLACE INTO daily_claims')) {
        dailyClaims.set(bindings[0], { user_id: bindings[0], last_claimed: bindings[1] })
        return makeIter([])
      }

      return makeIter([])
    },
  }

  return { storage: { sql } }
}

function makeIter(arr) {
  return { [Symbol.iterator]: () => arr[Symbol.iterator]() }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function req(method, path, body) {
  return new Request('https://do' + path, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: body ? { 'Content-Type': 'application/json' } : {},
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EconomyObject', () => {
  let obj

  beforeEach(() => {
    obj = new EconomyObject(createMockState(), {})
  })

  // -------------------------------------------------------------------------
  // Members
  // -------------------------------------------------------------------------

  describe('POST /members/join', () => {
    test('registers a new member with initial balance', async () => {
      const res = await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.balance).toBe(100)
      expect(body.isNew).toBe(true)
    })

    test('returns error for already-active member', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))

      const res = await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.error).toBe('既に参加しています。')
    })

    test('reactivates an inactive member without re-granting bonus when balance > 0', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/members/leave-request', { userId: 'u1' }))
      await obj.fetch(req('POST', '/members/approve-leave', { userId: 'u1', confiscate: false }))

      const res = await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.isNew).toBe(false)
    })

    test('returns 400 if userId is missing', async () => {
      const res = await obj.fetch(req('POST', '/members/join', {}))
      expect(res.status).toBe(400)
    })
  })

  describe('GET /members/get/:userId', () => {
    test('returns member data for existing member', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(req('GET', '/members/get/u1'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.user_id).toBe('u1')
      expect(body.active).toBe(1)
    })

    test('returns null for nonexistent member', async () => {
      const res = await obj.fetch(req('GET', '/members/get/nobody'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toBeNull()
    })
  })

  describe('POST /members/leave-request', () => {
    test('sets leave_requested flag', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(req('POST', '/members/leave-request', { userId: 'u1' }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
    })

    test('returns 404 if member not found', async () => {
      const res = await obj.fetch(req('POST', '/members/leave-request', { userId: 'nobody' }))
      expect(res.status).toBe(404)
    })

    test('returns error if leave already requested', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/members/leave-request', { userId: 'u1' }))
      const res = await obj.fetch(req('POST', '/members/leave-request', { userId: 'u1' }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.error).toBe('離脱申請は既に送信されています。')
    })
  })

  describe('POST /members/approve-leave', () => {
    test('deactivates member without confiscation', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/members/leave-request', { userId: 'u1' }))

      const res = await obj.fetch(req('POST', '/members/approve-leave', { userId: 'u1', confiscate: false }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
    })

    test('deactivates member with confiscation (balance zeroed)', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/members/leave-request', { userId: 'u1' }))

      await obj.fetch(req('POST', '/members/approve-leave', { userId: 'u1', confiscate: true }))

      const balRes = await obj.fetch(req('GET', '/bank/balance/u1'))
      const bal = await balRes.json()
      expect(bal.amount).toBe(0)
    })

    test('returns 404 if member not found', async () => {
      const res = await obj.fetch(req('POST', '/members/approve-leave', { userId: 'nobody', confiscate: false }))
      expect(res.status).toBe(404)
    })

    test('returns error if leave not requested', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(req('POST', '/members/approve-leave', { userId: 'u1', confiscate: false }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.error).toBe('離脱申請が見つかりません。')
    })
  })

  describe('POST /members/reject-leave', () => {
    test('clears leave_requested flag', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/members/leave-request', { userId: 'u1' }))

      const res = await obj.fetch(req('POST', '/members/reject-leave', { userId: 'u1' }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
    })

    test('returns 404 if member not found', async () => {
      const res = await obj.fetch(req('POST', '/members/reject-leave', { userId: 'nobody' }))
      expect(res.status).toBe(404)
    })

    test('returns error if leave not requested', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(req('POST', '/members/reject-leave', { userId: 'u1' }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.error).toBe('離脱申請が見つかりません。')
    })
  })

  describe('GET /members/status', () => {
    test('lists active members and pending leaves', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/members/join', { userId: 'u2' }))
      await obj.fetch(req('POST', '/members/leave-request', { userId: 'u2' }))

      const res = await obj.fetch(req('GET', '/members/status'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.active).toHaveLength(2)
      expect(body.pendingLeaves).toHaveLength(1)
      expect(body.pendingLeaves[0].user_id).toBe('u2')
    })
  })

  // -------------------------------------------------------------------------
  // Bank - balance
  // -------------------------------------------------------------------------

  describe('GET /bank/balance/:userId', () => {
    test('returns balance for existing member', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(req('GET', '/bank/balance/u1'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.amount).toBe(100)
    })

    test('returns 404 for unknown user', async () => {
      const res = await obj.fetch(req('GET', '/bank/balance/nobody'))
      expect(res.status).toBe(404)
    })
  })

  // -------------------------------------------------------------------------
  // Bank - send
  // -------------------------------------------------------------------------

  describe('POST /bank/send', () => {
    test('transfers coins between users atomically', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/members/join', { userId: 'u2' }))

      const res = await obj.fetch(req('POST', '/bank/send', { fromUserId: 'u1', toUserId: 'u2', amount: 40 }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.fromBalance).toBe(60)
      expect(body.toBalance).toBe(140)

      const b1 = await (await obj.fetch(req('GET', '/bank/balance/u1'))).json()
      const b2 = await (await obj.fetch(req('GET', '/bank/balance/u2'))).json()
      expect(b1.amount).toBe(60)
      expect(b2.amount).toBe(140)
    })

    test('returns 400 if insufficient funds', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/members/join', { userId: 'u2' }))

      const res = await obj.fetch(req('POST', '/bank/send', { fromUserId: 'u1', toUserId: 'u2', amount: 500 }))
      expect(res.status).toBe(400)
    })

    test('returns 400 if amount <= 0', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/members/join', { userId: 'u2' }))
      const res = await obj.fetch(req('POST', '/bank/send', { fromUserId: 'u1', toUserId: 'u2', amount: 0 }))
      expect(res.status).toBe(400)
    })

    test('returns 404 if sender not found', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u2' }))
      const res = await obj.fetch(req('POST', '/bank/send', { fromUserId: 'nobody', toUserId: 'u2', amount: 10 }))
      expect(res.status).toBe(404)
    })

    test('returns 404 if recipient not found', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(req('POST', '/bank/send', { fromUserId: 'u1', toUserId: 'nonexistent', amount: 10 }))
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error).toBe('送金先が見つかりません。')

      // Verify sender's balance was not deducted
      const senderBal = await (await obj.fetch(req('GET', '/bank/balance/u1'))).json()
      expect(senderBal.amount).toBe(100)
    })
  })

  // -------------------------------------------------------------------------
  // Bank - history
  // -------------------------------------------------------------------------

  describe('GET /bank/history/:userId', () => {
    test('returns last 20 transactions for user', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/members/join', { userId: 'u2' }))
      await obj.fetch(req('POST', '/bank/send', { fromUserId: 'u1', toUserId: 'u2', amount: 10 }))

      const res = await obj.fetch(req('GET', '/bank/history/u1'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThan(0)
    })
  })

  // -------------------------------------------------------------------------
  // Bank - ranking
  // -------------------------------------------------------------------------

  describe('GET /bank/ranking', () => {
    test('returns top members sorted by balance descending', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/members/join', { userId: 'u2' }))
      await obj.fetch(req('POST', '/bank/grant', { userId: 'u2', amount: 200, adminId: 'admin' }))

      const res = await obj.fetch(req('GET', '/bank/ranking'))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body[0].user_id).toBe('u2')
      expect(body[0].amount).toBe(300)
    })
  })

  // -------------------------------------------------------------------------
  // Bank - daily
  // -------------------------------------------------------------------------

  describe('POST /bank/daily', () => {
    test('grants daily bonus on first claim', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(req('POST', '/bank/daily', { userId: 'u1' }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.balance).toBe(150)

      const bal = await (await obj.fetch(req('GET', '/bank/balance/u1'))).json()
      expect(bal.amount).toBe(150)
    })

    test('returns 429 if already claimed today', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/bank/daily', { userId: 'u1' }))
      const res = await obj.fetch(req('POST', '/bank/daily', { userId: 'u1' }))
      expect(res.status).toBe(429)
    })

    test('returns 404 if member not found', async () => {
      const res = await obj.fetch(req('POST', '/bank/daily', { userId: 'nobody' }))
      expect(res.status).toBe(404)
    })
  })

  // -------------------------------------------------------------------------
  // Bank - grant / revoke
  // -------------------------------------------------------------------------

  describe('POST /bank/grant', () => {
    test('adds coins to member balance', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(req('POST', '/bank/grant', { userId: 'u1', amount: 500, adminId: 'admin' }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.balance).toBe(600)

      const bal = await (await obj.fetch(req('GET', '/bank/balance/u1'))).json()
      expect(bal.amount).toBe(600)
    })

    test('returns 404 if member not found', async () => {
      const res = await obj.fetch(req('POST', '/bank/grant', { userId: 'nobody', amount: 100, adminId: 'admin' }))
      expect(res.status).toBe(404)
    })
  })

  describe('POST /bank/revoke', () => {
    test('removes coins from member balance (floor at 0)', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(req('POST', '/bank/revoke', { userId: 'u1', amount: 50, adminId: 'admin' }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.balance).toBe(50)

      const bal = await (await obj.fetch(req('GET', '/bank/balance/u1'))).json()
      expect(bal.amount).toBe(50)
    })

    test('floors balance at 0 when amount exceeds balance', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/bank/revoke', { userId: 'u1', amount: 9999, adminId: 'admin' }))

      const bal = await (await obj.fetch(req('GET', '/bank/balance/u1'))).json()
      expect(bal.amount).toBe(0)
    })

    test('returns 404 if member not found', async () => {
      const res = await obj.fetch(req('POST', '/bank/revoke', { userId: 'nobody', amount: 100, adminId: 'admin' }))
      expect(res.status).toBe(404)
    })
  })

  // -------------------------------------------------------------------------
  // Slot machine
  // -------------------------------------------------------------------------

  describe('POST /slot/play', () => {
    test('returns spin result with reels and payout', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/bank/grant', { userId: 'u1', amount: 900, adminId: 'admin' }))

      const res = await obj.fetch(req('POST', '/slot/play', { userId: 'u1', bet: 10 }))
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.ok).toBe(true)
      expect(body.reels).toHaveLength(3)
      expect(typeof body.multiplier).toBe('number')
      expect(typeof body.payout).toBe('number')
      expect(typeof body.balance).toBe('number')
      expect(body.bet).toBeUndefined()
    })

    test('returns 400 if bet below minimum', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(req('POST', '/slot/play', { userId: 'u1', bet: 5 }))
      expect(res.status).toBe(400)
    })

    test('returns 400 if bet exceeds maximum (5000)', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/bank/grant', { userId: 'u1', amount: 99900, adminId: 'admin' }))
      const res = await obj.fetch(req('POST', '/slot/play', { userId: 'u1', bet: 6000 }))
      expect(res.status).toBe(400)
    })

    test('returns 400 if bet exceeds 50% of balance', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      // balance = 100, max allowed = 50
      const res = await obj.fetch(req('POST', '/slot/play', { userId: 'u1', bet: 51 }))
      expect(res.status).toBe(400)
    })

    test('returns 400 if insufficient funds', async () => {
      await obj.fetch(req('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(req('POST', '/bank/revoke', { userId: 'u1', amount: 100, adminId: 'admin' }))
      const res = await obj.fetch(req('POST', '/slot/play', { userId: 'u1', bet: 10 }))
      expect(res.status).toBe(400)
    })

    test('returns 404 if user not found', async () => {
      const res = await obj.fetch(req('POST', '/slot/play', { userId: 'nobody', bet: 10 }))
      expect(res.status).toBe(404)
    })
  })

  // -------------------------------------------------------------------------
  // Unknown routes
  // -------------------------------------------------------------------------

  describe('Unknown routes', () => {
    test('returns 404 for unknown path', async () => {
      const res = await obj.fetch(req('GET', '/nonexistent'))
      expect(res.status).toBe(404)
    })
  })
})
