module.exports = {
  apps: [{
    name: 'fxtz-server',
    script: './dist/index.js',
    args: '--wt --pem-dir=./example-cert',
    env: {
      HOST: '0.0.0.0',
      PORT: 22334
    },
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    autorestart: true,
    max_memory_restart: '1G'
  }]
}