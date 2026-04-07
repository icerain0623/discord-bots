# サーバー内通貨（肩書コイン）システム設計書

## 概要

サーバー内で使用できる独自通貨「肩書コイン」を導入し、参加者管理・銀行機能・ギャンブル（スロット）を提供する。将来的に肩書購入、限定チャンネル、税金制度、変動為替などに拡張予定。

## 背景・動機

- サーバー内での交流・駆け引きを活性化するため、経済・ゲーム要素を作りたい
- 参加していないのに通貨だけ占有するユーザーを整理するため、参加状態の管理と通貨回収の仕組みが必要

## アーキテクチャ

### ストレージ: ギルド単位の Durable Object

`EconomyObject` — 1ギルド = 1インスタンス。内部にSQLiteテーブルを持つ。

選定理由:
- 送金・賭けなどがSQLiteトランザクションでアトミックに処理できる
- RelayObjectと同じパターンでコードの一貫性が高い
- 単一ギルド運用なのでスケーラビリティの懸念なし

### ファイル構成

```
src/
├── economy/
│   └── EconomyObject.js    # Durable Object クラス
├── commands/
│   ├── economy.js           # /economy コマンド定義・ハンドラ
│   ├── bank.js              # /bank コマンド定義・ハンドラ
│   └── slot.js              # /slot コマンド定義・ハンドラ
├── utils/
│   └── economyStore.js      # DO へのfetchラッパー
└── worker.js                # ルーティング追加
```

### wrangler.toml 変更

```toml
[durable_objects]
bindings = [
  { name = "RELAY_DO", class_name = "RelayObject" },
  { name = "ECONOMY_DO", class_name = "EconomyObject" }
]

[[migrations]]
tag = "v3"
new_classes = ["EconomyObject"]
```

### 環境変数追加

| 変数名 | 説明 |
|---|---|
| `ECONOMY_ROLE_ID` | 参加者ロールのID |
| `ECONOMY_ADMIN_CHANNEL_ID` | 離脱申請等の管理者通知先チャンネル |

## データモデル

### `members` テーブル

| カラム | 型 | 説明 |
|---|---|---|
| user_id | TEXT PK | Discord ユーザーID |
| joined_at | TEXT | 参加日時（ISO 8601） |
| active | INTEGER | 1=参加中, 0=離脱 |
| leave_requested | INTEGER | 1=離脱申請中, 0=通常 |

### `balances` テーブル

| カラム | 型 | 説明 |
|---|---|---|
| user_id | TEXT PK | Discord ユーザーID |
| amount | INTEGER | 現在の残高（整数） |

### `transactions` テーブル

| カラム | 型 | 説明 |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | 取引ID |
| from_user | TEXT | 送金元（null=システム） |
| to_user | TEXT | 送金先（null=システム） |
| amount | INTEGER | 金額 |
| type | TEXT | 取引種別（後述） |
| created_at | TEXT | 日時（ISO 8601） |

取引種別（type）: `join_bonus`, `daily`, `grant`, `revoke`, `send`, `slot_bet`, `slot_win`, `leave_confiscate`

### `daily_claims` テーブル

| カラム | 型 | 説明 |
|---|---|---|
| user_id | TEXT PK | Discord ユーザーID |
| last_claimed | TEXT | 最終取得日（YYYY-MM-DD、UTC） |

### 設計方針

- 残高は `balances` に直接持つ（transactions集計は重いため）
- 残高変更は必ず `balances` UPDATE + `transactions` INSERT をSQLiteトランザクション内で実行
- 整数のみ（端数問題を回避）

## コマンド体系

### `/economy` — 参加者管理

| サブコマンド | 説明 | 権限 |
|---|---|---|
| `join` | 参加登録。初期コイン付与 + ロール付与 | 誰でも |
| `leave` | 離脱申請。管理者チャンネルにボタン付き通知を送る | 参加者 |
| `approve-leave <user>` | 離脱承認。`confiscate` オプション（boolean、デフォルトfalse）で残高回収を選択 | ManageGuild |
| `reject-leave <user>` | 離脱却下 | ManageGuild |
| `status` | 参加者一覧と統計 | 誰でも |
| `grant <user> <amount>` | 管理者による手動付与 | ManageGuild |
| `revoke <user> <amount>` | 管理者による手動回収 | ManageGuild |

### `/bank` — 銀行機能

| サブコマンド | 説明 | 権限 |
|---|---|---|
| `balance` | 自分の残高確認（ephemeral） | 参加者 |
| `send <user> <amount>` | 他ユーザーへ送金 | 参加者 |
| `history` | 直近の取引履歴（ephemeral） | 参加者 |
| `ranking` | 残高ランキング | 参加者 |
| `daily` | デイリーボーナス受け取り（50 肩書コイン） | 参加者 |

### `/slot` — スロットマシン

| サブコマンド | 説明 | 権限 |
|---|---|---|
| `play <bet>` | 賭け金を指定してスロット実行 | 参加者 |
| `rules` | 配当表とルール表示 | 誰でも |

### 権限モデル

- 「参加者」= `members` テーブルで `active=1` のユーザー。コマンド実行時にbot内でチェック
- `balance`, `history` はephemeral（本人のみ表示）
- `/slot play` の結果は通常メッセージ（盛り上がり要素）

## EconomyObject HTTP API

| メソッド | パス | 説明 |
|---|---|---|
| POST | `/members/join` | 参加登録 + 初期コイン付与 |
| POST | `/members/leave-request` | 離脱申請フラグ設定 |
| POST | `/members/approve-leave` | 離脱承認 |
| POST | `/members/reject-leave` | 離脱却下 |
| GET | `/members/status` | 参加者一覧 |
| GET | `/bank/balance/:userId` | 残高取得 |
| POST | `/bank/send` | 送金 |
| GET | `/bank/history/:userId` | 取引履歴 |
| GET | `/bank/ranking` | 残高ランキング |
| POST | `/bank/daily` | デイリーボーナス |
| POST | `/bank/grant` | 管理者付与 |
| POST | `/bank/revoke` | 管理者回収 |
| POST | `/slot/play` | スロット実行 |

## 処理フロー

### 参加フロー

```
ユーザー: /economy join
  → membersにINSERT (active=1)
  → balancesにINSERT (amount=100)
  → transactionsにINSERT (type: join_bonus)
  → Discord API: 参加者ロールを付与
  → ephemeral応答:「参加しました！100 肩書コインを受け取りました」
```

### 離脱フロー

```
ユーザー: /economy leave
  → membersのleave_requested=1に更新
  → ECONOMY_ADMIN_CHANNEL_IDにボタン付きメッセージを投稿
    「@user が離脱を申請しました（残高: X 肩書コイン）」
    [残高を保持して承認] [残高を回収して承認] [却下]

管理者: [残高を保持して承認] ボタンクリック
  → 残高保持、active=0
管理者: [残高を回収して承認] ボタンクリック
  → 残高をゼロにしtransactionsに記録（type: leave_confiscate）、active=0
（コマンドからも可: /economy approve-leave @user confiscate:true/false）
  → active=0, leave_requested=0
  → Discord API: ロール剥奪
  → ユーザーに結果通知

管理者: [却下] ボタンクリック（または /economy reject-leave @user）
  → leave_requested=0
  → ユーザーに却下通知
```

### 送金フロー

```
ユーザー: /bank send @target 50
  → EconomyObject の /bank/send を fetch
  → DO内:
    BEGIN TRANSACTION
      SELECT amount FROM balances WHERE user_id = :from  → 残高チェック
      残高不足 → エラー返却
      UPDATE balances SET amount = amount - 50 WHERE user_id = :from
      UPDATE balances SET amount = amount + 50 WHERE user_id = :to
      INSERT INTO transactions (type='send') x2
    COMMIT
  → 結果返却 → Discord応答
```

### スロットフロー

```
ユーザー: /slot play 100
  → 参加者チェック + 残高チェック
  → EconomyObject の /slot/play を fetch
  → DO内:
    BEGIN TRANSACTION
      残高から賭け金を引く (type: slot_bet)
      3リールを重み付きランダムで決定
      配当計算
      当たりの場合: 残高に配当を加算 (type: slot_win)
    COMMIT
  → リール結果 + 損益 + 残高を返却
  → Discord: embed形式で表示
```

## スロットマシン仕様

### リール構成

3リール。7種のシンボル（重み付き）:

| シンボル | 重み | 出やすさ |
|---|---|---|
| :cherries: 🍒 | 8 | 高 |
| :lemon: 🍋 | 7 | 高 |
| :orange: 🍊 | 6 | 中 |
| :grapes: 🍇 | 5 | 中 |
| :bell: 🔔 | 3 | 低 |
| :seven: 7️⃣ | 2 | 低 |
| :gem: 💎 | 1 | 極低 |

合計重み: 32

### 配当表

| 結果 | 倍率 |
|---|---|
| 💎💎💎 | x50 |
| 7️⃣7️⃣7️⃣ | x20 |
| 🔔🔔🔔 | x10 |
| 🍇🍇🍇 | x5 |
| 🍊🍊🍊 | x4 |
| 🍋🍋🍋 | x3 |
| 🍒🍒🍒 | x2 |
| 2つ揃い（任意） | x1（賭け金返却） |
| ハズレ | x0（没収） |

### 表示形式

```
🎰 スロットマシン
┌───┬───┬───┐
│ 🍋 │ 🍋 │ 🍋 │
└───┴───┴───┘
3つ揃い! x3 → +300 肩書コイン
残高: 1,300 肩書コイン
```

### 制約

- 最低賭け金: 10 肩書コイン
- 最大賭け金: 5,000 肩書コイン（または残高の50%の小さい方）
- 残高不足の場合はephemeralエラー

## 初期パラメータ

| パラメータ | 初期値 | 説明 |
|---|---|---|
| 初期コイン | 100 | join時の付与額 |
| デイリーボーナス | 50 | 1日1回 |
| スロット最低賭け金 | 10 | |
| スロット最大賭け金 | 5,000 | 残高の50%との小さい方 |

初期段階ではコード内の定数として定義。将来的にDO内のconfigテーブルで動的変更可能にする。

## 通貨獲得手段

HTTP Interactions方式ではメッセージイベントを受信できないため、アクティビティ報酬（メッセージ送信時の自動付与）は実装しない。

獲得手段:
1. **初期コイン** — join時に100
2. **デイリーボーナス** — 1日1回50
3. **スロット当たり** — 配当倍率に応じた払い戻し
4. **管理者grant** — イベント報酬など

## 段階的導入計画

### Phase 1（今回の実装スコープ）

1. EconomyObject（DO基盤） — テーブル作成、HTTP API
2. 参加者管理 — join / leave申請 / approve-leave / reject-leave / ロール連動
3. 銀行機能 — balance / send / history / ranking / daily / grant / revoke
4. スロット — play / rules

### Phase 2以降（スコープ外）

| フェーズ | 機能 |
|---|---|
| 2 | 肩書購入（通貨でカスタムロール取得） |
| 3 | 限定チャンネル参加権の購入 |
| 4 | 追加ギャンブル（ブラックジャック等） |
| 5 | 税金制度（一定条件での回収） |
| 6 | 変動為替 |
| 7 | 動的config管理（DO内configテーブル） |
