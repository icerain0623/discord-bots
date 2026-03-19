import { extractEmojisFromText } from '../src/utils/emojiCounter.js'

describe('extractEmojisFromText', () => {
  test('Unicode 絵文字を抽出する', () => {
    const result = extractEmojisFromText('こんにちは😂🔥🔥')
    expect(result).toEqual({ '😂': 1, '🔥': 2 })
  })
  test('絵文字がない場合は空オブジェクトを返す', () => {
    expect(extractEmojisFromText('hello world')).toEqual({})
  })
  test('空文字列は空オブジェクトを返す', () => {
    expect(extractEmojisFromText('')).toEqual({})
  })
})
