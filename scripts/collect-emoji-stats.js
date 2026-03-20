import 'dotenv/config'
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { execSync } from 'child_process'
import {
  getTextChannels,
  getForumChannels,
  getForumThreads,
  getAllMessagesSince,
} from '../src/utils/discordApi.js'
import { countEmojis } from '../src/utils/emojiCounter.js'
import { getISOWeekKey } from '../src/utils/weekUtils.js'

const DISCORD_TOKEN = process.env.DISCORD_TOKEN
const GUILD_ID = process.env.GUILD_ID
const KV_KEY = 'emoji-stats'

if (!DISCORD_TOKEN || !GUILD_ID) {
  console.error('DISCORD_TOKEN と GUILD_ID を .env に設定してください')
  process.exit(1)
}

// wrangler.toml から KV namespace ID を読み取る
function getKvNamespaceId() {
  const toml = readFileSync('wrangler.toml', 'utf-8')
  const match = toml.match(/\[\[kv_namespaces\]\][^[]*?id\s*=\s*"([^"]+)"/s)
  if (!match) throw new Error('wrangler.toml に KV namespace ID が見つかりません')
  return match[1]
}

const KV_NAMESPACE_ID = getKvNamespaceId()

// KV からデータを読み取り（既存データがあれば）
function kvGet(key) {
  try {
    const result = execSync(
      `npx wrangler kv key get "${key}" --namespace-id="${KV_NAMESPACE_ID}" --remote`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    )
    return JSON.parse(result)
  } catch {
    return null
  }
}

// KV にデータを書き込み
function kvPut(key, value) {
  const tmpFile = `.tmp-kv-${key}.json`
  writeFileSync(tmpFile, JSON.stringify(value))
  try {
    execSync(
      `npx wrangler kv key put "${key}" --namespace-id="${KV_NAMESPACE_ID}" --path="${tmpFile}" --remote`,
      { stdio: 'inherit' }
    )
  } finally {
    unlinkSync(tmpFile)
  }
}

// メッセージを週別に振り分けて絵文字カウント
function countByWeek(messages) {
  const weekBuckets = {}
  for (const msg of messages) {
    const weekKey = getISOWeekKey(new Date(msg.timestamp))
    if (!weekBuckets[weekKey]) weekBuckets[weekKey] = []
    weekBuckets[weekKey].push(msg)
  }

  const result = {}
  for (const [weekKey, msgs] of Object.entries(weekBuckets)) {
    result[weekKey] = {
      counts: countEmojis(msgs),
      messageCount: msgs.length,
    }
  }
  return result
}

// 週データをマージ（既存データに新データを加算）
function mergeWeekData(existing, incoming) {
  const merged = { ...existing }
  for (const [weekKey, data] of Object.entries(incoming)) {
    if (!merged[weekKey]) {
      merged[weekKey] = data
    } else {
      const m = merged[weekKey]
      for (const [emoji, count] of Object.entries(data.counts)) {
        m.counts[emoji] = (m.counts[emoji] || 0) + count
      }
      m.messageCount += data.messageCount
    }
  }
  return merged
}

// タイムスタンプから Discord Snowflake ID を生成（after パラメータ用）
// Discord Epoch: 2015-01-01T00:00:00Z = 1420070400000
function timestampToSnowflake(isoTimestamp) {
  const ms = new Date(isoTimestamp).getTime()
  return String((BigInt(ms) - 1420070400000n) << 22n)
}

// チャンネル/スレッドリストから全メッセージを取得
async function fetchMessages(sources, lastRun) {
  const afterId = lastRun ? timestampToSnowflake(lastRun) : null
  const allMessages = []
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i]
    console.log(`  [${i + 1}/${sources.length}] #${source.name || source.id}`)
    const messages = await getAllMessagesSince(source.id, DISCORD_TOKEN, afterId)
    allMessages.push(...messages)
  }
  return allMessages
}

// メイン実行
console.log('絵文字統計の収集を開始します...')

const existing = kvGet(KV_KEY)
const lastRun = existing?.lastRun || null

console.log(lastRun ? `前回の続きから取得 (since: ${lastRun})` : '初回: 全メッセージを取得')

// テキストチャンネル
const textChannels = await getTextChannels(GUILD_ID, DISCORD_TOKEN)
console.log(`\nテキストチャンネル: ${textChannels.length}件`)
const channelMessages = await fetchMessages(textChannels, lastRun)
console.log(`取得メッセージ: ${channelMessages.length}件`)

// フォーラムスレッド
const forumChannels = await getForumChannels(GUILD_ID, DISCORD_TOKEN)
const forumThreads = await getForumThreads(GUILD_ID, forumChannels, DISCORD_TOKEN)
console.log(`\nフォーラムスレッド: ${forumThreads.length}件`)
const forumMessages = await fetchMessages(forumThreads, lastRun)
console.log(`取得メッセージ: ${forumMessages.length}件`)

// 合算
const allMessages = [...channelMessages, ...forumMessages]
console.log(`\n合計メッセージ: ${allMessages.length}件`)

if (allMessages.length === 0 && existing) {
  console.log('新しいメッセージはありません')
} else {
  const newWeekData = countByWeek(allMessages)
  const sourceCount = textChannels.length + forumThreads.length

  for (const data of Object.values(newWeekData)) {
    data.channelCount = sourceCount
  }

  const mergedWeeks = mergeWeekData(existing?.weeks || {}, newWeekData)

  for (const data of Object.values(mergedWeeks)) {
    data.channelCount = sourceCount
  }

  const kvData = {
    weeks: mergedWeeks,
    lastRun: new Date().toISOString(),
  }

  kvPut(KV_KEY, kvData)
  console.log(`KV に書き込み完了: ${KV_KEY}`)
}

console.log('\n完了!')
