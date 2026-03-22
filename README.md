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
| 1文リレー | イベント用1文リレー機能（匿名全文投稿＋ネタバレ） | 🧪 テスト機能 | — |

---

## 技術スタック

- **Runtime:** Node.js 20+
- **ライブラリ:** discord.js v14
- **状態管理:** オンメモリ Map（TTL: 30分）
- **テスト:** Jest（ESM対応）

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
│   │   └── relay.js               # /relay コマンド（1文リレー）
│   ├── interactions/
│   │   ├── buttons.js             # ボタン操作ハンドラー
│   │   ├── modals.js              # モーダル送信ハンドラー
│   │   ├── contactModals.js       # 匿名コンタクト モーダルハンドラー
│   │   └── orgConfigHandler.js   # 組織図設定モーダルハンドラー
│   ├── modals/
│   │   ├── modal1.js〜modal3.js   # モーダル定義
│   │   ├── matchupFreeTopics.js   # マッチング自由トピックモーダル
│   │   ├── contactModal.js        # 匿名コンタクト モーダル定義
│   │   ├── orgConfigModal.js     # 組織図設定モーダル定義
│   │   └── relayModal.js         # 1文リレー入力モーダル定義
│   └── utils/
│       ├── sessionStore.js        # セッション管理（KV + TTL）
│       ├── formatIntro.js         # 自己紹介テキスト整形
│       ├── discordApi.js          # Discord API ユーティリティ
│       ├── emojiCounter.js        # 絵文字カウント処理
│       ├── formatEmojiStats.js    # ランキング表示整形
│       ├── weekUtils.js           # ISO 週番号・期間フィルタ
│       ├── matchupKvStore.js      # マッチング KV データアクセス
│       ├── matchupLogic.js        # シャッフル・グループ分けロジック
│       ├── matchupChannelUtils.js # チャンネル作成ペイロード生成
│       ├── contactStore.js        # 匿名コンタクト KV データアクセス
│       ├── reportId.js            # レポートID生成ユーティリティ
│       ├── permissions.js         # 権限チェックユーティリティ
│       ├── verify.js              # Discord リクエスト署名検証
│       ├── orgStore.js            # 組織図 KV データアクセス
│       ├── orgFormatter.js        # 組織図 Embed 整形ロジック
│       └── relayStore.js          # 1文リレー KV データアクセス
├── docs/                          # 機能別ドキュメント
├── scripts/
│   └── collect-emoji-stats.js     # ローカルバッチ集計スクリプト
└── tests/
    ├── sessionStore.test.js
    ├── formatIntro.test.js
    ├── formatEmojiStats.test.js
    ├── emojiStats.test.js
    ├── weekUtils.test.js
    ├── contactStore.test.js
    ├── reportId.test.js
    ├── contactModals.test.js
    ├── org.test.js
    ├── orgStore.test.js
    ├── orgFormatter.test.js
    ├── orgConfigModal.test.js
    ├── orgConfigHandler.test.js
    ├── discordApiOrg.test.js
    ├── relayStore.test.js
    ├── relay.test.js
    └── relayButton.test.js
```

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

`.env.example` をコピーして `.env` を作成し、各値を設定します。

```bash
cp .env.example .env
```

| 変数名 | 説明 |
|--------|------|
| `DISCORD_TOKEN` | Bot のトークン（Discord Developer Portal で取得） |
| `CLIENT_ID` | Bot のアプリケーション ID |
| `GUILD_ID` | 開発・運用サーバーの ID |
| `INTRO_CHANNEL_ID` | 自己紹介を投稿するチャンネルの ID |
| `CONTACT_CHANNEL_ID` | モデレーター用チャンネルの ID |

### 3. スラッシュコマンドを登録

```bash
npm run deploy
```

### 4. Bot を起動

```bash
npm start
```

## 実装計画

詳細な実装計画は [`docs/superpowers/plans/2026-03-18-intro-bot.md`](docs/superpowers/plans/2026-03-18-intro-bot.md) を参照してください。
