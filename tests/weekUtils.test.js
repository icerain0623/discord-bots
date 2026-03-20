import { getISOWeekKey, getWeekKeysForPeriod } from '../src/utils/weekUtils.js'

describe('getISOWeekKey', () => {
  test('月曜日の日付からISO週キーを返す', () => {
    expect(getISOWeekKey(new Date('2026-03-16T00:00:00Z'))).toBe('2026-W12')
  })

  test('日曜日は同じ週に属する', () => {
    expect(getISOWeekKey(new Date('2026-03-22T00:00:00Z'))).toBe('2026-W12')
  })

  test('年をまたぐ週を正しく処理する', () => {
    expect(getISOWeekKey(new Date('2025-12-29T00:00:00Z'))).toBe('2026-W01')
  })
})

describe('getWeekKeysForPeriod', () => {
  const availableWeeks = ['2026-W09', '2026-W10', '2026-W11', '2026-W12']
  const now = new Date('2026-03-20T10:00:00Z')

  test('今週: 現在の週のみ返す', () => {
    expect(getWeekKeysForPeriod('this_week', availableWeeks, now)).toEqual(['2026-W12'])
  })

  test('先週: 1つ前の週を返す', () => {
    expect(getWeekKeysForPeriod('last_week', availableWeeks, now)).toEqual(['2026-W11'])
  })

  test('全期間: すべての週を返す', () => {
    expect(getWeekKeysForPeriod('all', availableWeeks, now)).toEqual(availableWeeks)
  })

  test('今月: 木曜日が3月に含まれる週を返す', () => {
    const result = getWeekKeysForPeriod('this_month', availableWeeks, now)
    expect(result).toContain('2026-W10')
    expect(result).toContain('2026-W11')
    expect(result).toContain('2026-W12')
    expect(result).not.toContain('2026-W09')
  })

  test('先月: 木曜日が2月に含まれる週を返す', () => {
    const result = getWeekKeysForPeriod('last_month', availableWeeks, now)
    expect(result).toContain('2026-W09')
    expect(result).not.toContain('2026-W10')
  })

  test('該当する週がない場合は空配列を返す', () => {
    expect(getWeekKeysForPeriod('last_week', ['2026-W12'], now)).toEqual([])
  })
})
