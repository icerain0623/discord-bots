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
