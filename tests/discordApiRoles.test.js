import { addMemberRole, removeMemberRole } from '../src/utils/discordApi.js'

let fetchCalls = []
const originalFetch = globalThis.fetch

beforeEach(() => {
  fetchCalls = []
  globalThis.fetch = async (url, opts) => {
    fetchCalls.push({ url, opts })
    return new Response('', {
      status: 200,
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
