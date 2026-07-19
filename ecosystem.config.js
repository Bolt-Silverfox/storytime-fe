// PM2 config for storytime-fe (Next.js `output: 'standalone'`).
//
// Blue-green: green = current stable (develop-v1.2.0, dev.storytimeapp.me),
// blue = the candidate (develop-v1.3.0, blue.dev.storytimeapp.me). Each color
// runs on its own port and is fronted by its own nginx server block; the port
// per color is set below and consumed by scripts/deploy-blue-green.sh.
const path = require('path');

// Standalone entrypoint produced by `pnpm build` (output: 'standalone').
const script = path.join('.next', 'standalone', 'server.js');

const base = {
  script,
  instances: 1,
  exec_mode: 'fork',
  autorestart: true,
  watch: false,
  max_memory_restart: '512M',
};

// Ports per color (override with BLUE_PORT / GREEN_PORT env at deploy time).
const GREEN_PORT = process.env.GREEN_PORT || 3000;
const BLUE_PORT = process.env.BLUE_PORT || 3010;

module.exports = {
  apps: [
    {
      ...base,
      name: 'storytime-fe-green',
      env: { NODE_ENV: 'production', PORT: GREEN_PORT, HOSTNAME: '0.0.0.0' },
    },
    {
      ...base,
      name: 'storytime-fe-blue',
      env: { NODE_ENV: 'production', PORT: BLUE_PORT, HOSTNAME: '0.0.0.0' },
    },
  ],
};
