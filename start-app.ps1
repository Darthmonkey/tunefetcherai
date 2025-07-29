# Install dependencies
npm install

# Start the backend server in a new window
Start-Process powershell -ArgumentList "-Command", "npm run server"

# Start the frontend server in the current window
npm start
