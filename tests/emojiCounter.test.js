import { extractEmojisFromText, countReactions, countEmojis } from '../src/utils/emojiCounter.js'

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

describe('countReactions', () => {
  test('リアクションをカウントする', () => {
    const reactions = [
      { emoji: { name: '😂', id: null }, count: 5 },
      { emoji: { name: 'kusa', id: '123456' }, count: 3 },
    ]
    expect(countReactions(reactions)).toEqual({ '😂': 5, '<:kusa:123456>': 3 })
  })
  test('リアクションが空の場合は空オブジェクトを返す', () => {
    expect(countReactions(undefined)).toEqual({})
    expect(countReactions([])).toEqual({})
  })
  test('アニメーション絵文字のリアクション', () => {
    const reactions = [{ emoji: { name: 'parrot', id: '789', animated: true }, count: 2 }]
    expect(countReactions(reactions)).toEqual({ '<a:parrot:789>': 2 })
  })
})

describe('countEmojis', () => {
  test('メッセージ内絵文字とリアクションを合算する', () => {
    const messages = [{
      content: '😂😂',
      reactions: [{ emoji: { name: '😂', id: null }, count: 3 }],
      author: { bot: false },
    }]
    expect(countEmojis(messages)).toEqual({ '😂': 5 })
  })
  test('Bot のメッセージは除外する', () => {
    const messages = [
      { content: '😂', reactions: [], author: { bot: true } },
      { content: '🔥', reactions: [], author: { bot: false } },
    ]
    expect(countEmojis(messages)).toEqual({ '🔥': 1 })
  })
  test('空の配列は空オブジェクトを返す', () => {
    expect(countEmojis([])).toEqual({})
  })
})
