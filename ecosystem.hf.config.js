module.exports = {
  apps: [
    {
      name: "whatsapp-bridge-api",
      script: "npm",
      args: "run start:prod --workspace=apps/api",
      env_file: ".env"
    },
    {
      name: "whatsapp-bridge-web",
      script: "npm",
      args: "run start --workspace=apps/web",
      env_file: ".env"
    }
  ]
};
