import { judge, HANDS, HAND_EMOJI, HAND_LABEL } from '../src/utils/jankenLogic.js'

describe('judge', () => {
  test('rock vs rock = draw', () => {
    expect(judge('rock', 'rock')).toBe('draw')
  })
  test('scissors vs scissors = draw', () => {
    expect(judge('scissors', 'scissors')).toBe('draw')
  })
  test('paper vs paper = draw', () => {
    expect(judge('paper', 'paper')).toBe('draw')
  })
  test('rock beats scissors (a wins)', () => {
    expect(judge('rock', 'scissors')).toBe('a')
  })
  test('scissors beats paper (a wins)', () => {
    expect(judge('scissors', 'paper')).toBe('a')
  })
  test('paper beats rock (a wins)', () => {
    expect(judge('paper', 'rock')).toBe('a')
  })
  test('scissors loses to rock (b wins)', () => {
    expect(judge('scissors', 'rock')).toBe('b')
  })
  test('paper loses to scissors (b wins)', () => {
    expect(judge('paper', 'scissors')).toBe('b')
  })
  test('rock loses to paper (b wins)', () => {
    expect(judge('rock', 'paper')).toBe('b')
  })
})

describe('constants', () => {
  test('HANDS contains all three hands', () => {
    expect(HANDS).toEqual(['rock', 'scissors', 'paper'])
  })
  test('HAND_EMOJI maps all hands', () => {
    expect(HAND_EMOJI.rock).toBe('✊')
    expect(HAND_EMOJI.scissors).toBe('✌️')
    expect(HAND_EMOJI.paper).toBe('✋')
  })
  test('HAND_LABEL maps all hands in Japanese', () => {
    expect(HAND_LABEL.rock).toBe('グー')
    expect(HAND_LABEL.scissors).toBe('チョキ')
    expect(HAND_LABEL.paper).toBe('パー')
  })
})
