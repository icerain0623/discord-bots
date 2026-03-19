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

describe('extractEmojisFromText — custom emojis', () => {
  test('カスタム絵文字を抽出する', () => {
    const result = extractEmojisFromText('これは <:kusa:123456> だね <:kusa:123456>')
    expect(result).toEqual({ '<:kusa:123456>': 2 })
  })
  test('アニメーション絵文字を抽出する', () => {
    const result = extractEmojisFromText('動く <a:parrot:789>')
    expect(result).toEqual({ '<a:parrot:789>': 1 })
  })
  test('Unicode とカスタムの両方を抽出する', () => {
    const result = extractEmojisFromText('😂 <:kusa:123>')
    expect(result).toEqual({ '😂': 1, '<:kusa:123>': 1 })
  })
})
