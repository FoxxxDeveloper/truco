// PM2 ecosystem config
// Usage:
//   npm install -g pm2
//   pm2 start ecosystem.config.js --env production
//   pm2 save && pm2 startup

module.exports = {
  apps: [
    {
      name: 'truco-api',
      script: './src/index.js',
      instances: 'max',          // one per CPU core (cluster mode)
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 3000,
      max_restarts: 10,

      // Graceful shutdown: wait for in-flight requests
      kill_timeout: 10000,

      env_development: {
        NODE_ENV: 'development',
        PORT: 3001,
        JWT_SECRET: 'dev_secret_change_me',
        DB_HOST: 'localhost',
        DB_PORT: 3306,
        DB_USER: 'root',
        DB_PASSWORD: '',
        DB_NAME: 'truco_dev',
      },

      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
        // ⚠️  DO NOT commit real secrets here — use env vars or pm2 secrets:
        //     pm2 set truco-api:JWT_SECRET <value>
        JWT_SECRET: 'CHANGE_ME_IN_PRODUCTION',
        DB_HOST: '127.0.0.1',
        DB_PORT: 3306,
        DB_USER: 'truco_user',
        DB_PASSWORD: 'CHANGE_DB_PASS',
        DB_NAME: 'truco_prod',
        TELEGRAM_BOT_TOKEN: '',
        TELEGRAM_BOT_SECRET: '',
        TELEGRAM_ADMIN_CHAT_ID: '',
        COMMISSION_RATE: '0.05',
        REDIS_URL: '',           // optional — falls back to in-memory
      },

      // Log files
      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
