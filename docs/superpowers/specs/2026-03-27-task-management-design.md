# タスク管理機能 設計書

## 概要

サーバー内でタスクを管理するためのスラッシュコマンド機能。モデレーターや許可されたユーザーがタスクを追加し、一覧は誰でも確認でき、完了・削除はサーバー管理者のみが行える。

## コマンド一覧

既存コードベースのサブコマンドパターン（単一階層）に合わせ、`config` グループは使わずフラットに定義する。

| サブコマンド | 権限 | 説明 |
|---|---|---|
| `/task add <name> [deadline] [priority]` | MANAGE_MESSAGES または許可ユーザー | タスクを追加 |
| `/task list` | 誰でも | タスク一覧を表示 |
| `/task complete <id>` | MANAGE_GUILD | タスクを完了にする |
| `/task delete <id>` | MANAGE_GUILD | タスクを削除する（配列から完全に除去） |
| `/task allow-user <user>` | MANAGE_GUILD | タスク追加を許可するユーザーを登録 |
| `/task remove-user <user>` | MANAGE_GUILD | 許可を取り消す |
| `/task allowed-users` | MANAGE_GUILD | 許可済みユーザー一覧を表示 |

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

### `/task allow-user` / `remove-user`

| オプション | 型 | 必須 | 説明 |
|---|---|---|---|
| `user` | User | ✅ | 対象ユーザー |

## レスポンスパターン

すべて **同期（type 4、エフェメラル flags: 64）**。KVの読み書きのみで外部API呼び出しがないため、3秒以内に完了する。

唯一の例外として `/task list` は **公開（flagsなし）** で返す。誰でも見られる情報であり、チャンネルで共有される方が便利なため。

## 権限モデル

### add の判定ロジック

```
1. hasManageMessages(interaction) → OK（モデレーター）
2. config の allowedUsers に userId が含まれる → OK
3. それ以外 → 拒否
```

### complete / delete / allow-user / remove-user / allowed-users

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

- タスク上限: **100件**（未完了+完了の合計）。上限に達した場合は「タスクが上限（100件）に達しています。不要なタスクを削除してください」と返す。
- `nextId` は常にインクリメントし、IDは再利用しない。
- `delete` はタスクを配列から完全に除去する（ハードデリート）。
- `complete` は `completed: true` に更新する（ソフト状態変更）。

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

### 新規ファイル

| ファイル | 説明 |
|---|---|
| `src/commands/task.js` | コマンドハンドラー |
| `src/utils/taskStore.js` | KVラッパー（タスク・設定の読み書き） |
| `tests/task.test.js` | テスト |

### 既存ファイルへの変更

| ファイル | 変更内容 |
|---|---|
| `src/worker.js` | `task` コマンドのルーティング追加（`handleTask` を呼び出す） |
| `src/deploy-commands.js` | `/task` コマンド定義の追加（サブコマンド登録） |
| `src/commands/status.js` | コマンド一覧に `/task` を追加 |

## エッジケース

- 存在しないIDを指定: エフェメラルで「タスク #X が見つかりません」
- 期限の形式が不正: ハンドラーで `YYYY-MM-DD` 形式を正規表現で検証。不正なら「期限は YYYY-MM-DD 形式で入力してください」。過去の日付は許容する（記録用途もあるため）。
- タスクが上限（100件）に達した状態で add: エフェメラルで上限エラーを返す
- タスクが0件の状態で complete/delete: 「タスクはありません」
- 同じユーザーを二重に allow-user: 既に登録済みならスキップして「既に登録されています」と返す
- 並行書き込み: KVの結果整合性の制約上、完全な排他は不可。タスク管理用途では許容範囲とする。
