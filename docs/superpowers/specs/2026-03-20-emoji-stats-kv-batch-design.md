# emoji-stats KV バッチ集計 設計書

## 概要

emoji-stats コマンドのリアルタイム集計を廃止し、ローカル PC でのバッチ集計 + Cloudflare KV からの読み取りに切り替える。Cloudflare Workers Free プランの 30 秒制限を回避し、チャンネル数・スレッド数の上限なく全件集計できるようにする。

## 背景

- Workers Free プランの実行時間制限（30 秒）により、チャンネル数・スレッド数に上限を設ける必要があった
- ローカル PC で集計すれば時間制限がなく、全チャンネル・全スレッドを対象にできる
- 超正確な精度は不要で、週 1 回程度の集計頻度で十分

## 全体構成

```
ローカル（PC）                             Cloudflare
┌─────────────────────────┐              ┌──────────────────────┐
│ npm run collect          │              │                      │
│  ├─ Discord API で集計   │  wrangler   │   SESSION_KV         │
│  ├─ JSON 生成           │ ──────────→ │   emoji-stats-channel │
│  └─ KV に書き込み        │   kv:key    │   emoji-stats-forum   │
└─────────────────────────┘    put       └──────────┬───────────┘
                                                    │ KV.get
                                         ┌──────────┴───────────┐
                                         │  Worker              │
                                         │  /emoji-stats        │
                                         │  → KV 読み取り        │
                                         │  → Embed 即時返信     │
                                         └──────────────────────┘
```

## KV データ構造

キー: `emoji-stats-channel`, `emoji-stats-forum`

```json
{
  "counts": { "😂": 128, "🔥": 95 },
  "sourceLabel": "20チャンネル",
  "messageCount": 1234,
  "collectedAt": "2026-03-20T10:00:00Z"
}
```

## コンポーネント

### 1. ローカル集計スクリプト (`scripts/collect-emoji-stats.js`)

- `.env` から `DISCORD_TOKEN`, `GUILD_ID` を読み込む
- 既存の `discordApi.js`, `emojiCounter.js` のロジックを再利用
- テキストチャンネルとフォーラムの両方を集計
- チャンネル数・スレッド数・ページ数の上限なし（ローカル実行なので時間制限なし）
- `wrangler kv:key put` で `SESSION_KV` に 2 つのキーを書き込み
- `npm run collect` で実行

### 2. Worker 側 (`src/commands/emojiStats.js`)

- Discord API への集計処理を削除
- `env.SESSION_KV.get()` で KV から読み取り
- KV 読み取りは高速なので deferred response（type: 5）→ 即時レスポンス（type: 4）に変更

### 3. コマンドインターフェース

既存の `/emoji-stats` コマンドはそのまま維持。

- `対象: テキストチャンネル` → KV キー `emoji-stats-channel` を読む
- `対象: フォーラム` → KV キー `emoji-stats-forum` を読む

### 4. フッター表示

`collectedAt` を表示して、いつ時点のデータかわかるようにする。

```
集計対象: 20チャンネル / 1,234メッセージ（集計日時: 2026/03/20 19:00）
```

## 変更ファイル一覧

| ファイル | 変更 |
|---------|------|
| `scripts/collect-emoji-stats.js` | 新規: ローカル集計スクリプト |
| `src/commands/emojiStats.js` | KV 読み取りに書き換え |
| `src/worker.js` | deferred → 即時レスポンスに変更 |
| `src/utils/formatEmojiStats.js` | フッターに集計日時追加 |
| `src/utils/discordApi.js` | MAX_CHANNELS 制限・MAX_PAGES_PER_CHANNEL 制限を撤廃 |
| `package.json` | `collect` スクリプト追加 |

## テスト方針

- `formatEmojiStats` のテストに `collectedAt` のケースを追加
- ローカルスクリプトは手動実行で確認（Discord API への実リクエストが必要なため）
