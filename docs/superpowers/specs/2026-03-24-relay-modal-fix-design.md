# Relay Modal Fix — Design Spec

## 背景

リレーの「一文を追加する」モーダルで、やや長めの文章を入力するとDiscordが「問題が発生しました、再度お試しください」を表示する。原因は以下の3点:

1. deferred応答の前にKV読み取りを行っており、コールドスタート時に3秒のインタラクションタイムアウトを超える
2. バックグラウンド処理（`doRelayModalSubmit`）にtry/catchがなく、失敗時にfollowupが送信されない
3. モーダルが `style: 1`（短文入力）で `max_length: 200` のため、長文のUXが悪い

## 変更内容

### 1. モーダルの改善（`src/modals/relayModal.js`）

**Before:**
- title: 前の文章（45文字で切り詰め）
- 入力欄1つ: style 1（短文）、max_length 200

**After:**
- title: 固定文字列「一文リレー」
- 入力欄1（表示用）:
  - custom_id: `relay_prev`
  - label: 「前の文章」
  - style: 2（段落）
  - value: 前の人の文章（全文、最大4000文字）
  - required: false
- 入力欄2（入力用）:
  - custom_id: `relay_sentence`
  - label: 「あなたの一文を入力してください」
  - style: 2（段落）
  - max_length: 500
  - required: true
  - placeholder: 「一文を入力…」

`relay_prev` の値はサーバー側で無視する（既存の `extractFields` が `relay_sentence` のみ取得するため変更不要）。

### 2. deferred応答の即時返却（`src/interactions/modals.js`）

**Before:** `handleRelayModal` がKV読み取り・連投チェックの後にdeferred応答を返す。

**After:** `handleRelayModal` はdeferred応答を即座に返し、KV読み取り・連投チェック・保存をすべて `doRelayModalSubmit` に移動する。

連投チェック失敗時はfollowupメッセージでエフェメラル通知する。

### 3. エラーハンドリング追加（`src/interactions/modals.js`）

`doRelayModalSubmit` 全体をtry/catchで囲み、エラー時もfollowupメッセージでユーザーに通知する。

```
try {
  // KV読み取り、連投チェック、保存、パネル更新、followup送信
} catch (err) {
  console.error('doRelayModalSubmit error:', err)
  await sendFollowupMessage(applicationId, interactionToken, {
    content: 'エラーが発生しました。もう一度お試しください。',
    flags: 64,
  })
}
```

## 影響範囲

| ファイル | 変更内容 |
|---------|---------|
| `src/modals/relayModal.js` | モーダル構造の変更（タイトル固定、2入力欄、style/max_length変更） |
| `src/interactions/modals.js` | deferred即時返却、ロジック移動、try/catch追加 |

## テスト

- 既存の `tests/relayButton.test.js` のモーダル関連テストを更新
- deferred応答が即座に返されることの確認
- エラー時にfollowupが送信されることの確認
- 連投チェックがバックグラウンドで正しく動作することの確認
