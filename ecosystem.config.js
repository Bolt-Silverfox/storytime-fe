// PM2 process definitions for the Storytime web app.
//
// Each environment runs the Next.js standalone server (server.js) on its own
// port; nginx reverse-proxies the matching subdomain to that port:
//
//   dev.web.storytimeapp.me      -> storytime-fe-dev      127.0.0.1:3674
//   staging.web.storytimeapp.me  -> storytime-fe-staging  127.0.0.1:3675
//   web.storytimeapp.me          -> storytime-fe-prod      127.0.0.1:3000
//
// dev + staging run together on the shared server; prod runs on its own server.
// A deploy starts only its own app from within its deploy path, e.g.:
//   pm2 startOrReload ecosystem.config.js --only storytime-fe-dev
//
// NODE_ENV is 'production' for all three — the dev/staging/prod distinction is
// baked in at *build* time via NEXT_PUBLIC_API_URL (a NEXT_PUBLIC_ var is
// inlined during `next build`, not read at runtime). See deploy/DEPLOYMENT.md.
const base = {
  script: 'server.js',
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  watch: false,
  max_memory_restart: '512M',
};

module.exports = {
  apps: [
    {
      ...base,
      name: 'storytime-fe-dev',
      env: { NODE_ENV: 'production', PORT: 3674 },
    },
    {
      ...base,
      name: 'storytime-fe-staging',
      env: { NODE_ENV: 'production', PORT: 3675 },
    },
    {
      ...base,
      name: 'storytime-fe-prod',
      env: { NODE_ENV: 'production', PORT: 3000 },
    },
  ],
};
