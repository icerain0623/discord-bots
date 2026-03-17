# CONTRIBUTING.md Design Spec

**Date:** 2026-03-18
**Topic:** Developer contribution guide for open source discord-bots project

---

## Context

The `discord-bots` project is an open source Discord bot (Node.js 20+, discord.js v14) expecting code contributions via standard GitHub flow (fork → feature branch → PR). A single `CONTRIBUTING.md` in the repo root is the chosen approach — no wiki.

---

## Sections

### 1. Overview & Prerequisites

A short welcome paragraph followed by what contributors need locally:
- Node.js 20+
- A Discord bot token and a test Discord server for manual testing
- Familiarity with discord.js v14

### 2. Contribution Workflow

Standard GitHub flow:
1. Fork the repo
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Make changes and write/update tests
4. Run `npm test` — all tests must pass before submitting
5. Commit using Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`)
6. Open a PR against `main` with a clear title and description

### 3. Code Style & Conventions

- Use ESM (`import`/`export`) throughout — no `require()`
- Commit messages follow Conventional Commits format
- Custom interaction IDs follow the `intro_*` prefix pattern (extend with a new prefix per feature)
- New commands go in `src/commands/`
- New interaction handlers go in `src/interactions/`

### 4. Testing

- Unit tests are required for any new utility added under `src/utils/`
- Run all tests with `npm test`
- Test files live in `tests/`, mirroring the `src/` directory structure

### 5. Adding a New Bot Feature

Checklist for contributors adding a new feature:
- [ ] Add command definition in `src/commands/`
- [ ] Register the command in `src/index.js` and `src/deploy-commands.js`
- [ ] Add interaction handlers in `src/interactions/`
- [ ] Write unit tests for any new utility logic
- [ ] Update the feature table in `README.md`

---

## Out of Scope

- GitHub Wiki (can be added later as the project grows)
- Code of Conduct (can be added separately if needed)
- Issue/PR templates (can be added later)
