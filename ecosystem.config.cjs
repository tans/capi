const os = require("node:os");
const path = require("node:path");

const bun = path.join(os.homedir(), ".bun", "bin", "bun");

module.exports = {
  apps: [
    {
      name: "capi",
      cwd: __dirname,
      script: bun,
      args: "--bun ./node_modules/next/dist/bin/next start -p 3210",
      interpreter: "none",
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      env: {
        NODE_ENV: "production",
        PORT: "3210",
        PATH: `${path.dirname(bun)}:${process.env.PATH || ""}`,
      },
    },
  ],
};
