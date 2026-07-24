#!/bin/bash
# ima2-gen startup script for long-running deployment
# Server binds to 127.0.0.1:3333 — access via reverse proxy only

cd /Users/faustolin/Documents/生图调研/ima2-gen

# Load environment
set -a
source .env
set +a

# Start server in background
node server.js &
SERVER_PID=$!
echo $SERVER_PID > /tmp/ima2-gen.pid
echo "ima2-gen started (PID: $SERVER_PID) on http://127.0.0.1:3333"

# Wait for server to be ready
for i in $(seq 1 10); do
  if curl -s http://127.0.0.1:3333/api/capabilities > /dev/null 2>&1; then
    echo "Server is ready"
    exit 0
  fi
  sleep 1
done

echo "Server failed to start"
exit 1
