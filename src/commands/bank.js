import { getUserId } from '../utils/interactionHelpers.js'
import {
  getBalance, sendCoins, getHistory, getRanking, claimDaily, getMember,
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
  janken_bet: 'じゃんけん賭け',
  janken_win: 'じゃんけん勝利',
  janken_refund: 'じゃんけん引き分け',
}

export async function handleBank(interaction, env) {
  const doNs = env.ECONOMY_DO
  const guildId = interaction.guild_id
  const userId = getUserId(interaction)
  const { sub, options } = getSubcommand(interaction)

  if (sub !== 'ranking') {
    const member = await getMember(doNs, guildId, userId)
    if (!member || member.active !== 1) {
      return ephemeralMsg('この機能を使うには `/economy join` で参加してください。')
    }
  }

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
    return { type: 4, data: { content } } // public, not ephemeral
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
