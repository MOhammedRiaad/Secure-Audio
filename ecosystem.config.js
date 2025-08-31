module.exports = {
  "apps": [
    {
      "name": "secure-audio-api",
      "script": "server.js",
      "instances": 1,
      "exec_mode": "fork",
      "env": {
        "NODE_ENV": "production",
        "NODE_OPTIONS": "--max-old-space-size=1024",
        "UV_THREADPOOL_SIZE": 8
      },
      "max_memory_restart": "1800M",
      "node_args": "--max-old-space-size=1024 --expose-gc",
      "kill_timeout": 30000,
      "listen_timeout": 10000,
      "max_restarts": 3,
      "min_uptime": "10s",
      "watch": false,
      "ignore_watch": [
        "node_modules",
        "uploads",
        "covers",
        "temp"
      ],
      "log_file": "./logs/combined.log",
      "out_file": "./logs/out.log",
      "error_file": "./logs/error.log",
      "log_date_format": "YYYY-MM-DD HH:mm:ss Z"
    }
  ]
};
