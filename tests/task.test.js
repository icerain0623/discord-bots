import { handleTask } from '../src/commands/task.js'

function createMockKV() {
  const store = new Map()
  return {
    get: async (key) => store.get(key) ?? null,
    put: async (key, value) => store.set(key, value),
    delete: async (key) => store.delete(key),
  }
}

function makeInteraction(sub, options = {}, permissions = '8192', roles = []) {
  // 8192 = MANAGE_MESSAGES (1 << 13)
  const opts = Object.entries(options).map(([name, value]) => ({ name, value }))
  return {
    guild_id: 'g1',
    member: {
      permissions,
      roles,
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

  test('allows add when user has allowed role', async () => {
    const kv = createMockKV()
    await kv.put('task-config:g1', JSON.stringify({ allowedRoles: ['role1'] }))
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('add', { name: 'タスク' }, '0', ['role1'])
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

describe('task allow-role', () => {
  test('adds role to allowed list', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('allow-role', { role: 'r-target' }, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('許可しました')

    const config = JSON.parse(await kv.get('task-config:g1'))
    expect(config.allowedRoles).toContain('r-target')
  })

  test('skips duplicate role', async () => {
    const kv = createMockKV()
    await kv.put('task-config:g1', JSON.stringify({ allowedRoles: ['r-target'] }))
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('allow-role', { role: 'r-target' }, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('既に登録されています')
  })

  test('rejects without MANAGE_GUILD', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('allow-role', { role: 'r-target' }, '0')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('権限')
  })
})

describe('task remove-role', () => {
  test('removes role from allowed list', async () => {
    const kv = createMockKV()
    await kv.put('task-config:g1', JSON.stringify({ allowedRoles: ['r-target'] }))
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('remove-role', { role: 'r-target' }, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('取り消しました')

    const config = JSON.parse(await kv.get('task-config:g1'))
    expect(config.allowedRoles).not.toContain('r-target')
  })

  test('returns message when role not in list', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('remove-role', { role: 'r-unknown' }, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('登録されていません')
  })
})

describe('task allowed-roles', () => {
  test('shows allowed roles list', async () => {
    const kv = createMockKV()
    await kv.put('task-config:g1', JSON.stringify({ allowedRoles: ['111', '222'] }))
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('allowed-roles', {}, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('<@&111>')
    expect(result.data.content).toContain('<@&222>')
  })

  test('shows empty message when no roles', async () => {
    const kv = createMockKV()
    const env = { SESSION_KV: kv }
    const interaction = makeInteraction('allowed-roles', {}, '32')
    const result = await handleTask(interaction, env)
    expect(result.data.content).toContain('許可ロールはありません')
  })
})
