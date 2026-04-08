// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INITIAL_BALANCE = 100
const DAILY_BONUS = 50
const SLOT_MIN_BET = 10
const SLOT_MAX_BET = 5000

// Slot symbols with weights (total weight = 32)
const SLOT_SYMBOLS = [
  { symbol: '🍒', weight: 8, tripleMultiplier: 2 },
  { symbol: '🍋', weight: 7, tripleMultiplier: 3 },
  { symbol: '🍊', weight: 6, tripleMultiplier: 4 },
  { symbol: '🍇', weight: 5, tripleMultiplier: 5 },
  { symbol: '🔔', weight: 3, tripleMultiplier: 10 },
  { symbol: '7️⃣', weight: 2, tripleMultiplier: 20 },
  { symbol: '💎', weight: 1, tripleMultiplier: 50 },
]

// ---------------------------------------------------------------------------
// EconomyObject Durable Object
// ---------------------------------------------------------------------------

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

    // Parse JSON body for POST requests
    let body = null
    if (method === 'POST') {
      try {
        body = await request.json()
      } catch {
        return Response.json({ error: 'Invalid JSON' }, { status: 400 })
      }
    }

    // -----------------------------------------------------------------------
    // Members routes
    // -----------------------------------------------------------------------

    if (method === 'POST' && path === '/members/join') {
      return this._handleMembersJoin(body)
    }

    if (method === 'POST' && path === '/members/leave-request') {
      return this._handleLeaveRequest(body)
    }

    if (method === 'POST' && path === '/members/approve-leave') {
      return this._handleApproveLeave(body)
    }

    if (method === 'POST' && path === '/members/reject-leave') {
      return this._handleRejectLeave(body)
    }

    if (method === 'GET' && path === '/members/status') {
      return this._handleMembersStatus()
    }

    if (method === 'GET' && path.startsWith('/members/get/')) {
      const userId = path.split('/')[3]
      return Response.json(this.#getMember(userId))
    }

    // -----------------------------------------------------------------------
    // Bank routes
    // -----------------------------------------------------------------------

    if (method === 'GET' && path.startsWith('/bank/balance/')) {
      const userId = path.slice('/bank/balance/'.length)
      return this._handleGetBalance(userId)
    }

    if (method === 'POST' && path === '/bank/send') {
      return this._handleSend(body)
    }

    if (method === 'GET' && path.startsWith('/bank/history/')) {
      const userId = path.slice('/bank/history/'.length)
      return this._handleHistory(userId)
    }

    if (method === 'GET' && path === '/bank/ranking') {
      return this._handleRanking()
    }

    if (method === 'POST' && path === '/bank/daily') {
      return this._handleDaily(body)
    }

    if (method === 'POST' && path === '/bank/grant') {
      return this._handleGrant(body)
    }

    if (method === 'POST' && path === '/bank/revoke') {
      return this._handleRevoke(body)
    }

    // -----------------------------------------------------------------------
    // Slot route
    // -----------------------------------------------------------------------

    if (method === 'POST' && path === '/slot/play') {
      return this._handleSlotPlay(body)
    }

    return Response.json({ error: 'Not Found' }, { status: 404 })
  }

  // -------------------------------------------------------------------------
  // Members handlers
  // -------------------------------------------------------------------------

  _handleMembersJoin(body) {
    const { userId } = body ?? {}
    if (!userId) {
      return Response.json({ error: 'userId is required' }, { status: 400 })
    }

    const existing = [...this.sql.exec('SELECT * FROM members WHERE user_id = ?', userId)]

    if (existing.length > 0) {
      const member = existing[0]

      if (member.active === 1) {
        // Already active
        return Response.json({ error: '既に参加しています。' })
      }

      // Reactivate
      this.sql.exec('UPDATE members SET active = 1, leave_requested = 0 WHERE user_id = ?', userId)

      const balRows = [...this.sql.exec('SELECT amount FROM balances WHERE user_id = ?', userId)]
      let balance = balRows[0]?.amount ?? 0

      if (balance === 0) {
        // Re-grant initial bonus
        this.sql.exec('INSERT OR REPLACE INTO balances (user_id, amount) VALUES (?, ?)', userId, INITIAL_BALANCE)
        this._recordTransaction(null, userId, INITIAL_BALANCE, 'join_bonus')
        balance = INITIAL_BALANCE
      }

      return Response.json({ ok: true, isNew: false, balance })
    }

    // New member
    const now = new Date().toISOString()
    this.sql.exec(
      'INSERT OR REPLACE INTO members (user_id, joined_at, active, leave_requested) VALUES (?, ?, ?, ?)',
      userId, now, 1, 0,
    )
    this.sql.exec('INSERT OR REPLACE INTO balances (user_id, amount) VALUES (?, ?)', userId, INITIAL_BALANCE)
    this._recordTransaction(null, userId, INITIAL_BALANCE, 'join_bonus')

    return Response.json({ ok: true, isNew: true, balance: INITIAL_BALANCE })
  }

  _handleLeaveRequest(body) {
    const { userId } = body ?? {}
    if (!userId) {
      return Response.json({ error: 'userId is required' }, { status: 400 })
    }

    const rows = [...this.sql.exec('SELECT * FROM members WHERE user_id = ?', userId)]
    if (rows.length === 0 || rows[0].active === 0) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    if (rows[0].leave_requested === 1) return Response.json({ error: '離脱申請は既に送信されています。' })

    this.sql.exec('UPDATE members SET leave_requested = 1 WHERE user_id = ?', userId)
    return Response.json({ ok: true })
  }

  _handleApproveLeave(body) {
    const { userId, confiscate } = body ?? {}
    if (!userId) {
      return Response.json({ error: 'userId is required' }, { status: 400 })
    }

    const rows = [...this.sql.exec('SELECT * FROM members WHERE user_id = ?', userId)]
    if (rows.length === 0) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    if (!rows[0].leave_requested) return Response.json({ error: '離脱申請が見つかりません。' })

    if (confiscate) {
      const balRows = [...this.sql.exec('SELECT amount FROM balances WHERE user_id = ?', userId)]
      const balance = balRows[0]?.amount ?? 0
      if (balance > 0) {
        this.sql.exec('INSERT OR REPLACE INTO balances (user_id, amount) VALUES (?, ?)', userId, 0)
        this._recordTransaction(userId, null, balance, 'leave_confiscate')
      }
    }

    this.sql.exec('UPDATE members SET active = 0, leave_requested = 0 WHERE user_id = ?', userId)
    return Response.json({ ok: true })
  }

  _handleRejectLeave(body) {
    const { userId } = body ?? {}
    if (!userId) {
      return Response.json({ error: 'userId is required' }, { status: 400 })
    }

    const rows = [...this.sql.exec('SELECT * FROM members WHERE user_id = ?', userId)]
    if (rows.length === 0) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    if (!rows[0].leave_requested) return Response.json({ error: '離脱申請が見つかりません。' })

    this.sql.exec('UPDATE members SET leave_requested = 0 WHERE user_id = ?', userId)
    return Response.json({ ok: true })
  }

  _handleMembersStatus() {
    const active = [...this.sql.exec('SELECT * FROM members WHERE active = 1')]
    const pendingLeaves = [...this.sql.exec('SELECT * FROM members WHERE leave_requested = 1')]
    return Response.json({ active, pendingLeaves })
  }

  // -------------------------------------------------------------------------
  // Bank handlers
  // -------------------------------------------------------------------------

  _handleGetBalance(userId) {
    const rows = [...this.sql.exec('SELECT amount FROM balances WHERE user_id = ?', userId)]
    if (rows.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }
    return Response.json({ user_id: userId, amount: rows[0].amount })
  }

  _handleSend(body) {
    const { fromUserId, toUserId, amount } = body ?? {}
    if (!fromUserId || !toUserId || amount == null) {
      return Response.json({ error: 'fromUserId, toUserId, and amount are required' }, { status: 400 })
    }
    if (amount <= 0) {
      return Response.json({ error: 'Amount must be positive' }, { status: 400 })
    }

    const fromRows = [...this.sql.exec('SELECT amount FROM balances WHERE user_id = ?', fromUserId)]
    if (fromRows.length === 0) {
      return Response.json({ error: '送金元が見つかりません。' }, { status: 404 })
    }

    const fromBalance = fromRows[0].amount
    if (fromBalance < amount) {
      return Response.json({ error: 'Insufficient funds' }, { status: 400 })
    }

    const toRows = [...this.sql.exec('SELECT amount FROM balances WHERE user_id = ?', toUserId)]
    if (toRows.length === 0) {
      return Response.json({ error: '送金先が見つかりません。' }, { status: 404 })
    }

    // Atomic transfer
    this.sql.exec('UPDATE balances SET amount = amount - ? WHERE user_id = ?', amount, fromUserId)
    this.sql.exec('UPDATE balances SET amount = amount + ? WHERE user_id = ?', amount, toUserId)
    this._recordTransaction(fromUserId, toUserId, amount, 'send')

    const newFromRows = [...this.sql.exec('SELECT amount FROM balances WHERE user_id = ?', fromUserId)]
    const newToRows = [...this.sql.exec('SELECT amount FROM balances WHERE user_id = ?', toUserId)]

    return Response.json({
      ok: true,
      fromBalance: newFromRows[0]?.amount ?? fromBalance - amount,
      toBalance: newToRows[0]?.amount ?? toRows[0].amount + amount,
    })
  }

  _handleHistory(userId) {
    const rows = [...this.sql.exec(
      'SELECT * FROM transactions WHERE from_user = ? OR to_user = ? ORDER BY id DESC LIMIT 20',
      userId, userId,
    )]
    return Response.json(rows)
  }

  _handleRanking() {
    const rows = [...this.sql.exec('SELECT * FROM balances ORDER BY amount DESC LIMIT 20')]
    return Response.json(rows)
  }

  _handleDaily(body) {
    const { userId } = body ?? {}
    if (!userId) {
      return Response.json({ error: 'userId is required' }, { status: 400 })
    }

    const memberRows = [...this.sql.exec('SELECT * FROM members WHERE user_id = ?', userId)]
    if (memberRows.length === 0 || memberRows[0].active === 0) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    const todayUTC = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    const claimRows = [...this.sql.exec('SELECT last_claimed FROM daily_claims WHERE user_id = ?', userId)]

    if (claimRows.length > 0 && claimRows[0].last_claimed === todayUTC) {
      return Response.json({ error: 'Already claimed today' }, { status: 429 })
    }

    this.sql.exec('INSERT OR REPLACE INTO daily_claims (user_id, last_claimed) VALUES (?, ?)', userId, todayUTC)
    this.sql.exec('UPDATE balances SET amount = amount + ? WHERE user_id = ?', DAILY_BONUS, userId)
    this._recordTransaction(null, userId, DAILY_BONUS, 'daily')

    const newBalRows = [...this.sql.exec('SELECT amount FROM balances WHERE user_id = ?', userId)]
    const balance = newBalRows[0]?.amount ?? DAILY_BONUS

    return Response.json({ ok: true, balance })
  }

  _handleGrant(body) {
    const { userId, amount, adminId } = body ?? {}
    if (!userId || amount == null) {
      return Response.json({ error: 'userId and amount are required' }, { status: 400 })
    }

    const rows = [...this.sql.exec('SELECT amount FROM balances WHERE user_id = ?', userId)]
    if (rows.length === 0) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    this.sql.exec('UPDATE balances SET amount = amount + ? WHERE user_id = ?', amount, userId)
    this._recordTransaction(adminId ?? 'admin', userId, amount, 'grant')

    const newRows = [...this.sql.exec('SELECT amount FROM balances WHERE user_id = ?', userId)]
    const balance = newRows[0]?.amount ?? rows[0].amount + amount

    return Response.json({ ok: true, balance })
  }

  _handleRevoke(body) {
    const { userId, amount, adminId } = body ?? {}
    if (!userId || amount == null) {
      return Response.json({ error: 'userId and amount are required' }, { status: 400 })
    }

    const rows = [...this.sql.exec('SELECT amount FROM balances WHERE user_id = ?', userId)]
    if (rows.length === 0) {
      return Response.json({ error: 'Member not found' }, { status: 404 })
    }

    const current = rows[0].amount
    const deduct = Math.min(amount, current)

    if (deduct > 0) {
      this.sql.exec('UPDATE balances SET amount = amount - ? WHERE user_id = ?', deduct, userId)
      this._recordTransaction(userId, adminId ?? 'admin', deduct, 'revoke')
    }

    const newRows = [...this.sql.exec('SELECT amount FROM balances WHERE user_id = ?', userId)]
    const balance = newRows[0]?.amount ?? current - deduct

    return Response.json({ ok: true, balance })
  }

  // -------------------------------------------------------------------------
  // Slot handler
  // -------------------------------------------------------------------------

  _handleSlotPlay(body) {
    const { userId, bet } = body ?? {}
    if (!userId || bet == null) {
      return Response.json({ error: 'userId and bet are required' }, { status: 400 })
    }

    const balRows = [...this.sql.exec('SELECT amount FROM balances WHERE user_id = ?', userId)]
    if (balRows.length === 0) {
      return Response.json({ error: 'User not found' }, { status: 404 })
    }

    const balance = balRows[0].amount

    if (bet < SLOT_MIN_BET) {
      return Response.json({ error: `Minimum bet is ${SLOT_MIN_BET}` }, { status: 400 })
    }
    if (bet > SLOT_MAX_BET) {
      return Response.json({ error: `Maximum bet is ${SLOT_MAX_BET}` }, { status: 400 })
    }

    const maxAllowed = Math.min(SLOT_MAX_BET, Math.floor(balance * 0.5))
    if (bet > maxAllowed) {
      return Response.json({ error: `Bet exceeds 50% of balance (max: ${maxAllowed})` }, { status: 400 })
    }

    if (balance < bet) {
      return Response.json({ error: 'Insufficient funds' }, { status: 400 })
    }

    // Spin reels
    const reels = [_spinReel(), _spinReel(), _spinReel()]

    // Calculate payout
    let multiplier = 0
    if (reels[0].symbol === reels[1].symbol && reels[1].symbol === reels[2].symbol) {
      // Triple
      multiplier = reels[0].tripleMultiplier
    } else if (
      reels[0].symbol === reels[1].symbol ||
      reels[1].symbol === reels[2].symbol ||
      reels[0].symbol === reels[2].symbol
    ) {
      // Two match
      multiplier = 1
    }

    const payout = bet * multiplier

    // Update balance: deduct bet then add payout
    const netChange = payout - bet
    if (netChange < 0) {
      this.sql.exec('UPDATE balances SET amount = amount - ? WHERE user_id = ?', -netChange, userId)
    } else if (netChange > 0) {
      this.sql.exec('UPDATE balances SET amount = amount + ? WHERE user_id = ?', netChange, userId)
    }

    this._recordTransaction(userId, null, bet, 'slot_bet')
    if (payout > 0) {
      this._recordTransaction(null, userId, payout, 'slot_win')
    }

    const newBalRows = [...this.sql.exec('SELECT amount FROM balances WHERE user_id = ?', userId)]
    const newBalance = newBalRows[0]?.amount ?? balance + netChange

    return Response.json({
      ok: true,
      reels: reels.map(r => r.symbol),
      multiplier,
      payout,
      balance: newBalance,
    })
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  #getMember(userId) {
    const rows = [...this.sql.exec('SELECT * FROM members WHERE user_id = ?', userId)]
    return rows[0] ?? null
  }

  _recordTransaction(fromUser, toUser, amount, type) {
    const now = new Date().toISOString()
    this.sql.exec(
      'INSERT INTO transactions (from_user, to_user, amount, type, created_at) VALUES (?, ?, ?, ?, ?)',
      fromUser, toUser, amount, type, now,
    )
  }
}

// ---------------------------------------------------------------------------
// Slot helper (module-level, pure function)
// ---------------------------------------------------------------------------

function _spinReel() {
  const totalWeight = SLOT_SYMBOLS.reduce((sum, s) => sum + s.weight, 0)
  let rand = Math.floor(Math.random() * totalWeight)
  for (const sym of SLOT_SYMBOLS) {
    rand -= sym.weight
    if (rand < 0) return sym
  }
  return SLOT_SYMBOLS[SLOT_SYMBOLS.length - 1]
}
