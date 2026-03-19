# Emoji Stats Feature Design

## Overview

Discord サーバー内で過去7日間に最もよく使われた絵文字をランキング表示するスラッシュコマンド `/emoji-stats` を追加する。

## Requirements

- メッセージ内の絵文字（Unicode + カスタム）とリアクションの両方を集計
- サーバー内の全テキストチャンネルを対象
- 直近7日間を集計期間とする
- コマンド実行時にリアルタイムでDiscord APIから取得（データ永続化なし）
- 結果をチャンネルに投稿（全員に見える）

## Command

- **Name:** `/emoji-stats`
- **Options:** なし
- **Permission:** 特に制限なし（全メンバーが実行可能）

## User Flow

1. ユーザーが `/emoji-stats` を実行
2. Bot が deferred response を返す（Discord の 3 秒応答制限対策）
3. Discord API で全テキストチャンネル一覧を取得
4. 5 チャンネルずつバッチで並列にメッセージを取得（7 日以内）
5. メッセージ内絵文字 + リアクションをカウント
6. Top 10 ランキングを Embed 形式で followup メッセージとして投稿

## Output Format

```
📊 絵文字ランキング（過去7日間）

🥇 😂 × 128
🥈 🔥 × 95
🥉 ❤️ × 72
4. 👍 × 58
5. <:custom:123> × 45
...

集計対象: 全20チャンネル / 3,456メッセージ
```

## Architecture

### New Files

| File | Purpose |
|------|---------|
| `src/commands/emojiStats.js` | `/emoji-stats` コマンド定義 |
| `src/utils/discordApi.js` | Discord REST API 呼び出しユーティリティ |
| `src/utils/emojiCounter.js` | 絵文字カウントロジック |
| `src/utils/formatEmojiStats.js` | ランキング表示フォーマット |

### Modified Files

| File | Change |
|------|--------|
| `src/worker.js` | コマンドルーティングに `emoji-stats` を追加、deferred response 処理、`ctx`（ExecutionContext）パラメータ追加 |
| `src/deploy-commands.js` | スラッシュコマンド登録に追加 |

### Processing Flow

```
worker.js (receives interaction)
  ├── Return deferred response (type 5)
  └── ctx.waitUntil(collectAndRespond())   ← ExecutionContext で Worker を生存させる
        ├── discordApi.js: getTextChannels(guildId)
        ├── discordApi.js: getAllMessages(channelId, since)  ← ページネーション対応
        │     └── 100件ずつ `before` カーソルでループ取得
        ├── emojiCounter.js: countEmojis(messages)
        ├── formatEmojiStats.js: formatRanking(counts)
        └── discordApi.js: sendFollowup(interactionToken, embed)
        （エラー時は followup でエラーメッセージを送信）
```

#### ctx.waitUntil() について

現在の `worker.js` の fetch ハンドラは `(request, env)` のみ受け取っている。
第3引数 `ctx`（ExecutionContext）を追加し、deferred response を返した後の
非同期処理を `ctx.waitUntil()` でラップする必要がある。
これにより、Response 返却後も Worker ランタイムが処理完了まで生存する。

#### メッセージのページネーション

Discord API の `GET /channels/{id}/messages` は 1 リクエスト最大 100 件。
`before` パラメータでカーソルベースのページネーションを行い、7 日以内の全メッセージを取得する。
1 チャンネルあたり最大 10 ページ（1,000 件）を上限とし、それ以上は打ち切る。

### Rate Limit Strategy

- 5 チャンネル並列バッチ（`Promise.all` で 5 チャンネル同時、完了後に次の 5 チャンネル）
- Discord API のレート制限は 1 ルート約 50req/秒なので 5 並列なら余裕
- レスポンスヘッダの `X-RateLimit-Remaining` が 0 の場合は `Retry-After` 秒待機するフォールバック
- ページネーションを含めた場合、20 チャンネル × 最大 10 ページ = 最大 200 リクエスト
- Discord の followup トークン有効期限は 15 分。上記リクエスト数なら十分余裕あり

## Emoji Counting Logic

### Message Emojis

- **Unicode 絵文字:** Unicode 範囲の正規表現でマッチ（外部パッケージ不使用）。ZWJ 結合シーケンスや国旗など一部の複雑な絵文字は検出漏れの可能性あり（既知の制限）
- **カスタム絵文字:** `<:name:id>` および `<a:name:id>` を正規表現で抽出

### Reactions

- メッセージオブジェクトの `reactions` 配列に含まれる `reactions[].count` フィールドを使用
- メッセージ取得レスポンスに含まれるため、別途 API コール不要

### Counting Rules

- メッセージ内絵文字とリアクションは合算して 1 つのランキングにする
- 同じメッセージ内で同じ絵文字が複数回使われた場合、その回数分カウント
- Bot のメッセージは集計対象外（ノイズ除去）
- スレッド・フォーラムチャンネル・ボイスチャンネルテキストは対象外（テキストチャンネルのみ）

## Error Handling

- `collectAndRespond()` 内でエラーが発生した場合、followup メッセージでエラー通知を送信
  （例: 「集計中にエラーが発生しました」）
- チャンネル読み取り権限がない場合（403）はそのチャンネルをスキップ
- 全チャンネルでエラーの場合もエラー followup を送信

## Environment Variables

追加の環境変数は不要。既存の `DISCORD_TOKEN` を Discord API 呼び出しに使用する。

## Testing

- `emojiCounter.js` のユニットテスト（Unicode / カスタム / リアクション / Bot 除外）
- `formatEmojiStats.js` のユニットテスト（ランキング表示フォーマット）
- `discordApi.js` のユニットテスト（バッチ並列処理、レート制限フォールバック）
