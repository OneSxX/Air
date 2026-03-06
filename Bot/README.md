# Air Bot

Discord bot project (`discord.js v14` + `quick.db` / sqlite).

## Requirements

- Node.js 20+ (recommended: 22 LTS)
- npm

## Local Setup

1. Install dependencies:

```bash
npm ci
```

2. Create env file:

```bash
cp .env.example .env
```

3. Fill `.env` at least with:
- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`

4. Validate:

```bash
npm run check
```

5. Run:

```bash
npm start
```

## PM2 (Production)

```bash
pm2 start ecosystem.config.cjs --env production
pm2 save
```

## GitHub Safety Notes

- Never commit secrets. `.env` is ignored by `.gitignore`.
- DB/runtime files are ignored (`json.sqlite`, `backups/`, logs).
- If a token was exposed before, rotate it from Discord Developer Portal.
