module.exports = {
  apps: [{
    name: 'weekly-api',
    script: 'server.js',
    cwd: '/home/ubuntu/weekly-api',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '200M',
    env: {
      NODE_ENV: 'production',
      PORT: 3004,
      DB_PATH: '/home/ubuntu/weekly-api/data/weeklydata.db'
    }
  }]
};
