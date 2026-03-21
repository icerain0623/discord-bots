const DEFAULT_CONFIG = {
  departments: [
    { name: '部門名', roles: ['ロール名1', 'ロール名2'] },
  ],
}

export function buildOrgConfigModal(currentConfig) {
  const value = currentConfig
    ? JSON.stringify(currentConfig, null, 2)
    : JSON.stringify(DEFAULT_CONFIG, null, 2)

  return {
    custom_id: 'org_config_modal',
    title: '組織図 部門定義',
    components: [
      {
        type: 1,
        components: [{
          type: 4,
          custom_id: 'org_config_json',
          label: '部門定義 (JSON)',
          placeholder: '{"departments": [{"name": "部門名", "roles": ["ロール名"]}]}',
          style: 2,
          required: true,
          max_length: 4000,
          value,
        }],
      },
    ],
  }
}
