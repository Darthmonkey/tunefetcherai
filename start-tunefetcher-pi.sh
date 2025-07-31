#!/bin/bash

# Navigate to the application directory
cd "$(dirname "$0")"

echo "Starting TuneFetcher AI application..."

# Install Node.js dependencies if node_modules does not exist
if [ ! -d "node_modules" ]; then
  echo "node_modules not found. Installing dependencies..."
  npm install || { echo "npm install failed. Exiting."; exit 1; }
fi

# Build the frontend for production
echo "Building frontend..."
npm run build || { echo "Frontend build failed. Exiting."; exit 1; }

# Start the backend server using PM2
echo "Starting backend server with PM2..."
pm2 start server.js --name tunefetcherai-server --watch || { echo "PM2 failed to start server. Exiting."; exit 1; }

echo "TuneFetcher AI application started successfully with PM2."
echo "You can check the status with: pm2 list"
echo "To view logs: pm2 logs tunefetcherai-server"
