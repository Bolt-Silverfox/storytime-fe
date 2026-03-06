module.exports = {
  apps: [
    {
      name: 'storytime-fe-dev',
      script: 'server.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'development',
        PORT: 3674,
      },
      env: {
        NODE_ENV: 'staging',
        PORT: 3675,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
