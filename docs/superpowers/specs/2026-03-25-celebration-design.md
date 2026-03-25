# お祝いメッセージ保存機能 設計書

## 概要

お祝いメッセージを専用チャンネルにアーカイブする機能。コンテキストメニュー（右クリック）でメッセージを選択し、事前設定されたアーカイブチャンネルにEmbed形式で転送する。

関連Issue: #24

## コマンド一覧

| コマンド / 操作 | 権限 | 説明 |
|----------------|------|------|
| `/celebration-setup` | MANAGE_GUILD | アーカイブ先チャンネルと操作可能ロールを設定 |
| 「お祝い保存」コンテキストメニュー | 設定されたロール | メッセージをアーカイブチャンネルに転送 |

## セットアップフロー

レスポンスパターン: **同期（type 4）** — KVへの書き込みのみなので3秒以内に完了する。

1. 管理者が `/celebration-setup` を実行
2. オプション:
   - `channel`（必須, Channel） — アーカイブ先チャンネル
   - `role`（必須, Role） — 操作を許可するロール
3. KVに設定を保存
4. エフェメラルで設定完了メッセージを返す

## 保存フロー

レスポンスパターン: **遅延（type 5 + followup）** — アーカイブチャンネルへのAPI呼び出しがあるため、`censor.js` と同様に `ctx.waitUntil()` + `sendFollowupMessage` を使用する。

1. ユーザーがメッセージを右クリック → 「お祝い保存」を選択
2. 即座にdeferred response（type 5, flags: 64）を返す
3. `ctx.waitUntil()` 内で以下を実行:
   a. サーバーの設定をKVから取得
      - 未設定の場合: followupで「先に `/celebration-setup` を実行してください」と返す
   b. ロールチェック: `interaction.member.roles` 配列に設定された `roleId` が含まれるか確認（※ `permissions.js` のビットフラグチェックではなく、ロールIDの直接比較）
      - 失敗: followupで権限エラーを返す
   c. 対象メッセージの情報を取得（resolved messagesから）
   d. アーカイブチャンネルにEmbedを送信
   e. followupで「保存しました」と返す

## Embed表示内容

| 要素 | 内容 |
|------|------|
| Color | `0xFFD700`（ゴールド） |
| Author | 投稿者名・アイコン |
| Description | メッセージ本文（空の場合は「（テキストなし）」） |
| Image | 添付画像（最初の1枚） |
| Timestamp | 元メッセージの投稿日時 |
| Field | name: `元メッセージ`, value: `[リンク](https://discord.com/channels/{guildId}/{channelId}/{messageId})` |
| Footer | 「保存者: {保存した人の名前}」 |

複数画像がある場合は最初の1枚をEmbedのimageに設定し、残りは同じ `postMessage` の `content` フィールドにURLを改行区切りで記載する。画像以外の添付ファイル（PDF、動画等）は無視する。

## データ構造

### KV

ストレージ: `SESSION_KV`（既存の機能と同じ名前空間を共有、キープレフィックスで区別）

キー: `celebration-config:{guildId}`（TTLなし、永続）

```json
{
  "channelId": "123456789",
  "roleId": "987654321"
}
```

## ファイル構成

| ファイル | 役割 |
|---------|------|
| `src/commands/celebrationSetup.js` | `/celebration-setup` コマンドの定義・ハンドラ |
| `src/commands/celebrationSave.js` | コンテキストメニュー「お祝い保存」の定義・ハンドラ |

## 既存パターンとの整合性

- コンテキストメニュー: `censor.js` と同パターン（deferred response + waitUntil）
- セットアップコマンド: `censorSettings.js` と同パターン（同期response）
- KV操作: `kvStore.js` を使用
- Discord API呼び出し: `discordApi.js` を使用
- コマンド登録: `deploy-commands.js` に追加

### worker.js ルーティング

- `celebration-setup`: 同期ハンドラ（`censor-settings` と同様）
- `お祝い保存`: deferred + `ctx.waitUntil()`（`検閲` と同様）

### コンテキストメニュー権限設定

`お祝い保存` は `defaultMemberPermissions` を設定しない（全員に表示、ロールチェックは実行時に行う）。これは `検閲`（ManageMessages必須）とは異なるパターン。

## 重複保存

同じメッセージの重複保存は許容する。運用上の頻度が低く、KVに保存済みIDを管理するコストに見合わないため。必要になった場合は後から制限を追加する。

## エラーハンドリング

| ケース | 対応 |
|--------|------|
| 未セットアップ | followupで設定を促すメッセージ |
| ロール不足 | followupで権限エラー |
| アーカイブチャンネルが削除済み | followupで再設定を促すメッセージ |
| Bot権限不足（送信先チャンネル） | followupでBotの権限を確認するよう案内 |
