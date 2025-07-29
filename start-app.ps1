# Install dependencies
npm install

# Update ytdl-core to the latest version
Write-Host "Checking for ytdl-core updates..."
npm install ytdl-core@latest

# Build the frontend
Write-Host "Building frontend..."
npm run build

# Start the backend server in the background
Write-Host "Starting backend server..."
Start-Process node -ArgumentList "server.js" -NoNewWindow

# Start the frontend development server
Write-Host "Starting frontend development server..."
npm start
