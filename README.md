# discord-bots

複数の Bot 機能を内包した Discord Bot プロジェクト。

## 機能一覧

| 機能 | 説明 | ステータス | ドキュメント |
|------|------|-----------|-------------|
| 自己紹介ワークフロー | ステップ式モーダルで自己紹介を簡単投稿 | ✅ 稼働中 | [詳細](docs/intro-workflow.md) |
| 絵文字ランキング | テキストチャンネル+フォーラムの絵文字使用状況を期間別に表示 | ✅ 稼働中 | [詳細](docs/emoji-stats.md) |
| Bot ステータス | バージョン・集計状況・登録コマンドを表示（管理者のみ） | ✅ 稼働中 | [詳細](docs/status.md) |
| 匿名コンタクト | モデレーターへの匿名通報・相談（双方向やり取り対応） | 🧪 テスト中 | [詳細](docs/contact.md) |
| 交流マッチング | メンバーをランダムにグループ分けして専用チャンネルで交流 | 🧪 テスト機能 | [詳細](docs/matchup.md) |
| 検閲（ジョーク） | メッセージを1984風に検閲するコンテキストメニュー | ✅ 稼働中 | — |
| 組織図自動編成 | Discordロールから組織図を自動構成しEmbed表示 | 🧪 テスト機能 | — |
| 1文リレー | イベント用1文リレー機能（匿名全文投稿＋ネタバレ） | ✅ 稼働中 | — |
| お祝い保存 | メッセージを専用チャンネルにアーカイブ（コンテキストメニュー） | 🧪 テスト機能 | — |
| タスク管理 | ロールベースのタスク作成・完了・削除 | ✅ 稼働中 | — |
| 肩書コイン経済 | サーバー内通貨（参加者管理・銀行・スロット） | 🧪 テスト機能 | — |
| じゃんけんPvP | 肩書コインを賭けて他ユーザーと1対1のじゃんけん対戦 | 🧪 テスト機能 | — |

## コマンド一覧

### 一般コマンド

| コマンド | 説明 |
|----------|------|
| `/setup-intro` | 自己紹介パネルをチャンネルに設置（管理者） |
| `/emoji-stats <期間>` | 絵文字ランキングを表示 |
| `/status` | Bot のステータスを表示（管理者） |
| `/contact` | モデレーターに匿名で連絡 |
| `/matchup start/run/terminate` | 交流マッチング管理（管理者） |
| `/censor-settings <mode>` | 検閲モード設定（管理者） |
| `/org setup/refresh/config/...` | 組織図管理（管理者） |
| `/relay start/status/post/...` | 1文リレーイベント管理（管理者） |
| `/celebration-setup <channel> <role>` | お祝い保存設定（管理者） |
| `/task add/list/complete/delete` | タスク管理 |

### 肩書コイン経済コマンド

| コマンド | 説明 |
|----------|------|
| `/economy join` | 肩書コイン経済に参加（初期100コイン付与） |
| `/economy leave` | 離脱申請（管理者の承認が必要） |
| `/economy status` | 参加者一覧を表示 |
| `/economy grant <user> <amount>` | コインを付与（管理者） |
| `/economy revoke <user> <amount>` | コインを回収（管理者） |
| `/economy approve-leave <user>` | 離脱申請を承認（管理者） |
| `/economy reject-leave <user>` | 離脱申請を却下（管理者） |
| `/bank balance` | 残高を確認 |
| `/bank send <user> <amount>` | 他ユーザーに送金 |
| `/bank history` | 取引履歴を表示 |
| `/bank ranking` | 残高ランキングを表示 |
| `/bank daily` | デイリーボーナスを受け取る（1日1回、50コイン） |
| `/slot play <bet>` | スロットマシン（賭け金: 10〜5000） |
| `/slot rules` | スロットの配当表を表示 |
| `/janken challenge <user> <bet>` | じゃんけんで対戦（賭け金: 10〜5000） |

---

## 技術スタック

- **Runtime:** Cloudflare Workers
- **ライブラリ:** discord.js v14（コマンド登録用）
- **ストレージ:**
  - Cloudflare KV（セッション管理、タスク、マッチング）
  - Durable Objects + SQLite（リレー、肩書コイン経済）
- **テスト:** Jest（ESM対応）
- **デプロイ:** Wrangler CLI

## プロジェクト構成

```
discord-bots/
├── src/
│   ├── worker.js                  # Cloudflare Worker エントリー
│   ├── deploy-commands.js         # スラッシュコマンド登録スクリプト
│   ├── commands/
│   │   ├── setupIntro.js          # /setup-intro コマンド
│   │   ├── emojiStats.js          # /emoji-stats コマンド
│   │   ├── status.js              # /status コマンド
│   │   ├── matchup.js             # /matchup コマンド
│   │   ├── contact.js             # /contact コマンド
│   │   ├── censor.js              # 検閲コンテキストメニューコマンド
│   │   ├── censorSettings.js      # /censor-settings コマンド
│   │   ├── org.js                 # /org コマンド（組織図管理）
│   │   ├── relay.js               # /relay コマンド（1文リレー）
│   │   ├── celebrationSetup.js    # /celebration-setup コマンド
│   │   ├── celebrationSave.js     # お祝い保存コンテキストメニュー
│   │   ├── task.js                # /task コマンド（タスク管理）
│   │   ├── economy.js             # /economy コマンド（肩書コイン参加者管理）
│   │   ├── bank.js                # /bank コマンド（肩書コイン銀行）
│   │   ├── slot.js                # /slot コマンド（スロットマシン）
│   │   └── janken.js              # /janken コマンド（じゃんけんPvP）
│   ├── economy/
│   │   └── EconomyObject.js       # 肩書コイン Durable Object
│   ├── relay/
│   │   └── RelayObject.js         # 1文リレー Durable Object
│   ├── interactions/
│   │   ├── buttons.js             # ボタン操作ハンドラー
│   │   ├── modals.js              # モーダル送信ハンドラー
│   │   ├── contactModals.js       # 匿名コンタクト モーダルハンドラー
│   │   └── orgConfigHandler.js    # 組織図設定モーダルハンドラー
│   ├── modals/
│   │   ├── modal1.js〜modal5.js   # 自己紹介モーダル定義
│   │   ├── matchupFreeTopics.js   # マッチング自由トピックモーダル
│   │   ├── contactModal.js        # 匿名コンタクト モーダル定義
│   │   ├── orgConfigModal.js      # 組織図設定モーダル定義
│   │   └── relayModal.js          # 1文リレー入力モーダル定義
│   └── utils/
│       ├── kvStore.js             # セッション管理（KV + TTL）
│       ├── formatIntro.js         # 自己紹介テキスト整形
│       ├── discordApi.js          # Discord API ユーティリティ
│       ├── interactionHelpers.js  # インタラクション共通ヘルパー
│       ├── permissions.js         # 権限チェックユーティリティ
│       ├── verify.js              # Discord リクエスト署名検証
│       ├── emojiCounter.js        # 絵文字カウント処理
│       ├── formatEmojiStats.js    # ランキング表示整形
│       ├── weekUtils.js           # ISO 週番号・期間フィルタ
│       ├── matchupKvStore.js      # マッチング KV データアクセス
│       ├── matchupLogic.js        # シャッフル・グループ分けロジック
│       ├── matchupChannelUtils.js # チャンネル作成ペイロード生成
│       ├── contactStore.js        # 匿名コンタクト KV データアクセス
│       ├── reportId.js            # レポートID生成ユーティリティ
│       ├── orgStore.js            # 組織図 KV データアクセス
│       ├── orgFormatter.js        # 組織図 Embed 整形ロジック
│       ├── relayStore.js          # 1文リレー DO データアクセス
│       ├── taskStore.js           # タスク KV データアクセス
│       ├── economyStore.js        # 肩書コイン DO データアクセス
│       ├── jankenStore.js         # じゃんけんセッション KV アクセス
│       └── jankenLogic.js         # じゃんけん勝敗判定ロジック
├── docs/                          # 機能別ドキュメント
├── scripts/
│   ├── collect-emoji-stats.js     # 絵文字統計バッチ集計スクリプト
│   └── collect-celebrations.js    # お祝いメッセージ収集スクリプト
└── tests/                         # 41テストスイート（317テスト）
```

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

Cloudflare Workers の Secrets として設定します。

```bash
wrangler secret put DISCORD_TOKEN
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put CLIENT_ID
wrangler secret put GUILD_ID
wrangler secret put INTRO_CHANNEL_ID
wrangler secret put CONTACT_CHANNEL_ID
wrangler secret put ECONOMY_ROLE_ID
wrangler secret put ECONOMY_ADMIN_CHANNEL_ID
```

ローカル開発時は `.env` ファイルを作成します。

| 変数名 | 説明 |
|--------|------|
| `DISCORD_TOKEN` | Bot のトークン（Discord Developer Portal で取得） |
| `DISCORD_PUBLIC_KEY` | Bot の Public Key（署名検証用） |
| `CLIENT_ID` | Bot のアプリケーション ID |
| `GUILD_ID` | 開発・運用サーバーの ID |
| `INTRO_CHANNEL_ID` | 自己紹介を投稿するチャンネルの ID |
| `CONTACT_CHANNEL_ID` | モデレーター用チャンネルの ID |
| `ECONOMY_ROLE_ID` | 肩書コイン経済の参加者ロール ID |
| `ECONOMY_ADMIN_CHANNEL_ID` | 肩書コイン管理者通知チャンネルの ID |

### 3. スラッシュコマンドを登録

```bash
npm run deploy
```

### 4. デプロイ

```bash
npm run publish
```

### 5. ローカル開発

```bash
npm run dev
```

## 開発コマンド

| コマンド | 説明 |
|----------|------|
| `npm run dev` | ローカル開発サーバー起動（wrangler dev） |
| `npm run deploy` | スラッシュコマンドを Discord に登録 |
| `npm run publish` | Cloudflare Workers にデプロイ |
| `npm test` | テスト実行（Jest） |
| `npm run lint` | ESLint 実行 |
| `npm run collect` | 絵文字統計バッチ集計 |
