# /contact Anonymous Contact Command Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/contact` slash command that lets any member anonymously send reports/consultations to moderators, with multi-turn anonymous conversation support via buttons and modals.

**Architecture:** Slash command opens a modal for body input. Submissions are stored in KV (30-day TTL) and posted as anonymous Embeds to a moderator channel. Moderators reply via button→modal, which DMs the sender (with a reply button). Sender replies via button→modal in DM, which posts anonymously back to the mod channel. This cycle repeats.

**Tech Stack:** Cloudflare Workers, Discord HTTP Interactions API, Workers KV, Web Crypto API (for ID generation)

**Note:** This feature is in test/beta phase. Documentation should clearly state this.

---

### Task 1: Report ID Generator (`src/utils/reportId.js`)

**Files:**
- Create: `src/utils/reportId.js`
- Create: `tests/reportId.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/reportId.test.js
import { generateReportId } from '../src/utils/reportId.js'

describe('generateReportId', () => {
  test('8文字の英数字を生成する', () => {
    const id = generateReportId()
    expect(id).toMatch(/^[a-z0-9]{8}$/)
  })

  test('毎回異なるIDを生成する', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateReportId()))
    expect(ids.size).toBe(100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/reportId.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/utils/reportId.js
export function generateReportId() {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => b.toString(36).padStart(2, '0').slice(-1)).join('')
    .slice(0, 8)
}
```

Wait — `toString(36)` on a byte (0-255) gives 1-2 chars. Safer approach:

```javascript
// src/utils/reportId.js
const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

export function generateReportId() {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, b => CHARS[b % CHARS.length]).join('')
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/reportId.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/reportId.js tests/reportId.test.js
git commit -m "feat(contact): add report ID generator"
```

---

### Task 2: Contact Store (`src/utils/contactStore.js`)

**Files:**
- Create: `src/utils/contactStore.js`
- Create: `tests/contactStore.test.js`

- [ ] **Step 1: Write the failing test**

```javascript
// tests/contactStore.test.js
import { createContact, getContact, addMessage } from '../src/utils/contactStore.js'

function createMockKV() {
  const store = new Map()
  return {
    async get(key) { return store.get(key) ?? null },
    async put(key, value, _options) { store.set(key, value) },
    async delete(key) { store.delete(key) },
  }
}

describe('contactStore', () => {
  let kv

  beforeEach(() => {
    kv = createMockKV()
  })

  test('コンタクトを作成できる', async () => {
    const result = await createContact(kv, 'report123', 'user456', 'Help me')
    const contact = await getContact(kv, 'report123')
    expect(contact).not.toBeNull()
    expect(contact.userId).toBe('user456')
    expect(contact.messages).toHaveLength(1)
    expect(contact.messages[0].from).toBe('sender')
    expect(contact.messages[0].body).toBe('Help me')
  })

  test('存在しないコンタクトは null を返す', async () => {
    expect(await getContact(kv, 'nonexistent')).toBeNull()
  })

  test('メッセージを追加できる', async () => {
    await createContact(kv, 'report123', 'user456', 'Help me')
    await addMessage(kv, 'report123', 'moderator', 'How can we help?')
    const contact = await getContact(kv, 'report123')
    expect(contact.messages).toHaveLength(2)
    expect(contact.messages[1].from).toBe('moderator')
    expect(contact.messages[1].body).toBe('How can we help?')
  })

  test('メッセージ追加時にupdatedAtが更新される', async () => {
    await createContact(kv, 'report123', 'user456', 'Help me')
    const before = (await getContact(kv, 'report123')).updatedAt
    // Small delay to ensure timestamp differs
    await new Promise(r => setTimeout(r, 10))
    await addMessage(kv, 'report123', 'moderator', 'Reply')
    const after = (await getContact(kv, 'report123')).updatedAt
    expect(after).not.toBe(before)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/contactStore.test.js`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Write minimal implementation**

```javascript
// src/utils/contactStore.js
const TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days

export async function createContact(kv, reportId, userId, body) {
  const now = new Date().toISOString()
  const data = {
    userId,
    messages: [{ from: 'sender', body, timestamp: now }],
    createdAt: now,
    updatedAt: now,
  }
  await kv.put(`contact_${reportId}`, JSON.stringify(data), {
    expirationTtl: TTL_SECONDS,
  })
  return data
}

export async function getContact(kv, reportId) {
  const raw = await kv.get(`contact_${reportId}`)
  if (!raw) return null
  return JSON.parse(raw)
}

export async function addMessage(kv, reportId, from, body) {
  const contact = await getContact(kv, reportId)
  if (!contact) return null
  contact.messages.push({ from, body, timestamp: new Date().toISOString() })
  contact.updatedAt = new Date().toISOString()
  await kv.put(`contact_${reportId}`, JSON.stringify(contact), {
    expirationTtl: TTL_SECONDS,
  })
  return contact
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/contactStore.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/contactStore.js tests/contactStore.test.js
git commit -m "feat(contact): add contact store with 30-day TTL"
```

---

### Task 3: Contact Modal Definition (`src/modals/contactModal.js`)

**Files:**
- Create: `src/modals/contactModal.js`

- [ ] **Step 1: Write the modal definition**

```javascript
// src/modals/contactModal.js
export function buildContactModal() {
  return {
    custom_id: 'contact_modal',
    title: '匿名で連絡する',
    components: [
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'contact_body',
          label: '内容',
          placeholder: '通報・相談・その他、自由に記入してください',
          style: 2, // Paragraph
          required: true,
          max_length: 1000,
        }],
      },
    ],
  }
}

export function buildReplyModal(reportId) {
  return {
    custom_id: `contact_reply_modal_${reportId}`,
    title: '返信する',
    components: [
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'contact_reply_body',
          label: '返信内容',
          placeholder: '返信内容を入力してください',
          style: 2,
          required: true,
          max_length: 1000,
        }],
      },
    ],
  }
}

export function buildFollowupModal(reportId) {
  return {
    custom_id: `contact_followup_modal_${reportId}`,
    title: '返信する',
    components: [
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'contact_followup_body',
          label: '返信内容',
          placeholder: '返信内容を入力してください',
          style: 2,
          required: true,
          max_length: 1000,
        }],
      },
    ],
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/modals/contactModal.js
git commit -m "feat(contact): add modal definitions for contact, reply, and followup"
```

---

### Task 4: Contact Command Handler (`src/commands/contact.js`)

**Files:**
- Create: `src/commands/contact.js`

- [ ] **Step 1: Write the command handler**

```javascript
// src/commands/contact.js
import { buildContactModal } from '../modals/contactModal.js'

export async function handleContact() {
  return { type: 9, data: buildContactModal() }
}
```

- [ ] **Step 2: Register the command in `src/deploy-commands.js`**

Add to the `commands` array:

```javascript
new SlashCommandBuilder()
  .setName('contact')
  .setDescription('モデレーターに匿名で連絡します（通報・相談など）')
  .toJSON(),
```

- [ ] **Step 3: Wire into `src/worker.js`**

Add import and routing for the `contact` command:

```javascript
import { handleContact } from './commands/contact.js'

// In the routing section, add before the MESSAGE_COMPONENT handler:
} else if (
  interaction.type === InteractionType.APPLICATION_COMMAND &&
  interaction.data?.name === 'contact'
) {
  result = await handleContact(interaction, env)
}
```

- [ ] **Step 4: Commit**

```bash
git add src/commands/contact.js src/deploy-commands.js src/worker.js
git commit -m "feat(contact): add /contact command with modal trigger"
```

---

### Task 5: Contact Modal Submit Handler (`src/interactions/contactModals.js`)

**Files:**
- Create: `src/interactions/contactModals.js`

- [ ] **Step 1: Write the modal submit handlers**

```javascript
// src/interactions/contactModals.js
import { createContact, getContact, addMessage } from '../utils/contactStore.js'
import { generateReportId } from '../utils/reportId.js'
import { getUserId } from '../utils/interactionHelpers.js'

const EPHEMERAL = 64

function extractBody(interaction, fieldId) {
  for (const row of interaction.data.components ?? []) {
    for (const component of row.components ?? []) {
      if (component.custom_id === fieldId) {
        return component.value?.trim() || ''
      }
    }
  }
  return ''
}

export async function handleContactModalSubmit(interaction, env) {
  const customId = interaction.data.custom_id

  if (customId === 'contact_modal') {
    return await handleInitialContact(interaction, env)
  }

  // contact_reply_modal_<reportId>
  if (customId.startsWith('contact_reply_modal_')) {
    const reportId = customId.replace('contact_reply_modal_', '')
    return await handleModeratorReply(interaction, env, reportId)
  }

  // contact_followup_modal_<reportId>
  if (customId.startsWith('contact_followup_modal_')) {
    const reportId = customId.replace('contact_followup_modal_', '')
    return await handleSenderFollowup(interaction, env, reportId)
  }

  return { type: 4, data: { content: '不明なインタラクションです。', flags: EPHEMERAL } }
}

async function handleInitialContact(interaction, env) {
  const kv = env.SESSION_KV
  const userId = getUserId(interaction)
  const body = extractBody(interaction, 'contact_body')

  if (!body) {
    return { type: 4, data: { content: '内容を入力してください。', flags: EPHEMERAL } }
  }

  const reportId = generateReportId()
  await createContact(kv, reportId, userId, body)

  // Post to moderator channel
  const embed = {
    title: '📩 新しい匿名メッセージ',
    description: body,
    fields: [{ name: 'レポートID', value: reportId, inline: true }],
    color: 0x5865f2,
    timestamp: new Date().toISOString(),
  }

  const messagePayload = {
    embeds: [embed],
    components: [{
      type: 1,
      components: [{
        type: 2,
        custom_id: `contact_reply_${reportId}`,
        label: '返信する',
        style: 1,
      }],
    }],
  }

  const res = await fetch(
    `https://discord.com/api/v10/channels/${env.CONTACT_CHANNEL_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    },
  )

  if (!res.ok) {
    console.error('Failed to post to contact channel:', await res.text())
    return {
      type: 4,
      data: { content: '送信に失敗しました。管理者にお問い合わせください。', flags: EPHEMERAL },
    }
  }

  return {
    type: 4,
    data: { content: `✅ 匿名で送信しました（レポートID: ${reportId}）`, flags: EPHEMERAL },
  }
}

async function handleModeratorReply(interaction, env, reportId) {
  const kv = env.SESSION_KV
  const body = extractBody(interaction, 'contact_reply_body')

  const contact = await getContact(kv, reportId)
  if (!contact) {
    return {
      type: 4,
      data: { content: 'このレポートは期限切れです。', flags: EPHEMERAL },
    }
  }

  await addMessage(kv, reportId, 'moderator', body)

  // Create DM channel with the sender
  const dmChannelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: contact.userId }),
  })

  if (!dmChannelRes.ok) {
    return {
      type: 4,
      data: {
        content: '⚠️ DMの送信に失敗しました。相手がDMを無効にしている可能性があります。',
        flags: EPHEMERAL,
      },
    }
  }

  const dmChannel = await dmChannelRes.json()

  // Send DM with reply button
  const dmPayload = {
    embeds: [{
      title: '📬 モデレーターからの返信',
      description: body,
      fields: [{ name: 'レポートID', value: reportId, inline: true }],
      color: 0x57f287,
      timestamp: new Date().toISOString(),
    }],
    components: [{
      type: 1,
      components: [{
        type: 2,
        custom_id: `contact_followup_${reportId}`,
        label: '返信する',
        style: 1,
      }],
    }],
  }

  const dmRes = await fetch(
    `https://discord.com/api/v10/channels/${dmChannel.id}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dmPayload),
    },
  )

  if (!dmRes.ok) {
    return {
      type: 4,
      data: {
        content: '⚠️ DMの送信に失敗しました。相手がDMを無効にしている可能性があります。',
        flags: EPHEMERAL,
      },
    }
  }

  return {
    type: 4,
    data: { content: '✅ 返信を送信しました。', flags: EPHEMERAL },
  }
}

async function handleSenderFollowup(interaction, env, reportId) {
  const kv = env.SESSION_KV
  const body = extractBody(interaction, 'contact_followup_body')

  const contact = await getContact(kv, reportId)
  if (!contact) {
    return {
      type: 4,
      data: { content: 'このレポートは期限切れです。', flags: EPHEMERAL },
    }
  }

  await addMessage(kv, reportId, 'sender', body)

  // Post follow-up to moderator channel
  const embed = {
    title: '📩 匿名フォローアップ',
    description: body,
    fields: [{ name: 'レポートID', value: reportId, inline: true }],
    color: 0x5865f2,
    timestamp: new Date().toISOString(),
  }

  const messagePayload = {
    embeds: [embed],
    components: [{
      type: 1,
      components: [{
        type: 2,
        custom_id: `contact_reply_${reportId}`,
        label: '返信する',
        style: 1,
      }],
    }],
  }

  const res = await fetch(
    `https://discord.com/api/v10/channels/${env.CONTACT_CHANNEL_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bot ${env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messagePayload),
    },
  )

  if (!res.ok) {
    console.error('Failed to post followup:', await res.text())
  }

  return {
    type: 4,
    data: { content: '✅ 返信を送信しました。', flags: EPHEMERAL },
  }
}
```

- [ ] **Step 2: Wire contact modals into `src/interactions/modals.js`**

In `handleModalSubmit`, add contact modal routing before the existing intro modal handling:

```javascript
import { handleContactModalSubmit } from './contactModals.js'

// At the top of handleModalSubmit function, before the session check:
if (customId.startsWith('contact_')) {
  return await handleContactModalSubmit(interaction, env)
}
```

- [ ] **Step 3: Commit**

```bash
git add src/interactions/contactModals.js src/interactions/modals.js
git commit -m "feat(contact): add modal submit handlers for contact, reply, and followup"
```

---

### Task 6: Contact Button Handlers

**Files:**
- Modify: `src/interactions/buttons.js`

- [ ] **Step 1: Add contact button routing to `handleButton`**

Import the modal builders and add routing for contact buttons before the final "unknown" return:

```javascript
import { buildReplyModal, buildFollowupModal } from '../modals/contactModal.js'

// Add before the final `return ephemeralMsg('不明なインタラクションです。')`:

if (customId.startsWith('contact_reply_')) {
  const reportId = customId.replace('contact_reply_', '')
  return showModal(buildReplyModal(reportId))
}

if (customId.startsWith('contact_followup_')) {
  const reportId = customId.replace('contact_followup_', '')
  return showModal(buildFollowupModal(reportId))
}
```

- [ ] **Step 2: Commit**

```bash
git add src/interactions/buttons.js
git commit -m "feat(contact): add button handlers for reply and followup modals"
```

---

### Task 7: Tests for Contact Interaction Handlers

**Files:**
- Create: `tests/contactModals.test.js`

- [ ] **Step 1: Write tests**

```javascript
// tests/contactModals.test.js
import { handleContactModalSubmit } from '../src/interactions/contactModals.js'
import { getContact } from '../src/utils/contactStore.js'

function createMockKV() {
  const store = new Map()
  return {
    async get(key) { return store.get(key) ?? null },
    async put(key, value, _options) { store.set(key, value) },
    async delete(key) { store.delete(key) },
  }
}

function buildInteraction(customId, fieldId, value) {
  return {
    data: {
      custom_id: customId,
      components: [{
        components: [{ custom_id: fieldId, value }],
      }],
    },
    member: { user: { id: 'user123' } },
  }
}

describe('handleContactModalSubmit', () => {
  let kv
  let env

  beforeEach(() => {
    kv = createMockKV()
    // Mock fetch globally
    global.fetch = jest.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ id: 'dm_channel_1' }), text: () => Promise.resolve('') })
    )
    env = {
      SESSION_KV: kv,
      DISCORD_TOKEN: 'test-token',
      CONTACT_CHANNEL_ID: 'mod-channel-123',
    }
  })

  afterEach(() => {
    delete global.fetch
  })

  test('初回送信でKVに保存されエフェメラル確認が返る', async () => {
    const interaction = buildInteraction('contact_modal', 'contact_body', 'Help me please')
    const result = await handleContactModalSubmit(interaction, env)

    expect(result.type).toBe(4)
    expect(result.data.flags).toBe(64)
    expect(result.data.content).toContain('匿名で送信しました')
    expect(global.fetch).toHaveBeenCalled()
  })

  test('空の本文はエラーを返す', async () => {
    const interaction = buildInteraction('contact_modal', 'contact_body', '')
    const result = await handleContactModalSubmit(interaction, env)

    expect(result.data.content).toContain('内容を入力してください')
  })

  test('期限切れレポートへの返信はエラーを返す', async () => {
    const interaction = buildInteraction('contact_reply_modal_expired123', 'contact_reply_body', 'Reply')
    const result = await handleContactModalSubmit(interaction, env)

    expect(result.data.content).toContain('期限切れ')
  })
})
```

- [ ] **Step 2: Run tests**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/contactModals.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/contactModals.test.js
git commit -m "test(contact): add tests for contact modal submit handlers"
```

---

### Task 8: Update Documentation (Test Phase)

**Files:**
- Modify: `README.md`
- Modify: `RELEASE_NOTES.md`
- Modify: `package.json` (version bump to 0.7.0)

- [ ] **Step 1: Update README.md**

Add to the feature table:

```markdown
| 匿名コンタクト | モデレーターへの匿名通報・相談（双方向やり取り対応） | 🧪 テスト中 |
```

Add a new section after "Bot ステータス":

```markdown
## 匿名コンタクト 🧪

> **この機能はテスト段階です。** 仕様や動作が変更される場合があります。

モデレーターに匿名で通報・相談を送信できるコマンドです。モデレーターとの匿名のやり取り（複数往復）にも対応しています。

### コマンド

\`\`\`bash
/contact
\`\`\`

**必要権限:** なし（全メンバーが使用可能）

### フロー

\`\`\`
/contact コマンド実行
    ↓
モーダルで内容を入力（本人のみ表示）
    ↓
モデレーターチャンネルに匿名で投稿
    ↓
モデレーターが「返信する」ボタン → モーダルで入力
    ↓
送信者にDMで返信が届く（「返信する」ボタン付き）
    ↓
送信者がボタンで返信 → モデレーターチャンネルに匿名で追記
    ↓（繰り返し可能）
\`\`\`

### 特徴

- 送信者の匿名性が保たれる（モデレーターにも送信者は見えない）
- ボタン→モーダル方式で複数往復のやり取りが可能
- データは30日間保持（やり取りがあるたびに延長）

### セットアップ

\`CONTACT_CHANNEL_ID\` 環境変数にモデレーターチャンネルのIDを設定してください。

\`\`\`bash
wrangler secret put CONTACT_CHANNEL_ID
\`\`\`
```

Update the project structure to include new files.

- [ ] **Step 2: Update RELEASE_NOTES.md**

Add at the top:

```markdown
## v0.7.0 — 匿名コンタクト機能（テスト版）

> 2026-03-21

### 追加（🧪 テスト段階）

- `/contact` コマンド — モデレーターに匿名で通報・相談を送信
  - モーダルで本文を入力、モデレーターチャンネルに匿名Embedとして投稿
  - モデレーターが「返信する」ボタンで匿名のまま返信可能（DM経由）
  - 送信者もDM内の「返信する」ボタンで追加メッセージ可能（複数往復対応）
  - データは30日間KVに保持（やり取りがあるたびにTTLを延長）
- `CONTACT_CHANNEL_ID` 環境変数 — モデレーター用チャンネルの指定

---
```

- [ ] **Step 3: Update package.json version**

Change `"version": "0.6.0"` to `"version": "0.7.0"`

- [ ] **Step 4: Update `src/commands/status.js` version string** (if hardcoded)

Check if version is hardcoded in status.js and update to 0.7.0.

- [ ] **Step 5: Commit**

```bash
git add README.md RELEASE_NOTES.md package.json src/commands/status.js
git commit -m "docs: add /contact command docs (test phase) and bump to v0.7.0"
```

---

### Task 9: Register Command & Final Verification

- [ ] **Step 1: Run linter**

Run: `npm run lint`
Expected: No errors

- [ ] **Step 2: Run all tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 3: Commit any fixes if needed**

- [ ] **Step 4: Create PR**

Create a PR with all changes for review before merging to main.
