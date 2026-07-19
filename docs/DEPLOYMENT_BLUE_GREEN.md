# Blue-green deployment — storytime-fe

Mirrors the backend blue-green model. **Green = current stable** (`develop-v1.2.0`,
served at `dev.storytimeapp.me`, talking to `dev.api.storytimeapp.me`).
**Blue = candidate** (`develop-v1.3.0`, served at `blue.dev.storytimeapp.me`,
talking to `blue.dev.api.storytimeapp.me`). Blue runs alongside green so the whole
v1.3.0 stack (frontend + backend) can be validated before promotion.

## Why a build per color
`NEXT_PUBLIC_API_URL` is inlined at **build time** by Next.js. So each color is a
separate build:
- blue build → `NEXT_PUBLIC_API_URL=https://blue.dev.api.storytimeapp.me` (`.env.blue`)
- green build → `NEXT_PUBLIC_API_URL=https://dev.api.storytimeapp.me`

`lib/axios.ts` appends `/api/v1/`, so the value is the API **base without** `/api/v1`.

## Deploy a color
```bash
# on the branch for that color (blue = develop-v1.3.0, green = develop-v1.2.0)
scripts/deploy-blue-green.sh blue     # build against blue API, start PM2 storytime-fe-blue :3010, health-gate
scripts/deploy-blue-green.sh green    # build against green API, start PM2 storytime-fe-green :3000, health-gate
```
The script builds (baking the color's API URL + git sha), assembles the Next
standalone bundle (copies `public/` and `.next/static`), (re)starts the color's
PM2 app, and health-gates `GET /api/health` before returning. Ports are
overridable via `BLUE_PORT` / `GREEN_PORT`.

## nginx (one server block per color)
Unlike an in-place upstream flip, each color has its own subdomain:
```nginx
server {
  server_name blue.dev.storytimeapp.me;
  location / { proxy_pass http://127.0.0.1:3010; proxy_set_header Host $host; }
}
server {
  server_name dev.storytimeapp.me;
  location / { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; }
}
```

## Health check
`GET /api/health` → `{ status: "ok", apiBase, commit, timestamp }`. `apiBase`/`commit`
let you confirm which build + backend a color is serving.

## Promote blue → green
Once `blue.dev` is validated end-to-end against `blue.dev.api`:
1. Merge `develop-v1.3.0` → `develop-v1.2.0` (or fast-forward green to blue).
2. Re-run `scripts/deploy-blue-green.sh green` from that branch (rebuilds green
   against the green API and restarts the green PM2 app). Green now serves v1.3.0.
3. Blue is free for the next candidate.

## In-place flip variant (optional)
If you later want a single-domain zero-downtime cutover (like the backend's
`deploy-blue-green.sh`), keep both colors on ports behind one nginx `upstream`
and flip it after health-gating the new color — the health gate + PM2 wiring here
are the same; only the nginx step changes (swap the `upstream` server + reload).
