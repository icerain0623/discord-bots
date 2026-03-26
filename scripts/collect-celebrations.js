import 'dotenv/config'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import {
  getTextChannels,
  getAllMessagesSince,
  postMessage,
} from '../src/utils/discordApi.js'

const DISCORD_TOKEN = process.env.DISCORD_TOKEN
const GUILD_ID = process.env.GUILD_ID
const CELEBRATION_CHANNEL_ID = process.env.CELEBRATION_CHANNEL_ID
const CELEBRATION_KEYWORDS = (process.env.CELEBRATION_KEYWORDS || '')
  .split(',')
  .map(k => k.trim())
  .filter(Boolean)

if (!DISCORD_TOKEN || !GUILD_ID) {
  console.error('DISCORD_TOKEN と GUILD_ID を .env に設定してください')
  process.exit(1)
}
if (!CELEBRATION_CHANNEL_ID) {
  console.error('CELEBRATION_CHANNEL_ID を .env に設定してください')
  process.exit(1)
}
if (CELEBRATION_KEYWORDS.length === 0) {
  console.error('CELEBRATION_KEYWORDS を .env に設定してください（カンマ区切り）')
  process.exit(1)
}

const STATE_FILE = '.celebration-last-run.json'
const EMBED_COLOR = 0xFFD700

function getLastRun() {
  if (!existsSync(STATE_FILE)) return null
  const data = JSON.parse(readFileSync(STATE_FILE, 'utf-8'))
  return data.lastRun || null
}

function saveLastRun(isoTimestamp) {
  writeFileSync(STATE_FILE, JSON.stringify({ lastRun: isoTimestamp }, null, 2))
}

// タイムスタンプから Discord Snowflake ID を生成
function timestampToSnowflake(isoTimestamp) {
  const ms = new Date(isoTimestamp).getTime()
  return String((BigInt(ms) - 1420070400000n) << 22n)
}

function getAvatarUrl(author) {
  if (!author.avatar) return null
  return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png`
}

function containsKeyword(content) {
  const lower = content.toLowerCase()
  return CELEBRATION_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()))
}

function buildEmbed(msg, channelId) {
  const embed = {
    color: EMBED_COLOR,
    author: {
      name: msg.author.global_name || msg.author.username,
      icon_url: getAvatarUrl(msg.author),
    },
    description: msg.content || '（テキストなし）',
    fields: [
      {
        name: '元メッセージ',
        value: `[リンク](https://discord.com/channels/${GUILD_ID}/${channelId}/${msg.id})`,
        inline: false,
      },
    ],
    timestamp: msg.timestamp,
    footer: {
      text: '自動収集',
    },
  }

  const imageAttachments = (msg.attachments || [])
    .filter(a => a.content_type?.startsWith('image/'))

  if (imageAttachments.length > 0) {
    embed.image = { url: imageAttachments[0].url }
  }

  const payload = { embeds: [embed] }

  if (imageAttachments.length > 1) {
    payload.content = imageAttachments
      .slice(1)
      .map(a => a.url)
      .join('\n')
  }

  return payload
}

// メイン実行
console.log('お祝いメッセージの収集を開始します...')
console.log(`キーワード: ${CELEBRATION_KEYWORDS.join(', ')}`)

const lastRun = getLastRun()

if (!lastRun) {
  console.log('\n初回実行: 現在時刻を起点として記録します')
  saveLastRun(new Date().toISOString())
  console.log(`状態ファイル: ${STATE_FILE}`)
  console.log('完了! 次回実行時から差分を取得します')
  process.exit(0)
}

console.log(`前回実行: ${lastRun}`)

// アーカイブチャンネルを除外して全テキストチャンネルを取得
const textChannels = await getTextChannels(GUILD_ID, DISCORD_TOKEN)
const targetChannels = textChannels.filter(ch => ch.id !== CELEBRATION_CHANNEL_ID)
console.log(`\nスキャン対象チャンネル: ${targetChannels.length}件（アーカイブチャンネルを除外）`)

const afterId = timestampToSnowflake(lastRun)
let matchCount = 0

for (let i = 0; i < targetChannels.length; i++) {
  const ch = targetChannels[i]
  console.log(`  [${i + 1}/${targetChannels.length}] #${ch.name}`)

  const messages = await getAllMessagesSince(ch.id, DISCORD_TOKEN, afterId)

  for (const msg of messages) {
    if (!msg.content || msg.author.bot) continue
    if (!containsKeyword(msg.content)) continue

    matchCount++
    console.log(`    ✨ キーワード検出: "${msg.content.slice(0, 50)}..." by ${msg.author.username}`)

    const payload = buildEmbed(msg, ch.id)
    const res = await postMessage(CELEBRATION_CHANNEL_ID, DISCORD_TOKEN, payload)
    if (!res.ok) {
      console.error(`    ❌ 投稿失敗 (${res.status})`)
    }
  }
}

// 最終実行時刻を更新
saveLastRun(new Date().toISOString())

console.log(`\n完了! ${matchCount}件のお祝いメッセージを投稿しました`)
