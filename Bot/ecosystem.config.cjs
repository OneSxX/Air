module.exports = {
  apps: [
    {
      name: "air-bot",
      script: "src/index.js",
      cwd: ".",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      restart_delay: 5000,
      max_memory_restart: "400M",
      env: {
        NODE_ENV: "production",
        NODE_OPTIONS: "--dns-result-order=ipv4first",
        REGISTER_SLASH_ON_READY: "0",
        HEALTH_ENABLED: "1",
        HEALTH_PORT: "8080",
      },
    },
  ],
};
