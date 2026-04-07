import { handleButton } from '../src/interactions/buttons.js'

function createMockDO() {
  return {
    idFromName(name) { return `id:${name}` },
    get(_id) {
      return {
        async fetch(request) {
          const url = new URL(request.url)
          if (url.pathname === '/members/approve-leave') return Response.json({ ok: true })
          if (url.pathname === '/members/reject-leave') return Response.json({ ok: true })
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
      status: 200,
      headers: { 'Content-Type': 'application/json', 'x-ratelimit-remaining': '10' },
    })
  }
})

afterEach(() => { globalThis.fetch = originalFetch })

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
