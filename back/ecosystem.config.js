// PM2 ecosystem — no hardcodear secretos ni DB aquí.
// Los valores reales vienen de back/.env (cargado por dotenv en src/app.js).
//
// Producción:
//   cd /ruta/al/back
//   mkdir -p logs
//   pm2 start ecosystem.config.js --env production
//   pm2 save
//
// Tras cambiar .env:
//   pm2 restart truco-api --update-env
//
// Apache debe proxyear al PORT definido en .env (ej. 5129).

const path = require('path');

module.exports = {
  apps: [
    {
      name: 'truco-api',
      script: './src/app.js',
      cwd: __dirname,

      // Partidas activas viven en memoria por proceso.
      // No usar cluster sin sticky sessions + estado centralizado.
      instances: 1,
      exec_mode: 'fork',

      watch: false,
      max_memory_restart: '500M',
      restart_delay: 3000,
      max_restarts: 10,
      kill_timeout: 10000,

      env_development: {
        NODE_ENV: 'development',
      },

      env_production: {
        NODE_ENV: 'production',
        // PORT, JWT_SECRET, DB_*, CLIENT_ORIGIN, etc. → solo desde .env
      },

      out_file: './logs/pm2-out.log',
      error_file: './logs/pm2-err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
};
