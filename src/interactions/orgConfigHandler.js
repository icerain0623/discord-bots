import { setOrgConfig } from '../utils/orgStore.js'

const EPHEMERAL = 64

function extractJsonField(interaction) {
  for (const row of interaction.data.components ?? []) {
    for (const component of row.components ?? []) {
      if (component.custom_id === 'org_config_json') {
        return component.value?.trim() || ''
      }
    }
  }
  return ''
}

export async function handleOrgConfigModal(interaction, env) {
  const guildId = interaction.guild_id
  const jsonStr = extractJsonField(interaction)

  let config
  try {
    config = JSON.parse(jsonStr)
  } catch (e) {
    return {
      type: 4,
      data: {
        content: `JSON解析エラー: ${e.message}`,
        flags: EPHEMERAL,
      },
    }
  }

  // Validate structure
  if (!config.departments || !Array.isArray(config.departments)) {
    return {
      type: 4,
      data: {
        content: 'JSONに `departments` 配列が必要です。',
        flags: EPHEMERAL,
      },
    }
  }

  for (const dept of config.departments) {
    if (!dept.name || !Array.isArray(dept.roles)) {
      return {
        type: 4,
        data: {
          content: '各部門には `name`（文字列）と `roles`（配列）が必要です。',
          flags: EPHEMERAL,
        },
      }
    }
  }

  await setOrgConfig(env.SESSION_KV, guildId, config)

  return {
    type: 4,
    data: {
      content: `✅ 部門定義を保存しました。（${config.departments.length}部門）`,
      flags: EPHEMERAL,
    },
  }
}
