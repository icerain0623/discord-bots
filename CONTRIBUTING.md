# Contributing to discord-bots

このプロジェクトへの貢献に興味を持ってくださりありがとうございます！
コードが書けなくても、アイデアの提案だけでも大歓迎です。

---

## Issue の立て方（機能リクエスト）

新しい機能やコマンドのアイデアがあるときは、GitHub Issue を使って提案してください。
コードが書けなくても大丈夫です。アイデアだけでも歓迎します。

### Issue を作成する手順

1. リポジトリの **Issues** タブを開く
2. 右上の **「New issue」** ボタンをクリック
3. **「機能リクエスト」** テンプレートを選ぶ（テンプレートが表示されます）
4. テンプレートに沿って内容を記入する
5. 右下の **「Submit new issue」** をクリックして投稿

### 書き方のポイント

#### タイトル

- `[Feature]` が自動で付きます。その後ろに **ひと言で内容がわかる要約** を書いてください
- 良い例: `[Feature] 川柳を自動検出してリアクションする機能`
- 悪い例: `[Feature] 新しい機能について`

#### 本文（テンプレートの各項目）

| セクション | 書くこと | 例 |
|---|---|---|
| **やりたいこと** | 欲しい機能をひと言で | 「メッセージ中の川柳（5-7-5）を自動検出して Bot がリアクションをつける」 |
| **背景・動機** | なぜ欲しいか、どんな場面で使うか | 「サーバーで川柳を投稿する文化があるが、気づかれずに流れてしまうことが多い」 |
| **具体的なイメージ** | コマンド名、動作の流れ、UI など | 「ユーザーがメッセージを送信 → Bot が5-7-5を検出 → 🎋リアクションを付ける」 |
| **参考情報** | 参考になる Bot やサービスがあれば | URL やスクリーンショットなど |

#### Tips

- **完璧でなくて OK** — 粗いアイデアでも投稿してください。議論しながら詰めていきます
- **1 issue = 1 機能** — 複数のアイデアがあるときは、別々の issue に分けてください
- **スクリーンショットや画像** — イメージ図があれば、ドラッグ&ドロップで貼り付けられます
- **既存の issue を確認** — 同じアイデアがすでにないか、Issues タブで検索してから投稿してください
- **コメントで +1** — 既存の issue に賛同するときは、👍 リアクションやコメントで応援してください

---

## 開発者向け: コードで貢献する

ここから先は、コードを書いて貢献したい方向けのガイドです。

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (installed as a dev dependency via `npm install`)
- A Cloudflare account with Workers enabled
- A Discord bot token and a test Discord server for manual testing

### Environment Setup

#### 1. Install dependencies

```bash
npm install
```

#### 2. Configure secrets

Set the required secrets via Wrangler:

```bash
wrangler secret put DISCORD_TOKEN
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put CLIENT_ID
wrangler secret put GUILD_ID
wrangler secret put INTRO_CHANNEL_ID
```

> `INTRO_CHANNEL_ID` is the channel where self-introduction posts are sent.

#### 3. KV namespace

Session data is stored in a Cloudflare KV namespace bound as `SESSION_KV`. The binding is already configured in `wrangler.toml`. For local development, Wrangler automatically provides a local KV instance.

#### 4. Local development

```bash
npm run dev
```

This runs the worker locally via `wrangler dev`.

#### 5. Register slash commands

```bash
npm run deploy
```

This registers slash commands with Discord via `src/deploy-commands.js`. Run this once after adding or changing commands.

---

### Contribution Workflow

1. **Fork** the repository and clone your fork locally
2. **Create a feature branch**
   ```bash
   git checkout -b feat/your-feature
   ```
3. **Make your changes** and write or update tests as needed
4. **Lint** your code
   ```bash
   npm run lint
   ```
5. **Run tests** — all tests must pass before submitting
   ```bash
   npm test
   ```
   > Note: The project uses ESM (`"type": "module"`). Jest requires the `--experimental-vm-modules` flag, which is already configured in `package.json`.
6. **Commit** using [Conventional Commits](https://www.conventionalcommits.org/)
   - `feat:` new feature
   - `fix:` bug fix
   - `chore:` maintenance / tooling
   - `docs:` documentation only
   - `test:` test additions or changes
7. **Open a Pull Request** against `main` with a clear title and description

---

### Code Style & Conventions

- Use ESM (`import`/`export`) throughout — do not use `require()`
- New **commands** go in `src/commands/`
- New **interaction handlers** go in `src/interactions/`
- New **modal definitions** go in `src/modals/`
- New **utilities** go in `src/utils/`
- **Custom interaction IDs** must follow a `<feature>_*` namespace pattern (e.g., the intro workflow uses `intro_start`, `intro_modal_1`, `intro_next_2`, etc.). Define a new prefix for each new feature. This matters because `src/worker.js` routes interactions by `customId`.
- **Environment/secrets** are accessed via the `env` parameter passed to handlers — do not use `process.env` in Worker code

---

### Testing

- Unit tests are required for any new utility added under `src/utils/`
- Test files live flat in `tests/` and are named `<module>.test.js`
- Run all tests with:
  ```bash
  npm test
  ```

---

### Adding a New Bot Feature

Use this checklist when adding a new feature:

- [ ] Add command definition in `src/commands/`
- [ ] Register the command in `src/worker.js` and `src/deploy-commands.js`
- [ ] Add interaction handlers in `src/interactions/`
- [ ] Add modal definitions in `src/modals/` (if the feature uses modals)
- [ ] Write unit tests for any new utility logic in `src/utils/`
- [ ] Update the feature table in `README.md`

---

### Deploying

> Only maintainers deploy to production.

```bash
npm run publish
```

This deploys the worker to Cloudflare via `wrangler deploy`.
