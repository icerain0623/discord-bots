import { generateReportId } from '../src/utils/reportId.js'

describe('generateReportId', () => {
  test('32文字の16進数文字列を生成する', () => {
    const id = generateReportId()
    expect(id).toMatch(/^[a-f0-9]{32}$/)
  })

  test('毎回異なるIDを生成する', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateReportId()))
    expect(ids.size).toBe(100)
  })
})
