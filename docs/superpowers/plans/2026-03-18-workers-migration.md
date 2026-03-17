# Cloudflare Workers 移行実装計画

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** discord.js ゲートウェイ方式から Cloudflare Workers（HTTP Interactions）方式に移行し、ゼロコストで常時稼働できる構成にする。

**Architecture:** Discord が HTTP POST で Workers を呼び出す方式に変更。セッションはオンメモリ Map から Cloudflare KV に移行。discord.js は `deploy-commands.js`（ローカル実行のみ）に限定し、Workers バンドルには含めない。

**Tech Stack:** Cloudflare Workers, Cloudflare KV, wrangler v3, discord.js v14（deploy-commands.js のみ）, Jest（ユニットテスト）

---

## 変更対照表

| ファイル | 変更種別 | 理由 |
|---------|---------|------|
| `src/worker.js` | 新規作成 | Workers エントリーポイント（index.js の代替） |
| `src/utils/verify.js` | 新規作成 | Discord 署名検証（Web Crypto API） |
| `src/utils/kvStore.js` | 新規作成 | KV ベースのセッション管理（sessionStore.js の代替） |
| `tests/kvStore.test.js` | 新規作成 | KV ストアのユニットテスト（モック KV） |
| `tests/verify.test.js` | 新規作成 | 署名検証のユニットテスト |
| `wrangler.toml` | 新規作成 | Workers 設定 |
| `.github/workflows/ci-deploy.yml` | 新規作成 | CI（テスト）+ Deploy（wrangler deploy）|
| `src/utils/interactionHelpers.js` | 修正 | raw JSON 構造に合わせて getDisplayName を更新 |
| `src/modals/modal1.js` 〜 `modal4.js` | 修正 | ModalBuilder → plain JSON オブジェクト |
| `src/commands/setupIntro.js` | 修正 | discord.js 依存を削除、execute を JSON レスポンス形式に |
| `src/deploy-commands.js` | 修正 | SlashCommandBuilder をインライン定義（setupIntro.js から分離） |
| `src/interactions/buttons.js` | 修正 | 非同期・JSON レスポンス・fetch で投稿・env 引数追加 |
| `src/interactions/modals.js` | 修正 | 非同期・JSON レスポンス・raw フィールド抽出・env 引数追加 |
| `package.json` | 修正 | wrangler 追加、start スクリプト更新 |
| `.env.example` | 修正 | DISCORD_PUBLIC_KEY 追加 |
| `.gitignore` | 修正 | `.dev.vars` 追加 |
| `src/index.js` | 削除 | worker.js に置き換え |
| `src/utils/sessionStore.js` | 削除 | kvStore.js に置き換え |
| `tests/sessionStore.test.js` | 削除 | kvStore.test.js に置き換え |

---

## Discord HTTP Interactions の基礎知識

### インタラクションタイプ

| 型番 | 名前 | 説明 |
|-----|------|------|
| 1 | PING | 疎通確認（type:1 で返す） |
| 2 | APPLICATION_COMMAND | スラッシュコマンド |
| 3 | MESSAGE_COMPONENT | ボタン押下 |
| 5 | MODAL_SUBMIT | モーダル送信 |

### レスポンスタイプ

| 型番 | 名前 | 説明 |
|-----|------|------|
| 1 | PONG | PING への応答 |
| 4 | CHANNEL_MESSAGE_WITH_SOURCE | メッセージ返信 |
| 7 | UPDATE_MESSAGE | 既存メッセージ更新 |
| 9 | MODAL | モーダルを表示 |

### 主なフラグ

| 値 | 意味 |
|---|------|
| 64 | EPHEMERAL（本人のみ表示） |

### raw インタラクション JSON 構造（抜粋）

```json
{
  "type": 3,
  "data": { "custom_id": "intro_start", "component_type": 2 },
  "user": { "id": "...", "username": "...", "global_name": "..." },
  "member": {
    "nick": "...",
    "user": { "id": "...", "username": "...", "global_name": "..." }
  },
  "channel_id": "..."
}
```

モーダル送信時の data:
```json
{
  "custom_id": "intro_modal_1",
  "components": [
    {
      "type": 1,
      "components": [{ "type": 4, "custom_id": "name", "value": "山田太郎" }]
    }
  ]
}
```

### `env` オブジェクト（Workers）

Workers のすべてのハンドラーは `env` を引数で受け取る。

| `env.XXX` | 内容 |
|-----------|------|
| `env.SESSION_KV` | KV Namespace バインディング |
| `env.DISCORD_TOKEN` | Bot トークン（wrangler secret） |
| `env.DISCORD_PUBLIC_KEY` | Bot 公開鍵（wrangler secret） |
| `env.INTRO_CHANNEL_ID` | 投稿先チャンネル ID（wrangler secret） |

---

## Task 1: package.json / wrangler / gitignore 更新

**Files:**
- Modify: `package.json`
- Create: `wrangler.toml`
- Modify: `.env.example`
- Modify: `.gitignore`

- [ ] **Step 1: wrangler をインストール**

```bash
cd /Users/icerain/Developers/discord-bots
npm install --save-dev wrangler
```

- [ ] **Step 2: package.json の scripts を更新**

`package.json`:

```json
{
  "name": "discord-bots",
  "version": "1.0.0",
  "description": "Discord bot with multiple features",
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "node src/deploy-commands.js",
    "publish": "wrangler deploy",
    "test": "node --experimental-vm-modules node_modules/.bin/jest"
  },
  "jest": {
    "transform": {}
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "dependencies": {
    "discord.js": "^14.25.1",
    "dotenv": "^17.3.1"
  },
  "devDependencies": {
    "jest": "^30.3.0",
    "wrangler": "^3.0.0"
  }
}
```

> `start` スクリプトは削除（`wrangler dev` がローカル実行を担う）。
> `publish` = Workers デプロイ（`deploy` は既存のコマンド登録スクリプト）。

- [ ] **Step 3: wrangler.toml を作成**

```toml
name = "discord-bots"
main = "src/worker.js"
compatibility_date = "2024-09-23"

# [vars] には機密でない設定のみ記述する
# INTRO_CHANNEL_ID は機密情報のため wrangler secret put で設定する（下記 Task 10 参照）

[[kv_namespaces]]
binding = "SESSION_KV"
id = ""         # npx wrangler kv namespace create SESSION_KV で取得
preview_id = "" # npx wrangler kv namespace create SESSION_KV --preview で取得
```

> **注意:** KV Namespace の ID は後で `npx wrangler kv namespace create SESSION_KV` を実行して取得し、ここに記入する。

- [ ] **Step 4: .env.example を更新**

```
# deploy-commands.js 用（ローカル実行）
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_client_id_here
GUILD_ID=your_guild_id_here

# .dev.vars に記述（wrangler dev 用のローカル Workers シークレット）
# DISCORD_TOKEN=your_bot_token_here
# DISCORD_PUBLIC_KEY=your_public_key_here
# INTRO_CHANNEL_ID=your_intro_channel_id_here

# 本番 Workers シークレットは以下で設定:
# npx wrangler secret put DISCORD_TOKEN
# npx wrangler secret put DISCORD_PUBLIC_KEY
# npx wrangler secret put INTRO_CHANNEL_ID
```

- [ ] **Step 5: .gitignore に .dev.vars を追加**

```
node_modules/
.env
.dev.vars
```

- [ ] **Step 6: コミット**

```bash
git add package.json wrangler.toml .env.example .gitignore package-lock.json
git commit -m "chore: add wrangler and Workers config"
```

---

## Task 2: 署名検証ユーティリティ（TDD）

**Files:**
- Create: `src/utils/verify.js`
- Create: `tests/verify.test.js`

Discord は全リクエストに Ed25519 署名を付ける。Workers はリクエストを処理する前に必ずこれを検証しなければならない（未検証の場合、Discord からのリクエストに応答しない）。

- [ ] **Step 1: テストを書く**

`tests/verify.test.js`:

```js
import { verifyDiscordRequest } from '../src/utils/verify.js'

describe('verifyDiscordRequest', () => {
  test('署名ヘッダーがない場合は false を返す', async () => {
    const request = { headers: { get: () => null } }
    const result = await verifyDiscordRequest(request, 'body', 'a'.repeat(64))
    expect(result).toBe(false)
  })

  test('不正な hex 文字列の署名は false を返す', async () => {
    const request = {
      headers: {
        get: (key) =>
          key === 'X-Signature-Ed25519' ? 'invalid-hex' : '1234567890',
      },
    }
    const result = await verifyDiscordRequest(request, 'body', 'a'.repeat(64))
    expect(result).toBe(false)
  })

  test('有効な形式だが間違った署名は false を返す', async () => {
    const request = {
      headers: {
        get: (key) =>
          key === 'X-Signature-Ed25519' ? 'a'.repeat(128) : '1234567890',
      },
    }
    // 正しい鍵でないので false になる
    const result = await verifyDiscordRequest(request, 'body', 'a'.repeat(64))
    expect(result).toBe(false)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npm test -- tests/verify.test.js
```

Expected: FAIL

- [ ] **Step 3: 実装**

`src/utils/verify.js`:

```js
function hexToBytes(hex) {
  if (hex.length % 2 !== 0) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    const byte = parseInt(hex.slice(i, i + 2), 16)
    if (isNaN(byte)) return null
    bytes[i / 2] = byte
  }
  return bytes
}

export async function verifyDiscordRequest(request, body, publicKey) {
  const signature = request.headers.get('X-Signature-Ed25519')
  const timestamp = request.headers.get('X-Signature-Timestamp')
  if (!signature || !timestamp) return false

  const sigBytes = hexToBytes(signature)
  const keyBytes = hexToBytes(publicKey)
  if (!sigBytes || !keyBytes) return false

  try {
    const key = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'Ed25519' },
      false,
      ['verify'],
    )
    const encoder = new TextEncoder()
    return await crypto.subtle.verify(
      'Ed25519',
      key,
      sigBytes,
      encoder.encode(timestamp + body),
    )
  } catch {
    return false
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test -- tests/verify.test.js
```

Expected: PASS (3 tests)

- [ ] **Step 5: コミット**

```bash
git add src/utils/verify.js tests/verify.test.js
git commit -m "feat: add Discord request signature verification"
```

---

## Task 3: KV ストア（TDD）

**Files:**
- Create: `src/utils/kvStore.js`
- Create: `tests/kvStore.test.js`
- Delete: `src/utils/sessionStore.js`
- Delete: `tests/sessionStore.test.js`

KV の TTL は `expirationTtl` オプションで指定する（KV が自動で期限切れエントリを削除）。`isExpired()` は不要。すべての関数は async。

- [ ] **Step 1: テストを書く**

`tests/kvStore.test.js`:

```js
import { create, get, update, setStep, remove } from '../src/utils/kvStore.js'

// Cloudflare KV のモック（Map ベース）
function createMockKV() {
  const store = new Map()
  return {
    async get(key) { return store.get(key) ?? null },
    async put(key, value, _options) { store.set(key, value) },
    async delete(key) { store.delete(key) },
  }
}

describe('kvStore', () => {
  let kv

  beforeEach(() => {
    kv = createMockKV()
  })

  test('セッションを作成できる', async () => {
    await create(kv, 'user1')
    const session = await get(kv, 'user1')
    expect(session).not.toBeNull()
    expect(session.step).toBe(1)
    expect(session.data).toEqual({})
  })

  test('データを更新できる', async () => {
    await create(kv, 'user1')
    await update(kv, 'user1', { name: '太郎' })
    const session = await get(kv, 'user1')
    expect(session.data).toEqual({ name: '太郎' })
  })

  test('update は既存データとマージされる', async () => {
    await create(kv, 'user1')
    await update(kv, 'user1', { name: '花子' })
    await update(kv, 'user1', { age: '25' })
    const session = await get(kv, 'user1')
    expect(session.data).toEqual({ name: '花子', age: '25' })
  })

  test('セッションを削除できる', async () => {
    await create(kv, 'user1')
    await remove(kv, 'user1')
    expect(await get(kv, 'user1')).toBeNull()
  })

  test('存在しないセッションは null を返す', async () => {
    expect(await get(kv, 'nonexistent')).toBeNull()
  })

  test('ステップを更新できる', async () => {
    await create(kv, 'user1')
    await setStep(kv, 'user1', 3)
    const session = await get(kv, 'user1')
    expect(session.step).toBe(3)
  })
})
```

- [ ] **Step 2: テストが失敗することを確認**

```bash
npm test -- tests/kvStore.test.js
```

- [ ] **Step 3: 実装**

`src/utils/kvStore.js`:

```js
const TTL_SECONDS = 30 * 60 // 30分

export async function create(kv, userId) {
  await kv.put(userId, JSON.stringify({ step: 1, data: {} }), {
    expirationTtl: TTL_SECONDS,
  })
}

export async function get(kv, userId) {
  const raw = await kv.get(userId)
  if (!raw) return null
  return JSON.parse(raw)
}

export async function update(kv, userId, newData) {
  const session = await get(kv, userId)
  if (!session) return
  session.data = { ...session.data, ...newData }
  await kv.put(userId, JSON.stringify(session), { expirationTtl: TTL_SECONDS })
}

export async function setStep(kv, userId, step) {
  const session = await get(kv, userId)
  if (!session) return
  session.step = step
  await kv.put(userId, JSON.stringify(session), { expirationTtl: TTL_SECONDS })
}

export async function remove(kv, userId) {
  await kv.delete(userId)
}
```

- [ ] **Step 4: テストが通ることを確認**

```bash
npm test -- tests/kvStore.test.js
```

Expected: PASS (6 tests)

- [ ] **Step 5: sessionStore.js と sessionStore.test.js を削除**

```bash
rm src/utils/sessionStore.js tests/sessionStore.test.js
```

- [ ] **Step 6: コミット**

```bash
git add src/utils/kvStore.js tests/kvStore.test.js
git rm src/utils/sessionStore.js tests/sessionStore.test.js
git commit -m "feat: replace sessionStore with KV-based kvStore"
```

---

## Task 4: interactionHelpers.js の更新

**Files:**
- Modify: `src/utils/interactionHelpers.js`

discord.js の `interaction.user.globalName` は raw JSON では `interaction.user.global_name`（スネークケース）になる。`member.displayName` も raw JSON では `member.nick`。

- [ ] **Step 1: 修正**

`src/utils/interactionHelpers.js`:

```js
export const SESSION_EXPIRED_MSG = 'セッションが切れました。最初からやり直してください。'

// raw Discord interaction JSON からユーザー表示名を取得
// 優先順位: サーバーニックネーム → グローバル表示名 → ユーザー名
export function getDisplayName(interaction) {
  return (
    interaction.member?.nick ??
    interaction.member?.user?.global_name ??
    interaction.member?.user?.username ??
    interaction.user?.global_name ??
    interaction.user?.username ??
    'Unknown'
  )
}

// raw interaction から userId を取得
export function getUserId(interaction) {
  return interaction.member?.user?.id ?? interaction.user?.id
}
```

> `getUserId` を追加する（buttons.js / modals.js で `interaction.user` が存在しないケースに対応）。

- [ ] **Step 2: コミット**

```bash
git add src/utils/interactionHelpers.js
git commit -m "fix: update interactionHelpers for raw Discord JSON structure"
```

---

## Task 5: モーダル定義を plain JSON に変換

**Files:**
- Modify: `src/modals/modal1.js`
- Modify: `src/modals/modal2.js`
- Modify: `src/modals/modal3.js`
- Modify: `src/modals/modal4.js`

discord.js の ModalBuilder の代わりに、Discord API の raw JSON オブジェクトを返す。

テキスト入力コンポーネントタイプ: `4`（TEXT_INPUT）、スタイル: `1`（SHORT）。

- [ ] **Step 1: modal1.js を更新**

`src/modals/modal1.js`:

```js
export function buildModal1() {
  return {
    custom_id: 'intro_modal_1',
    title: '自己紹介 (1/4) 【基本①】',
    components: [
      textRow('name',     '名前',   '例：山田太郎（ニックネームでもOK）'),
      textRow('gender',   '性別',   '男性 / 女性 / その他 / 回答しない'),
      textRow('age',      '年齢',   '例：25'),
      textRow('title',    '肩書き', '例：エンジニア / 学生 / 主婦'),
      textRow('hometown', '出身地', '例：東京都 / 北海道'),
    ],
  }
}

function textRow(custom_id, label, placeholder) {
  return {
    type: 1,
    components: [{ type: 4, custom_id, label, placeholder, style: 1, required: false }],
  }
}
```

- [ ] **Step 2: modal2.js を更新**

`src/modals/modal2.js`:

```js
export function buildModal2() {
  return {
    custom_id: 'intro_modal_2',
    title: '自己紹介 (2/4) 【基本②＋好きな物①】',
    components: [
      textRow('hobby',  '趣味',         '例：ゲーム、映画鑑賞'),
      textRow('skill',  '特技',         '例：料理、プログラミング'),
      textRow('myboom', 'マイブーム',   '例：朝のストレッチ'),
      textRow('food',   '好きな食べ物', '例：ラーメン'),
      textRow('drink',  '好きな飲み物', '例：コーヒー'),
    ],
  }
}

function textRow(custom_id, label, placeholder) {
  return {
    type: 1,
    components: [{ type: 4, custom_id, label, placeholder, style: 1, required: false }],
  }
}
```

- [ ] **Step 3: modal3.js を更新**

`src/modals/modal3.js`:

```js
export function buildModal3() {
  return {
    custom_id: 'intro_modal_3',
    title: '自己紹介 (3/4) 【好きな物②＋もっと①】',
    components: [
      textRow('place', '好きな場所',         '例：秋葉原、海辺'),
      textRow('oshi',  '推し・キャラクター', '例：〇〇（アニメ）のキャラ'),
      textRow('music', '好きな音楽',         '例：ロック、J-POP'),
      textRow('book',  '好きな本',           '例：技術書、小説'),
      textRow('want',  'いま欲しいもの',     '例：広いモニター'),
    ],
  }
}

function textRow(custom_id, label, placeholder) {
  return {
    type: 1,
    components: [{ type: 4, custom_id, label, placeholder, style: 1, required: false }],
  }
}
```

- [ ] **Step 4: modal4.js を更新**

`src/modals/modal4.js`:

```js
export function buildModal4() {
  return {
    custom_id: 'intro_modal_4',
    title: '自己紹介 (4/4) 【もっと！＋一言】',
    components: [
      textRow('pet',     'ペットを飼うなら',   '例：ねこ、いぬ'),
      textRow('holiday', '休日はどう過ごす？', '例：ゲーム、外出、ゴロゴロ'),
      textRow('reply',   '返信は早い？',       '早い / 普通 / 遅め'),
      textRow('game',    'ゲームやってる？',   'やってる / たまに / やってない'),
      textRow('oneword', '一言！',             'よろしくお願いします！'),
    ],
  }
}

function textRow(custom_id, label, placeholder) {
  return {
    type: 1,
    components: [{ type: 4, custom_id, label, placeholder, style: 1, required: false }],
  }
}
```

- [ ] **Step 5: コミット**

```bash
git add src/modals/
git commit -m "refactor: replace ModalBuilder with plain JSON objects"
```

---

## Task 6: setupIntro.js と deploy-commands.js の分離

**Files:**
- Modify: `src/commands/setupIntro.js`
- Modify: `src/deploy-commands.js`

`worker.js` が `setupIntro.js` をインポートするため、discord.js を `setupIntro.js` から取り除く必要がある。`SlashCommandBuilder` の定義は `deploy-commands.js` に移動する。

- [ ] **Step 1: setupIntro.js を更新**

`src/commands/setupIntro.js`:

```js
const EPHEMERAL = 64

export async function execute(interaction, env) {
  const row = {
    type: 1,
    components: [{
      type: 2,
      custom_id: 'intro_start',
      label: '✏️ 自己紹介を書く',
      style: 1,
    }],
  }

  const res = await fetch(
    `https://discord.com/api/v10/channels/${interaction.channel_id}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: '**📝 自己紹介**\nボタンを押して自己紹介を投稿しましょう！',
        components: [row],
      }),
    },
  )

  if (!res.ok) {
    return { type: 4, data: { content: 'パネルの設置に失敗しました。', flags: EPHEMERAL } }
  }

  return { type: 4, data: { content: 'パネルを設置しました！', flags: EPHEMERAL } }
}
```

- [ ] **Step 2: deploy-commands.js を更新（SlashCommandBuilder をインライン定義）**

`src/deploy-commands.js`:

```js
import 'dotenv/config'
import { REST, Routes, SlashCommandBuilder } from 'discord.js'

const commands = [
  new SlashCommandBuilder()
    .setName('setup-intro')
    .setDescription('自己紹介パネルをこのチャンネルに設置します（管理者のみ）')
    .toJSON(),
]

const rest = new REST().setToken(process.env.DISCORD_TOKEN)

await rest.put(
  Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
  { body: commands },
)
console.log('✅ スラッシュコマンドを登録しました')
```

- [ ] **Step 3: コミット**

```bash
git add src/commands/setupIntro.js src/deploy-commands.js
git commit -m "refactor: decouple setupIntro from discord.js for Workers compatibility"
```

---

## Task 7: インタラクションハンドラーの書き直し

**Files:**
- Modify: `src/interactions/buttons.js`
- Modify: `src/interactions/modals.js`

すべての関数が `async` になり、`env` 引数を受け取り、JSON オブジェクトを `return` する（`await interaction.reply()` の代わり）。

### レスポンスヘルパー（modals.js 内で定義）

```js
const EPHEMERAL = 64
const ephemeralMsg = (content, components) => ({
  type: 4,
  data: { content, flags: EPHEMERAL, ...(components ? { components } : {}) },
})
const updateMsg = (content) => ({ type: 7, data: { content, components: [] } })
const showModal = (data) => ({ type: 9, data })
```

- [ ] **Step 1: buttons.js を書き直す**

`src/interactions/buttons.js`:

```js
import { buildModal1 } from '../modals/modal1.js'
import { buildModal2 } from '../modals/modal2.js'
import { buildModal3 } from '../modals/modal3.js'
import { buildModal4 } from '../modals/modal4.js'
import { create, get, remove } from '../utils/kvStore.js'
import { formatIntro } from '../utils/formatIntro.js'
import { SESSION_EXPIRED_MSG, getDisplayName, getUserId } from '../utils/interactionHelpers.js'

const EPHEMERAL = 64
const ephemeralMsg = (content) => ({ type: 4, data: { content, flags: EPHEMERAL } })
const updateMsg = (content) => ({ type: 7, data: { content, components: [] } })
const showModal = (data) => ({ type: 9, data })

export async function handleButton(interaction, env) {
  const kv = env.SESSION_KV
  const userId = getUserId(interaction)
  const customId = interaction.data.custom_id

  if (customId === 'intro_start') {
    const existing = await get(kv, userId)
    if (existing) {
      return ephemeralMsg('自己紹介の入力が途中です。続きから入力するか、キャンセルしてから再度お試しください。')
    }
    await create(kv, userId)
    return showModal(buildModal1())
  }

  if (customId === 'intro_next_2') {
    if (!await get(kv, userId)) return ephemeralMsg(SESSION_EXPIRED_MSG)
    return showModal(buildModal2())
  }

  if (customId === 'intro_next_3') {
    if (!await get(kv, userId)) return ephemeralMsg(SESSION_EXPIRED_MSG)
    return showModal(buildModal3())
  }

  if (customId === 'intro_next_4') {
    if (!await get(kv, userId)) return ephemeralMsg(SESSION_EXPIRED_MSG)
    return showModal(buildModal4())
  }

  if (customId === 'intro_confirm') {
    const session = await get(kv, userId)
    if (!session) return ephemeralMsg(SESSION_EXPIRED_MSG)

    const text = formatIntro(getDisplayName(interaction), session.data)
    const res = await fetch(
      `https://discord.com/api/v10/channels/${env.INTRO_CHANNEL_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bot ${env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content: text }),
      },
    )

    if (!res.ok) {
      return ephemeralMsg('投稿に失敗しました。Botのチャンネル権限を確認してください。')
    }

    await remove(kv, userId)
    return updateMsg('✅ 自己紹介を投稿しました！')
  }

  if (customId === 'intro_cancel') {
    await remove(kv, userId)
    return updateMsg('キャンセルしました。')
  }

  return ephemeralMsg('不明なインタラクションです。')
}
```

- [ ] **Step 2: modals.js を書き直す**

`src/interactions/modals.js`:

```js
import { get, update, setStep } from '../utils/kvStore.js'
import { formatIntro } from '../utils/formatIntro.js'
import { SESSION_EXPIRED_MSG, getDisplayName, getUserId } from '../utils/interactionHelpers.js'

const EPHEMERAL = 64
const ephemeralMsg = (content, components) => ({
  type: 4,
  data: { content, flags: EPHEMERAL, ...(components ? { components } : {}) },
})

function nextRow(nextButtonId) {
  return {
    type: 1,
    components: [
      { type: 2, custom_id: nextButtonId, label: '次へ →', style: 1 },
      { type: 2, custom_id: 'intro_cancel', label: 'キャンセル', style: 2 },
    ],
  }
}

function confirmRow() {
  return {
    type: 1,
    components: [
      { type: 2, custom_id: 'intro_confirm', label: '✅ 投稿する', style: 3 },
      { type: 2, custom_id: 'intro_cancel', label: 'キャンセル', style: 2 },
    ],
  }
}

// raw モーダル送信の data.components から指定キーのフィールドを抽出
function extractFields(interaction, keys) {
  const fields = {}
  for (const row of interaction.data.components ?? []) {
    for (const component of row.components ?? []) {
      if (keys.includes(component.custom_id)) {
        fields[component.custom_id] = component.value?.trim() || undefined
      }
    }
  }
  return fields
}

export async function handleModalSubmit(interaction, env) {
  const kv = env.SESSION_KV
  const userId = getUserId(interaction)
  const customId = interaction.data.custom_id

  const session = await get(kv, userId)
  if (!session) return ephemeralMsg(SESSION_EXPIRED_MSG)

  if (customId === 'intro_modal_1') {
    await update(kv, userId, extractFields(interaction, ['name', 'gender', 'age', 'title', 'hometown']))
    await setStep(kv, userId, 2)
    return ephemeralMsg('**ステップ 1/4 完了！** 次は趣味・特技などを入力します。', [nextRow('intro_next_2')])
  }

  if (customId === 'intro_modal_2') {
    await update(kv, userId, extractFields(interaction, ['hobby', 'skill', 'myboom', 'food', 'drink']))
    await setStep(kv, userId, 3)
    return ephemeralMsg('**ステップ 2/4 完了！** 次は好きな場所・音楽などを入力します。', [nextRow('intro_next_3')])
  }

  if (customId === 'intro_modal_3') {
    await update(kv, userId, extractFields(interaction, ['place', 'oshi', 'music', 'book', 'want']))
    await setStep(kv, userId, 4)
    return ephemeralMsg('**ステップ 3/4 完了！** 最後の質問です。', [nextRow('intro_next_4')])
  }

  if (customId === 'intro_modal_4') {
    await update(kv, userId, extractFields(interaction, ['pet', 'holiday', 'reply', 'game', 'oneword']))
    const updated = await get(kv, userId)
    if (!updated) return ephemeralMsg(SESSION_EXPIRED_MSG)
    const preview = formatIntro(getDisplayName(interaction), updated.data)
    return ephemeralMsg(`**入力完了！** 以下の内容で投稿します。\n\n${preview}`, [confirmRow()])
  }

  return ephemeralMsg('不明なインタラクションです。')
}
```

- [ ] **Step 3: コミット**

```bash
git add src/interactions/
git commit -m "refactor: rewrite handlers for Workers HTTP Interactions"
```

---

## Task 8: worker.js（エントリーポイント）と index.js の削除

**Files:**
- Create: `src/worker.js`
- Delete: `src/index.js`

- [ ] **Step 1: worker.js を作成**

`src/worker.js`:

```js
import { verifyDiscordRequest } from './utils/verify.js'
import { execute as setupIntroExecute } from './commands/setupIntro.js'
import { handleButton } from './interactions/buttons.js'
import { handleModalSubmit } from './interactions/modals.js'

const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2,
  MESSAGE_COMPONENT: 3,
  MODAL_SUBMIT: 5,
}

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const body = await request.text()
    const isValid = await verifyDiscordRequest(request, body, env.DISCORD_PUBLIC_KEY)
    if (!isValid) {
      return new Response('Unauthorized', { status: 401 })
    }

    const interaction = JSON.parse(body)

    if (interaction.type === InteractionType.PING) {
      return Response.json({ type: 1 })
    }

    try {
      let result

      if (
        interaction.type === InteractionType.APPLICATION_COMMAND &&
        interaction.data?.name === 'setup-intro'
      ) {
        result = await setupIntroExecute(interaction, env)
      } else if (interaction.type === InteractionType.MESSAGE_COMPONENT) {
        result = await handleButton(interaction, env)
      } else if (interaction.type === InteractionType.MODAL_SUBMIT) {
        result = await handleModalSubmit(interaction, env)
      } else {
        return new Response('Unknown interaction', { status: 400 })
      }

      return Response.json(result)
    } catch (err) {
      console.error('Worker error:', err)
      return Response.json({
        type: 4,
        data: { content: '予期しないエラーが発生しました。', flags: 64 },
      })
    }
  },
}
```

- [ ] **Step 2: index.js を削除**

```bash
rm src/index.js
```

- [ ] **Step 3: 全テストが通ることを確認**

```bash
npm test
```

Expected: PASS（verify: 3, kvStore: 6, formatIntro: 3 = 計12テスト）

- [ ] **Step 4: コミット**

```bash
git add src/worker.js
git rm src/index.js
git commit -m "feat: add Cloudflare Workers entry point, remove index.js"
```

---

## Task 9: GitHub Actions（CI + Deploy）

**Files:**
- Create: `.github/workflows/ci-deploy.yml`

- [ ] **Step 1: ワークフローファイルを作成**

`.github/workflows/ci-deploy.yml`:

```yaml
name: CI / Deploy

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test

  deploy:
    name: Deploy to Cloudflare Workers
    runs-on: ubuntu-latest
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    steps:
      - uses: actions/checkout@v4
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

- [ ] **Step 2: GitHub Secrets に CLOUDFLARE_API_TOKEN を登録**

Cloudflare ダッシュボード → My Profile → API Tokens → "Edit Cloudflare Workers" テンプレートでトークン生成後:

```bash
gh secret set CLOUDFLARE_API_TOKEN
```

- [ ] **Step 3: コミット**

```bash
git add .github/workflows/ci-deploy.yml
git commit -m "ci: add GitHub Actions CI and Cloudflare Workers deploy workflow"
```

---

## Task 10: Workers の初回セットアップ（手動）

このタスクはコマンドの実行が必要な手動作業。

- [ ] **Step 1: KV Namespace を作成**

```bash
npx wrangler kv namespace create SESSION_KV
npx wrangler kv namespace create SESSION_KV --preview
```

出力された `id` と `preview_id` を `wrangler.toml` の `[[kv_namespaces]]` に記入:

```toml
[[kv_namespaces]]
binding = "SESSION_KV"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
preview_id = "yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy"
```

- [ ] **Step 2: Workers シークレットを設定**

```bash
npx wrangler secret put DISCORD_TOKEN
npx wrangler secret put DISCORD_PUBLIC_KEY
npx wrangler secret put INTRO_CHANNEL_ID
```

各コマンドで値の入力を求められる。`DISCORD_PUBLIC_KEY` は Discord Developer Portal → Bot → 「Public Key」に記載。

- [ ] **Step 3: .dev.vars を作成（ローカル開発用）**

`.dev.vars`（gitignore 済み）:

```
DISCORD_TOKEN=your_bot_token_here
DISCORD_PUBLIC_KEY=your_public_key_here
INTRO_CHANNEL_ID=your_channel_id_here
```

- [ ] **Step 4: ローカルで動作確認**

```bash
npm run dev
```

別ターミナルで ngrok 等を使って HTTPS URL を取得し、Discord Developer Portal → Interactions Endpoint URL に設定。Discord から PING が来て `{"type":1}` が返れば成功。

- [ ] **Step 5: wrangler.toml の変更をコミット**

```bash
git add wrangler.toml
git commit -m "chore: set KV namespace IDs in wrangler.toml"
```

- [ ] **Step 6: 本番デプロイ**

```bash
npm run publish
```

デプロイ後に表示される Workers URL を Discord Developer Portal → Interactions Endpoint URL に設定。

- [ ] **Step 7: スラッシュコマンドを再登録**

```bash
npm run deploy
```

- [ ] **Step 8: 動作確認（Discord から）**

1. `/setup-intro` を実行 → チャンネルにパネルが投稿されること
2. 「✏️ 自己紹介を書く」ボタン → モーダル①が表示されること
3. 4ステップ完了 → 確認画面が表示されること
4. 「✅ 投稿する」→ チャンネルに自己紹介が投稿されること
5. 「キャンセル」→ セッションが破棄されること
