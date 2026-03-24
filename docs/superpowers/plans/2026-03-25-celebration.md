# お祝いメッセージ保存機能 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** メッセージをコンテキストメニューから専用チャンネルにEmbed形式でアーカイブする機能を追加する

**Architecture:** `/celebration-setup` で管理者がアーカイブ先チャンネルと許可ロールをKVに保存。「お祝い保存」コンテキストメニューで対象メッセージをEmbed転送する。setupは同期レスポンス（type 4）、saveはdeferred（type 5 + followup）パターン。

**Tech Stack:** Cloudflare Workers, discord.js v14 (REST only), Cloudflare KV

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/commands/celebrationSetup.js` | Create | `/celebration-setup` ハンドラ（同期） |
| `src/commands/celebrationSave.js` | Create | 「お祝い保存」コンテキストメニューハンドラ（deferred） |
| `src/worker.js` | Modify | ルーティング追加（2エントリ） |
| `src/deploy-commands.js` | Modify | コマンド定義追加（2コマンド） |

---

### Task 1: Create feature branch

**Files:** None

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b feature/celebration-archive
```

- [ ] **Step 2: Verify branch**

```bash
git branch --show-current
```

Expected: `feature/celebration-archive`

---

### Task 2: Implement `/celebration-setup` command

**Files:**
- Create: `src/commands/celebrationSetup.js`

- [ ] **Step 1: Create celebrationSetup.js**

```javascript
import { hasManageGuild, permissionDeniedResponse } from '../utils/permissions.js'

export async function handleCelebrationSetup(interaction, env) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const channelId = interaction.data.options.find(o => o.name === 'channel')?.value
  const roleId = interaction.data.options.find(o => o.name === 'role')?.value
  const guildId = interaction.guild_id

  await env.SESSION_KV.put(
    `celebration-config:${guildId}`,
    JSON.stringify({ channelId, roleId })
  )

  return {
    type: 4,
    data: {
      content: `お祝い保存の設定が完了しました。\nアーカイブ先: <#${channelId}>\n許可ロール: <@&${roleId}>`,
      flags: 64,
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/celebrationSetup.js
git commit -m "feat: add /celebration-setup command handler"
```

---

### Task 3: Implement 「お祝い保存」 context menu command

**Files:**
- Create: `src/commands/celebrationSave.js`

- [ ] **Step 1: Create celebrationSave.js**

```javascript
import { sendFollowupMessage, postMessage } from '../utils/discordApi.js'

const EMBED_COLOR = 0xFFD700

function getAvatarUrl(author) {
  if (!author.avatar) return null
  return `https://cdn.discordapp.com/avatars/${author.id}/${author.avatar}.png`
}

export async function handleCelebrationSave(interaction, env) {
  const guildId = interaction.guild_id
  const applicationId = interaction.application_id
  const interactionToken = interaction.token

  // KVから設定を取得
  const raw = await env.SESSION_KV.get(`celebration-config:${guildId}`)
  if (!raw) {
    await sendFollowupMessage(applicationId, interactionToken, {
      content: 'お祝い保存が設定されていません。先に `/celebration-setup` を実行してください。',
      flags: 64,
    })
    return
  }

  const config = JSON.parse(raw)

  // ロールチェック（permissions.jsのビットフラグではなく、ロールIDの直接比較）
  if (!interaction.member.roles.includes(config.roleId)) {
    await sendFollowupMessage(applicationId, interactionToken, {
      content: 'この操作に必要なロールがありません。',
      flags: 64,
    })
    return
  }

  // 対象メッセージを取得
  const targetId = interaction.data.target_id
  const message = interaction.data.resolved.messages[targetId]
  const sourceChannelId = interaction.channel_id

  // Embed構築
  const embed = {
    color: EMBED_COLOR,
    author: {
      name: message.author.global_name || message.author.username,
      icon_url: getAvatarUrl(message.author),
    },
    description: message.content || '（テキストなし）',
    fields: [
      {
        name: '元メッセージ',
        value: `[リンク](https://discord.com/channels/${guildId}/${sourceChannelId}/${targetId})`,
        inline: false,
      },
    ],
    timestamp: message.timestamp,
    footer: {
      text: `保存者: ${interaction.member.user.global_name || interaction.member.user.username}`,
    },
  }

  // 画像添付の処理
  const imageAttachments = (message.attachments || [])
    .filter(a => a.content_type?.startsWith('image/'))

  if (imageAttachments.length > 0) {
    embed.image = { url: imageAttachments[0].url }
  }

  // postMessage用のpayload
  const payload = { embeds: [embed] }

  // 2枚目以降の画像はcontentにURLを記載
  if (imageAttachments.length > 1) {
    payload.content = imageAttachments
      .slice(1)
      .map(a => a.url)
      .join('\n')
  }

  // アーカイブチャンネルに送信
  const res = await postMessage(config.channelId, env.DISCORD_TOKEN, payload)

  if (!res.ok) {
    await sendFollowupMessage(applicationId, interactionToken, {
      content: 'アーカイブチャンネルへの送信に失敗しました。チャンネルが存在するか、Bot に送信権限があるか確認してください。',
      flags: 64,
    })
    return
  }

  await sendFollowupMessage(applicationId, interactionToken, {
    content: `お祝いメッセージを <#${config.channelId}> に保存しました。`,
    flags: 64,
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/commands/celebrationSave.js
git commit -m "feat: add celebration save context menu handler"
```

---

### Task 4: Register commands in deploy-commands.js

**Files:**
- Modify: `src/deploy-commands.js`

- [ ] **Step 1: Add command definitions**

After the relay command block (line 231), add:

```javascript
  new SlashCommandBuilder()
    .setName('celebration-setup')
    .setDescription('お祝い保存機能を設定します')
    .addChannelOption(option =>
      option
        .setName('channel')
        .setDescription('アーカイブ先チャンネル')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    )
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('操作を許可するロール')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .toJSON(),
  new ContextMenuCommandBuilder()
    .setName('お祝い保存')
    .setType(ApplicationCommandType.Message)
    .toJSON(),
```

Note: 「お祝い保存」は `defaultMemberPermissions` を設定しない（全員に表示、ロールチェックは実行時）。

- [ ] **Step 2: Commit**

```bash
git add src/deploy-commands.js
git commit -m "feat: register celebration commands in deploy-commands"
```

---

### Task 5: Add routing in worker.js

**Files:**
- Modify: `src/worker.js`

- [ ] **Step 1: Add imports**

At the top of worker.js, add:

```javascript
import { handleCelebrationSetup } from './commands/celebrationSetup.js'
import { handleCelebrationSave } from './commands/celebrationSave.js'
```

- [ ] **Step 2: Add routing entries**

After the relay routing block (lines 83-87) and before the `MESSAGE_COMPONENT` handler (line 88), add:

```javascript
      } else if (
        interaction.type === InteractionType.APPLICATION_COMMAND &&
        interaction.data?.name === 'celebration-setup'
      ) {
        result = await handleCelebrationSetup(interaction, env)
      } else if (
        interaction.type === InteractionType.APPLICATION_COMMAND &&
        interaction.data?.name === 'お祝い保存'
      ) {
        ctx.waitUntil(handleCelebrationSave(interaction, env))
        return Response.json({ type: 5, data: { flags: 64 } })
```

- [ ] **Step 3: Commit**

```bash
git add src/worker.js
git commit -m "feat: add celebration routing in worker"
```

---

### Task 6: Deploy and verify

- [ ] **Step 1: Register commands to Discord**

```bash
node src/deploy-commands.js
```

Expected: `✅ スラッシュコマンドを登録しました`

- [ ] **Step 2: Deploy to Cloudflare Workers**

```bash
npx wrangler deploy
```

- [ ] **Step 3: Manual verification**

1. サーバーで `/celebration-setup channel:#テストチャンネル role:@テストロール` を実行 → 設定完了メッセージが表示される
2. テストロールを持つユーザーで任意のメッセージを右クリック → 「お祝い保存」 → アーカイブチャンネルにEmbed転送される
3. テストロールを持たないユーザーで試す → 権限エラーが表示される
