import { getUserId, getDisplayName } from '../utils/interactionHelpers.js'
import { getMember, getBalance } from '../utils/economyStore.js'
import { createSession, getSession } from '../utils/jankenStore.js'

const EPHEMERAL = 64
const MIN_BET = 10
const MAX_BET = 5000

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

export async function handleJanken(interaction, env, ctx) {
  const doNs = env.ECONOMY_DO
  const kv = env.SESSION_KV
  const guildId = interaction.guild_id
  const userId = getUserId(interaction)
  const { sub, options } = getSubcommand(interaction)

  if (sub !== 'challenge') return ephemeralMsg('不明なサブコマンドです。')

  const targetId = options.user
  const bet = options.bet

  // Validation
  if (bet < MIN_BET || bet > MAX_BET) {
    return ephemeralMsg(`賭け金は ${MIN_BET}〜${MAX_BET} 肩書コインの間で指定してください。`)
  }
  if (targetId === userId) {
    return ephemeralMsg('自分自身には挑戦できません。')
  }

  // Check challenger is member
  const challenger = await getMember(doNs, guildId, userId)
  if (!challenger || challenger.active !== 1) {
    return ephemeralMsg('この機能を使うには `/economy join` で参加してください。')
  }

  // Check target is member
  const target = await getMember(doNs, guildId, targetId)
  if (!target || target.active !== 1) {
    return ephemeralMsg('相手は肩書コイン経済に参加していません。')
  }

  // Check challenger balance
  const challengerBal = await getBalance(doNs, guildId, userId)
  if (challengerBal.amount < bet) {
    return ephemeralMsg(`残高が不足しています（必要: ${bet}、所持: ${challengerBal.amount}）。`)
  }

  // Check target balance
  const targetBal = await getBalance(doNs, guildId, targetId)
  if (targetBal.amount < bet) {
    return ephemeralMsg(`相手の残高が不足しています（必要: ${bet}、相手所持: ${targetBal.amount}）。`)
  }

  // Check no pending session
  const existing = await getSession(kv, guildId, userId)
  if (existing) {
    return ephemeralMsg('既に進行中のじゃんけんがあります。')
  }

  // Return deferred response (type 5) and do work in waitUntil
  if (ctx) {
    ctx.waitUntil(startChallenge(kv, guildId, userId, targetId, bet, interaction, env))
  }
  return { type: 5, data: {} }
}

async function startChallenge(kv, guildId, challengerId, targetId, bet, interaction, env) {
  const { sendFollowupMessage } = await import('../utils/discordApi.js')
  const applicationId = interaction.application_id
  const interactionToken = interaction.token

  // Post challenge message as follow-up (public)
  const res = await sendFollowupMessage(applicationId, interactionToken, {
    content:
      `🎌 **じゃんけん勝負！**\n` +
      `<@${challengerId}> が <@${targetId}> に挑戦！\n` +
      `賭け金: **${bet.toLocaleString()} 肩書コイン**\n\n` +
      `残り時間: 5分`,
    components: [{
      type: 1,
      components: [
        { type: 2, custom_id: `janken_accept_${challengerId}`, label: '受ける', style: 3 },
        { type: 2, custom_id: `janken_reject_${challengerId}`, label: '拒否する', style: 4 },
      ],
    }],
    allowed_mentions: { users: [targetId] },
  })

  // sendFollowupMessage does not return the response, so messageId stays null
  let messageId = null
  let channelId = interaction.channel_id
  if (res && typeof res.json === 'function') {
    try {
      const msg = await res.json()
      messageId = msg.id
      channelId = msg.channel_id ?? channelId
    } catch (_e) {}
  }

  // Save session
  await createSession(kv, guildId, challengerId, {
    messageId,
    channelId,
    challengerId,
    targetId,
    bet,
    status: 'pending',
    choices: {
      [challengerId]: null,
      [targetId]: null,
    },
    createdAt: new Date().toISOString(),
  })
}
