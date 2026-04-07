# 肩書コイン経済システム Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-server currency ("肩書コイン") system with member management, banking, and slot machine gambling to the existing Discord bot.

**Architecture:** Single Durable Object (`EconomyObject`) per guild with SQLite tables for members, balances, transactions, and daily claims. Commands split across `/economy`, `/bank`, and `/slot`. Button interactions for leave approval flow.

**Tech Stack:** Cloudflare Workers, Durable Objects (SQLite), discord.js v14 (command registration), Jest (testing)

**Spec:** `docs/superpowers/specs/2026-04-08-economy-system-design.md`

---

### Task 1: EconomyObject Durable Object

**Files:**
- Create: `src/economy/EconomyObject.js`
- Test: `tests/economyObject.test.js`

This is the core data layer. It handles all SQL operations via HTTP API.

- [ ] **Step 1: Write tests for EconomyObject**

Create `tests/economyObject.test.js`:

```javascript
import { EconomyObject } from '../src/economy/EconomyObject.js'

function createEconomyObject() {
  const members = new Map()
  const balances = new Map()
  const transactions = []
  const dailyClaims = new Map()
  let txId = 0

  const ctx = {
    storage: {
      sql: {
        exec(query, ...bindings) {
          if (query.includes('CREATE TABLE')) return

          // members
          if (query.includes('INSERT INTO members')) {
            const [userId, joinedAt, active] = bindings
            members.set(userId, { user_id: userId, joined_at: joinedAt, active, leave_requested: 0 })
            return
          }
          if (query.includes('UPDATE members SET active')) {
            const [active, leaveRequested, userId] = bindings
            const m = members.get(userId)
            if (m) { m.active = active; m.leave_requested = leaveRequested }
            return
          }
          if (query.includes('UPDATE members SET leave_requested')) {
            const [val, userId] = bindings
            const m = members.get(userId)
            if (m) m.leave_requested = val
            return
          }
          if (query.includes('SELECT * FROM members WHERE user_id')) {
            const row = members.get(bindings[0])
            return row ? [row] : []
          }
          if (query.includes('SELECT * FROM members WHERE active')) {
            return [...members.values()].filter(m => m.active === 1)
          }
          if (query.includes('SELECT * FROM members WHERE leave_requested')) {
            return [...members.values()].filter(m => m.leave_requested === 1)
          }

          // balances
          if (query.includes('INSERT INTO balances')) {
            balances.set(bindings[0], { user_id: bindings[0], amount: bindings[1] })
            return
          }
          if (query.includes('UPDATE balances SET amount =') && query.includes('- ?')) {
            const m = balances.get(bindings[1])
            if (m) m.amount -= bindings[0]
            return
          }
          if (query.includes('UPDATE balances SET amount =') && query.includes('+ ?')) {
            const m = balances.get(bindings[1])
            if (m) m.amount += bindings[0]
            return
          }
          if (query.includes('UPDATE balances SET amount = 0')) {
            const m = balances.get(bindings[0])
            if (m) m.amount = 0
            return
          }
          if (query.includes('UPDATE balances SET amount = ?') && !query.includes('+') && !query.includes('-')) {
            balances.set(bindings[1], { user_id: bindings[1], amount: bindings[0] })
            return
          }
          if (query.includes('SELECT * FROM balances WHERE user_id')) {
            const row = balances.get(bindings[0])
            return row ? [row] : []
          }
          if (query.includes('SELECT * FROM balances ORDER BY amount DESC')) {
            return [...balances.values()].sort((a, b) => b.amount - a.amount)
          }

          // transactions
          if (query.includes('INSERT INTO transactions')) {
            txId++
            transactions.push({
              id: txId,
              from_user: bindings[0],
              to_user: bindings[1],
              amount: bindings[2],
              type: bindings[3],
              created_at: bindings[4],
            })
            return
          }
          if (query.includes('SELECT * FROM transactions WHERE')) {
            const userId = bindings[0]
            return transactions
              .filter(t => t.from_user === userId || t.to_user === userId)
              .reverse()
              .slice(0, 20)
          }

          // daily_claims
          if (query.includes('INSERT OR REPLACE INTO daily_claims')) {
            dailyClaims.set(bindings[0], { user_id: bindings[0], last_claimed: bindings[1] })
            return
          }
          if (query.includes('SELECT * FROM daily_claims WHERE user_id')) {
            const row = dailyClaims.get(bindings[0])
            return row ? [row] : []
          }
        },
      },
    },
  }

  return new EconomyObject(ctx, {})
}

function makeRequest(method, path, body) {
  const opts = { method }
  if (body) {
    opts.body = JSON.stringify(body)
    opts.headers = { 'Content-Type': 'application/json' }
  }
  return new Request(`https://economy-do${path}`, opts)
}

describe('EconomyObject', () => {
  describe('POST /members/join', () => {
    test('registers a new member with initial balance', async () => {
      const obj = createEconomyObject()
      const res = await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.balance).toBe(100)

      const balRes = await obj.fetch(makeRequest('GET', '/bank/balance/u1'))
      const bal = await balRes.json()
      expect(bal.amount).toBe(100)
    })

    test('rejects duplicate join', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      const data = await res.json()
      expect(data.error).toBeTruthy()
    })

    test('allows rejoin after leave (active=0)', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(makeRequest('POST', '/members/leave-request', { userId: 'u1' }))
      await obj.fetch(makeRequest('POST', '/members/approve-leave', { userId: 'u1', confiscate: false }))
      const res = await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      const data = await res.json()
      expect(data.ok).toBe(true)
    })
  })

  describe('POST /members/leave-request', () => {
    test('sets leave_requested flag', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(makeRequest('POST', '/members/leave-request', { userId: 'u1' }))
      const data = await res.json()
      expect(data.ok).toBe(true)
    })
  })

  describe('POST /members/approve-leave', () => {
    test('deactivates member without confiscation', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(makeRequest('POST', '/members/leave-request', { userId: 'u1' }))
      const res = await obj.fetch(makeRequest('POST', '/members/approve-leave', {
        userId: 'u1', confiscate: false,
      }))
      const data = await res.json()
      expect(data.ok).toBe(true)

      const balRes = await obj.fetch(makeRequest('GET', '/bank/balance/u1'))
      const bal = await balRes.json()
      expect(bal.amount).toBe(100)
    })

    test('deactivates member with confiscation', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(makeRequest('POST', '/members/approve-leave', {
        userId: 'u1', confiscate: true,
      }))
      const data = await res.json()
      expect(data.ok).toBe(true)

      const balRes = await obj.fetch(makeRequest('GET', '/bank/balance/u1'))
      const bal = await balRes.json()
      expect(bal.amount).toBe(0)
    })
  })

  describe('POST /bank/send', () => {
    test('transfers coins between members', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u2' }))
      const res = await obj.fetch(makeRequest('POST', '/bank/send', {
        fromUserId: 'u1', toUserId: 'u2', amount: 30,
      }))
      const data = await res.json()
      expect(data.ok).toBe(true)

      const b1 = await (await obj.fetch(makeRequest('GET', '/bank/balance/u1'))).json()
      const b2 = await (await obj.fetch(makeRequest('GET', '/bank/balance/u2'))).json()
      expect(b1.amount).toBe(70)
      expect(b2.amount).toBe(130)
    })

    test('rejects transfer with insufficient balance', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u2' }))
      const res = await obj.fetch(makeRequest('POST', '/bank/send', {
        fromUserId: 'u1', toUserId: 'u2', amount: 999,
      }))
      const data = await res.json()
      expect(data.error).toBeTruthy()
    })
  })

  describe('POST /bank/daily', () => {
    test('grants daily bonus', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(makeRequest('POST', '/bank/daily', { userId: 'u1' }))
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.balance).toBe(150)
    })

    test('rejects duplicate daily claim', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(makeRequest('POST', '/bank/daily', { userId: 'u1' }))
      const res = await obj.fetch(makeRequest('POST', '/bank/daily', { userId: 'u1' }))
      const data = await res.json()
      expect(data.error).toBeTruthy()
    })
  })

  describe('POST /bank/grant and /bank/revoke', () => {
    test('admin grant adds coins', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(makeRequest('POST', '/bank/grant', { userId: 'u1', amount: 500 }))
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.balance).toBe(600)
    })

    test('admin revoke removes coins', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(makeRequest('POST', '/bank/revoke', { userId: 'u1', amount: 50 }))
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.balance).toBe(50)
    })
  })

  describe('POST /slot/play', () => {
    test('deducts bet and returns reel result', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(makeRequest('POST', '/slot/play', { userId: 'u1', bet: 10 }))
      const data = await res.json()
      expect(data.ok).toBe(true)
      expect(data.reels).toHaveLength(3)
      expect(typeof data.multiplier).toBe('number')
      expect(typeof data.payout).toBe('number')
      expect(typeof data.balance).toBe('number')
    })

    test('rejects bet exceeding balance', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(makeRequest('POST', '/slot/play', { userId: 'u1', bet: 999 }))
      const data = await res.json()
      expect(data.error).toBeTruthy()
    })

    test('rejects bet below minimum', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(makeRequest('POST', '/slot/play', { userId: 'u1', bet: 5 }))
      const data = await res.json()
      expect(data.error).toBeTruthy()
    })

    test('rejects bet above maximum', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(makeRequest('POST', '/bank/grant', { userId: 'u1', amount: 99900 }))
      const res = await obj.fetch(makeRequest('POST', '/slot/play', { userId: 'u1', bet: 6000 }))
      const data = await res.json()
      expect(data.error).toBeTruthy()
    })
  })

  describe('GET /bank/ranking', () => {
    test('returns members sorted by balance', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u2' }))
      await obj.fetch(makeRequest('POST', '/bank/grant', { userId: 'u2', amount: 500 }))
      const res = await obj.fetch(makeRequest('GET', '/bank/ranking'))
      const data = await res.json()
      expect(data[0].user_id).toBe('u2')
      expect(data[1].user_id).toBe('u1')
    })
  })

  describe('GET /bank/history/:userId', () => {
    test('returns transaction history', async () => {
      const obj = createEconomyObject()
      await obj.fetch(makeRequest('POST', '/members/join', { userId: 'u1' }))
      const res = await obj.fetch(makeRequest('GET', '/bank/history/u1'))
      const data = await res.json()
      expect(data.length).toBeGreaterThan(0)
      expect(data[0].type).toBe('join_bonus')
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/economyObject.test.js`
Expected: FAIL with `Cannot find module '../src/economy/EconomyObject.js'`

- [ ] **Step 3: Implement EconomyObject**

Create `src/economy/EconomyObject.js`:

```javascript
const INITIAL_BALANCE = 100
const DAILY_BONUS = 50
const SLOT_MIN_BET = 10
const SLOT_MAX_BET = 5000

const SYMBOLS = [
  { emoji: '🍒', weight: 8 },
  { emoji: '🍋', weight: 7 },
  { emoji: '🍊', weight: 6 },
  { emoji: '🍇', weight: 5 },
  { emoji: '🔔', weight: 3 },
  { emoji: '7️⃣', weight: 2 },
  { emoji: '💎', weight: 1 },
]

const TOTAL_WEIGHT = SYMBOLS.reduce((sum, s) => sum + s.weight, 0)

const TRIPLE_MULTIPLIERS = {
  '💎': 50,
  '7️⃣': 20,
  '🔔': 10,
  '🍇': 5,
  '🍊': 4,
  '🍋': 3,
  '🍒': 2,
}

function spinReel() {
  let rand = Math.random() * TOTAL_WEIGHT
  for (const symbol of SYMBOLS) {
    rand -= symbol.weight
    if (rand <= 0) return symbol.emoji
  }
  return SYMBOLS[SYMBOLS.length - 1].emoji
}

function calculatePayout(reels, bet) {
  const [a, b, c] = reels
  if (a === b && b === c) {
    const multiplier = TRIPLE_MULTIPLIERS[a] || 2
    return { multiplier, payout: bet * multiplier }
  }
  if (a === b || b === c || a === c) {
    return { multiplier: 1, payout: bet }
  }
  return { multiplier: 0, payout: 0 }
}

function todayUTC() {
  return new Date().toISOString().slice(0, 10)
}

function nowISO() {
  return new Date().toISOString()
}

export class EconomyObject {
  constructor(ctx, _env) {
    this.sql = ctx.storage.sql
    this.sql.exec(`CREATE TABLE IF NOT EXISTS members (
      user_id TEXT PRIMARY KEY,
      joined_at TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      leave_requested INTEGER NOT NULL DEFAULT 0
    )`)
    this.sql.exec(`CREATE TABLE IF NOT EXISTS balances (
      user_id TEXT PRIMARY KEY,
      amount INTEGER NOT NULL DEFAULT 0
    )`)
    this.sql.exec(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_user TEXT,
      to_user TEXT,
      amount INTEGER NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`)
    this.sql.exec(`CREATE TABLE IF NOT EXISTS daily_claims (
      user_id TEXT PRIMARY KEY,
      last_claimed TEXT NOT NULL
    )`)
  }

  async fetch(request) {
    const url = new URL(request.url)
    const path = url.pathname
    const method = request.method

    try {
      // --- Members ---
      if (method === 'POST' && path === '/members/join') {
        const { userId } = await request.json()
        return Response.json(this.#memberJoin(userId))
      }
      if (method === 'POST' && path === '/members/leave-request') {
        const { userId } = await request.json()
        return Response.json(this.#memberLeaveRequest(userId))
      }
      if (method === 'POST' && path === '/members/approve-leave') {
        const { userId, confiscate } = await request.json()
        return Response.json(this.#memberApproveLeave(userId, confiscate))
      }
      if (method === 'POST' && path === '/members/reject-leave') {
        const { userId } = await request.json()
        return Response.json(this.#memberRejectLeave(userId))
      }
      if (method === 'GET' && path === '/members/status') {
        return Response.json(this.#memberStatus())
      }

      // --- Bank ---
      if (method === 'GET' && path.startsWith('/bank/balance/')) {
        const userId = path.split('/')[3]
        return Response.json(this.#bankBalance(userId))
      }
      if (method === 'POST' && path === '/bank/send') {
        const { fromUserId, toUserId, amount } = await request.json()
        return Response.json(this.#bankSend(fromUserId, toUserId, amount))
      }
      if (method === 'GET' && path.startsWith('/bank/history/')) {
        const userId = path.split('/')[3]
        return Response.json(this.#bankHistory(userId))
      }
      if (method === 'GET' && path === '/bank/ranking') {
        return Response.json(this.#bankRanking())
      }
      if (method === 'POST' && path === '/bank/daily') {
        const { userId } = await request.json()
        return Response.json(this.#bankDaily(userId))
      }
      if (method === 'POST' && path === '/bank/grant') {
        const { userId, amount } = await request.json()
        return Response.json(this.#bankGrant(userId, amount))
      }
      if (method === 'POST' && path === '/bank/revoke') {
        const { userId, amount } = await request.json()
        return Response.json(this.#bankRevoke(userId, amount))
      }

      // --- Slot ---
      if (method === 'POST' && path === '/slot/play') {
        const { userId, bet } = await request.json()
        return Response.json(this.#slotPlay(userId, bet))
      }

      return new Response('Not Found', { status: 404 })
    } catch (err) {
      console.error('EconomyObject error:', err)
      return Response.json({ error: err.message }, { status: 500 })
    }
  }

  #memberJoin(userId) {
    const existing = [...this.sql.exec('SELECT * FROM members WHERE user_id = ?', userId)]
    if (existing.length > 0 && existing[0].active === 1) {
      return { error: '既に参加しています。' }
    }

    if (existing.length > 0) {
      this.sql.exec('UPDATE members SET active = ?, leave_requested = ? WHERE user_id = ?', 1, 0, userId)
      const bal = [...this.sql.exec('SELECT * FROM balances WHERE user_id = ?', userId)]
      if (bal.length > 0 && bal[0].amount === 0) {
        this.sql.exec('UPDATE balances SET amount = ? WHERE user_id = ?', INITIAL_BALANCE, userId)
        this.#recordTx(null, userId, INITIAL_BALANCE, 'join_bonus')
      }
      const currentBal = [...this.sql.exec('SELECT * FROM balances WHERE user_id = ?', userId)]
      return { ok: true, balance: currentBal[0].amount }
    }

    this.sql.exec('INSERT INTO members (user_id, joined_at, active, leave_requested) VALUES (?, ?, ?, ?)',
      userId, nowISO(), 1, 0)
    this.sql.exec('INSERT INTO balances (user_id, amount) VALUES (?, ?)', userId, INITIAL_BALANCE)
    this.#recordTx(null, userId, INITIAL_BALANCE, 'join_bonus')
    return { ok: true, balance: INITIAL_BALANCE }
  }

  #memberLeaveRequest(userId) {
    const member = this.#getMember(userId)
    if (!member || member.active !== 1) return { error: '参加者ではありません。' }
    this.sql.exec('UPDATE members SET leave_requested = ? WHERE user_id = ?', 1, userId)
    return { ok: true }
  }

  #memberApproveLeave(userId, confiscate) {
    const member = this.#getMember(userId)
    if (!member) return { error: 'メンバーが見つかりません。' }

    if (confiscate) {
      const bal = this.#getBalance(userId)
      if (bal > 0) {
        this.sql.exec('UPDATE balances SET amount = 0 WHERE user_id = ?', userId)
        this.#recordTx(userId, null, bal, 'leave_confiscate')
      }
    }

    this.sql.exec('UPDATE members SET active = ?, leave_requested = ? WHERE user_id = ?', 0, 0, userId)
    return { ok: true }
  }

  #memberRejectLeave(userId) {
    const member = this.#getMember(userId)
    if (!member) return { error: 'メンバーが見つかりません。' }
    this.sql.exec('UPDATE members SET leave_requested = ? WHERE user_id = ?', 0, userId)
    return { ok: true }
  }

  #memberStatus() {
    const active = [...this.sql.exec('SELECT * FROM members WHERE active = ?', 1)]
    const pending = [...this.sql.exec('SELECT * FROM members WHERE leave_requested = ?', 1)]
    return { active, pendingLeaves: pending }
  }

  #bankBalance(userId) {
    const rows = [...this.sql.exec('SELECT * FROM balances WHERE user_id = ?', userId)]
    if (rows.length === 0) return { amount: 0 }
    return { amount: rows[0].amount }
  }

  #bankSend(fromUserId, toUserId, amount) {
    if (amount <= 0) return { error: '金額は1以上を指定してください。' }
    const fromBal = this.#getBalance(fromUserId)
    if (fromBal < amount) return { error: '残高が不足しています。' }
    const toBal = this.#getBalance(toUserId)
    if (toBal === null) return { error: '送金先が見つかりません。' }

    this.sql.exec('UPDATE balances SET amount = amount - ? WHERE user_id = ?', amount, fromUserId)
    this.sql.exec('UPDATE balances SET amount = amount + ? WHERE user_id = ?', amount, toUserId)
    this.#recordTx(fromUserId, toUserId, amount, 'send')
    return { ok: true, fromBalance: fromBal - amount, toBalance: toBal + amount }
  }

  #bankHistory(userId) {
    return [...this.sql.exec(
      'SELECT * FROM transactions WHERE from_user = ? OR to_user = ? ORDER BY id DESC LIMIT 20',
      userId, userId,
    )]
  }

  #bankRanking() {
    return [...this.sql.exec('SELECT * FROM balances ORDER BY amount DESC LIMIT 20')]
  }

  #bankDaily(userId) {
    const today = todayUTC()
    const claim = [...this.sql.exec('SELECT * FROM daily_claims WHERE user_id = ?', userId)]
    if (claim.length > 0 && claim[0].last_claimed === today) {
      return { error: '本日のデイリーボーナスは既に受け取り済みです。' }
    }

    this.sql.exec('INSERT OR REPLACE INTO daily_claims (user_id, last_claimed) VALUES (?, ?)', userId, today)
    this.sql.exec('UPDATE balances SET amount = amount + ? WHERE user_id = ?', DAILY_BONUS, userId)
    this.#recordTx(null, userId, DAILY_BONUS, 'daily')
    const newBal = this.#getBalance(userId)
    return { ok: true, balance: newBal }
  }

  #bankGrant(userId, amount) {
    if (amount <= 0) return { error: '金額は1以上を指定してください。' }
    this.sql.exec('UPDATE balances SET amount = amount + ? WHERE user_id = ?', amount, userId)
    this.#recordTx(null, userId, amount, 'grant')
    return { ok: true, balance: this.#getBalance(userId) }
  }

  #bankRevoke(userId, amount) {
    if (amount <= 0) return { error: '金額は1以上を指定してください。' }
    const bal = this.#getBalance(userId)
    const actual = Math.min(amount, bal)
    this.sql.exec('UPDATE balances SET amount = amount - ? WHERE user_id = ?', actual, userId)
    this.#recordTx(userId, null, actual, 'revoke')
    return { ok: true, balance: bal - actual }
  }

  #slotPlay(userId, bet) {
    if (bet < SLOT_MIN_BET) return { error: `最低賭け金は ${SLOT_MIN_BET} 肩書コインです。` }
    if (bet > SLOT_MAX_BET) return { error: `最大賭け金は ${SLOT_MAX_BET} 肩書コインです。` }
    const bal = this.#getBalance(userId)
    const maxFromBalance = Math.floor(bal * 0.5)
    const effectiveMax = Math.min(SLOT_MAX_BET, maxFromBalance)
    if (bet > effectiveMax) return { error: `賭け金が上限を超えています（残高の50%: ${maxFromBalance}、上限: ${SLOT_MAX_BET}）。` }
    if (bet > bal) return { error: '残高が不足しています。' }

    this.sql.exec('UPDATE balances SET amount = amount - ? WHERE user_id = ?', bet, userId)
    this.#recordTx(userId, null, bet, 'slot_bet')

    const reels = [spinReel(), spinReel(), spinReel()]
    const { multiplier, payout } = calculatePayout(reels, bet)

    if (payout > 0) {
      this.sql.exec('UPDATE balances SET amount = amount + ? WHERE user_id = ?', payout, userId)
      this.#recordTx(null, userId, payout, 'slot_win')
    }

    const newBal = this.#getBalance(userId)
    return { ok: true, reels, multiplier, payout, balance: newBal }
  }

  #getMember(userId) {
    const rows = [...this.sql.exec('SELECT * FROM members WHERE user_id = ?', userId)]
    return rows.length > 0 ? rows[0] : null
  }

  #getBalance(userId) {
    const rows = [...this.sql.exec('SELECT * FROM balances WHERE user_id = ?', userId)]
    if (rows.length === 0) return null
    return rows[0].amount
  }

  #recordTx(from, to, amount, type) {
    this.sql.exec(
      'INSERT INTO transactions (from_user, to_user, amount, type, created_at) VALUES (?, ?, ?, ?, ?)',
      from, to, amount, type, nowISO(),
    )
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/economyObject.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/economy/EconomyObject.js tests/economyObject.test.js
git commit -m "feat(economy): add EconomyObject Durable Object with SQLite tables"
```

---

### Task 2: Economy Store (DO Fetch Wrapper)

**Files:**
- Create: `src/utils/economyStore.js`
- Test: `tests/economyStore.test.js`

Thin wrapper that follows the same pattern as `src/utils/relayStore.js`.

- [ ] **Step 1: Write tests for economyStore**

Create `tests/economyStore.test.js`:

```javascript
import {
  memberJoin, memberLeaveRequest, memberApproveLeave, memberRejectLeave, memberStatus,
  getBalance, sendCoins, getHistory, getRanking, claimDaily, grantCoins, revokeCoins,
  playSlot,
} from '../src/utils/economyStore.js'

function createMockDO() {
  const responses = new Map()
  return {
    idFromName(name) { return `id:${name}` },
    get(_id) {
      return {
        async fetch(request) {
          const url = new URL(request.url)
          const key = `${request.method}:${url.pathname}`
          const handler = responses.get(key)
          if (handler) return handler(request)
          return Response.json({ ok: true })
        },
      }
    },
    _onRequest(method, path, handler) {
      responses.set(`${method}:${path}`, handler)
    },
  }
}

describe('economyStore', () => {
  test('memberJoin sends POST /members/join', async () => {
    const doNs = createMockDO()
    doNs._onRequest('POST', '/members/join', async (req) => {
      const body = await req.json()
      return Response.json({ ok: true, balance: 100, userId: body.userId })
    })
    const result = await memberJoin(doNs, 'g1', 'u1')
    expect(result.ok).toBe(true)
    expect(result.balance).toBe(100)
  })

  test('getBalance sends GET /bank/balance/:userId', async () => {
    const doNs = createMockDO()
    doNs._onRequest('GET', '/bank/balance/u1', async () => {
      return Response.json({ amount: 250 })
    })
    const result = await getBalance(doNs, 'g1', 'u1')
    expect(result.amount).toBe(250)
  })

  test('sendCoins sends POST /bank/send', async () => {
    const doNs = createMockDO()
    doNs._onRequest('POST', '/bank/send', async () => {
      return Response.json({ ok: true, fromBalance: 70, toBalance: 130 })
    })
    const result = await sendCoins(doNs, 'g1', 'u1', 'u2', 30)
    expect(result.ok).toBe(true)
  })

  test('playSlot sends POST /slot/play', async () => {
    const doNs = createMockDO()
    doNs._onRequest('POST', '/slot/play', async () => {
      return Response.json({ ok: true, reels: ['🍒', '🍒', '🍒'], multiplier: 2, payout: 20, balance: 110 })
    })
    const result = await playSlot(doNs, 'g1', 'u1', 10)
    expect(result.ok).toBe(true)
    expect(result.reels).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/economyStore.test.js`
Expected: FAIL with `Cannot find module '../src/utils/economyStore.js'`

- [ ] **Step 3: Implement economyStore**

Create `src/utils/economyStore.js`:

```javascript
function getStub(doNamespace, guildId) {
  const id = doNamespace.idFromName(guildId)
  return doNamespace.get(id)
}

async function doPost(doNamespace, guildId, path, body) {
  const stub = getStub(doNamespace, guildId)
  const res = await stub.fetch(new Request(`https://economy-do${path}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  }))
  return res.json()
}

async function doGet(doNamespace, guildId, path) {
  const stub = getStub(doNamespace, guildId)
  const res = await stub.fetch(new Request(`https://economy-do${path}`, { method: 'GET' }))
  return res.json()
}

export function memberJoin(doNs, guildId, userId) {
  return doPost(doNs, guildId, '/members/join', { userId })
}

export function memberLeaveRequest(doNs, guildId, userId) {
  return doPost(doNs, guildId, '/members/leave-request', { userId })
}

export function memberApproveLeave(doNs, guildId, userId, confiscate) {
  return doPost(doNs, guildId, '/members/approve-leave', { userId, confiscate })
}

export function memberRejectLeave(doNs, guildId, userId) {
  return doPost(doNs, guildId, '/members/reject-leave', { userId })
}

export function memberStatus(doNs, guildId) {
  return doGet(doNs, guildId, '/members/status')
}

export function getBalance(doNs, guildId, userId) {
  return doGet(doNs, guildId, `/bank/balance/${userId}`)
}

export function sendCoins(doNs, guildId, fromUserId, toUserId, amount) {
  return doPost(doNs, guildId, '/bank/send', { fromUserId, toUserId, amount })
}

export function getHistory(doNs, guildId, userId) {
  return doGet(doNs, guildId, `/bank/history/${userId}`)
}

export function getRanking(doNs, guildId) {
  return doGet(doNs, guildId, '/bank/ranking')
}

export function claimDaily(doNs, guildId, userId) {
  return doPost(doNs, guildId, '/bank/daily', { userId })
}

export function grantCoins(doNs, guildId, userId, amount) {
  return doPost(doNs, guildId, '/bank/grant', { userId, amount })
}

export function revokeCoins(doNs, guildId, userId, amount) {
  return doPost(doNs, guildId, '/bank/revoke', { userId, amount })
}

export function playSlot(doNs, guildId, userId, bet) {
  return doPost(doNs, guildId, '/slot/play', { userId, bet })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/economyStore.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/economyStore.js tests/economyStore.test.js
git commit -m "feat(economy): add economyStore DO fetch wrapper"
```

---

### Task 3: Discord API Role Functions

**Files:**
- Modify: `src/utils/discordApi.js` (append at end, after `deleteMessage` function)
- Test: `tests/discordApiRoles.test.js`

The economy system needs `addMemberRole` and `removeMemberRole` — these don't exist yet in `discordApi.js`.

- [ ] **Step 1: Write tests for role functions**

Create `tests/discordApiRoles.test.js`:

```javascript
import { addMemberRole, removeMemberRole } from '../src/utils/discordApi.js'

let fetchCalls = []
const originalFetch = globalThis.fetch

beforeEach(() => {
  fetchCalls = []
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts })
    return new Response('', {
      status: 204,
      headers: { 'x-ratelimit-remaining': '10' },
    })
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('addMemberRole', () => {
  test('sends PUT to correct endpoint', async () => {
    await addMemberRole('g123', 'u456', 'r789', 'test-token')
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].url).toBe('https://discord.com/api/v10/guilds/g123/members/u456/roles/r789')
    expect(fetchCalls[0].opts.method).toBe('PUT')
  })
})

describe('removeMemberRole', () => {
  test('sends DELETE to correct endpoint', async () => {
    await removeMemberRole('g123', 'u456', 'r789', 'test-token')
    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].url).toBe('https://discord.com/api/v10/guilds/g123/members/u456/roles/r789')
    expect(fetchCalls[0].opts.method).toBe('DELETE')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/discordApiRoles.test.js`
Expected: FAIL with `addMemberRole is not a function`

- [ ] **Step 3: Add role functions to discordApi.js**

Append at end of `src/utils/discordApi.js` (after the `deleteMessage` export):

```javascript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/discordApiRoles.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/discordApi.js tests/discordApiRoles.test.js
git commit -m "feat(economy): add addMemberRole and removeMemberRole to discordApi"
```

---

### Task 4: /economy Command Handler

**Files:**
- Create: `src/commands/economy.js`
- Test: `tests/economy.test.js`

Handles `/economy join`, `leave`, `approve-leave`, `reject-leave`, `status`, `grant`, `revoke`.

- [ ] **Step 1: Write tests for economy command**

Create `tests/economy.test.js`:

```javascript
import { handleEconomy } from '../src/commands/economy.js'

function createMockDO() {
  const store = {}
  return {
    idFromName(name) { return `id:${name}` },
    get(_id) {
      return {
        async fetch(request) {
          const url = new URL(request.url)
          const path = url.pathname
          if (request.method === 'POST' && path === '/members/join') {
            const body = await request.json()
            store[body.userId] = { active: 1, balance: 100 }
            return Response.json({ ok: true, balance: 100 })
          }
          if (request.method === 'POST' && path === '/members/leave-request') {
            return Response.json({ ok: true })
          }
          if (request.method === 'GET' && path === '/members/status') {
            return Response.json({ active: [], pendingLeaves: [] })
          }
          if (request.method === 'GET' && path.startsWith('/bank/balance/')) {
            const userId = path.split('/')[3]
            const user = store[userId]
            return Response.json({ amount: user?.balance ?? 0 })
          }
          if (request.method === 'POST' && path === '/bank/grant') {
            const body = await request.json()
            return Response.json({ ok: true, balance: (store[body.userId]?.balance ?? 0) + body.amount })
          }
          if (request.method === 'POST' && path === '/bank/revoke') {
            const body = await request.json()
            return Response.json({ ok: true, balance: Math.max(0, (store[body.userId]?.balance ?? 0) - body.amount) })
          }
          return Response.json({ ok: true })
        },
      }
    },
  }
}

let fetchCalls = []
const originalFetch = globalThis.fetch

beforeEach(() => {
  fetchCalls = []
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts })
    return new Response(JSON.stringify({ ok: true }), {
      status: 204,
      headers: { 'Content-Type': 'application/json', 'x-ratelimit-remaining': '10' },
    })
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function makeInteraction(sub, options = {}) {
  const opts = Object.entries(options).map(([name, value]) => {
    if (typeof value === 'object' && value.type) return { name, ...value }
    return { name, value }
  })
  return {
    guild_id: 'g1',
    application_id: 'app1',
    token: 'tok1',
    member: {
      permissions: '32',
      user: { id: 'u-admin', global_name: 'Admin' },
    },
    data: {
      name: 'economy',
      options: [{ name: sub, type: 1, options: opts }],
    },
  }
}

function makeNonAdminInteraction(sub, options = {}) {
  const i = makeInteraction(sub, options)
  i.member.permissions = '0'
  i.member.user = { id: 'u-user', global_name: 'User' }
  return i
}

describe('handleEconomy', () => {
  const env = {
    ECONOMY_DO: createMockDO(),
    ECONOMY_ROLE_ID: 'role-123',
    ECONOMY_ADMIN_CHANNEL_ID: 'ch-admin',
    DISCORD_TOKEN: 'test-tok',
  }

  test('join returns ephemeral success', async () => {
    const result = await handleEconomy(makeNonAdminInteraction('join'), env)
    expect(result.type).toBe(4)
    expect(result.data.content).toContain('100')
    expect(result.data.flags).toBe(64)
  })

  test('leave returns ephemeral confirmation', async () => {
    const result = await handleEconomy(makeNonAdminInteraction('leave'), env)
    expect(result.type).toBe(4)
    expect(result.data.content).toContain('離脱申請')
  })

  test('status returns member list', async () => {
    const result = await handleEconomy(makeInteraction('status'), env)
    expect(result.type).toBe(4)
  })

  test('grant requires ManageGuild', async () => {
    const result = await handleEconomy(makeNonAdminInteraction('grant', {
      user: { type: 'user', value: 'u1' }, amount: 100,
    }), env)
    expect(result.data.content).toContain('権限')
  })

  test('grant adds coins', async () => {
    const result = await handleEconomy(makeInteraction('grant', {
      user: { type: 'user', value: 'u1' }, amount: 100,
    }), env)
    expect(result.type).toBe(4)
    expect(result.data.content).toContain('付与')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/economy.test.js`
Expected: FAIL with `Cannot find module '../src/commands/economy.js'`

- [ ] **Step 3: Implement economy command handler**

Create `src/commands/economy.js`:

```javascript
import { hasManageGuild, permissionDeniedResponse } from '../utils/permissions.js'
import { getUserId } from '../utils/interactionHelpers.js'
import {
  memberJoin, memberLeaveRequest, memberApproveLeave, memberRejectLeave,
  memberStatus, getBalance, grantCoins, revokeCoins,
} from '../utils/economyStore.js'

const EPHEMERAL = 64

function ephemeralMsg(content) {
  return { type: 4, data: { content, flags: EPHEMERAL } }
}

function getSubcommand(interaction) {
  const top = interaction.data.options?.[0]
  if (!top) return { sub: null, options: {} }
  const options = {}
  for (const opt of top.options ?? []) {
    options[opt.name] = opt.value
  }
  return { sub: top.name, options }
}

export async function handleEconomy(interaction, env) {
  const doNs = env.ECONOMY_DO
  const guildId = interaction.guild_id
  const userId = getUserId(interaction)
  const { sub, options } = getSubcommand(interaction)

  if (sub === 'join') {
    const result = await memberJoin(doNs, guildId, userId)
    if (result.error) return ephemeralMsg(result.error)
    const { addMemberRole } = await import('../utils/discordApi.js')
    await addMemberRole(guildId, userId, env.ECONOMY_ROLE_ID, env.DISCORD_TOKEN)
    return ephemeralMsg(`参加しました！ **${result.balance} 肩書コイン** を受け取りました。`)
  }

  if (sub === 'leave') {
    const result = await memberLeaveRequest(doNs, guildId, userId)
    if (result.error) return ephemeralMsg(result.error)
    const bal = await getBalance(doNs, guildId, userId)
    const { postMessage } = await import('../utils/discordApi.js')
    await postMessage(env.ECONOMY_ADMIN_CHANNEL_ID, env.DISCORD_TOKEN, {
      content: `<@${userId}> が肩書コイン経済からの離脱を申請しました（残高: **${bal.amount} 肩書コイン**）`,
      components: [{
        type: 1,
        components: [
          { type: 2, custom_id: `economy_approve_keep_${userId}`, label: '残高を保持して承認', style: 1 },
          { type: 2, custom_id: `economy_approve_confiscate_${userId}`, label: '残高を回収して承認', style: 4 },
          { type: 2, custom_id: `economy_reject_leave_${userId}`, label: '却下', style: 2 },
        ],
      }],
    })
    return ephemeralMsg('離脱申請を送信しました。管理者の承認をお待ちください。')
  }

  if (sub === 'status') {
    const status = await memberStatus(doNs, guildId)
    const activeCount = status.active.length
    const pendingCount = status.pendingLeaves.length
    let content = `**肩書コイン経済 参加者状況**\n`
    content += `参加者: ${activeCount}人\n`
    if (pendingCount > 0) {
      content += `離脱申請中: ${pendingCount}人\n`
    }
    if (activeCount > 0) {
      content += `\n**参加者一覧:**\n`
      for (const m of status.active) {
        content += `- <@${m.user_id}>`
        if (m.leave_requested) content += ` ⚠️ 離脱申請中`
        content += `\n`
      }
    }
    return { type: 4, data: { content, flags: EPHEMERAL } }
  }

  // Admin-only commands
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  if (sub === 'approve-leave') {
    const targetUserId = options.user
    const confiscate = options.confiscate ?? false
    const result = await memberApproveLeave(doNs, guildId, targetUserId, confiscate)
    if (result.error) return ephemeralMsg(result.error)
    const { removeMemberRole } = await import('../utils/discordApi.js')
    await removeMemberRole(guildId, targetUserId, env.ECONOMY_ROLE_ID, env.DISCORD_TOKEN)
    const msg = confiscate
      ? `<@${targetUserId}> の離脱を承認しました（残高を回収しました）。`
      : `<@${targetUserId}> の離脱を承認しました（残高を保持しました）。`
    return ephemeralMsg(msg)
  }

  if (sub === 'reject-leave') {
    const targetUserId = options.user
    const result = await memberRejectLeave(doNs, guildId, targetUserId)
    if (result.error) return ephemeralMsg(result.error)
    return ephemeralMsg(`<@${targetUserId}> の離脱申請を却下しました。`)
  }

  if (sub === 'grant') {
    const targetUserId = options.user
    const amount = options.amount
    const result = await grantCoins(doNs, guildId, targetUserId, amount)
    if (result.error) return ephemeralMsg(result.error)
    return ephemeralMsg(`<@${targetUserId}> に **${amount} 肩書コイン** を付与しました（残高: ${result.balance}）。`)
  }

  if (sub === 'revoke') {
    const targetUserId = options.user
    const amount = options.amount
    const result = await revokeCoins(doNs, guildId, targetUserId, amount)
    if (result.error) return ephemeralMsg(result.error)
    return ephemeralMsg(`<@${targetUserId}> から **${amount} 肩書コイン** を回収しました（残高: ${result.balance}）。`)
  }

  return ephemeralMsg('不明なサブコマンドです。')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/economy.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/economy.js tests/economy.test.js
git commit -m "feat(economy): add /economy command handler (join, leave, grant, revoke, status)"
```

---

### Task 5: /bank Command Handler

**Files:**
- Create: `src/commands/bank.js`
- Test: `tests/bank.test.js`

- [ ] **Step 1: Write tests for bank command**

Create `tests/bank.test.js`:

```javascript
import { handleBank } from '../src/commands/bank.js'

function createMockDO() {
  return {
    idFromName(name) { return `id:${name}` },
    get(_id) {
      return {
        async fetch(request) {
          const url = new URL(request.url)
          const path = url.pathname
          if (path.startsWith('/bank/balance/')) {
            return Response.json({ amount: 100 })
          }
          if (path === '/bank/send') {
            const body = await request.json()
            if (body.amount > 100) return Response.json({ error: '残高が不足しています。' })
            return Response.json({ ok: true, fromBalance: 100 - body.amount, toBalance: body.amount })
          }
          if (path.startsWith('/bank/history/')) {
            return Response.json([
              { id: 1, from_user: null, to_user: 'u1', amount: 100, type: 'join_bonus', created_at: '2026-04-08T00:00:00Z' },
            ])
          }
          if (path === '/bank/ranking') {
            return Response.json([
              { user_id: 'u1', amount: 500 },
              { user_id: 'u2', amount: 100 },
            ])
          }
          if (path === '/bank/daily') {
            return Response.json({ ok: true, balance: 150 })
          }
          return Response.json({ ok: true })
        },
      }
    },
  }
}

function makeInteraction(sub, options = {}) {
  const opts = Object.entries(options).map(([name, value]) => {
    if (typeof value === 'object' && value.type) return { name, ...value }
    return { name, value }
  })
  return {
    guild_id: 'g1',
    member: {
      permissions: '0',
      user: { id: 'u1', global_name: 'User1' },
    },
    data: {
      name: 'bank',
      options: [{ name: sub, type: 1, options: opts }],
    },
  }
}

describe('handleBank', () => {
  const env = { ECONOMY_DO: createMockDO() }

  test('balance returns ephemeral amount', async () => {
    const result = await handleBank(makeInteraction('balance'), env)
    expect(result.type).toBe(4)
    expect(result.data.flags).toBe(64)
    expect(result.data.content).toContain('100')
  })

  test('send transfers coins', async () => {
    const result = await handleBank(makeInteraction('send', {
      user: { type: 'user', value: 'u2' }, amount: 30,
    }), env)
    expect(result.type).toBe(4)
    expect(result.data.content).toContain('30')
  })

  test('daily returns bonus', async () => {
    const result = await handleBank(makeInteraction('daily'), env)
    expect(result.type).toBe(4)
    expect(result.data.content).toContain('50')
  })

  test('ranking returns public list', async () => {
    const result = await handleBank(makeInteraction('ranking'), env)
    expect(result.type).toBe(4)
    expect(result.data.content).toContain('500')
    expect(result.data.flags).toBeUndefined() // public, no ephemeral
  })

  test('history returns ephemeral list', async () => {
    const result = await handleBank(makeInteraction('history'), env)
    expect(result.type).toBe(4)
    expect(result.data.flags).toBe(64)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/bank.test.js`
Expected: FAIL with `Cannot find module '../src/commands/bank.js'`

- [ ] **Step 3: Implement bank command handler**

Create `src/commands/bank.js`:

```javascript
import { getUserId } from '../utils/interactionHelpers.js'
import {
  getBalance, sendCoins, getHistory, getRanking, claimDaily,
} from '../utils/economyStore.js'

const EPHEMERAL = 64

function ephemeralMsg(content) {
  return { type: 4, data: { content, flags: EPHEMERAL } }
}

function getSubcommand(interaction) {
  const top = interaction.data.options?.[0]
  if (!top) return { sub: null, options: {} }
  const options = {}
  for (const opt of top.options ?? []) {
    options[opt.name] = opt.value
  }
  return { sub: top.name, options }
}

const TYPE_LABELS = {
  join_bonus: '参加ボーナス',
  daily: 'デイリーボーナス',
  grant: '管理者付与',
  revoke: '管理者回収',
  send: '送金',
  slot_bet: 'スロット賭け',
  slot_win: 'スロット当たり',
  leave_confiscate: '離脱回収',
}

export async function handleBank(interaction, env) {
  const doNs = env.ECONOMY_DO
  const guildId = interaction.guild_id
  const userId = getUserId(interaction)
  const { sub, options } = getSubcommand(interaction)

  if (sub === 'balance') {
    const result = await getBalance(doNs, guildId, userId)
    return ephemeralMsg(`💰 残高: **${result.amount.toLocaleString()} 肩書コイン**`)
  }

  if (sub === 'send') {
    const targetUserId = options.user
    const amount = options.amount
    if (amount <= 0) return ephemeralMsg('金額は1以上を指定してください。')
    if (targetUserId === userId) return ephemeralMsg('自分自身には送金できません。')
    const result = await sendCoins(doNs, guildId, userId, targetUserId, amount)
    if (result.error) return ephemeralMsg(result.error)
    return ephemeralMsg(
      `<@${targetUserId}> に **${amount.toLocaleString()} 肩書コイン** を送金しました。\n` +
      `残高: **${result.fromBalance.toLocaleString()} 肩書コイン**`
    )
  }

  if (sub === 'history') {
    const txns = await getHistory(doNs, guildId, userId)
    if (txns.length === 0) return ephemeralMsg('取引履歴がありません。')
    let content = '**📜 取引履歴（直近20件）**\n'
    for (const tx of txns) {
      const label = TYPE_LABELS[tx.type] || tx.type
      const sign = tx.to_user === userId ? '+' : '-'
      const date = tx.created_at.slice(0, 10)
      content += `\`${date}\` ${label}: ${sign}${tx.amount.toLocaleString()}\n`
    }
    return ephemeralMsg(content)
  }

  if (sub === 'ranking') {
    const ranking = await getRanking(doNs, guildId)
    if (ranking.length === 0) return ephemeralMsg('まだ参加者がいません。')
    let content = '**🏆 残高ランキング**\n'
    for (let i = 0; i < ranking.length; i++) {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      content += `${medal} <@${ranking[i].user_id}>: **${ranking[i].amount.toLocaleString()}** 肩書コイン\n`
    }
    return { type: 4, data: { content } }
  }

  if (sub === 'daily') {
    const result = await claimDaily(doNs, guildId, userId)
    if (result.error) return ephemeralMsg(result.error)
    return ephemeralMsg(
      `✅ デイリーボーナス **50 肩書コイン** を受け取りました！\n` +
      `残高: **${result.balance.toLocaleString()} 肩書コイン**`
    )
  }

  return ephemeralMsg('不明なサブコマンドです。')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/bank.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/bank.js tests/bank.test.js
git commit -m "feat(economy): add /bank command handler (balance, send, history, ranking, daily)"
```

---

### Task 6: /slot Command Handler

**Files:**
- Create: `src/commands/slot.js`
- Test: `tests/slot.test.js`

- [ ] **Step 1: Write tests for slot command**

Create `tests/slot.test.js`:

```javascript
import { handleSlot } from '../src/commands/slot.js'

function createMockDO() {
  return {
    idFromName(name) { return `id:${name}` },
    get(_id) {
      return {
        async fetch(request) {
          const url = new URL(request.url)
          const path = url.pathname
          if (path === '/slot/play') {
            const body = await request.json()
            return Response.json({
              ok: true,
              reels: ['🍒', '🍒', '🍋'],
              multiplier: 0,
              payout: 0,
              balance: 100 - body.bet,
            })
          }
          return Response.json({ ok: true })
        },
      }
    },
  }
}

function makeInteraction(sub, options = {}) {
  const opts = Object.entries(options).map(([name, value]) => ({ name, value }))
  return {
    guild_id: 'g1',
    member: {
      permissions: '0',
      user: { id: 'u1', global_name: 'User1' },
    },
    data: {
      name: 'slot',
      options: [{ name: sub, type: 1, options: opts }],
    },
  }
}

describe('handleSlot', () => {
  const env = { ECONOMY_DO: createMockDO() }

  test('play returns slot result with reels display', async () => {
    const result = await handleSlot(makeInteraction('play', { bet: 10 }), env)
    expect(result.type).toBe(4)
    expect(result.data.content).toContain('🎰')
    expect(result.data.content).toContain('🍒')
    expect(result.data.flags).toBeUndefined() // public
  })

  test('rules returns payout table', async () => {
    const result = await handleSlot(makeInteraction('rules'), env)
    expect(result.type).toBe(4)
    expect(result.data.content).toContain('配当表')
    expect(result.data.content).toContain('💎')
    expect(result.data.flags).toBe(64)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/slot.test.js`
Expected: FAIL with `Cannot find module '../src/commands/slot.js'`

- [ ] **Step 3: Implement slot command handler**

Create `src/commands/slot.js`:

```javascript
import { getUserId } from '../utils/interactionHelpers.js'
import { playSlot } from '../utils/economyStore.js'

const EPHEMERAL = 64

function ephemeralMsg(content) {
  return { type: 4, data: { content, flags: EPHEMERAL } }
}

function getSubcommand(interaction) {
  const top = interaction.data.options?.[0]
  if (!top) return { sub: null, options: {} }
  const options = {}
  for (const opt of top.options ?? []) {
    options[opt.name] = opt.value
  }
  return { sub: top.name, options }
}

function formatSlotResult(reels, bet, multiplier, payout, balance) {
  let content = '🎰 **スロットマシン**\n'
  content += '┌───┬───┬───┐\n'
  content += `│ ${reels[0]} │ ${reels[1]} │ ${reels[2]} │\n`
  content += '└───┴───┴───┘\n'

  if (multiplier >= 2) {
    content += `**3つ揃い! x${multiplier}** → +${payout.toLocaleString()} 肩書コイン 🎉\n`
  } else if (multiplier === 1) {
    content += `**2つ揃い! x1** → ±0（賭け金返却）\n`
  } else {
    content += `**ハズレ...** → -${bet.toLocaleString()} 肩書コイン\n`
  }

  content += `残高: **${balance.toLocaleString()} 肩書コイン**`
  return content
}

export async function handleSlot(interaction, env) {
  const doNs = env.ECONOMY_DO
  const guildId = interaction.guild_id
  const userId = getUserId(interaction)
  const { sub, options } = getSubcommand(interaction)

  if (sub === 'play') {
    const bet = options.bet
    const result = await playSlot(doNs, guildId, userId, bet)
    if (result.error) return ephemeralMsg(result.error)
    const content = formatSlotResult(result.reels, bet, result.multiplier, result.payout, result.balance)
    return { type: 4, data: { content } }
  }

  if (sub === 'rules') {
    const content =
      '**🎰 スロットマシン 配当表**\n\n' +
      '| 結果 | 倍率 |\n' +
      '|---|---|\n' +
      '| 💎💎💎 | x50 |\n' +
      '| 7️⃣7️⃣7️⃣ | x20 |\n' +
      '| 🔔🔔🔔 | x10 |\n' +
      '| 🍇🍇🍇 | x5 |\n' +
      '| 🍊🍊🍊 | x4 |\n' +
      '| 🍋🍋🍋 | x3 |\n' +
      '| 🍒🍒🍒 | x2 |\n' +
      '| 2つ揃い | x1（返却）|\n' +
      '| ハズレ | x0 |\n\n' +
      '最低賭け金: **10** 肩書コイン\n' +
      '最大賭け金: **5,000** 肩書コイン（残高の50%との小さい方）'
    return ephemeralMsg(content)
  }

  return ephemeralMsg('不明なサブコマンドです。')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/slot.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/slot.js tests/slot.test.js
git commit -m "feat(economy): add /slot command handler (play, rules)"
```

---

### Task 7: Button Handlers for Leave Approval

**Files:**
- Modify: `src/interactions/buttons.js` (add before the final `return ephemeralMsg(...)` line at line 288)
- Test: `tests/economyButtons.test.js`

Handle the 3 buttons posted in admin channel: `economy_approve_keep_*`, `economy_approve_confiscate_*`, `economy_reject_leave_*`.

- [ ] **Step 1: Write tests for economy button handlers**

Create `tests/economyButtons.test.js`:

```javascript
import { handleButton } from '../src/interactions/buttons.js'

function createMockDO() {
  return {
    idFromName(name) { return `id:${name}` },
    get(_id) {
      return {
        async fetch(request) {
          const url = new URL(request.url)
          if (url.pathname === '/members/approve-leave') {
            return Response.json({ ok: true })
          }
          if (url.pathname === '/members/reject-leave') {
            return Response.json({ ok: true })
          }
          return Response.json({ ok: true })
        },
      }
    },
  }
}

let fetchCalls = []
const originalFetch = globalThis.fetch

beforeEach(() => {
  fetchCalls = []
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts })
    return new Response(JSON.stringify({}), {
      status: 204,
      headers: { 'Content-Type': 'application/json', 'x-ratelimit-remaining': '10' },
    })
  }
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

function makeButtonInteraction(customId) {
  return {
    guild_id: 'g1',
    data: { custom_id: customId },
    member: {
      permissions: '32',
      user: { id: 'u-admin', global_name: 'Admin' },
    },
  }
}

describe('economy button handlers', () => {
  const env = {
    ECONOMY_DO: createMockDO(),
    ECONOMY_ROLE_ID: 'role-123',
    DISCORD_TOKEN: 'test-tok',
    SESSION_KV: { get: async () => null },
  }

  test('economy_approve_keep approves without confiscation', async () => {
    const result = await handleButton(makeButtonInteraction('economy_approve_keep_u-target'), env)
    expect(result.type).toBe(7)
    expect(result.data.content).toContain('保持')
  })

  test('economy_approve_confiscate approves with confiscation', async () => {
    const result = await handleButton(makeButtonInteraction('economy_approve_confiscate_u-target'), env)
    expect(result.type).toBe(7)
    expect(result.data.content).toContain('回収')
  })

  test('economy_reject_leave rejects', async () => {
    const result = await handleButton(makeButtonInteraction('economy_reject_leave_u-target'), env)
    expect(result.type).toBe(7)
    expect(result.data.content).toContain('却下')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/economyButtons.test.js`
Expected: FAIL — button handler doesn't recognize `economy_approve_keep_*`

- [ ] **Step 3: Update buttons.js**

First, update the import at line 10 of `src/interactions/buttons.js`:

Change:
```javascript
import { hasManageMessages, permissionDeniedResponse } from '../utils/permissions.js'
```
To:
```javascript
import { hasManageGuild, hasManageMessages, permissionDeniedResponse } from '../utils/permissions.js'
```

Then add the following block **before** the final `return ephemeralMsg('不明なインタラクションです。')` (before line 288):

```javascript
  // --- Economy leave approval handlers ---
  if (customId.startsWith('economy_approve_keep_')) {
    if (!hasManageGuild(interaction)) return permissionDeniedResponse('サーバーの管理')
    const targetUserId = customId.replace('economy_approve_keep_', '')
    const { memberApproveLeave } = await import('../utils/economyStore.js')
    const { removeMemberRole } = await import('../utils/discordApi.js')
    await memberApproveLeave(env.ECONOMY_DO, interaction.guild_id, targetUserId, false)
    await removeMemberRole(interaction.guild_id, targetUserId, env.ECONOMY_ROLE_ID, env.DISCORD_TOKEN)
    return updateMsg(`✅ <@${targetUserId}> の離脱を承認しました（残高を保持）。`)
  }

  if (customId.startsWith('economy_approve_confiscate_')) {
    if (!hasManageGuild(interaction)) return permissionDeniedResponse('サーバーの管理')
    const targetUserId = customId.replace('economy_approve_confiscate_', '')
    const { memberApproveLeave } = await import('../utils/economyStore.js')
    const { removeMemberRole } = await import('../utils/discordApi.js')
    await memberApproveLeave(env.ECONOMY_DO, interaction.guild_id, targetUserId, true)
    await removeMemberRole(interaction.guild_id, targetUserId, env.ECONOMY_ROLE_ID, env.DISCORD_TOKEN)
    return updateMsg(`✅ <@${targetUserId}> の離脱を承認しました（残高を回収）。`)
  }

  if (customId.startsWith('economy_reject_leave_')) {
    if (!hasManageGuild(interaction)) return permissionDeniedResponse('サーバーの管理')
    const targetUserId = customId.replace('economy_reject_leave_', '')
    const { memberRejectLeave } = await import('../utils/economyStore.js')
    await memberRejectLeave(env.ECONOMY_DO, interaction.guild_id, targetUserId)
    return updateMsg(`❌ <@${targetUserId}> の離脱申請を却下しました。`)
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/economyButtons.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/interactions/buttons.js tests/economyButtons.test.js
git commit -m "feat(economy): add leave approval button handlers to buttons.js"
```

---

### Task 8: Command Registration

**Files:**
- Modify: `src/deploy-commands.js`

Register `/economy`, `/bank`, `/slot` commands.

- [ ] **Step 1: Read current deploy-commands.js to find insertion point**

Read `src/deploy-commands.js` and locate the end of the `commands` array.

- [ ] **Step 2: Add economy command definitions**

Add the following entries to the `commands` array in `src/deploy-commands.js`:

```javascript
  new SlashCommandBuilder()
    .setName('economy')
    .setDescription('肩書コイン経済の参加者管理')
    .addSubcommand(sub =>
      sub.setName('join')
        .setDescription('肩書コイン経済に参加します')
    )
    .addSubcommand(sub =>
      sub.setName('leave')
        .setDescription('肩書コイン経済からの離脱を申請します')
    )
    .addSubcommand(sub =>
      sub.setName('approve-leave')
        .setDescription('離脱申請を承認します')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('対象ユーザー')
            .setRequired(true)
        )
        .addBooleanOption(opt =>
          opt.setName('confiscate')
            .setDescription('残高を回収するか（デフォルト: false）')
        )
    )
    .addSubcommand(sub =>
      sub.setName('reject-leave')
        .setDescription('離脱申請を却下します')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('対象ユーザー')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName('status')
        .setDescription('参加者一覧と統計を表示します')
    )
    .addSubcommand(sub =>
      sub.setName('grant')
        .setDescription('ユーザーに肩書コインを付与します')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('対象ユーザー')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount')
            .setDescription('付与する金額')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub.setName('revoke')
        .setDescription('ユーザーから肩書コインを回収します')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('対象ユーザー')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount')
            .setDescription('回収する金額')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('bank')
    .setDescription('肩書コイン銀行')
    .addSubcommand(sub =>
      sub.setName('balance')
        .setDescription('残高を確認します')
    )
    .addSubcommand(sub =>
      sub.setName('send')
        .setDescription('他のユーザーに送金します')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('送金先ユーザー')
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('amount')
            .setDescription('送金額')
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(sub =>
      sub.setName('history')
        .setDescription('取引履歴を表示します')
    )
    .addSubcommand(sub =>
      sub.setName('ranking')
        .setDescription('残高ランキングを表示します')
    )
    .addSubcommand(sub =>
      sub.setName('daily')
        .setDescription('デイリーボーナスを受け取ります')
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('slot')
    .setDescription('スロットマシン')
    .addSubcommand(sub =>
      sub.setName('play')
        .setDescription('スロットを回します')
        .addIntegerOption(opt =>
          opt.setName('bet')
            .setDescription('賭け金（最低10）')
            .setRequired(true)
            .setMinValue(10)
        )
    )
    .addSubcommand(sub =>
      sub.setName('rules')
        .setDescription('配当表とルールを表示します')
    )
    .toJSON(),
```

- [ ] **Step 3: Commit**

```bash
git add src/deploy-commands.js
git commit -m "feat(economy): register /economy, /bank, /slot slash commands"
```

---

### Task 9: Worker.js Routing & Wrangler Config

**Files:**
- Modify: `src/worker.js`
- Modify: `wrangler.toml`

- [ ] **Step 1: Update worker.js exports and imports**

Add at line 1 of `src/worker.js` (after the existing RelayObject export):

```javascript
export { EconomyObject } from './economy/EconomyObject.js'
```

Add to the import block (after line 15):

```javascript
import { handleEconomy } from './commands/economy.js'
import { handleBank } from './commands/bank.js'
import { handleSlot } from './commands/slot.js'
```

- [ ] **Step 2: Add command routing to worker.js**

Add before the `MESSAGE_COMPONENT` handler (before line 109 `} else if (interaction.type === InteractionType.MESSAGE_COMPONENT)`):

```javascript
      } else if (
        interaction.type === InteractionType.APPLICATION_COMMAND &&
        interaction.data?.name === 'economy'
      ) {
        result = await handleEconomy(interaction, env)
      } else if (
        interaction.type === InteractionType.APPLICATION_COMMAND &&
        interaction.data?.name === 'bank'
      ) {
        result = await handleBank(interaction, env)
      } else if (
        interaction.type === InteractionType.APPLICATION_COMMAND &&
        interaction.data?.name === 'slot'
      ) {
        result = await handleSlot(interaction, env)
```

- [ ] **Step 3: Update wrangler.toml**

Append to `wrangler.toml`:

```toml
[[durable_objects.bindings]]
name = "ECONOMY_DO"
class_name = "EconomyObject"

[[migrations]]
tag = "v2"
new_sqlite_classes = ["EconomyObject"]
```

- [ ] **Step 4: Run full test suite**

Run: `node --experimental-vm-modules node_modules/.bin/jest`
Expected: All tests PASS

- [ ] **Step 5: Run linter**

Run: `npx eslint src/ tests/`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/worker.js wrangler.toml
git commit -m "feat(economy): wire EconomyObject, commands, and DO binding in worker and wrangler"
```

---

### Task 10: Version Bump & Documentation

**Files:**
- Modify: `package.json` (version field)
- Modify: `src/commands/status.js` (VERSION constant)
- Modify: `RELEASE_NOTES.md`
- Modify: `README.md`

- [ ] **Step 1: Read current version files**

Read `package.json` version field and `src/commands/status.js` VERSION constant to confirm current version is `0.18.0`.

- [ ] **Step 2: Bump version to 0.19.0**

In `package.json`, change:
```json
"version": "0.19.0"
```

In `src/commands/status.js`, change the `VERSION` constant to `'0.19.0'`.

- [ ] **Step 3: Update RELEASE_NOTES.md**

Add at the top of `RELEASE_NOTES.md`:

```markdown
## v0.19.0 — 2026-04-XX

### 肩書コイン経済システム

- `/economy` — 参加者管理（join, leave, approve-leave, reject-leave, status, grant, revoke）
- `/bank` — 銀行機能（balance, send, history, ranking, daily）
- `/slot` — スロットマシン（play, rules）
- Durable Object `EconomyObject` による通貨残高のアトミック管理
- 参加者ロール自動付与/剥奪
- 離脱承認ワークフロー（ボタン付き管理者通知）
```

- [ ] **Step 4: Update README.md command list**

Add the economy/bank/slot commands to the command list section in `README.md`.

- [ ] **Step 5: Commit**

```bash
git add package.json src/commands/status.js RELEASE_NOTES.md README.md
git commit -m "chore: bump version to v0.19.0, add economy system release notes"
```

---

### Task 11: Set Environment Secrets & Deploy

**Files:** None (operational step)

- [ ] **Step 1: Set ECONOMY_ROLE_ID**

Create a "参加者" role in Discord, note its ID. Then run:
`wrangler secret put ECONOMY_ROLE_ID`

- [ ] **Step 2: Set ECONOMY_ADMIN_CHANNEL_ID**

Create or designate an admin channel for economy notifications. Then run:
`wrangler secret put ECONOMY_ADMIN_CHANNEL_ID`

- [ ] **Step 3: Deploy commands**

Run: `npm run deploy`
Expected: `✅ スラッシュコマンドを登録しました`

- [ ] **Step 4: Deploy worker**

Run: `npm run publish`
Expected: Successful deployment with EconomyObject migration
