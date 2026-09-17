const { app, BrowserWindow } = require('electron');
const path = require('path');

// Start the server
require('./server.js');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false, // Safer to keep false
      contextIsolation: true,
    },
  });

  // Load the web app from the local server
  // We might need a slight delay to ensure server started, 
  // but usually it's fast enough.
  win.loadURL('http://localhost:3000');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
