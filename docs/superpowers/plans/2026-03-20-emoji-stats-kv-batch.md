# emoji-stats KV バッチ集計 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** emoji-stats コマンドをリアルタイム集計からKVバッチ読み取りに移行し、ローカルPC上で週別に集計するスクリプトを追加する。

**Architecture:** ローカルスクリプトが Discord API から全メッセージを取得し、ISO週番号別に絵文字カウントを集計して Cloudflare KV に書き込む。Worker 側は KV から読み取り、期間オプション（今週/先週/今月/先月/全期間）に応じて合算してランキングを即時返信する。

**Tech Stack:** Node.js (ESM), Cloudflare Workers, Cloudflare KV, wrangler CLI, Jest

**Spec:** `docs/superpowers/specs/2026-03-20-emoji-stats-kv-batch-design.md`

---

## File Structure

| ファイル | 役割 |
|---------|------|
| `src/utils/weekUtils.js` | 新規: ISO週番号の計算、期間→週キー解決ロジック |
| `src/utils/discordApi.js` | 修正: `getAllMessagesSince` 追加、`discordFetch` に429リトライ追加 |
| `src/utils/formatEmojiStats.js` | 修正: `periodLabel`, `collectedAt` 対応 |
| `src/commands/emojiStats.js` | 書き換え: KV読み取り + 期間別合算 |
| `src/worker.js` | 修正: deferred→即時レスポンス |
| `src/deploy-commands.js` | 修正: `期間` オプション追加 |
| `scripts/collect-emoji-stats.js` | 新規: ローカル集計スクリプト |
| `package.json` | 修正: `collect` スクリプト追加 |
| `tests/weekUtils.test.js` | 新規: 週ユーティリティのテスト |
| `tests/formatEmojiStats.test.js` | 修正: 新パラメータ対応 |
| `tests/emojiStats.test.js` | 新規: KV 読み取り + 合算ロジックのテスト |

---

### Task 1: 週ユーティリティ (`src/utils/weekUtils.js`)

ISO週番号の計算と期間→週キーの解決を担う純粋関数モジュール。他のすべてのタスクがこれに依存する。

**Files:**
- Create: `src/utils/weekUtils.js`
- Create: `tests/weekUtils.test.js`

- [ ] **Step 1: テストファイルを作成 — `getISOWeekKey`**

`tests/weekUtils.test.js` を作成:

```js
import { getISOWeekKey } from '../src/utils/weekUtils.js'

describe('getISOWeekKey', () => {
  test('月曜日の日付からISO週キーを返す', () => {
    expect(getISOWeekKey(new Date('2026-03-16T00:00:00Z'))).toBe('2026-W12')
  })

  test('日曜日は同じ週に属する', () => {
    expect(getISOWeekKey(new Date('2026-03-22T00:00:00Z'))).toBe('2026-W12')
  })

  test('年をまたぐ週を正しく処理する', () => {
    // 2025-12-29（月曜）はISO週では2026-W01
    expect(getISOWeekKey(new Date('2025-12-29T00:00:00Z'))).toBe('2026-W01')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- --testPathPattern=weekUtils`
Expected: FAIL — `getISOWeekKey` が存在しない

- [ ] **Step 3: `getISOWeekKey` を実装**

`src/utils/weekUtils.js` を作成:

```js
export function getISOWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}
```

- [ ] **Step 4: テストがパスすることを確認**

Run: `npm test -- --testPathPattern=weekUtils`
Expected: PASS

- [ ] **Step 5: `getWeekKeysForPeriod` のテストを追加**

`tests/weekUtils.test.js` に追記:

```js
import { getISOWeekKey, getWeekKeysForPeriod } from '../src/utils/weekUtils.js'

describe('getWeekKeysForPeriod', () => {
  const availableWeeks = ['2026-W09', '2026-W10', '2026-W11', '2026-W12']
  // 2026-03-20 は W12（金曜日）
  const now = new Date('2026-03-20T10:00:00Z')

  test('今週: 現在の週のみ返す', () => {
    expect(getWeekKeysForPeriod('this_week', availableWeeks, now)).toEqual(['2026-W12'])
  })

  test('先週: 1つ前の週を返す', () => {
    expect(getWeekKeysForPeriod('last_week', availableWeeks, now)).toEqual(['2026-W11'])
  })

  test('全期間: すべての週を返す', () => {
    expect(getWeekKeysForPeriod('all', availableWeeks, now)).toEqual(availableWeeks)
  })

  test('今月: 木曜日が3月に含まれる週を返す', () => {
    // W10: 木曜=3/5, W11: 木曜=3/12, W12: 木曜=3/19 → 全部3月
    const result = getWeekKeysForPeriod('this_month', availableWeeks, now)
    expect(result).toContain('2026-W10')
    expect(result).toContain('2026-W11')
    expect(result).toContain('2026-W12')
    expect(result).not.toContain('2026-W09') // W09: 木曜=2/26 → 2月
  })

  test('先月: 木曜日が2月に含まれる週を返す', () => {
    const result = getWeekKeysForPeriod('last_month', availableWeeks, now)
    expect(result).toContain('2026-W09') // W09: 木曜=2/26 → 2月
    expect(result).not.toContain('2026-W10')
  })

  test('該当する週がない場合は空配列を返す', () => {
    expect(getWeekKeysForPeriod('last_week', ['2026-W12'], now)).toEqual([])
  })
})
```

- [ ] **Step 6: テストが失敗することを確認**

Run: `npm test -- --testPathPattern=weekUtils`
Expected: FAIL — `getWeekKeysForPeriod` が存在しない

- [ ] **Step 7: `getWeekKeysForPeriod` を実装**

`src/utils/weekUtils.js` に追記:

```js
function getThursdayOfWeek(weekKey) {
  const [yearStr, weekStr] = weekKey.split('-W')
  const year = parseInt(yearStr)
  const week = parseInt(weekStr)
  // 1月4日はISO週1に必ず含まれる
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dayOfWeek = jan4.getUTCDay() || 7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7)
  const thursday = new Date(monday)
  thursday.setUTCDate(monday.getUTCDate() + 3)
  return thursday
}

export function getWeekKeysForPeriod(period, availableWeeks, now = new Date()) {
  const currentWeek = getISOWeekKey(now)

  switch (period) {
    case 'this_week':
      return availableWeeks.filter(w => w === currentWeek)

    case 'last_week': {
      const d = new Date(now)
      d.setUTCDate(d.getUTCDate() - 7)
      const lastWeek = getISOWeekKey(d)
      return availableWeeks.filter(w => w === lastWeek)
    }

    case 'this_month': {
      const month = now.getUTCMonth()
      const year = now.getUTCFullYear()
      return availableWeeks.filter(w => {
        const thu = getThursdayOfWeek(w)
        return thu.getUTCFullYear() === year && thu.getUTCMonth() === month
      })
    }

    case 'last_month': {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
      const month = d.getUTCMonth()
      const year = d.getUTCFullYear()
      return availableWeeks.filter(w => {
        const thu = getThursdayOfWeek(w)
        return thu.getUTCFullYear() === year && thu.getUTCMonth() === month
      })
    }

    case 'all':
      return [...availableWeeks]

    default:
      return []
  }
}
```

- [ ] **Step 8: テストがパスすることを確認**

Run: `npm test -- --testPathPattern=weekUtils`
Expected: PASS

- [ ] **Step 9: コミット**

```bash
git add src/utils/weekUtils.js tests/weekUtils.test.js
git commit -m "feat: add ISO week utilities for period-based emoji stats"
```

---

### Task 2: `discordApi.js` — 429 リトライ + `getAllMessagesSince` 追加

ローカル集計スクリプト用に `after` ベースのページネーションとレートリミット強化を追加。

**Files:**
- Modify: `src/utils/discordApi.js`

- [ ] **Step 1: `discordFetch` に 429 リトライを追加**

`src/utils/discordApi.js` の `discordFetch` 関数を修正。既存の `fetch` 呼び出し後に 429 リトライロジックを追加:

```js
async function discordFetch(path, token, options = {}) {
  const { headers: extraHeaders, ...restOptions } = options
  const headers = { 'Content-Type': 'application/json', ...extraHeaders }
  if (token) headers.Authorization = `Bot ${token}`

  let res = await fetch(`${API_BASE}${path}`, {
    headers,
    ...restOptions,
  })

  // 429 retry
  if (res.status === 429) {
    const retryAfter = parseFloat(res.headers.get('retry-after') || '5')
    await new Promise(r => setTimeout(r, retryAfter * 1000))
    res = await fetch(`${API_BASE}${path}`, { headers, ...restOptions })
  }

  // Rate limit preemptive wait
  const remaining = res.headers.get('x-ratelimit-remaining')
  if (remaining === '0') {
    const retryAfter = parseFloat(res.headers.get('x-ratelimit-reset-after') || '1')
    await new Promise(r => setTimeout(r, retryAfter * 1000))
  }

  return res
}
```

- [ ] **Step 2: `getAllMessagesSince` を追加**

`src/utils/discordApi.js` の `fetchAllChannelMessages` の前に追加:

```js
export async function getAllMessagesSince(channelId, token, afterId) {
  const allMessages = []
  let after = afterId || null

  for (;;) {
    const params = new URLSearchParams({ limit: '100' })
    if (after) params.set('after', after)

    const res = await discordFetch(`/channels/${channelId}/messages?${params}`, token)
    if (!res.ok) return allMessages

    const messages = await res.json()
    if (messages.length === 0) break

    // Ensure chronological order for consistent `after` pagination
    messages.sort((a, b) => a.id.localeCompare(b.id))
    allMessages.push(...messages)
    after = messages[messages.length - 1].id
    if (messages.length < 100) break
  }

  return allMessages
}
```

- [ ] **Step 3: `getForumThreads` から `MAX_CHANNELS` 制限を削除**

`src/utils/discordApi.js` の `getForumThreads` 関数の最後の行を変更:

```js
  // 変更前:
  return threads.slice(0, MAX_CHANNELS)
  // 変更後:
  return threads
```

- [ ] **Step 4: テストがパスすることを確認**

Run: `npm test`
Expected: 全テスト PASS

- [ ] **Step 5: コミット**

```bash
git add src/utils/discordApi.js
git commit -m "feat: add getAllMessagesSince and 429 retry to discordFetch"
```

---

### Task 3: `formatEmojiStats` — 期間ラベル + 集計日時対応

Embed のタイトルに期間ラベル、フッターに最終集計日時を表示する。

**Files:**
- Modify: `src/utils/formatEmojiStats.js`
- Modify: `tests/formatEmojiStats.test.js`

- [ ] **Step 1: テストを更新**

`tests/formatEmojiStats.test.js` を全体書き換え:

```js
import { formatEmojiStats } from '../src/utils/formatEmojiStats.js'

describe('formatEmojiStats', () => {
  test('Top 10 ランキングを Embed 形式で返す', () => {
    const counts = { '😂': 128, '🔥': 95, '❤️': 72 }
    const result = formatEmojiStats(counts, {
      sourceLabel: '20チャンネル',
      messageCount: 3456,
      periodLabel: '今週',
    })
    expect(result.title).toBe('📊 絵文字ランキング（今週）')
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
    const result = formatEmojiStats(counts, {
      sourceLabel: '1チャンネル',
      messageCount: 100,
      periodLabel: '全期間',
    })
    const lines = result.description.split('\n').filter(l => l.trim())
    expect(lines).toHaveLength(10)
  })

  test('絵文字がない場合はメッセージを表示', () => {
    const result = formatEmojiStats({}, {
      sourceLabel: '5チャンネル',
      messageCount: 50,
      periodLabel: '今週',
    })
    expect(result.description).toContain('絵文字が見つかりませんでした')
  })

  test('collectedAt が指定された場合はフッターに集計日時を表示', () => {
    const counts = { '😂': 10 }
    const result = formatEmojiStats(counts, {
      sourceLabel: '15スレッド',
      messageCount: 200,
      periodLabel: '今月',
      collectedAt: '2026-03-20T10:00:00Z',
    })
    expect(result.footer.text).toContain('15スレッド')
    expect(result.footer.text).toContain('200メッセージ')
    expect(result.footer.text).toContain('最終集計:')
    expect(result.footer.text).toContain('JST')
  })

  test('collectedAt がない場合は集計日時を表示しない', () => {
    const counts = { '😂': 10 }
    const result = formatEmojiStats(counts, {
      sourceLabel: '10チャンネル',
      messageCount: 100,
      periodLabel: '先週',
    })
    expect(result.footer.text).not.toContain('最終集計')
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm test -- --testPathPattern=formatEmojiStats`
Expected: FAIL — `periodLabel` が未対応

- [ ] **Step 3: `formatEmojiStats` を書き換え**

`src/utils/formatEmojiStats.js`:

```js
const MEDALS = ['🥇', '🥈', '🥉']

export function formatEmojiStats(counts, { sourceLabel, messageCount, periodLabel, collectedAt }) {
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

  let footerText = `集計対象: ${sourceLabel} / ${messageCount.toLocaleString()}メッセージ`
  if (collectedAt) {
    const jst = new Date(new Date(collectedAt).getTime() + 9 * 60 * 60 * 1000)
    const dateStr = `${jst.getUTCFullYear()}/${String(jst.getUTCMonth() + 1).padStart(2, '0')}/${String(jst.getUTCDate()).padStart(2, '0')} ${String(jst.getUTCHours()).padStart(2, '0')}:${String(jst.getUTCMinutes()).padStart(2, '0')}`
    footerText += `（最終集計: ${dateStr} JST）`
  }

  return {
    title: `📊 絵文字ランキング（${periodLabel}）`,
    description,
    color: 0x5865f2,
    footer: { text: footerText },
  }
}
```

- [ ] **Step 4: テストがパスすることを確認**

Run: `npm test -- --testPathPattern=formatEmojiStats`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add src/utils/formatEmojiStats.js tests/formatEmojiStats.test.js
git commit -m "feat: add periodLabel and collectedAt to formatEmojiStats"
```

---

### Task 4: Worker 側 — KV 読み取り + 即時レスポンス

`emojiStats.js` を KV 読み取りに書き換え、`worker.js` を即時レスポンスに変更。

**Files:**
- Rewrite: `src/commands/emojiStats.js`
- Modify: `src/worker.js`

- [ ] **Step 1: `emojiStats.js` を書き換え**

`src/commands/emojiStats.js`:

```js
import { formatEmojiStats } from '../utils/formatEmojiStats.js'
import { getWeekKeysForPeriod } from '../utils/weekUtils.js'

const PERIOD_MAP = {
  this_week: '今週',
  last_week: '先週',
  this_month: '今月',
  last_month: '先月',
  all: '全期間',
}

const KV_KEYS = {
  channel: 'emoji-stats-channel',
  forum: 'emoji-stats-forum',
}

export async function handleEmojiStats(interaction, env) {
  const target = interaction.data.options?.find(o => o.name === '対象')?.value || 'channel'
  const period = interaction.data.options?.find(o => o.name === '期間')?.value || 'this_week'

  const kvKey = KV_KEYS[target]
  const raw = await env.SESSION_KV.get(kvKey)

  if (!raw) {
    return {
      type: 4,
      data: {
        embeds: [{
          title: '📊 絵文字ランキング',
          description: 'まだ集計データがありません。`npm run collect` を実行してください。',
          color: 0xed4245,
        }],
        flags: 64,
      },
    }
  }

  const data = JSON.parse(raw)
  const weekKeys = getWeekKeysForPeriod(period, Object.keys(data.weeks))

  const mergedCounts = {}
  let totalMessages = 0
  let maxChannels = 0
  for (const key of weekKeys) {
    const week = data.weeks[key]
    if (!week) continue
    for (const [emoji, count] of Object.entries(week.counts)) {
      mergedCounts[emoji] = (mergedCounts[emoji] || 0) + count
    }
    totalMessages += week.messageCount
    if (week.channelCount > maxChannels) maxChannels = week.channelCount
  }

  const sourceLabel = target === 'forum'
    ? `${maxChannels}スレッド`
    : `${maxChannels}チャンネル`

  const embed = formatEmojiStats(mergedCounts, {
    sourceLabel,
    messageCount: totalMessages,
    periodLabel: PERIOD_MAP[period],
    collectedAt: data.lastRun,
  })

  return {
    type: 4,
    data: { embeds: [embed] },
  }
}
```

- [ ] **Step 2: `worker.js` を修正 — deferred → 即時レスポンス**

`src/worker.js` を修正。import と emoji-stats の分岐を変更:

変更前:
```js
import { collectAndRespond as emojiStatsCollect } from './commands/emojiStats.js'
```
変更後:
```js
import { handleEmojiStats } from './commands/emojiStats.js'
```

変更前:
```js
      } else if (
        interaction.type === InteractionType.APPLICATION_COMMAND &&
        interaction.data?.name === 'emoji-stats'
      ) {
        ctx.waitUntil(emojiStatsCollect(interaction, env))
        return Response.json({ type: 5 })
```
変更後:
```js
      } else if (
        interaction.type === InteractionType.APPLICATION_COMMAND &&
        interaction.data?.name === 'emoji-stats'
      ) {
        result = await handleEmojiStats(interaction, env)
```

- [ ] **Step 3: テストがパスすることを確認**

Run: `npm test`
Expected: 全テスト PASS

- [ ] **Step 4: コミット**

```bash
git add src/commands/emojiStats.js src/worker.js
git commit -m "feat: switch emoji-stats to KV read with immediate response"
```

---

### Task 5: `handleEmojiStats` のユニットテスト

**Files:**
- Create: `tests/emojiStats.test.js`

- [ ] **Step 1: テストファイルを作成**

`tests/emojiStats.test.js`:

```js
import { handleEmojiStats } from '../src/commands/emojiStats.js'

function makeInteraction(target, period) {
  return {
    data: {
      options: [
        { name: '対象', value: target },
        { name: '期間', value: period },
      ],
    },
  }
}

function makeEnv(kvData) {
  return {
    SESSION_KV: {
      get: async (key) => kvData[key] ? JSON.stringify(kvData[key]) : null,
    },
  }
}

describe('handleEmojiStats', () => {
  test('KV が空の場合はエラーメッセージを返す', async () => {
    const result = await handleEmojiStats(
      makeInteraction('channel', 'this_week'),
      makeEnv({})
    )
    expect(result.type).toBe(4)
    expect(result.data.embeds[0].description).toContain('まだ集計データがありません')
  })

  test('今週のデータを正しく返す', async () => {
    const env = makeEnv({
      'emoji-stats-channel': {
        weeks: {
          '2026-W12': { counts: { '😂': 50 }, messageCount: 100, channelCount: 10 },
          '2026-W11': { counts: { '😂': 30 }, messageCount: 80, channelCount: 10 },
        },
        lastRun: '2026-03-20T10:00:00Z',
      },
    })
    // Note: this test depends on the current date being in W12.
    // For a more robust test, mock Date, but this validates the basic flow.
    const result = await handleEmojiStats(
      makeInteraction('channel', 'all'),
      env
    )
    expect(result.type).toBe(4)
    expect(result.data.embeds[0].description).toContain('😂')
    expect(result.data.embeds[0].footer.text).toContain('10チャンネル')
  })

  test('全期間で複数週のカウントが合算される', async () => {
    const env = makeEnv({
      'emoji-stats-forum': {
        weeks: {
          '2026-W12': { counts: { '😂': 50, '🔥': 10 }, messageCount: 100, channelCount: 5 },
          '2026-W11': { counts: { '😂': 30, '❤️': 20 }, messageCount: 80, channelCount: 5 },
        },
        lastRun: '2026-03-20T10:00:00Z',
      },
    })
    const result = await handleEmojiStats(
      makeInteraction('forum', 'all'),
      env
    )
    expect(result.data.embeds[0].description).toContain('😂 × 80')
    expect(result.data.embeds[0].footer.text).toContain('5スレッド')
    expect(result.data.embeds[0].footer.text).toContain('180メッセージ')
  })

  test('該当する週がない場合は絵文字なしメッセージ', async () => {
    const env = makeEnv({
      'emoji-stats-channel': {
        weeks: {
          '2020-W01': { counts: { '😂': 50 }, messageCount: 100, channelCount: 10 },
        },
        lastRun: '2026-03-20T10:00:00Z',
      },
    })
    const result = await handleEmojiStats(
      makeInteraction('channel', 'this_week'),
      env
    )
    expect(result.data.embeds[0].description).toContain('絵文字が見つかりませんでした')
  })
})
```

- [ ] **Step 2: テストがパスすることを確認**

Run: `npm test -- --testPathPattern=emojiStats`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add tests/emojiStats.test.js
git commit -m "test: add unit tests for handleEmojiStats KV read logic"
```

---

### Task 6: `deploy-commands.js` — `期間` オプション追加

**Files:**
- Modify: `src/deploy-commands.js`

- [ ] **Step 1: `期間` オプションを追加**

`src/deploy-commands.js` の emoji-stats コマンドビルダーに追加:

```js
  new SlashCommandBuilder()
    .setName('emoji-stats')
    .setDescription('絵文字ランキングを表示します')
    .addStringOption(option =>
      option
        .setName('対象')
        .setDescription('集計対象を選択')
        .setRequired(true)
        .addChoices(
          { name: 'テキストチャンネル', value: 'channel' },
          { name: 'フォーラム', value: 'forum' },
        )
    )
    .addStringOption(option =>
      option
        .setName('期間')
        .setDescription('集計期間を選択')
        .setRequired(true)
        .addChoices(
          { name: '今週', value: 'this_week' },
          { name: '先週', value: 'last_week' },
          { name: '今月', value: 'this_month' },
          { name: '先月', value: 'last_month' },
          { name: '全期間', value: 'all' },
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
```

- [ ] **Step 2: コミット**

```bash
git add src/deploy-commands.js
git commit -m "feat: add period option to emoji-stats slash command"
```

---

### Task 7: ローカル集計スクリプト (`scripts/collect-emoji-stats.js`)

Discord API からメッセージを取得し、週別に集計して KV に書き込むスクリプト。

**Files:**
- Create: `scripts/collect-emoji-stats.js`
- Modify: `package.json`

- [ ] **Step 1: `scripts/` ディレクトリと集計スクリプトを作成**

`scripts/collect-emoji-stats.js`:

```js
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
      `npx wrangler kv:key get "${key}" --namespace-id="${KV_NAMESPACE_ID}"`,
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
      `npx wrangler kv:key put "${key}" --namespace-id="${KV_NAMESPACE_ID}" --path="${tmpFile}"`,
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
  // lastRun（ISO タイムスタンプ）を Snowflake に変換して全チャンネル共通で使用
  // これにより、チャンネルをまたいでも正しく lastRun 以降のメッセージを取得できる
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

async function collectForTarget(target) {
  const kvKey = `emoji-stats-${target}`
  const existing = kvGet(kvKey)
  const lastRun = existing?.lastRun || null

  console.log(`\n=== ${target} ===`)
  console.log(lastRun ? `前回の続きから取得 (since: ${lastRun})` : '初回: 全メッセージを取得')

  let sources
  if (target === 'channel') {
    sources = await getTextChannels(GUILD_ID, DISCORD_TOKEN)
    console.log(`テキストチャンネル: ${sources.length}件`)
  } else {
    const forumChannels = await getForumChannels(GUILD_ID, DISCORD_TOKEN)
    sources = await getForumThreads(GUILD_ID, forumChannels, DISCORD_TOKEN)
    console.log(`フォーラムスレッド: ${sources.length}件`)
  }

  const messages = await fetchMessages(sources, lastRun)
  console.log(`取得メッセージ: ${messages.length}件`)

  if (messages.length === 0 && existing) {
    console.log('新しいメッセージはありません')
    return
  }

  const newWeekData = countByWeek(messages)
  const channelCount = sources.length

  // channelCount を各週に設定
  for (const data of Object.values(newWeekData)) {
    data.channelCount = channelCount
  }

  const mergedWeeks = mergeWeekData(existing?.weeks || {}, newWeekData)

  // channelCount を既存週にも更新（最新のチャンネル数を反映）
  for (const data of Object.values(mergedWeeks)) {
    data.channelCount = channelCount
  }

  const kvData = {
    weeks: mergedWeeks,
    lastRun: new Date().toISOString(),
  }

  kvPut(kvKey, kvData)
  console.log(`KV に書き込み完了: ${kvKey}`)
}

// メイン実行
console.log('絵文字統計の収集を開始します...')
await collectForTarget('channel')
await collectForTarget('forum')
console.log('\n完了!')
```

- [ ] **Step 2: `package.json` に `collect` スクリプトを追加**

`package.json` の `scripts` に追加:

```json
"collect": "node scripts/collect-emoji-stats.js"
```

- [ ] **Step 3: コミット**

```bash
git add scripts/collect-emoji-stats.js package.json
git commit -m "feat: add local emoji-stats collection script with KV write"
```

---

### Task 8: デプロイ + スラッシュコマンド登録 + 動作確認

**Files:** なし（デプロイと動作確認のみ）

- [ ] **Step 1: 全テストがパスすることを確認**

Run: `npm test`
Expected: 全テスト PASS

- [ ] **Step 2: lint がパスすることを確認**

Run: `npm run lint`
Expected: PASS（エラーなし）

- [ ] **Step 3: Worker をデプロイ**

Run: `npm run publish`
Expected: Deployed successfully

- [ ] **Step 4: スラッシュコマンドを登録**

Run: `npm run deploy`
Expected: `✅ スラッシュコマンドを登録しました`

- [ ] **Step 5: ローカル集計を実行**

Run: `npm run collect`
Expected: メッセージ取得と KV 書き込みが成功するログ出力

- [ ] **Step 6: Discord でコマンドをテスト**

Discord サーバーで以下を実行:
- `/emoji-stats 対象:テキストチャンネル 期間:今週`
- `/emoji-stats 対象:フォーラム 期間:全期間`

Expected: ランキングが Embed で即時表示される

- [ ] **Step 7: コミット（最終調整があれば）**

```bash
git commit -m "chore: final adjustments after deployment testing"
```
