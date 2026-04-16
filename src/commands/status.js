import { hasManageGuild, permissionDeniedResponse } from '../utils/permissions.js'

const VERSION = '0.20.0'

const COMMAND_SECTIONS = [
  {
    name: '🎮 サーバー機能',
    commands: [
      '`/setup-intro` — 自己紹介パネル設置（管理者）',
      '`/emoji-stats <期間>` — 絵文字ランキング表示',
      '`/contact` — モデレーターに匿名で連絡',
      '`/matchup start/run/terminate` — 交流マッチング（管理者）',
      '`/relay start/status/post/...` — 1文リレー（管理者）',
      '`/task add/list/complete/delete` — タスク管理',
    ],
  },
  {
    name: '💰 肩書コイン経済',
    commands: [
      '`/economy join` — 経済に参加（初期100コイン）',
      '`/economy leave` — 離脱申請',
      '`/economy status` — 参加者一覧',
      '`/economy grant/revoke <user> <amount>` — 付与/回収（管理者）',
      '`/bank balance` — 残高確認',
      '`/bank send <user> <amount>` — 送金',
      '`/bank daily` — デイリーボーナス（50コイン/日）',
      '`/bank history` — 取引履歴',
      '`/bank ranking` — 残高ランキング',
    ],
  },
  {
    name: '🎰 ギャンブル',
    commands: [
      '`/slot play <bet>` — スロットマシン（10〜5000）',
      '`/slot rules` — スロット配当表',
      '`/janken challenge <user> <bet>` — じゃんけん対戦（10〜5000）',
    ],
  },
  {
    name: '⚙️ 管理',
    commands: [
      '`/status` — Bot ステータス表示（管理者）',
      '`/censor-settings <mode>` — 検閲モード設定（管理者）',
      '`/org setup/refresh/config/...` — 組織図管理（管理者）',
      '`/celebration-setup` — お祝い保存設定（管理者）',
    ],
  },
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

  const fields = [
    { name: '📊 絵文字統計', value: statsLine },
  ]
  for (const section of COMMAND_SECTIONS) {
    fields.push({ name: section.name, value: section.commands.join('\n') })
  }

  const embed = {
    title: `🔧 Bot Status (v${VERSION})`,
    fields,
    color: 0x5865f2,
    footer: { text: 'Cloudflare Workers' },
  }

  return {
    type: 4,
    data: { embeds: [embed], flags: 64 },
  }
}
