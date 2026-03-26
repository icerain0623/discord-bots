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
  const config = raw ? JSON.parse(raw) : { allowedRoles: [] }
  if (!config.allowedRoles) {
    config.allowedRoles = []
    delete config.allowedUsers
  }
  return config
}

export async function saveTaskConfig(kv, guildId, config) {
  await kv.put(configKey(guildId), JSON.stringify(config))
}
