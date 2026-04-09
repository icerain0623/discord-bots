# じゃんけんPvP機能 設計書

## 概要

肩書コインを賭けた1対1のじゃんけん対戦機能。`/slot` に続く2つ目のギャンブル機能で、将来のPvPゲーム（ブラックジャック・ポーカー等）の基盤となるPvPフレームワークも兼ねる。

## 背景・動機

- 現状のギャンブルは `/slot`（vs ハウス）のみで、プレイヤー同士の対戦要素がない
- PvPにより参加者同士の交流・駆け引きが生まれ、サーバー内経済が活性化する
- ポーカーなどの複雑ゲームを実装する前に、シンプルなゲームでPvP基盤を検証したい

## コマンド

```
/janken challenge <user> <bet>
```

- `user`: 挑戦相手（User型、必須）
- `bet`: 賭け金（Integer型、必須、最低10、最大5000）

## フロー

```
1. /janken challenge @target 100
   → バリデーション:
     - 挑戦者が参加者（economy members active=1）か
     - 対象が参加者か
     - 自分自身NG、bot相手NG
     - 挑戦者の残高 >= bet
     - 対象の残高 >= bet
     - 挑戦者に進行中のじゃんけんセッションがないか
   → SESSION_KV にセッション保存（5分TTL）
   → 承諾ボタン付きメッセージを公開投稿

2. 対象が [受ける] クリック
   → セッション取得、ステータスが pending か確認
   → クリック者が targetId か確認
   → EconomyObject に escrow リクエスト → 両者から bet を引き落とし
   → 両者に ephemeral で ✊✌️✋ ボタン表示
   → セッションを status: 'selecting' に更新
   → 元のメッセージを「両者が承諾。手を選んでください」に更新

3. 両者が手を選択（ephemeral ボタン）
   → セッションに手を記録
   → 両者が選び終えたら勝敗判定
   → EconomyObject に payout リクエスト
     - 勝敗あり → winner に bet*2 加算
     - 引き分け → 両者に bet 返却
   → 元のメッセージを結果で更新
   → セッション削除

4. 拒否 or タイムアウト（5分）
   → セッション削除、残高は動かさない
   → タイムアウトは KV TTL に任せる（能動的な処理は不要）
   → 拒否時はメッセージを「拒否されました」に更新
```

## データストレージ

### セッション管理: SESSION_KV

既存の `SESSION_KV` を使用（新しいDOやテーブルは作らない）。

**Key:** `janken:{guildId}:{challengerId}`
**TTL:** 300秒

**Value:**
```json
{
  "messageId": "<承諾メッセージID>",
  "channelId": "<チャンネルID>",
  "challengerId": "<挑戦者ID>",
  "targetId": "<対象ID>",
  "bet": 100,
  "status": "pending" | "selecting",
  "choices": {
    "<challengerId>": null | "rock" | "scissors" | "paper",
    "<targetId>": null | "rock" | "scissors" | "paper"
  },
  "createdAt": "<ISO>"
}
```

### EconomyObject への追加エンドポイント

**POST `/janken/escrow`**
- body: `{ challengerId, targetId, amount }`
- 両者の残高チェック → 両者から amount を引き落とし → 両者 `type: 'janken_bet'` で記録
- レスポンス: `{ ok: true }` | `{ error: string }`

**POST `/janken/payout`**
- body: `{ challengerId, targetId, amount, winnerId | null }`
- winnerId があれば winner に `amount * 2` 加算、`type: 'janken_win'`
- winnerId が null（引き分け）なら両者に amount を返却、`type: 'janken_refund'`
- レスポンス: `{ ok: true, balance: number }` (winner の場合) or `{ ok: true }`

### 取引タイプ追加（bank.js TYPE_LABELS）

- `janken_bet`: じゃんけん賭け
- `janken_win`: じゃんけん勝利
- `janken_refund`: じゃんけん引き分け

## 勝敗判定ロジック

```javascript
function judge(a, b) {
  if (a === b) return 'draw'
  if (
    (a === 'rock' && b === 'scissors') ||
    (a === 'scissors' && b === 'paper') ||
    (a === 'paper' && b === 'rock')
  ) return 'a'
  return 'b'
}
```

## UI/UX

### 挑戦メッセージ（公開）
```
🎌 じゃんけん勝負！
<@challenger> が <@target> に挑戦！
賭け金: 100 肩書コイン

残り時間: 5分
```
ボタン: `[受ける]` (style=success), `[拒否する]` (style=danger)

### 承諾後（公開、同じメッセージを更新）
```
🎌 じゃんけん勝負！
<@challenger> vs <@target>
賭け金: 100 肩書コイン

両者が手を選択中...
```

### 手の選択（両者にephemeral）
```
あなたの手を選んでください
```
ボタン: `[✊ グー]` `[✌️ チョキ]` `[✋ パー]`

### 結果メッセージ（公開、最終更新）
```
🎌 じゃんけん勝負！
<@challenger> ✊ vs ✌️ <@target>
→ <@challenger> の勝利！ +100 肩書コイン
```
引き分け時：
```
<@challenger> ✊ vs ✊ <@target>
→ 引き分け！賭け金を返却しました
```

## ファイル構成

```
src/
├── commands/janken.js             # /janken コマンドハンドラ
├── interactions/buttons.js        # janken_accept_*, janken_reject_*, janken_hand_* を追加
├── utils/jankenStore.js           # SESSION_KV ラッパー
├── utils/jankenLogic.js           # 勝敗判定 + 表示ユーティリティ
└── economy/EconomyObject.js       # /janken/escrow, /janken/payout エンドポイント追加
```

## エラー処理

| 状況 | 応答 |
|---|---|
| 挑戦者が参加者でない | ephemeral: `/economy join で参加してください` |
| 対象が参加者でない | ephemeral: `相手は肩書コイン経済に参加していません` |
| 自分自身 / bot | ephemeral: `自分自身 / bot には挑戦できません` |
| 残高不足 | ephemeral: `残高が不足しています（必要: X、所持: Y）` |
| セッション進行中 | ephemeral: `進行中のじゃんけんがあります` |
| bet範囲外 | ephemeral: `賭け金は10〜5000 肩書コインの間で指定してください` |
| セッションタイムアウト | ボタン押下時に `セッションが切れました` |
| 対象以外が承諾ボタン押下 | ephemeral: `このじゃんけんの対象ではありません` |

## テスト戦略

- `jankenLogic.test.js`: 勝敗判定ロジック（9パターン全組み合わせ）
- `jankenStore.test.js`: KVラッパー（get/set/delete）
- `janken.test.js`: コマンドハンドラ（バリデーション、正常系、エラー系）
- `jankenButtons.test.js`: ボタン押下フロー（accept, reject, hand選択）
- `economyObject.test.js`: escrow/payout エンドポイントのテスト追加

## Phase 1 スコープ（今回実装）

- じゃんけん1ラウンドで勝敗決定（引き分けは返却で終了、再戦なし）
- KV TTLベースのタイムアウト（能動的な通知はしない）
- 1ユーザー1セッションまで

## Phase 2以降（今回スコープ外）

- ブラックジャック PvP（PvP基盤の再利用）
- ポーカー PvP
- 複数ラウンド対応（best of 3等）
- タイムアウト時の自動通知メッセージ
