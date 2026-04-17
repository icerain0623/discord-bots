# 肩書コイン経済

サーバー内で流通する「肩書コイン」を用いた仮想経済システムです。参加・送金・デイリーボーナス・スロット・じゃんけん対戦に対応しています。

## コマンド一覧

### /economy — 経済参加・管理

```bash
/economy join
```

肩書コイン経済に参加します。参加ボーナスコインを受け取り、専用ロールが付与されます。

```bash
/economy leave
```

離脱申請を送信します。管理者の承認が必要です。

```bash
/economy status
```

参加者一覧と離脱申請中のメンバーを自分だけに表示します。

```bash
/economy grant user:<ユーザー> amount:<枚数>
```

指定ユーザーにコインを付与します。（管理者のみ）

```bash
/economy revoke user:<ユーザー> amount:<枚数>
```

指定ユーザーからコインを回収します。（管理者のみ）

```bash
/economy approve-leave user:<ユーザー> [confiscate:<true|false>]
```

離脱申請を承認します。`confiscate: true` で残高を回収、`false` で保持。（管理者のみ）

```bash
/economy reject-leave user:<ユーザー>
```

離脱申請を却下します。（管理者のみ）

---

### /bank — 残高・送金・履歴

```bash
/bank balance
```

自分のコイン残高を確認します。

```bash
/bank send user:<ユーザー> amount:<枚数>
```

指定ユーザーにコインを送金します。

```bash
/bank history
```

直近20件の取引履歴を確認します。

```bash
/bank ranking
```

残高ランキングを全員に公開表示します。

```bash
/bank daily
```

デイリーボーナス（50 肩書コイン）を受け取ります。1日1回限り。

---

### /slot — スロットマシン

```bash
/slot play bet:<賭け金>
```

スロットを1回プレイします。結果は全員に公開表示されます。

```bash
/slot rules
```

配当表を確認します。

---

## 権限

| サブコマンド | 必要権限 |
|---|---|
| `economy join/leave/status` | なし（経済参加者向け） |
| `economy grant/revoke/approve-leave/reject-leave` | サーバーの管理 |
| `bank` 系・`slot` 系 | `/economy join` で参加済みであること |

## フロー

```
/economy join で参加・ロール付与
    ↓
/bank daily でデイリーボーナスを毎日受け取り
    ↓
/bank send で仲間にコインを送金
/slot play でスロットを楽しむ
/janken challenge で対戦（docs/janken.md 参照）
    ↓
/economy leave で離脱申請 → 管理者が承認
```

## 注意

- 賭け金の最低額は10コイン、最大額は5,000コイン（残高の50%との小さい方）です。
- `/bank ranking` のみ公開表示（他は自分だけに表示）です。
- `ECONOMY_ROLE_ID` と `ECONOMY_ADMIN_CHANNEL_ID` 環境変数の設定が必要です。
