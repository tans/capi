module.exports = {
  apps: [
    {
      name: "capi",
      cwd: __dirname,
      script: "bun",
      args: "run dev",
      interpreter: "none",
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: "development",
        PORT: "3210",
      },
    },
  ],
};
