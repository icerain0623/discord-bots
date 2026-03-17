import { formatIntro } from '../src/utils/formatIntro.js'

const sampleData = {
  name: '山田太郎',
  gender: '男性',
  age: '25',
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
  want: 'モニター',
  pet: 'ねこ',
  holiday: 'ゲームして過ごす',
  reply: '早い',
  game: 'やってる',
  oneword: 'よろしくお願いします！',
}

describe('formatIntro', () => {
  test('全フィールドが出力に含まれる', () => {
    const result = formatIntro('TestUser', sampleData)
    expect(result).toContain('山田太郎')
    expect(result).toContain('男性')
    expect(result).toContain('【基本】')
    expect(result).toContain('【好きな物】')
    expect(result).toContain('【もっと！】')
    expect(result).toContain('【一言！】')
  })

  test('未入力フィールドは "未回答" と表示される', () => {
    const result = formatIntro('TestUser', { name: '花子' })
    expect(result).toContain('性別：未回答')
  })

  test('ユーザー名がヘッダーに含まれる', () => {
    const result = formatIntro('TestUser', sampleData)
    expect(result).toContain('TestUser')
  })
})
