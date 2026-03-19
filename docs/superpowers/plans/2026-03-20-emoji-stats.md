# Emoji Stats Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/emoji-stats` slash command that shows a Top 10 emoji ranking for the past 7 days across all text channels.

**Architecture:** Deferred response pattern using `ctx.waitUntil()` on Cloudflare Workers. Discord REST API fetches messages with pagination (100/request, max 10 pages/channel) in parallel batches of 5 channels. Emoji counting logic extracts both Unicode and custom emojis from message content plus reaction counts.

**Tech Stack:** JavaScript (ESM), Cloudflare Workers, Discord REST API v10, Jest

**Spec:** `docs/superpowers/specs/2026-03-20-emoji-stats-design.md`

---

### Task 1: Emoji Counter — Unicode emoji extraction

**Files:**
- Create: `src/utils/emojiCounter.js`
- Create: `tests/emojiCounter.test.js`

- [ ] **Step 1: Write failing test for Unicode emoji extraction**

```js
// tests/emojiCounter.test.js
import { extractEmojisFromText } from '../src/utils/emojiCounter.js'

describe('extractEmojisFromText', () => {
  test('Unicode 絵文字を抽出する', () => {
    const result = extractEmojisFromText('こんにちは😂🔥🔥')
    expect(result).toEqual({ '😂': 1, '🔥': 2 })
  })

  test('絵文字がない場合は空オブジェクトを返す', () => {
    const result = extractEmojisFromText('hello world')
    expect(result).toEqual({})
  })

  test('空文字列は空オブジェクトを返す', () => {
    const result = extractEmojisFromText('')
    expect(result).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/emojiCounter.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement extractEmojisFromText**

```js
// src/utils/emojiCounter.js

// Unicode emoji regex covering common emoji ranges
// Known limitation: may miss some ZWJ sequences and flag emojis
const UNICODE_EMOJI_RE = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu

export function extractEmojisFromText(text) {
  const counts = {}
  if (!text) return counts

  const matches = text.match(UNICODE_EMOJI_RE)
  if (!matches) return counts

  for (const emoji of matches) {
    counts[emoji] = (counts[emoji] || 0) + 1
  }
  return counts
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/emojiCounter.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/emojiCounter.js tests/emojiCounter.test.js
git commit -m "feat: add Unicode emoji extraction from text"
```

---

### Task 2: Emoji Counter — Custom emoji extraction

**Files:**
- Modify: `src/utils/emojiCounter.js`
- Modify: `tests/emojiCounter.test.js`

- [ ] **Step 1: Write failing test for custom emoji extraction**

Add to `tests/emojiCounter.test.js`:

```js
describe('extractEmojisFromText — custom emojis', () => {
  test('カスタム絵文字を抽出する', () => {
    const result = extractEmojisFromText('これは <:kusa:123456> だね <:kusa:123456>')
    expect(result).toEqual({ '<:kusa:123456>': 2 })
  })

  test('アニメーション絵文字を抽出する', () => {
    const result = extractEmojisFromText('動く <a:parrot:789>')
    expect(result).toEqual({ '<a:parrot:789>': 1 })
  })

  test('Unicode とカスタムの両方を抽出する', () => {
    const result = extractEmojisFromText('😂 <:kusa:123>')
    expect(result).toEqual({ '😂': 1, '<:kusa:123>': 1 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/emojiCounter.test.js`
Expected: FAIL — custom emoji counts not returned

- [ ] **Step 3: Add custom emoji extraction to extractEmojisFromText**

Update `src/utils/emojiCounter.js`:

```js
const UNICODE_EMOJI_RE = /(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})/gu
const CUSTOM_EMOJI_RE = /<a?:\w+:\d+>/g

export function extractEmojisFromText(text) {
  const counts = {}
  if (!text) return counts

  // Custom emojis first (remove them before Unicode scan to avoid partial matches)
  const customMatches = text.match(CUSTOM_EMOJI_RE)
  if (customMatches) {
    for (const emoji of customMatches) {
      counts[emoji] = (counts[emoji] || 0) + 1
    }
  }

  // Remove custom emojis from text before Unicode scan
  const textWithoutCustom = text.replace(CUSTOM_EMOJI_RE, '')
  const unicodeMatches = textWithoutCustom.match(UNICODE_EMOJI_RE)
  if (unicodeMatches) {
    for (const emoji of unicodeMatches) {
      counts[emoji] = (counts[emoji] || 0) + 1
    }
  }

  return counts
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/emojiCounter.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/emojiCounter.js tests/emojiCounter.test.js
git commit -m "feat: add custom emoji extraction"
```

---

### Task 3: Emoji Counter — Reaction counting and message aggregation

**Files:**
- Modify: `src/utils/emojiCounter.js`
- Modify: `tests/emojiCounter.test.js`

- [ ] **Step 1: Write failing tests for countReactions and countEmojis**

Add to `tests/emojiCounter.test.js`:

```js
import { extractEmojisFromText, countReactions, countEmojis } from '../src/utils/emojiCounter.js'

describe('countReactions', () => {
  test('リアクションをカウントする', () => {
    const reactions = [
      { emoji: { name: '😂', id: null }, count: 5 },
      { emoji: { name: 'kusa', id: '123456' }, count: 3 },
    ]
    const result = countReactions(reactions)
    expect(result).toEqual({ '😂': 5, '<:kusa:123456>': 3 })
  })

  test('リアクションが空の場合は空オブジェクトを返す', () => {
    expect(countReactions(undefined)).toEqual({})
    expect(countReactions([])).toEqual({})
  })

  test('アニメーション絵文字のリアクション', () => {
    const reactions = [
      { emoji: { name: 'parrot', id: '789', animated: true }, count: 2 },
    ]
    const result = countReactions(reactions)
    expect(result).toEqual({ '<a:parrot:789>': 2 })
  })
})

describe('countEmojis', () => {
  test('メッセージ内絵文字とリアクションを合算する', () => {
    const messages = [
      {
        content: '😂😂',
        reactions: [{ emoji: { name: '😂', id: null }, count: 3 }],
        author: { bot: false },
      },
    ]
    const result = countEmojis(messages)
    expect(result).toEqual({ '😂': 5 })
  })

  test('Bot のメッセージは除外する', () => {
    const messages = [
      { content: '😂', reactions: [], author: { bot: true } },
      { content: '🔥', reactions: [], author: { bot: false } },
    ]
    const result = countEmojis(messages)
    expect(result).toEqual({ '🔥': 1 })
  })

  test('空の配列は空オブジェクトを返す', () => {
    expect(countEmojis([])).toEqual({})
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/emojiCounter.test.js`
Expected: FAIL — countReactions and countEmojis not defined

- [ ] **Step 3: Implement countReactions and countEmojis**

Add to `src/utils/emojiCounter.js`:

```js
export function countReactions(reactions) {
  const counts = {}
  if (!reactions || reactions.length === 0) return counts

  for (const r of reactions) {
    const emoji = r.emoji
    let key
    if (emoji.id) {
      const prefix = emoji.animated ? '<a:' : '<:'
      key = `${prefix}${emoji.name}:${emoji.id}>`
    } else {
      key = emoji.name
    }
    counts[key] = (counts[key] || 0) + r.count
  }
  return counts
}

function mergeCounts(target, source) {
  for (const [key, count] of Object.entries(source)) {
    target[key] = (target[key] || 0) + count
  }
}

export function countEmojis(messages) {
  const total = {}

  for (const msg of messages) {
    if (msg.author?.bot) continue

    mergeCounts(total, extractEmojisFromText(msg.content))
    mergeCounts(total, countReactions(msg.reactions))
  }

  return total
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/emojiCounter.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/emojiCounter.js tests/emojiCounter.test.js
git commit -m "feat: add reaction counting and message aggregation"
```

---

### Task 4: Format Emoji Stats

**Files:**
- Create: `src/utils/formatEmojiStats.js`
- Create: `tests/formatEmojiStats.test.js`

- [ ] **Step 1: Write failing test**

```js
// tests/formatEmojiStats.test.js
import { formatEmojiStats } from '../src/utils/formatEmojiStats.js'

describe('formatEmojiStats', () => {
  test('Top 10 ランキングを Embed 形式で返す', () => {
    const counts = { '😂': 128, '🔥': 95, '❤️': 72 }
    const result = formatEmojiStats(counts, { channelCount: 20, messageCount: 3456 })
    expect(result.title).toBe('📊 絵文字ランキング（過去7日間）')
    expect(result.description).toContain('🥇 😂 × 128')
    expect(result.description).toContain('🥈 🔥 × 95')
    expect(result.description).toContain('🥉 ❤️ × 72')
    expect(result.footer.text).toContain('20チャンネル')
    expect(result.footer.text).toContain('3,456メッセージ')
  })

  test('10件を超える場合は Top 10 のみ表示', () => {
    const counts = {}
    for (let i = 0; i < 15; i++) {
      counts[`emoji${i}`] = 100 - i
    }
    const result = formatEmojiStats(counts, { channelCount: 1, messageCount: 100 })
    const lines = result.description.split('\n').filter(l => l.trim())
    expect(lines).toHaveLength(10)
  })

  test('絵文字がない場合はメッセージを表示', () => {
    const result = formatEmojiStats({}, { channelCount: 5, messageCount: 50 })
    expect(result.description).toContain('絵文字が見つかりませんでした')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/formatEmojiStats.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement formatEmojiStats**

```js
// src/utils/formatEmojiStats.js
const MEDALS = ['🥇', '🥈', '🥉']

export function formatEmojiStats(counts, { channelCount, messageCount }) {
  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)

  let description
  if (sorted.length === 0) {
    description = '絵文字が見つかりませんでした'
  } else {
    description = sorted
      .map(([emoji, count], i) => {
        const rank = i < 3 ? MEDALS[i] : `${i + 1}.`
        return `${rank} ${emoji} × ${count.toLocaleString()}`
      })
      .join('\n')
  }

  return {
    title: '📊 絵文字ランキング（過去7日間）',
    description,
    color: 0x5865f2,
    footer: {
      text: `集計対象: ${channelCount}チャンネル / ${messageCount.toLocaleString()}メッセージ`,
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/formatEmojiStats.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/formatEmojiStats.js tests/formatEmojiStats.test.js
git commit -m "feat: add emoji stats ranking formatter"
```

---

### Task 5: Discord API utility

**Files:**
- Create: `src/utils/discordApi.js`
- Create: `tests/discordApi.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/discordApi.test.js
import { getTextChannels, getAllMessages, fetchAllChannelMessages, sendFollowup } from '../src/utils/discordApi.js'

// Mock global fetch
const mockFetch = (responses) => {
  let callIndex = 0
  globalThis.fetch = async (url, options) => {
    const res = responses[callIndex] ?? responses[responses.length - 1]
    callIndex++
    return res
  }
}

const jsonResponse = (data, status = 200, headers = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
  headers: new Map(Object.entries({
    'x-ratelimit-remaining': '10',
    'x-ratelimit-reset-after': '0',
    ...headers,
  })),
})

const TOKEN = 'test-token'

afterEach(() => {
  delete globalThis.fetch
})

describe('getTextChannels', () => {
  test('テキストチャンネルのみ返す', async () => {
    mockFetch([
      jsonResponse([
        { id: '1', type: 0, name: 'general' },       // text
        { id: '2', type: 2, name: 'voice' },          // voice
        { id: '3', type: 0, name: 'random' },         // text
        { id: '4', type: 5, name: 'announcements' },  // announcement (also text-based)
      ]),
    ])
    const channels = await getTextChannels('guild1', TOKEN)
    expect(channels.map(c => c.id)).toEqual(['1', '3'])
  })
})

describe('getAllMessages', () => {
  test('7日以内のメッセージを取得する', async () => {
    const now = new Date()
    const recent = new Date(now - 1000 * 60 * 60).toISOString() // 1 hour ago
    mockFetch([
      jsonResponse([
        { id: '100', content: 'hi', timestamp: recent, author: { bot: false } },
      ]),
      jsonResponse([]), // empty page = stop
    ])
    const messages = await getAllMessages('ch1', TOKEN)
    expect(messages).toHaveLength(1)
  })

  test('403 エラーの場合は空配列を返す', async () => {
    mockFetch([jsonResponse(null, 403)])
    const messages = await getAllMessages('ch1', TOKEN)
    expect(messages).toEqual([])
  })
})

describe('sendFollowup', () => {
  test('webhook URL に Authorization ヘッダーなしで送信する', async () => {
    let capturedUrl, capturedHeaders, capturedBody
    globalThis.fetch = async (url, options) => {
      capturedUrl = url
      capturedHeaders = options.headers
      capturedBody = JSON.parse(options.body)
      return jsonResponse({ id: 'msg1' })
    }
    await sendFollowup('app1', 'token1', { title: 'test' })
    expect(capturedUrl).toBe('https://discord.com/api/v10/webhooks/app1/token1')
    expect(capturedHeaders.Authorization).toBeUndefined()
    expect(capturedBody.embeds[0].title).toBe('test')
  })
})

describe('fetchAllChannelMessages', () => {
  test('5チャンネルずつバッチで並列取得する', async () => {
    const now = new Date()
    const recent = new Date(now - 1000 * 60 * 60).toISOString()
    const calledUrls = []
    globalThis.fetch = async (url, options) => {
      calledUrls.push(url)
      if (url.includes('/messages')) {
        return jsonResponse([
          { id: '1', content: 'hi', timestamp: recent, author: { bot: false } },
        ])
      }
      return jsonResponse([])
    }
    const channels = Array.from({ length: 7 }, (_, i) => ({ id: `ch${i}` }))
    const { fetchAllChannelMessages } = await import('../src/utils/discordApi.js')
    const messages = await fetchAllChannelMessages(channels, TOKEN)
    expect(messages).toHaveLength(7)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/discordApi.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement discordApi.js**

```js
// src/utils/discordApi.js
const API_BASE = 'https://discord.com/api/v10'
const MAX_PAGES_PER_CHANNEL = 10
const BATCH_SIZE = 5

async function discordFetch(path, token, options = {}) {
  const { headers: extraHeaders, ...restOptions } = options
  const headers = { 'Content-Type': 'application/json', ...extraHeaders }
  if (token) headers.Authorization = `Bot ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...restOptions,
  })

  // Rate limit handling
  const remaining = res.headers.get('x-ratelimit-remaining')
  if (remaining === '0') {
    const retryAfter = parseFloat(res.headers.get('x-ratelimit-reset-after') || '1')
    await new Promise(r => setTimeout(r, retryAfter * 1000))
  }

  return res
}

export async function getTextChannels(guildId, token) {
  const res = await discordFetch(`/guilds/${guildId}/channels`, token)
  if (!res.ok) return []
  const channels = await res.json()
  // type 0 = GUILD_TEXT
  return channels.filter(ch => ch.type === 0)
}

export async function getAllMessages(channelId, token) {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const allMessages = []
  let before = null

  for (let page = 0; page < MAX_PAGES_PER_CHANNEL; page++) {
    const params = new URLSearchParams({ limit: '100' })
    if (before) params.set('before', before)

    const res = await discordFetch(`/channels/${channelId}/messages?${params}`, token)
    if (!res.ok) return allMessages // 403 etc → return what we have

    const messages = await res.json()
    if (messages.length === 0) break

    for (const msg of messages) {
      if (new Date(msg.timestamp).getTime() < sevenDaysAgo) {
        return allMessages // reached messages older than 7 days
      }
      allMessages.push(msg)
    }

    before = messages[messages.length - 1].id
    if (messages.length < 100) break // no more pages
  }

  return allMessages
}

export async function fetchAllChannelMessages(channels, token) {
  const allMessages = []

  // Process in batches of BATCH_SIZE
  for (let i = 0; i < channels.length; i += BATCH_SIZE) {
    const batch = channels.slice(i, i + BATCH_SIZE)
    const results = await Promise.all(
      batch.map(ch => getAllMessages(ch.id, token))
    )
    for (const messages of results) {
      allMessages.push(...messages)
    }
  }

  return allMessages
}

export async function sendFollowup(applicationId, interactionToken, embed) {
  await discordFetch(`/webhooks/${applicationId}/${interactionToken}`, null, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/discordApi.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/discordApi.js tests/discordApi.test.js
git commit -m "feat: add Discord API utility for channel/message fetching"
```

---

### Task 6: Emoji Stats command handler

**Files:**
- Create: `src/commands/emojiStats.js`

- [ ] **Step 1: Create the command handler**

```js
// src/commands/emojiStats.js
import { getTextChannels, fetchAllChannelMessages, sendFollowup } from '../utils/discordApi.js'
import { countEmojis } from '../utils/emojiCounter.js'
import { formatEmojiStats } from '../utils/formatEmojiStats.js'

export async function collectAndRespond(interaction, env) {
  const guildId = interaction.guild_id
  const applicationId = env.CLIENT_ID
  const token = env.DISCORD_TOKEN
  const interactionToken = interaction.token

  try {
    const channels = await getTextChannels(guildId, token)
    const messages = await fetchAllChannelMessages(channels, token)
    const counts = countEmojis(messages)
    const embed = formatEmojiStats(counts, {
      channelCount: channels.length,
      messageCount: messages.length,
    })

    await sendFollowup(applicationId, interactionToken, embed)
  } catch (err) {
    console.error('emoji-stats error:', err)
    await sendFollowup(applicationId, interactionToken, {
      title: 'エラー',
      description: '絵文字の集計中にエラーが発生しました。',
      color: 0xed4245,
    })
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/emojiStats.js
git commit -m "feat: add emoji-stats command handler"
```

---

### Task 7: Wire up worker.js

**Files:**
- Modify: `src/worker.js:1-56`

- [ ] **Step 1: Add ctx parameter and emoji-stats routing**

Changes to `src/worker.js`:

1. Add import at top:
```js
import { collectAndRespond as emojiStatsCollect } from './commands/emojiStats.js'
```

2. Change `async fetch(request, env)` to `async fetch(request, env, ctx)`

3. Add routing for `emoji-stats` command inside the `try` block, before the `else if (interaction.type === InteractionType.MESSAGE_COMPONENT)` branch:

```js
      } else if (
        interaction.type === InteractionType.APPLICATION_COMMAND &&
        interaction.data?.name === 'emoji-stats'
      ) {
        ctx.waitUntil(emojiStatsCollect(interaction, env))
        return Response.json({ type: 5 })  // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
```

- [ ] **Step 2: Run lint to verify**

Run: `npx eslint src/worker.js`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/worker.js
git commit -m "feat: wire emoji-stats command into worker routing"
```

---

### Task 8: Register slash command

**Files:**
- Modify: `src/deploy-commands.js:1-17`

- [ ] **Step 1: Add emoji-stats command registration**

Add to the `commands` array in `src/deploy-commands.js`:

```js
  new SlashCommandBuilder()
    .setName('emoji-stats')
    .setDescription('過去7日間の絵文字ランキングを表示します')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
```

Also add `PermissionFlagsBits` to the import:

```js
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js'
```

- [ ] **Step 2: Commit**

```bash
git add src/deploy-commands.js
git commit -m "feat: register emoji-stats slash command with ManageGuild permission"
```

---

### Task 9: Run all tests and lint

**Files:** None (verification only)

- [ ] **Step 1: Run lint**

Run: `npx eslint src/ tests/`
Expected: No errors

- [ ] **Step 2: Run all tests**

Run: `node --experimental-vm-modules node_modules/.bin/jest`
Expected: All tests pass

- [ ] **Step 3: Fix any issues found**

If lint or tests fail, fix the issues and re-run.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: address lint/test issues"
```

---

### Task 10: Deploy and register command

**Files:** None (deployment only)

- [ ] **Step 1: Register the slash command with Discord**

Run: `npm run deploy`
Expected: `✅ スラッシュコマンドを登録しました`

- [ ] **Step 2: Deploy to Cloudflare Workers**

Run: `npm run publish`
Expected: Successful deployment

- [ ] **Step 3: Test in Discord**

Run `/emoji-stats` in the Discord server and verify:
- Deferred response appears ("Bot is thinking...")
- Emoji ranking embed is posted within ~10-30 seconds
- Ranking shows correct emojis with counts
- Footer shows channel count and message count
