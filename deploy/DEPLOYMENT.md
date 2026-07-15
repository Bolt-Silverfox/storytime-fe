# Web app deployment & subdomains

The web app is served from three subdomains, each backed by a Next.js
standalone process managed by PM2 and fronted by nginx.

| Subdomain | Env | Server | PM2 app | Port | Deploy branch | API (`NEXT_PUBLIC_API_URL`) |
|---|---|---|---|---|---|---|
| `dev.web.storytimeapp.me` | dev | shared dev/staging box | `storytime-fe-dev` | 3674 | `dev` | `https://dev.api.storytimeapp.me` |
| `staging.web.storytimeapp.me` | staging | shared dev/staging box | `storytime-frontend-staging` | 3675 | `staging` | `https://dev.api.storytimeapp.me` * |
| `web.storytimeapp.me` | prod | dedicated prod box | `storytime-fe-prod` | 3000 | `main` | `https://api.storytimeapp.me` |

\* There is no `staging.api` backend, so staging web points at `dev.api`. If a
staging backend is ever added, update the staging build env.

> **`NEXT_PUBLIC_API_URL` is build-time.** Next inlines `NEXT_PUBLIC_*` vars
> during `next build`, not at runtime — so it must be set *before the build* for
> each environment (via the env file / secret below), **not** in PM2. If it is
> unset, the app falls back to `https://dev.api.storytimeapp.me` (see
> `lib/axios.ts`), which is correct for dev/staging but **wrong for prod** — so
> prod must set it explicitly.

---

## 1. DNS (do this first)

Create these records at the DNS provider for `storytimeapp.me`:

| Type | Name | Value |
|---|---|---|
| A | `dev.web` | `3.136.23.56` (shared dev/staging server) |
| A | `staging.web` | `3.136.23.56` (shared dev/staging server) |
| A | `web` | **<prod server IP>** |

(The backend CORS already allows `*.storytimeapp.me` at any depth, so no backend
change is needed.)

## 2. GitHub Actions secrets

**`production` environment** (for `deploy-prod.yml`):

| Secret | Value |
|---|---|
| `PROD_SERVER_HOST` | prod server IP/host |
| `PROD_SERVER_USER` | ssh user |
| `PROD_DEPLOY_PATH` | e.g. `/var/www/storytime/prod/frontend` |
| `PROD_SSH_PRIVATE_KEY` | private key with access to the prod box |
| `PROD_ENV_FILE` | full `.env` contents, **must** include `NEXT_PUBLIC_API_URL=https://api.storytimeapp.me` |

**`development` environment** (existing `deploy-dev.yml`): confirm its
`ENV_FILE` secret sets `NEXT_PUBLIC_API_URL=https://dev.api.storytimeapp.me`.

**Staging** (`deploy-staging.yml`) builds on the server and has no env-file step;
it relies on the axios fallback (`dev.api`). Add a `.env` on the staging box with
`NEXT_PUBLIC_API_URL=https://dev.api.storytimeapp.me` if you want it explicit.

## 3. nginx (on each server)

Config files live in `deploy/nginx/`. On the **shared dev/staging box** install
`dev.web…` and `staging.web…`; on the **prod box** install `web…`:

```bash
sudo cp deploy/nginx/dev.web.storytimeapp.me.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/dev.web.storytimeapp.me.conf /etc/nginx/sites-enabled/
# repeat for staging.web on the same box; web on the prod box
sudo nginx -t && sudo systemctl reload nginx

# TLS (per domain):
sudo certbot --nginx -d dev.web.storytimeapp.me
sudo certbot --nginx -d staging.web.storytimeapp.me
sudo certbot --nginx -d web.storytimeapp.me   # on prod box
```

## 4. PM2

Ports and app names come from `ecosystem.config.js`. The deploy workflows run
`pm2 startOrReload ecosystem.config.js --only <app>` from the deploy path. After
the first successful deploy on each box, persist across reboots:

```bash
pm2 save
pm2 startup    # run the command it prints, once
```

## 5. Deploy

Push to the matching branch (`dev` / `staging` / `main`) and the workflow builds
and deploys. Verify:

```bash
curl -I https://dev.web.storytimeapp.me
curl -I https://staging.web.storytimeapp.me
curl -I https://web.storytimeapp.me
```

---

## Notes / follow-ups

- **`deploy-staging.yml` is bespoke** — it clones on the server and hard-resets to
  `origin/develop-v0.0.1`. Consider aligning it to the standalone rsync pattern
  used by dev/prod (and pointing it at the intended staging branch) for
  consistency; left as-is here to avoid changing a working pipeline untested.
- The dev/prod workflows require `output: 'standalone'` in `next.config` — already set.
- Port scheme is arbitrary but must stay in sync across `ecosystem.config.js`,
  the nginx `proxy_pass` lines, and the staging `PORT` override.
