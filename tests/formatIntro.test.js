import { formatIntro } from '../src/utils/formatIntro.js'

const sampleData = {
  name: '山田太郎',
  title: 'エンジニア',
  hometown: '東京都',
  hobby: 'プログラミング',
  skill: 'TypeScript',
  myboom: 'コーヒー',
  food: 'ラーメン',
  drink: 'コーヒー',
  place: '秋葉原',
  oshi: 'なし',
  music: 'ロック',
  book: '技術書',
  oneword: 'よろしくお願いします！',
}

describe('formatIntro', () => {
  test('全フィールドが出力に含まれる', () => {
    const result = formatIntro('TestUser', '123456', sampleData)
    expect(result).toContain('山田太郎')
    expect(result).toContain('【基本】')
    expect(result).toContain('【好きな物】')
    expect(result).toContain('【一言！】')
  })

  test('未入力フィールドは "未回答" と表示される', () => {
    const result = formatIntro('TestUser', '123456', { name: '花子' })
    expect(result).toContain('肩書き：未回答')
  })

  test('ユーザーIDがあればメンション形式になる', () => {
    const result = formatIntro('TestUser', '123456', sampleData)
    expect(result).toContain('<@123456>')
    expect(result).not.toContain('**TestUser**')
  })

  test('ユーザーIDがなければボールド表示になる', () => {
    const result = formatIntro('TestUser', null, sampleData)
    expect(result).toContain('**TestUser**')
  })
})
