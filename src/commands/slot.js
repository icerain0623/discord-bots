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
    return { type: 4, data: { content } } // public, visible to everyone
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
