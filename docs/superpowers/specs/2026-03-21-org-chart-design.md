# 組織図自動編成Bot設計書

## 概要

Discordサーバーのロール情報を元に組織図を自動構成し、指定チャンネルにEmbed形式で常設表示するBot機能。部門定義をKVにJSON保存し、手動トリガーで更新する。

**関連Issue:** #13

## 背景・課題

- 組織図の管理が特定個人に依存しており、更新遅延・ミスのリスクがある
- モデレーター管理の作業負担が大きい
- Discordロールと役職名が突合できるため、ロール情報から自動構成が可能

## 前提条件

- Discord Developer PortalでBotの **SERVER MEMBERS Intent** を有効化すること（`GET /guilds/{guildId}/members` に必要）

## 要件

- Discordロールからメンバーを自動取得して組織図を構成
- 特定チャンネルにEmbed形式の常設パネルとして表示
- 部門定義はKVにJSON保存、モーダルで直接編集可能
- 手動 `/org refresh` で更新（自動検知はアーキテクチャ上不可）
- 「サーバー管理」権限者のみ操作可能

## データ構造

### 部門定義 — `org:config:{guildId}`

```json
{
  "departments": [
    {
      "name": "三役",
      "roles": ["幹事長", "副幹事長", "会計担当"]
    },
    {
      "name": "企画部",
      "roles": ["企画事務局長", "企画事務局長代理", "未来設計室長"]
    }
  ]
}
```

- `roles` 配列の順序がそのまま表示順序
- ロール名はDiscord上のロール名と完全一致で突合

### パネル情報 — `org:panel:{guildId}`

```json
{
  "channelId": "123456789",
  "messageId": "987654321"
}
```

### ストレージ

既存の `SESSION_KV` に `org:` プレフィックスで保存。インフラ変更不要。
`org:` プレフィックスのキーには `expirationTtl` を設定しない（永続データ）。

## コマンド体系

| コマンド | 説明 |
|---------|------|
| `/org setup #チャンネル` | 指定チャンネルに組織図パネルを設置 |
| `/org refresh` | ロール情報を再取得してパネルを更新 |
| `/org config` | モーダルを開いて部門定義JSONを編集 |

すべてのコマンドは「サーバー管理」権限が必要。

### `/org setup` の再実行

既にパネルが設置されている状態で `/org setup` を再実行した場合、旧パネルメッセージの削除を試み、新しいチャンネルにパネルを再設置する。

## 処理フロー

### 初期設定フロー

1. `/org config` で部門定義JSONを作成・保存
2. `/org setup #チャンネル` で組織図Embedを投稿
3. チャンネルID・メッセージIDをKVに保存

### 更新フロー（`/org refresh`）

**Deferred Response パターンを使用**（API呼び出しが3秒を超える可能性があるため）：

1. 即座に Deferred Response（type 5, ephemeral）を返す
2. `ctx.waitUntil()` で以下を非同期実行：
   a. KVから部門定義 (`org:config:{guildId}`) を取得
   b. KVからパネル情報 (`org:panel:{guildId}`) を取得
   c. Discord REST APIでギルドのメンバー一覧を取得（ページネーション対応）
   d. ギルドのロール一覧からロール名→ロールIDのマッピングを構築
   e. 各部門の各ロールについて、そのロールを持つメンバーを抽出
   f. Embed形式に整形
   g. パネルメッセージをPATCH更新（404の場合はエラー通知）
   h. followupメッセージで完了を通知

### エラーハンドリング

- パネルメッセージが手動削除されていた場合（PATCH 404）：KVのパネル情報をクリアし、「パネルが見つかりません。`/org setup` で再設置してください」とエラー通知
- JSON解析失敗時：エフェメラルメッセージでパースエラーの内容を表示

### `/org config` モーダル

- モーダルの `custom_id`: `org_config_modal`
- テキスト入力の `custom_id`: `org_config_json`
- テキスト入力フィールドに現在のJSONを表示
- 編集して送信するとバリデーション後にKVに保存
- Discordモーダルのテキスト入力は最大4000文字の制限あり

### `/org setup` のDeferred Response

`/org setup` もメンバー一覧取得とEmbed投稿を行うため、Deferred Responseパターンを使用する。

## 表示形式

Embedのdescriptionフィールドにて：

```
📋 組織図
━━━━━━━━━━━━━━━

【三役】
幹事長：@非常出口
副幹事長：@ミト
会計担当：@00re

【企画部】
企画事務局長：@a
企画事務局長代理：@瀬戸際
未来設計室長：@くるみ

最終更新: 2026-03-21 15:30 (JST)
```

### 表示ルール

- 部門名は `【】` で囲んで見出し化
- 該当メンバーがいないロールは `役職名：（空席）` と表示
- メンバー名は `<@ユーザーID>` 形式でメンション表示
- 1つのロールに複数メンバーがいる場合は `役職名：@A, @B` とカンマ区切り
- Embedのdescription上限（4096文字）を超える場合は部門境界で分割して複数Embedに
- 最終更新日時をフッターにJSTで表示

## ファイル構成

```
src/
├── commands/
│   └── org.js              # /org コマンドハンドラ（setup, refresh, config）
├── modals/
│   └── orgConfigModal.js   # config モーダル定義
├── utils/
│   ├── orgStore.js          # KV読み書き（部門定義・パネル情報）
│   └── orgFormatter.js      # Embed整形ロジック
```

モーダル送信ハンドリングは `src/interactions/modals.js` に `org_config_modal` のルーティングを追加。

## 権限

- すべてのコマンドは `hasManageGuild(interaction)` で権限チェック
- 既存の `src/utils/permissions.js` を再利用
- `/org setup` 実行時、指定チャンネルでBotがメッセージ送信権限を持つか確認

## 技術的考慮事項

- Cloudflare Workersのため、Gateway Event（脱退検知等）は使用不可
- ギルドメンバー一覧取得には `GET /guilds/{guildId}/members` を使用（BOTトークン + SERVER MEMBERS Intent必要）
- メンバー数が多い場合はページネーション対応が必要（1リクエスト最大1000件）
- モーダルのテキスト入力4000文字制限を超える規模の組織図は非対応
- `/org refresh` と `/org setup` はDeferred Response（type 5）+ `ctx.waitUntil()` を使用
