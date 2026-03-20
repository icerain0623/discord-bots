import { hasManageGuild, permissionDeniedResponse } from '../utils/permissions.js'

const VERSION = '0.9.0'

const COMMANDS = [
  { name: 'setup-intro', desc: '自己紹介パネル設置' },
  { name: 'emoji-stats', desc: '絵文字ランキング表示' },
  { name: 'status', desc: 'Bot ステータス表示' },
  { name: 'matchup', desc: '交流マッチング（テスト機能）' },
  { name: 'contact', desc: '匿名コンタクト（テスト機能）' },
]

function formatJST(isoString) {
  if (!isoString) return '未取得'
  const d = new Date(isoString)
  const yyyy = d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Tokyo' })
  const hhmm = d.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo', hour12: false })
  return `${yyyy} ${hhmm} JST`
}

export async function handleStatus(interaction, env) {
  if (!hasManageGuild(interaction)) {
    return permissionDeniedResponse('サーバーの管理')
  }

  const raw = await env.SESSION_KV.get('emoji-stats')
  let statsLine = '最終集計: 未実行'
  if (raw) {
    const data = JSON.parse(raw)
    const weekCount = Object.keys(data.weeks).length
    statsLine = `最終集計: ${formatJST(data.lastRun)} / ${weekCount}週分`
  }

  const commandList = COMMANDS.map(c => `\`/${c.name}\` — ${c.desc}`).join('\n')

  const embed = {
    title: `🔧 Bot Status (v${VERSION})`,
    fields: [
      { name: '📊 絵文字統計', value: statsLine },
      { name: '📋 登録コマンド', value: commandList },
    ],
    color: 0x5865f2,
    footer: { text: 'Cloudflare Workers' },
  }

  return {
    type: 4,
    data: { embeds: [embed], flags: 64 },
  }
}
