function getStub(doNs, guildId) {
  const id = doNs.idFromName(guildId)
  return doNs.get(id)
}

async function doFetch(doNs, guildId, method, path, body) {
  const stub = getStub(doNs, guildId)
  const init = { method }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
    init.headers = { 'Content-Type': 'application/json' }
  }
  const res = await stub.fetch(new Request('https://economy-do' + path, init))
  return res
}

export async function getBalance(doNs, guildId, userId) {
  const res = await doFetch(doNs, guildId, 'GET', `/bank/balance/${userId}`)
  return res.json()
}

export async function sendCoins(doNs, guildId, fromUserId, toUserId, amount) {
  const res = await doFetch(doNs, guildId, 'POST', '/bank/send', { fromUserId, toUserId, amount })
  return res.json()
}

export async function getHistory(doNs, guildId, userId) {
  const res = await doFetch(doNs, guildId, 'GET', `/bank/history/${userId}`)
  return res.json()
}

export async function getRanking(doNs, guildId) {
  const res = await doFetch(doNs, guildId, 'GET', '/bank/ranking')
  return res.json()
}

export async function claimDaily(doNs, guildId, userId) {
  const res = await doFetch(doNs, guildId, 'POST', '/bank/daily', { userId })
  return res.json()
}

export async function memberJoin(doNs, guildId, userId) {
  const res = await doFetch(doNs, guildId, 'POST', '/members/join', { userId })
  return res.json()
}

export async function memberLeaveRequest(doNs, guildId, userId) {
  const res = await doFetch(doNs, guildId, 'POST', '/members/leave-request', { userId })
  return res.json()
}

export async function memberApproveLeave(doNs, guildId, userId, confiscate) {
  const res = await doFetch(doNs, guildId, 'POST', '/members/approve-leave', { userId, confiscate })
  return res.json()
}

export async function memberRejectLeave(doNs, guildId, userId) {
  const res = await doFetch(doNs, guildId, 'POST', '/members/reject-leave', { userId })
  return res.json()
}

export async function memberStatus(doNs, guildId) {
  const res = await doFetch(doNs, guildId, 'GET', '/members/status')
  return res.json()
}

export async function grantCoins(doNs, guildId, userId, amount) {
  const res = await doFetch(doNs, guildId, 'POST', '/bank/grant', { userId, amount })
  return res.json()
}

export async function revokeCoins(doNs, guildId, userId, amount) {
  const res = await doFetch(doNs, guildId, 'POST', '/bank/revoke', { userId, amount })
  return res.json()
}

export async function playSlot(doNs, guildId, userId, bet) {
  const res = await doFetch(doNs, guildId, 'POST', '/slot/play', { userId, bet })
  return res.json()
}

export async function getMember(doNs, guildId, userId) {
  const res = await doFetch(doNs, guildId, 'GET', `/members/get/${userId}`)
  return res.json()
}

// --- Janken ---
export async function jankenEscrow(doNs, guildId, challengerId, targetId, amount) {
  const res = await doFetch(doNs, guildId, 'POST', '/janken/escrow', { challengerId, targetId, amount })
  return res.json()
}

export async function jankenPayout(doNs, guildId, challengerId, targetId, amount, winnerId) {
  const res = await doFetch(doNs, guildId, 'POST', '/janken/payout', { challengerId, targetId, amount, winnerId })
  return res.json()
}
