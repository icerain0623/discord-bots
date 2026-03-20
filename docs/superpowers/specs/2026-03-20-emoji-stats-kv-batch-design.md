# emoji-stats KV バッチ集計 設計書

## 概要

emoji-stats コマンドのリアルタイム集計を廃止し、ローカル PC でのバッチ集計 + Cloudflare KV からの読み取りに切り替える。Cloudflare Workers Free プランの 30 秒制限を回避し、チャンネル数・スレッド数の上限なく全件集計できるようにする。週単位でデータを蓄積し、期間別のランキング表示に対応する。

## 背景

- Workers Free プランの実行時間制限（30 秒）により、チャンネル数・スレッド数に上限を設ける必要があった
- ローカル PC で集計すれば時間制限がなく、全チャンネル・全スレッドを対象にできる
- 超正確な精度は不要で、週 1 回程度の集計頻度で十分
- 週・月・全期間でのランキング比較ができると有用

## 全体構成

```
ローカル（PC）                             Cloudflare
┌─────────────────────────┐              ┌──────────────────────┐
│ npm run collect          │              │                      │
│  ├─ Discord API で集計   │  wrangler   │   SESSION_KV         │
│  ├─ 週別 JSON 生成      │ ──────────→ │   emoji-stats-channel │
│  └─ KV に書き込み        │   kv:key    │   emoji-stats-forum   │
└─────────────────────────┘    put       └──────────┬───────────┘
                                                    │ KV.get
                                         ┌──────────┴───────────┐
                                         │  Worker              │
                                         │  /emoji-stats        │
                                         │  → KV 読み取り        │
                                         │  → 期間別に合算       │
                                         │  → Embed 即時返信     │
                                         └──────────────────────┘
```

## KV データ構造

キー: `emoji-stats-channel`, `emoji-stats-forum`

```json
{
  "weeks": {
    "2026-W12": {
      "counts": { "😂": 50, "🔥": 30 },
      "messageCount": 500,
      "channelCount": 20
    },
    "2026-W11": {
      "counts": { "😂": 78, "🔥": 65 },
      "messageCount": 620,
      "channelCount": 20
    }
  },
  "lastMessageId": "1234567890123456789",
  "lastRun": "2026-03-20T10:00:00Z"
}
```

- 週キーは ISO 8601 形式（月曜始まり、例: `2026-W12`）
- `lastMessageId`: Discord Snowflake ID。次回実行時に `after` パラメータとして使用
- `lastRun`: 表示用の最終集計日時
- 各週に `messageCount` と `channelCount` を保持（フッター表示用）
- サイズ: 1 週あたり数 KB。KV 値上限 25 MiB に対して数年分でも問題なし。データのプルーニングは行わない

## コンポーネント

### 1. ローカル集計スクリプト (`scripts/collect-emoji-stats.js`)

- `dotenv/config` で `.env` から `DISCORD_TOKEN`, `GUILD_ID` を読み込む
- 既存の `emojiCounter.js` の関数を再利用
- チャンネル数・スレッド数の上限なし

#### メッセージ取得

`discordApi.js` に新関数 `getAllMessagesSince(channelId, token, afterId)` を追加する。

- `after` パラメータで `afterId` 以降のメッセージを取得（古い順）
- ページ数上限なし（ローカル実行用）
- 既存の `getAllMessages` は変更しない（Worker 側では使わなくなるが後方互換を維持）

#### 初回実行（KV にデータなし）

- `afterId` なしで全期間のメッセージを取得（時間をかけて収集）
- メッセージを `msg.timestamp` の ISO 週番号で振り分け、週ごとに `countEmojis` を呼び出してカウント
- 結果を KV に書き込み

#### 2 回目以降

- KV から既存データを読み取り、`lastMessageId` を取得
- `getAllMessagesSince(channelId, token, lastMessageId)` で新規メッセージのみ取得
- 新規メッセージを週ごとに振り分けてカウント
- 既存の週別データにマージ（各絵文字のカウントを加算）して KV に書き戻し

#### レートリミット対応

ローカル実行時は API 呼び出し回数が多くなるため、`discordFetch` のレートリミット処理を強化する。

- 429 レスポンス時は `Retry-After` ヘッダーの値だけ待機してリトライ
- 既存の `x-ratelimit-remaining === '0'` のハンドリングはそのまま維持

#### KV 書き込み

- JSON を一時ファイルに書き出し、`child_process.execSync` で `npx wrangler kv:key put --namespace-id <KV_ID> --path <tmpfile>` を実行
- KV namespace ID は `wrangler.toml` の `id` フィールドから読み取る（`fs.readFileSync` + パース）
- 前提: `wrangler login` 済みであること

#### 実行方法

- `npm run collect`（`"collect": "node scripts/collect-emoji-stats.js"`）

### 2. Worker 側 (`src/commands/emojiStats.js`)

- Discord API への集計処理を削除（Worker からは集計系関数を呼ばなくなる）
- `env.SESSION_KV.get()` で KV から読み取り
- `期間` オプションに応じて該当週のデータを合算してランキング生成
- KV が `null` の場合（未集計時）は「まだ集計データがありません」のメッセージを返す
- KV 読み取りは高速なので deferred response（type: 5）→ 即時レスポンス（type: 4）に変更

### 3. コマンドインターフェース

`/emoji-stats` コマンドにオプション 2 つ:

| オプション | 型 | 必須 | 選択肢 |
|-----------|-----|------|--------|
| `対象` | String | Yes | `テキストチャンネル` / `フォーラム` |
| `期間` | String | Yes | `今週` / `先週` / `今月` / `先月` / `全期間` |

#### 期間の解決ロジック

- **今週**: 現在の ISO 週番号のデータ
- **先週**: 現在の ISO 週番号 - 1 のデータ
- **今月**: 現在の月に含まれる週のデータを合算。週の所属月は木曜日の月で判定（ISO 8601 準拠）
- **先月**: 前月に含まれる週のデータを合算（同上）
- **全期間**: 全週のデータを合算

### 4. Embed 表示

#### タイトル

期間に応じて動的に変更する。

- `📊 絵文字ランキング（今週）`
- `📊 絵文字ランキング（先月）`
- `📊 絵文字ランキング（全期間）`

#### フッター

```
集計対象: 20チャンネル / 1,234メッセージ（最終集計: 2026/03/20 19:00 JST）
```

`messageCount` と `channelCount` は該当週の値を合算して表示。

## 変更ファイル一覧

| ファイル | 変更 |
|---------|------|
| `scripts/collect-emoji-stats.js` | 新規: ローカル集計スクリプト |
| `src/commands/emojiStats.js` | KV 読み取り + 期間別合算に書き換え |
| `src/worker.js` | deferred → 即時レスポンスに変更、`ctx.waitUntil` 削除 |
| `src/utils/formatEmojiStats.js` | タイトルに期間ラベル、フッターに最終集計日時（JST）追加 |
| `src/utils/discordApi.js` | `getAllMessagesSince` 追加、`discordFetch` に 429 リトライ追加 |
| `src/deploy-commands.js` | `期間` オプション追加 |
| `package.json` | `"collect": "node scripts/collect-emoji-stats.js"` 追加 |

## テスト方針

- `formatEmojiStats` のテストに `collectedAt` と `periodLabel` のケースを追加
- 期間別の週フィルタ・合算ロジック（ISO 週 → 月の所属判定含む）のユニットテストを追加
- ローカルスクリプトは手動実行で確認（Discord API への実リクエストが必要なため）
