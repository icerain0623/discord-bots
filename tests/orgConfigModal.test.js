import { describe, test, expect } from '@jest/globals'
import { buildOrgConfigModal } from '../src/modals/orgConfigModal.js'

describe('buildOrgConfigModal', () => {
  test('builds modal with empty JSON when no current config', () => {
    const modal = buildOrgConfigModal(null)
    expect(modal.custom_id).toBe('org_config_modal')
    expect(modal.title).toBe('組織図 部門定義')
    const textInput = modal.components[0].components[0]
    expect(textInput.custom_id).toBe('org_config_json')
    expect(textInput.style).toBe(2) // Paragraph
    expect(textInput.value).toContain('"departments"')
  })

  test('builds modal with current config as value', () => {
    const config = { departments: [{ name: '三役', roles: ['幹事長'] }] }
    const modal = buildOrgConfigModal(config)
    const textInput = modal.components[0].components[0]
    expect(textInput.value).toBe(JSON.stringify(config, null, 2))
  })
})
