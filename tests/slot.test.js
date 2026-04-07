import { describe, test, expect } from '@jest/globals'
import { handleSlot } from '../src/commands/slot.js'

// ---------------------------------------------------------------------------
// Mock DO namespace factory
// ---------------------------------------------------------------------------

function createMockDO(fixedResult) {
  return {
    idFromName: (_name) => 'mock-id',
    get: (_id) => ({
      async fetch(request) {
        await request.json()
        // Return fixed result for /slot/play, including the bet for validation
        if (request.url.includes('/slot/play')) {
          return Response.json(fixedResult)
        }
        return Response.json({ error: 'unexpected call' })
      },
    }),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInteraction(sub, options = []) {
  return {
    guild_id: 'g1',
    member: {
      permissions: '0',
      user: { id: 'u1', global_name: 'User1' },
    },
    data: {
      name: 'slot',
      options: [{ name: sub, type: 1, options }],
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleSlot', () => {
  describe('play subcommand', () => {
    test('returns public message with slot display on miss (multiplier 0)', async () => {
      const fixedResult = { ok: true, reels: ['🍒', '🍒', '🍋'], multiplier: 0, payout: 0, balance: 90 }
      const env = { ECONOMY_DO: createMockDO(fixedResult) }
      const interaction = makeInteraction('play', [{ name: 'bet', value: 10 }])

      const result = await handleSlot(interaction, env)

      // Public response (no ephemeral flags)
      expect(result.type).toBe(4)
      expect(result.data.flags).toBeUndefined()

      // Slot display with reels
      expect(result.data.content).toContain('🎰')
      expect(result.data.content).toContain('🍒')
      expect(result.data.content).toContain('🍋')

      // Miss label
      expect(result.data.content).toContain('ハズレ')
      expect(result.data.content).toContain('10')

      // Balance shown
      expect(result.data.content).toContain('90')
    })

    test('shows 2つ揃い display when multiplier is 1', async () => {
      const fixedResult = { ok: true, reels: ['🍒', '🍒', '🍋'], multiplier: 1, payout: 10, balance: 100 }
      const env = { ECONOMY_DO: createMockDO(fixedResult) }
      const interaction = makeInteraction('play', [{ name: 'bet', value: 10 }])

      const result = await handleSlot(interaction, env)

      expect(result.type).toBe(4)
      expect(result.data.flags).toBeUndefined()
      expect(result.data.content).toContain('2つ揃い')
      expect(result.data.content).toContain('±0')
    })

    test('shows 3つ揃い display when multiplier >= 2', async () => {
      const fixedResult = { ok: true, reels: ['🍒', '🍒', '🍒'], multiplier: 2, payout: 20, balance: 110 }
      const env = { ECONOMY_DO: createMockDO(fixedResult) }
      const interaction = makeInteraction('play', [{ name: 'bet', value: 10 }])

      const result = await handleSlot(interaction, env)

      expect(result.type).toBe(4)
      expect(result.data.flags).toBeUndefined()
      expect(result.data.content).toContain('3つ揃い')
      expect(result.data.content).toContain('x2')
      expect(result.data.content).toContain('🎉')
    })

    test('returns ephemeral error when DO returns an error field', async () => {
      const fixedResult = { error: '残高が不足しています。' }
      const env = { ECONOMY_DO: createMockDO(fixedResult) }
      const interaction = makeInteraction('play', [{ name: 'bet', value: 10 }])

      const result = await handleSlot(interaction, env)

      expect(result.type).toBe(4)
      expect(result.data.flags).toBe(64)
      expect(result.data.content).toContain('残高が不足しています。')
    })
  })

  describe('rules subcommand', () => {
    test('returns ephemeral payout table', async () => {
      const env = { ECONOMY_DO: createMockDO({}) }
      const interaction = makeInteraction('rules')

      const result = await handleSlot(interaction, env)

      expect(result.type).toBe(4)
      expect(result.data.flags).toBe(64)
      expect(result.data.content).toContain('配当表')
      expect(result.data.content).toContain('💎💎💎')
      expect(result.data.content).toContain('x50')
      expect(result.data.content).toContain('最低賭け金')
      expect(result.data.content).toContain('最大賭け金')
    })
  })

  describe('unknown subcommand', () => {
    test('returns ephemeral error for unknown subcommand', async () => {
      const env = { ECONOMY_DO: createMockDO({}) }
      const interaction = makeInteraction('unknown')

      const result = await handleSlot(interaction, env)

      expect(result.type).toBe(4)
      expect(result.data.flags).toBe(64)
      expect(result.data.content).toContain('不明なサブコマンドです')
    })
  })
})
