export const HANDS = ['rock', 'scissors', 'paper']

export const HAND_EMOJI = {
  rock: '✊',
  scissors: '✌️',
  paper: '✋',
}

export const HAND_LABEL = {
  rock: 'グー',
  scissors: 'チョキ',
  paper: 'パー',
}

/**
 * Judge janken result.
 * @param {string} a - player A's hand
 * @param {string} b - player B's hand
 * @returns {'draw' | 'a' | 'b'}
 */
export function judge(a, b) {
  if (a === b) return 'draw'
  if (
    (a === 'rock' && b === 'scissors') ||
    (a === 'scissors' && b === 'paper') ||
    (a === 'paper' && b === 'rock')
  ) return 'a'
  return 'b'
}
