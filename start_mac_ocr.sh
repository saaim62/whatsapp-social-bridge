#!/bin/bash

echo "🚀 Starting OCR Server on Macbook..."

# 1. Start Python OCR server in the background
cd apps/api
python3 ocr_server.py --port 8000 &
OCR_PID=$!

echo "✅ OCR Server running in background (PID: $OCR_PID)"
echo "🔄 Establishing SSH Reverse Tunnel to Oracle Server..."
echo "Press CTRL+C or type 'exit' inside the SSH session to stop both the tunnel and the OCR server."
echo "--------------------------------------------------------"

# 2. Start SSH Tunnel in the foreground
ssh -o ServerAliveInterval=60 -o ServerAliveCountMax=3 -i ~/Downloads/ssh-key-2026-08-27.key -R 9000:127.0.0.1:8000 opc@130.110.113.71

# 3. If SSH connection closes or user presses CTRL+C, kill the OCR server
echo "--------------------------------------------------------"
echo "🛑 SSH Tunnel closed. Shutting down OCR Server..."
kill $OCR_PID
wait $OCR_PID 2>/dev/null
echo "👋 Done!"
