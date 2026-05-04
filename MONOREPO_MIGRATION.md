# Monorepo Migration — apps/pm + apps/rnd

This branch (`monorepo-migration`) reshapes the repo from a single Next.js app
at the root into two independent Next.js apps under `apps/`:

```
apps/
  pm/       ← the existing Hive PM app (Gantt, Vision, Notion sync, etc.)
  rnd/      ← new R&D team manager app (currently a scaffold)
```

The two apps are **fully self-contained** — each has its own `package.json`,
`node_modules`, `next.config.ts`, `tsconfig.json`. No workspace tooling yet.
Shared packages can be extracted later under `packages/shared/` once the
deployments are verified.

## Local development

PM app (existing behavior, unchanged):

```bash
cd apps/pm
cp /path/to/.env.local .env.local      # already done locally on this branch
npm install
npm run dev                             # http://localhost:3000
```

R&D app (new scaffold):

```bash
cd apps/rnd
# create apps/rnd/.env.local with NEXTAUTH_SECRET and Supabase keys
# (see apps/pm/.env.local for the values currently in use)
npm install
npm run dev                             # use a different port if PM is also running:
                                        # npm run dev -- -p 3100
```

## Render reconfiguration (required before merging to main)

The existing Render service for Hive PM is currently configured with
`Root Directory = ""` (repo root). After merging this branch, the files
move to `apps/pm/`. Render won't auto-find them.

**Steps for the existing Hive PM service (BEFORE merging to main):**

1. Open Render dashboard → Hive PM service → Settings.
2. Set **Root Directory** to `apps/pm`.
3. Build Command: `npm install && npm run build` (unchanged).
4. Start Command: `npm start` (unchanged).
5. Environment variables: keep as-is.
6. Save. Don't trigger a deploy yet.

**Steps to create the new Hive R&D service:**

1. Render dashboard → New + → Web Service.
2. Connect to the same GitHub repo (`hive-pm`).
3. **Root Directory**: `apps/rnd`.
4. **Build Command**: `npm install && npm run build`.
5. **Start Command**: `npm start`.
6. Add the same environment variables that PM uses (NEXTAUTH_SECRET,
   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, NOTION_TOKEN,
   NOTION_TASKS_DB_ID, etc.) — start with the PM set and trim later.
7. Service name: `hive-rnd` (default URL `hive-rnd.onrender.com`).
8. Don't deploy yet.

**Then, in this order:**

1. Merge `monorepo-migration` → `main`.
2. The PM service auto-deploys from main with its new `Root Directory =
   apps/pm`. Verify it succeeds at `hive-pm.onrender.com`.
3. The R&D service auto-deploys from main with `Root Directory = apps/rnd`.
   Verify the scaffold page is live at `hive-rnd.onrender.com`.

If anything goes wrong, the safety net is the `LastMonolithMay4th2026` tag
on commit `cbf0a07`. To roll back:

```bash
git checkout main
git reset --hard LastMonolithMay4th2026
git push origin main --force-with-lease   # requires explicit confirmation
```

(Or just edit Render's Root Directory back to `""` for an instant rollback
without touching git.)
