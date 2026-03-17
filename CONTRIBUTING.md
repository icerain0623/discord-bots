# Contributing to discord-bots

Thank you for your interest in contributing! This project is a Discord bot running on Cloudflare Workers with discord.js v14. Contributions are welcome via the standard GitHub flow.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (installed as a dev dependency via `npm install`)
- A Cloudflare account with Workers enabled
- A Discord bot token and a test Discord server for manual testing

## Environment Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure secrets

Set the required secrets via Wrangler:

```bash
wrangler secret put DISCORD_TOKEN
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put CLIENT_ID
wrangler secret put GUILD_ID
wrangler secret put INTRO_CHANNEL_ID
```

> `INTRO_CHANNEL_ID` is the channel where self-introduction posts are sent.

### 3. KV namespace

Session data is stored in a Cloudflare KV namespace bound as `SESSION_KV`. The binding is already configured in `wrangler.toml`. For local development, Wrangler automatically provides a local KV instance.

### 4. Local development

```bash
npm run dev
```

This runs the worker locally via `wrangler dev`.

### 5. Register slash commands

```bash
npm run deploy
```

This registers slash commands with Discord via `src/deploy-commands.js`. Run this once after adding or changing commands.

---

## Contribution Workflow

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

## Code Style & Conventions

- Use ESM (`import`/`export`) throughout — do not use `require()`
- New **commands** go in `src/commands/`
- New **interaction handlers** go in `src/interactions/`
- New **modal definitions** go in `src/modals/`
- New **utilities** go in `src/utils/`
- **Custom interaction IDs** must follow a `<feature>_*` namespace pattern (e.g., the intro workflow uses `intro_start`, `intro_modal_1`, `intro_next_2`, etc.). Define a new prefix for each new feature. This matters because `src/worker.js` routes interactions by `customId`.
- **Environment/secrets** are accessed via the `env` parameter passed to handlers — do not use `process.env` in Worker code

---

## Testing

- Unit tests are required for any new utility added under `src/utils/`
- Test files live flat in `tests/` and are named `<module>.test.js`
- Run all tests with:
  ```bash
  npm test
  ```

---

## Adding a New Bot Feature

Use this checklist when adding a new feature:

- [ ] Add command definition in `src/commands/`
- [ ] Register the command in `src/worker.js` and `src/deploy-commands.js`
- [ ] Add interaction handlers in `src/interactions/`
- [ ] Add modal definitions in `src/modals/` (if the feature uses modals)
- [ ] Write unit tests for any new utility logic in `src/utils/`
- [ ] Update the feature table in `README.md`

---

## Deploying

> Only maintainers deploy to production.

```bash
npm run publish
```

This deploys the worker to Cloudflare via `wrangler deploy`.
