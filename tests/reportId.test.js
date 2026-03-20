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
