#!/bin/bash
set -e

# Start local Redis server for free background jobs
echo "Starting local Redis server..."
redis-server --daemonize yes || echo "Redis server failed to start, it might already be running"

# Run Prisma database migrations to ensure the Neon database is up to date
echo "Pushing database schema to Neon..."
cd apps/api
npx prisma db push --accept-data-loss
cd ../..

# Start all Node services (Next.js, NestJS)
echo "Starting backend and frontend services via PM2..."
pm2 start ecosystem.hf.config.js

# Stream PM2 logs to the console so we can see why it crashes
pm2 logs &

# Start Caddy reverse proxy to expose port 7860
echo "Starting Caddy on port 7860..."
caddy run --config Caddyfile.hf
