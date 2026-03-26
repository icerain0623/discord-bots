# タスク管理機能 設計書

## 概要

サーバー内でタスクを管理するためのスラッシュコマンド機能。モデレーターや許可されたユーザーがタスクを追加し、一覧は誰でも確認でき、完了・削除はサーバー管理者のみが行える。

## コマンド一覧

| サブコマンド | 権限 | 説明 |
|---|---|---|
| `/task add <name> [deadline] [priority]` | MANAGE_MESSAGES または許可ユーザー | タスクを追加 |
| `/task list` | 誰でも | タスク一覧を表示 |
| `/task complete <id>` | MANAGE_GUILD | タスクを完了にする |
| `/task delete <id>` | MANAGE_GUILD | タスクを削除する |
| `/task config add-user <user>` | MANAGE_GUILD | タスク追加を許可するユーザーを登録 |
| `/task config remove-user <user>` | MANAGE_GUILD | 許可を取り消す |
| `/task config list-users` | MANAGE_GUILD | 許可済みユーザー一覧を表示 |

## コマンドオプション

### `/task add`

| オプション | 型 | 必須 | 説明 |
|---|---|---|---|
| `name` | String | ✅ | タスク名 |
| `deadline` | String | - | 期限（YYYY-MM-DD 形式） |
| `priority` | String (Choice) | - | 優先度（high / medium / low、デフォルト: medium） |

### `/task complete` / `/task delete`

| オプション | 型 | 必須 | 説明 |
|---|---|---|---|
| `id` | Integer | ✅ | タスクID |

### `/task config add-user` / `config remove-user`

| オプション | 型 | 必須 | 説明 |
|---|---|---|---|
| `user` | User | ✅ | 対象ユーザー |

## レスポンスパターン

すべて **同期（type 4）**。KVの読み書きのみで外部API呼び出しがないため、3秒以内に完了する。

## 権限モデル

### add の判定ロジック

```
1. hasManageMessages(interaction) → OK（モデレーター）
2. config の allowedUsers に userId が含まれる → OK
3. それ以外 → 拒否
```

### complete / delete / config

`hasManageGuild(interaction)` — サーバー管理権限が必要。

### list

制限なし。

## データ構造

### タスクデータ: `tasks:<guildId>`（SESSION_KV、TTLなし）

```json
{
  "tasks": [
    {
      "id": 1,
      "name": "READMEを更新する",
      "priority": "high",
      "deadline": "2026-04-01",
      "createdBy": "123456789012345678",
      "createdAt": "2026-03-27T10:00:00Z",
      "completed": false
    }
  ],
  "nextId": 2
}
```

### 設定データ: `task-config:<guildId>`（SESSION_KV、TTLなし）

```json
{
  "allowedUsers": ["123456789012345678", "987654321098765432"]
}
```

## 表示フォーマット

### `/task list`（タスクあり）

```
📋 タスクリスト
─────────────────
🔴 #1 READMEを更新する
   📅 期限: 2026-04-01
🟡 #2 テストを書く
   📅 期限: なし
🟢 #3 リファクタリング
   📅 期限: 2026-04-15
✅ #4 デプロイ準備（完了）
─────────────────
未完了: 3件 / 完了: 1件
```

優先度の表示:
- 🔴 high（緊急）
- 🟡 medium（通常）
- 🟢 low（低め）
- ✅ 完了済み

### `/task list`（タスクなし）

```
📋 タスクリスト
─────────────────
タスクはありません。
```

### `/task add` 成功時

```
✅ タスクを追加しました
🔴 #1 READMEを更新する
📅 期限: 2026-04-01
```

### `/task complete` 成功時

```
✅ タスク #1 を完了しました
```

### `/task delete` 成功時

```
🗑️ タスク #1 を削除しました
```

## ファイル構成

| ファイル | 説明 |
|---|---|
| `src/commands/task.js` | コマンドハンドラー |
| `src/utils/taskStore.js` | KVラッパー（タスク・設定の読み書き） |
| `tests/task.test.js` | テスト |

## エッジケース

- 存在しないIDを指定: エフェメラルで「タスク #X が見つかりません」
- 期限の形式が不正: Discord側のStringバリデーションに任せず、ハンドラーで `YYYY-MM-DD` 形式を検証。不正なら「期限は YYYY-MM-DD 形式で入力してください」
- タスクが0件の状態でcomplete/delete: 「タスクはありません」
- 同じユーザーを二重にconfig登録: 既に登録済みならスキップしてメッセージを返す
