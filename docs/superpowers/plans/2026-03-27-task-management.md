# タスク管理機能 実装プラン

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** サーバー内でタスクを管理する `/task` コマンドを実装する（add / list / complete / delete / allow-user / remove-user / allowed-users）

**Architecture:** SESSION_KV にタスクデータと設定を保存し、既存の権限チェックパターン（hasManageGuild / hasManageMessages）とサブコマンドルーティングパターンに従う。

**Tech Stack:** Cloudflare Workers, KV Storage, discord.js (deploy only), Jest

---

### Task 1: KVストアユーティリティ

**Files:**
- Create: `src/utils/taskStore.js`
- Test: `tests/taskStore.test.js`

- [ ] **Step 1: Write failing tests for taskStore**

```javascript
// tests/taskStore.test.js
import { getTasks, saveTasks, getTaskConfig, saveTaskConfig } from '../src/utils/taskStore.js'

function createMockKV() {
  const store = new Map()
  return {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => store.set(key, value),
    delete: async (key) => store.delete(key),
  }
}

describe('taskStore', () => {
  test('getTasks returns default when empty', async () => {
    const kv = createMockKV()
    const data = await getTasks(kv, 'g1')
    expect(data).toEqual({ tasks: [], nextId: 1 })
  })

  test('saveTasks and getTasks round-trip', async () => {
    const kv = createMockKV()
    const data = { tasks: [{ id: 1, name: 'test' }], nextId: 2 }
    await saveTasks(kv, 'g1', data)
    const result = await getTasks(kv, 'g1')
    expect(result).toEqual(data)
  })

  test('getTaskConfig returns default when empty', async () => {
    const kv = createMockKV()
    const config = await getTaskConfig(kv, 'g1')
    expect(config).toEqual({ allowedUsers: [] })
  })

  test('saveTaskConfig and getTaskConfig round-trip', async () => {
    const kv = createMockKV()
    const config = { allowedUsers: ['u1', 'u2'] }
    await saveTaskConfig(kv, 'g1', config)
    const result = await getTaskConfig(kv, 'g1')
    expect(result).toEqual(config)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/taskStore.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement taskStore.js**

```javascript
// src/utils/taskStore.js
function tasksKey(guildId) { return `tasks:${guildId}` }
function configKey(guildId) { return `task-config:${guildId}` }

export async function getTasks(kv, guildId) {
  const raw = await kv.get(tasksKey(guildId))
  return raw ? JSON.parse(raw) : { tasks: [], nextId: 1 }
}

export async function saveTasks(kv, guildId, data) {
  await kv.put(tasksKey(guildId), JSON.stringify(data))
}

export async function getTaskConfig(kv, guildId) {
  const raw = await kv.get(configKey(guildId))
  return raw ? JSON.parse(raw) : { allowedUsers: [] }
}

export async function saveTaskConfig(kv, guildId, config) {
  await kv.put(configKey(guildId), JSON.stringify(config))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/taskStore.test.js`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/utils/taskStore.js tests/taskStore.test.js
git commit -m "feat(task): add KV store utility for tasks and config"
```

---

### Task 2: コマンドハンドラー — add / list

**Files:**
- Create: `src/commands/task.js`
- Test: `tests/task.test.js`

- [ ] **Step 1: Write failing tests for add and list**

```javascript
// tests/task.test.js
import { handleTask } from '../src/commands/task.js'

function createMockKV() {
  const store = new Map()
  return {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => store.set(key, value),
    delete: async (key) => store.delete(key),
  }
}

function makeInteraction(sub, options = {}, permissions = '8192') {
  // 8192 = MANAGE_MESSAGES (1 << 13)
  const opts = Object.entries(options).map(([name, value]) => ({ name, value }))
  return {
    guild_id: 'g1',
    member: {
      permissions,
      user: { id: 'u1', global_name: 'TestUser' },
    },
    data: {
      name: 'task',
      options: [{ name: sub, type: 1, options: opts }],
    },
  }
}

describe('task add', () => {
  test('adds a task with all options', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('add', { name: 'テストタスク', deadline: '2026-04-01', priority: 'high' })
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('タスクを追加しました')
    expect(result.data.content).toContain('#1')
    expect(result.data.content).toContain('テストタスク')
    expect(result.data.flags).toBe(64)
  })

  test('adds a task with defaults (medium priority, no deadline)', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('add', { name: 'シンプルタスク' })
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('#1')
    expect(result.data.content).toContain('🟡')
  })

  test('rejects invalid deadline format', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('add', { name: 'タスク', deadline: 'tomorrow' })
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('YYYY-MM-DD')
  })

  test('rejects when no permission and not in allowedUsers', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('add', { name: 'タスク' }, '0')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('権限')
  })

  test('allows add when user is in allowedUsers', async () => {
    const kv = createMockKV()
    await kv.put('task-config:g1', JSON.stringify({ allowedUsers: ['u1'] }))
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('add', { name: 'タスク' }, '0')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('タスクを追加しました')
  })

  test('rejects when task limit reached', async () => {
    const kv = createMockKV()
    const tasks = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1, name: `t${i}`, priority: 'medium', deadline: null,
      createdBy: 'u1', createdAt: new Date().toISOString(), completed: false,
    }))
    await kv.put('tasks:g1', JSON.stringify({ tasks, nextId: 101 }))
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('add', { name: 'overflow' })
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('上限')
  })
})

describe('task list', () => {
  test('shows empty message when no tasks', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('list', {}, '0')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('タスクはありません')
    expect(result.data.flags).toBeUndefined()
  })

  test('shows tasks with priority icons', async () => {
    const kv = createMockKV()
    const data = {
      tasks: [
        { id: 1, name: '緊急タスク', priority: 'high', deadline: '2026-04-01', createdBy: 'u1', createdAt: '2026-03-27T00:00:00Z', completed: false },
        { id: 2, name: '通常タスク', priority: 'medium', deadline: null, createdBy: 'u1', createdAt: '2026-03-27T00:00:00Z', completed: false },
        { id: 3, name: '低めタスク', priority: 'low', deadline: null, createdBy: 'u1', createdAt: '2026-03-27T00:00:00Z', completed: false },
        { id: 4, name: '完了タスク', priority: 'medium', deadline: null, createdBy: 'u1', createdAt: '2026-03-27T00:00:00Z', completed: true },
      ],
      nextId: 5,
    }
    await kv.put('tasks:g1', JSON.stringify(data))
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('list', {}, '0')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('🔴')
    expect(result.data.content).toContain('🟡')
    expect(result.data.content).toContain('✅')
    expect(result.data.content).toContain('🟢')
    expect(result.data.content).toContain('未完了: 3件')
    expect(result.data.content).toContain('完了: 1件')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/task.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement task.js (add and list subcommands)**

```javascript
// src/commands/task.js
import { hasManageGuild, hasManageMessages, permissionDeniedResponse } from '../utils/permissions.js'
import { getUserId } from '../utils/interactionHelpers.js'
import { getTasks, saveTasks, getTaskConfig, saveTaskConfig } from '../utils/taskStore.js'

const TASK_LIMIT = 100
const PRIORITY_ICONS = { high: '🔴', medium: '🟡', low: '🟢' }
const DEADLINE_RE = /^\d{4}-\d{2}-\d{2}$/

function ephemeralMsg(content) {
  return { type: 4, data: { content, flags: 64 } }
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

export async function handleTask(interaction, env) {
  const kv = env.SESSION_KV
  const guildId = interaction.guild_id
  const { sub, options } = getSubcommand(interaction)

  if (sub === 'add') return handleAdd(kv, guildId, options, interaction)
  if (sub === 'list') return handleList(kv, guildId)
  if (sub === 'complete') return handleComplete(kv, guildId, options, interaction)
  if (sub === 'delete') return handleDelete(kv, guildId, options, interaction)
  if (sub === 'allow-user') return handleAllowUser(kv, guildId, options, interaction)
  if (sub === 'remove-user') return handleRemoveUser(kv, guildId, options, interaction)
  if (sub === 'allowed-users') return handleAllowedUsers(kv, guildId, interaction)

  return ephemeralMsg('不明なサブコマンドです。')
}

async function canAddTask(interaction, kv, guildId) {
  if (hasManageMessages(interaction)) return true
  const userId = getUserId(interaction)
  const config = await getTaskConfig(kv, guildId)
  return config.allowedUsers.includes(userId)
}

async function handleAdd(kv, guildId, options, interaction) {
  if (!(await canAddTask(interaction, kv, guildId))) {
    return permissionDeniedResponse('メッセージの管理（または許可ユーザー）')
  }

  const name = options.name
  const deadline = options.deadline ?? null
  const priority = options.priority ?? 'medium'

  if (deadline && !DEADLINE_RE.test(deadline)) {
    return ephemeralMsg('期限は YYYY-MM-DD 形式で入力してください。')
  }

  const data = await getTasks(kv, guildId)

  if (data.tasks.length >= TASK_LIMIT) {
    return ephemeralMsg(`タスクが上限（${TASK_LIMIT}件）に達しています。不要なタスクを削除してください。`)
  }

  const task = {
    id: data.nextId,
    name,
    priority,
    deadline,
    createdBy: getUserId(interaction),
    createdAt: new Date().toISOString(),
    completed: false,
  }
  data.tasks.push(task)
  data.nextId++
  await saveTasks(kv, guildId, data)

  const icon = PRIORITY_ICONS[priority]
  const deadlineLine = deadline ? `\n📅 期限: ${deadline}` : ''
  return ephemeralMsg(`✅ タスクを追加しました\n${icon} #${task.id} ${name}${deadlineLine}`)
}

async function handleList(kv, guildId) {
  const data = await getTasks(kv, guildId)
  if (data.tasks.length === 0) {
    return {
      type: 4,
      data: { content: '📋 タスクリスト\n─────────────────\nタスクはありません。' },
    }
  }

  const lines = data.tasks.map(t => {
    if (t.completed) return `✅ #${t.id} ${t.name}（完了）`
    const icon = PRIORITY_ICONS[t.priority] || '🟡'
    const dl = `\n   📅 期限: ${t.deadline ?? 'なし'}`
    return `${icon} #${t.id} ${t.name}${dl}`
  })

  const incomplete = data.tasks.filter(t => !t.completed).length
  const complete = data.tasks.filter(t => t.completed).length

  const content = [
    '📋 タスクリスト',
    '─────────────────',
    ...lines,
    '─────────────────',
    `未完了: ${incomplete}件 / 完了: ${complete}件`,
  ].join('\n')

  return { type: 4, data: { content } }
}
```

Note: `handleComplete`, `handleDelete`, `handleAllowUser`, `handleRemoveUser`, `handleAllowedUsers` are stubbed as returning `ephemeralMsg('未実装')` for now — implemented in Task 3 and Task 4.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/task.test.js`
Expected: All add and list tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/task.js tests/task.test.js
git commit -m "feat(task): implement add and list subcommands"
```

---

### Task 3: コマンドハンドラー — complete / delete

**Files:**
- Modify: `src/commands/task.js`
- Modify: `tests/task.test.js`

- [ ] **Step 1: Write failing tests for complete and delete**

Append to `tests/task.test.js`:

```javascript
describe('task complete', () => {
  test('marks task as completed', async () => {
    const kv = createMockKV()
    const data = {
      tasks: [{ id: 1, name: 'タスク', priority: 'high', deadline: null, createdBy: 'u1', createdAt: '2026-03-27T00:00:00Z', completed: false }],
      nextId: 2,
    }
    await kv.put('tasks:g1', JSON.stringify(data))
    const env = { SESSION_KV: kv }
    // MANAGE_GUILD = 1 << 5 = 32
    const interaction = makeInteraction('complete', { id: 1 }, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('完了しました')

    const updated = JSON.parse(await kv.get('tasks:g1'))
    expect(updated.tasks[0].completed).toBe(true)
  })

  test('rejects without MANAGE_GUILD', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('complete', { id: 1 }, '0')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('権限')
  })

  test('returns error for non-existent task', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('complete', { id: 99 }, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('見つかりません')
  })
})

describe('task delete', () => {
  test('removes task from array', async () => {
    const kv = createMockKV()
    const data = {
      tasks: [{ id: 1, name: 'タスク', priority: 'high', deadline: null, createdBy: 'u1', createdAt: '2026-03-27T00:00:00Z', completed: false }],
      nextId: 2,
    }
    await kv.put('tasks:g1', JSON.stringify(data))
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('delete', { id: 1 }, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('削除しました')

    const updated = JSON.parse(await kv.get('tasks:g1'))
    expect(updated.tasks).toHaveLength(0)
    expect(updated.nextId).toBe(2) // nextId stays
  })

  test('rejects without MANAGE_GUILD', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('delete', { id: 1 }, '0')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('権限')
  })

  test('returns error for non-existent task', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('delete', { id: 99 }, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('見つかりません')
  })
})
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/task.test.js`
Expected: complete/delete tests FAIL (stubs return '未実装')

- [ ] **Step 3: Implement complete and delete in task.js**

Replace the stubs in `src/commands/task.js`:

```javascript
async function handleComplete(kv, guildId, options, interaction) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const data = await getTasks(kv, guildId)
  const task = data.tasks.find(t => t.id === options.id)
  if (!task) return ephemeralMsg(`タスク #${options.id} が見つかりません。`)

  task.completed = true
  await saveTasks(kv, guildId, data)
  return ephemeralMsg(`✅ タスク #${task.id} を完了しました。`)
}

async function handleDelete(kv, guildId, options, interaction) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const data = await getTasks(kv, guildId)
  const idx = data.tasks.findIndex(t => t.id === options.id)
  if (idx === -1) return ephemeralMsg(`タスク #${options.id} が見つかりません。`)

  data.tasks.splice(idx, 1)
  await saveTasks(kv, guildId, data)
  return ephemeralMsg(`🗑️ タスク #${options.id} を削除しました。`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/task.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/task.js tests/task.test.js
git commit -m "feat(task): implement complete and delete subcommands"
```

---

### Task 4: コマンドハンドラー — allow-user / remove-user / allowed-users

**Files:**
- Modify: `src/commands/task.js`
- Modify: `tests/task.test.js`

- [ ] **Step 1: Write failing tests for config subcommands**

Append to `tests/task.test.js`:

```javascript
describe('task allow-user', () => {
  test('adds user to allowed list', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('allow-user', { user: 'u-target' }, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('許可しました')

    const config = JSON.parse(await kv.get('task-config:g1'))
    expect(config.allowedUsers).toContain('u-target')
  })

  test('skips duplicate user', async () => {
    const kv = createMockKV()
    await kv.put('task-config:g1', JSON.stringify({ allowedUsers: ['u-target'] }))
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('allow-user', { user: 'u-target' }, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('既に登録されています')
  })

  test('rejects without MANAGE_GUILD', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('allow-user', { user: 'u-target' }, '0')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('権限')
  })
})

describe('task remove-user', () => {
  test('removes user from allowed list', async () => {
    const kv = createMockKV()
    await kv.put('task-config:g1', JSON.stringify({ allowedUsers: ['u-target'] }))
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('remove-user', { user: 'u-target' }, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('取り消しました')

    const config = JSON.parse(await kv.get('task-config:g1'))
    expect(config.allowedUsers).not.toContain('u-target')
  })

  test('returns message when user not in list', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('remove-user', { user: 'u-unknown' }, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('登録されていません')
  })
})

describe('task allowed-users', () => {
  test('shows allowed users list', async () => {
    const kv = createMockKV()
    await kv.put('task-config:g1', JSON.stringify({ allowedUsers: ['111', '222'] }))
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('allowed-users', {}, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('<@111>')
    expect(result.data.content).toContain('<@222>')
  })

  test('shows empty message when no users', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('allowed-users', {}, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('許可ユーザーはいません')
  })
})
```

- [ ] **Step 2: Run tests to verify new tests fail**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/task.test.js`
Expected: allow-user/remove-user/allowed-users tests FAIL

- [ ] **Step 3: Implement config subcommands in task.js**

Replace the stubs in `src/commands/task.js`:

```javascript
async function handleAllowUser(kv, guildId, options, interaction) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const userId = options.user
  const config = await getTaskConfig(kv, guildId)
  if (config.allowedUsers.includes(userId)) {
    return ephemeralMsg(`<@${userId}> は既に登録されています。`)
  }

  config.allowedUsers.push(userId)
  await saveTaskConfig(kv, guildId, config)
  return ephemeralMsg(`✅ <@${userId}> にタスク追加を許可しました。`)
}

async function handleRemoveUser(kv, guildId, options, interaction) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const userId = options.user
  const config = await getTaskConfig(kv, guildId)
  const idx = config.allowedUsers.indexOf(userId)
  if (idx === -1) {
    return ephemeralMsg(`<@${userId}> は登録されていません。`)
  }

  config.allowedUsers.splice(idx, 1)
  await saveTaskConfig(kv, guildId, config)
  return ephemeralMsg(`✅ <@${userId}> の許可を取り消しました。`)
}

async function handleAllowedUsers(kv, guildId, interaction) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const config = await getTaskConfig(kv, guildId)
  if (config.allowedUsers.length === 0) {
    return ephemeralMsg('許可ユーザーはいません。')
  }

  const list = config.allowedUsers.map(id => `・<@${id}>`).join('\n')
  return ephemeralMsg(`📋 タスク追加許可ユーザー\n${list}`)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --experimental-vm-modules node_modules/.bin/jest tests/task.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/commands/task.js tests/task.test.js
git commit -m "feat(task): implement allow-user, remove-user, allowed-users subcommands"
```

---

### Task 5: 既存ファイルへの統合

**Files:**
- Modify: `src/worker.js` — ルーティング追加
- Modify: `src/deploy-commands.js` — コマンド登録追加
- Modify: `src/commands/status.js` — コマンド一覧にtask追加

- [ ] **Step 1: Add routing to worker.js**

Add import at top of `src/worker.js`:
```javascript
import { handleTask } from './commands/task.js'
```

Add routing block (follow existing pattern, before the final else):
```javascript
} else if (
  interaction.type === InteractionType.APPLICATION_COMMAND &&
  interaction.data?.name === 'task'
) {
  result = await handleTask(interaction, env)
```

- [ ] **Step 2: Add command definition to deploy-commands.js**

Add to the `commands` array in `src/deploy-commands.js`:

```javascript
new SlashCommandBuilder()
  .setName('task')
  .setDescription('タスク管理')
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('タスクを追加します')
      .addStringOption(opt =>
        opt.setName('name').setDescription('タスク名').setRequired(true)
      )
      .addStringOption(opt =>
        opt.setName('deadline').setDescription('期限（YYYY-MM-DD）').setRequired(false)
      )
      .addStringOption(opt =>
        opt.setName('priority')
          .setDescription('優先度')
          .setRequired(false)
          .addChoices(
            { name: '🔴 緊急', value: 'high' },
            { name: '🟡 通常', value: 'medium' },
            { name: '🟢 低め', value: 'low' },
          )
      )
  )
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('タスク一覧を表示します')
  )
  .addSubcommand(sub =>
    sub.setName('complete')
      .setDescription('タスクを完了にします')
      .addIntegerOption(opt =>
        opt.setName('id').setDescription('タスクID').setRequired(true).setMinValue(1)
      )
  )
  .addSubcommand(sub =>
    sub.setName('delete')
      .setDescription('タスクを削除します')
      .addIntegerOption(opt =>
        opt.setName('id').setDescription('タスクID').setRequired(true).setMinValue(1)
      )
  )
  .addSubcommand(sub =>
    sub.setName('allow-user')
      .setDescription('ユーザーにタスク追加を許可します')
      .addUserOption(opt =>
        opt.setName('user').setDescription('対象ユーザー').setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName('remove-user')
      .setDescription('ユーザーのタスク追加許可を取り消します')
      .addUserOption(opt =>
        opt.setName('user').setDescription('対象ユーザー').setRequired(true)
      )
  )
  .addSubcommand(sub =>
    sub.setName('allowed-users')
      .setDescription('タスク追加許可ユーザー一覧を表示します')
  )
  .toJSON(),
```

Note: `setDefaultMemberPermissions` は設定しない。`add` は許可ユーザーも使えるため、Discord側ではコマンド自体を誰でも見えるようにし、権限チェックはハンドラー内で行う。

- [ ] **Step 3: Add task to status.js command list**

Add to the `COMMANDS` array in `src/commands/status.js`:
```javascript
{ name: 'task', desc: 'タスク管理' },
```

- [ ] **Step 4: Run all tests to verify nothing broke**

Run: `node --experimental-vm-modules node_modules/.bin/jest`
Expected: All tests PASS

- [ ] **Step 5: Run linter**

Run: `npx eslint src/commands/task.js src/utils/taskStore.js`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/worker.js src/deploy-commands.js src/commands/status.js
git commit -m "feat(task): integrate task command into worker routing and deploy"
```

---

### Task 6: バージョン更新・ドキュメント

**Files:**
- Modify: `package.json` — version bump
- Modify: `src/commands/status.js` — VERSION定数更新
- Modify: `RELEASE_NOTES.md` — エントリ追加

- [ ] **Step 1: Check current version**

Read `package.json` version field and `RELEASE_NOTES.md` last entry to determine next version.
Current: `0.13.0` → Next: `0.14.0`（新機能追加 = MINOR bump）

- [ ] **Step 2: Update package.json version**

Change `"version": "0.13.0"` to `"version": "0.14.0"`

- [ ] **Step 3: Update status.js VERSION constant**

Change `const VERSION = '0.13.0'` to `const VERSION = '0.14.0'`

- [ ] **Step 4: Add RELEASE_NOTES.md entry**

Add new entry at the top of the release notes:

```markdown
## v0.14.0 — タスク管理機能

- `/task add` — タスクを追加（名前・期限・優先度）
- `/task list` — タスク一覧を表示
- `/task complete` — タスクを完了にする
- `/task delete` — タスクを削除する
- `/task allow-user` — ユーザーにタスク追加を許可
- `/task remove-user` — 許可を取り消し
- `/task allowed-users` — 許可ユーザー一覧
```

- [ ] **Step 5: Commit**

```bash
git add package.json src/commands/status.js RELEASE_NOTES.md
git commit -m "chore: bump version to v0.14.0, add task management release notes"
```
