# discord-bots

複数の Bot 機能を内包した Discord Bot プロジェクト。

## 機能一覧

| 機能 | 説明 | ステータス |
|------|------|-----------|
| 自己紹介ワークフロー | ステップ式モーダルで自己紹介を簡単投稿 | 🚧 開発中 |
| 絵文字ランキング | テキストチャンネル+フォーラムの絵文字使用状況を期間別に表示 | ✅ 稼働中 |

---

## 自己紹介ワークフロー

チャンネルに常駐ボタンを設置し、ユーザーが3ステップのモーダルで自己紹介を入力してチャンネルに投稿できるワークフロー。

### フロー

```
「✏️ 自己紹介を書く」ボタン（チャンネル常駐）
    ↓
モーダル① 【基本①】名前・肩書き・出身地                    （本人のみ表示）
    ↓
モーダル② 【基本②＋好きな物①】趣味・特技・マイブーム・食べ物・飲み物
    ↓
モーダル③ 【好きな物②＋一言】場所・推し・音楽・本・一言！
    ↓
最終確認（本人のみ）→「投稿する」ボタン
    ↓
チャンネルに自己紹介テキストを投稿
```

### 特徴

- 全ステップが本人にしか見えない（ephemeral）
- いつでもキャンセル可能（セッションは30分で自動破棄）
- 未入力フィールドは「未回答」として投稿

### セットアップコマンド

```bash
/setup-intro
```

任意のチャンネルで実行すると、そのチャンネルに「✏️ 自己紹介を書く」ボタン付きパネルメッセージを投稿します。

### 投稿フォーマット（出力例）

```
✨ @ユーザー名 さんの自己紹介 ✨

【基本】
名前：山田太郎
肩書き：エンジニア
出身地：東京都
趣味：プログラミング
特技：TypeScript
マイブーム：朝のコーヒー

【好きな物】
食べ物：ラーメン
飲み物：コーヒー
場所：秋葉原
推し・キャラクター：未回答
音楽：ロック
本：技術書

【一言！】
よろしくお願いします！
```

---

## 絵文字ランキング

サーバー内のテキストチャンネルとフォーラムスレッドの絵文字使用状況を集計し、トップ10をランキング形式で表示します。

### 集計対象

- テキストチャンネル + フォーラムスレッド（合算）
- メッセージ内の絵文字（カスタム・Unicode両対応）
- メッセージへのリアクション
- Bot のメッセージは除外

### コマンド

```bash
/emoji-stats 期間:今週
```

**必要権限:** サーバー管理（Manage Guild）

**期間オプション:**

| 値 | 説明 |
|-----|------|
| 今週 | 現在の ISO 週のデータ |
| 先週 | 前の ISO 週のデータ |
| 今月 | 当月に含まれる週のデータを合算 |
| 先月 | 前月に含まれる週のデータを合算 |
| 全期間 | 全週のデータを合算 |

### アーキテクチャ

ローカル PC でバッチ集計し、Cloudflare KV に書き込む方式です。Worker は KV から読み取って即時レスポンスを返します。

```
ローカル PC                          Cloudflare
┌────────────────────┐              ┌──────────────────┐
│ npm run collect     │  wrangler   │  SESSION_KV      │
│  ├─ Discord API    │ ──────────→ │  emoji-stats     │
│  └─ 週別に集計     │   kv put    │                  │
└────────────────────┘              └────────┬─────────┘
                                             │ KV.get
                                    ┌────────┴─────────┐
                                    │  Worker           │
                                    │  /emoji-stats     │
                                    │  → 即時レスポンス  │
                                    └──────────────────┘
```

### バッチ集計の実行

```bash
npm run collect
```

- 初回は全メッセージを取得、2回目以降は前回実行時刻以降の差分のみ取得
- 週単位でデータを蓄積（ISO 8601 週番号、月曜始まり）
- 前提: `wrangler login` 済み、`.env` に `DISCORD_TOKEN` と `GUILD_ID` を設定

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
│   │   └── emojiStats.js          # /emoji-stats コマンド
│   ├── interactions/
│   │   ├── buttons.js             # ボタン操作ハンドラー
│   │   └── modals.js              # モーダル送信ハンドラー
│   ├── modals/
│   │   ├── modal1.js〜modal3.js   # モーダル定義
│   └── utils/
│       ├── sessionStore.js        # セッション管理（KV + TTL）
│       ├── formatIntro.js         # 自己紹介テキスト整形
│       ├── discordApi.js          # Discord API ユーティリティ
│       ├── emojiCounter.js        # 絵文字カウント処理
│       ├── formatEmojiStats.js    # ランキング表示整形
│       └── weekUtils.js           # ISO 週番号・期間フィルタ
├── scripts/
│   └── collect-emoji-stats.js     # ローカルバッチ集計スクリプト
└── tests/
    ├── sessionStore.test.js
    ├── formatIntro.test.js
    ├── formatEmojiStats.test.js
    ├── emojiStats.test.js
    └── weekUtils.test.js
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
