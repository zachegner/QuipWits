/**
 * QuipWits Electron Main Process
 * Launches the game server and opens the host display in a native window
 */
const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const path = require('path');
const serverManager = require('./server-manager');

// Keep a global reference of the window object
let mainWindow = null;
let splashWindow = null;

// Determine if we're in development mode
const isDev = !app.isPackaged;

/**
 * Create the splash/loading window shown while server starts
 */
function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    resizable: false,
    show: true,
    backgroundColor: '#0a0a1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // Load a simple loading HTML
  splashWindow.loadURL(`data:text/html;charset=utf-8,
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
          background: linear-gradient(135deg, #0a0a1a 0%, #1a0a2e 100%);
          color: white;
          height: 100vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border-radius: 16px;
          border: 2px solid #ff00ff;
          box-shadow: 0 0 30px rgba(255, 0, 255, 0.3);
        }
        h1 {
          font-size: 2.5rem;
          color: #00ffff;
          text-shadow: 0 0 20px #00ffff;
          margin-bottom: 1rem;
          letter-spacing: 0.1em;
        }
        .loader {
          width: 50px;
          height: 50px;
          border: 3px solid transparent;
          border-top-color: #ff00ff;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          margin: 1rem 0;
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        p {
          color: #aaa;
          font-size: 0.9rem;
        }
      </style>
    </head>
    <body>
      <h1>QuipWits</h1>
      <div class="loader"></div>
      <p>Starting game server...</p>
    </body>
    </html>
  `);

  splashWindow.center();
}

/**
 * Create the main application window
 * @param {number} port - The port the server is running on
 */
function createMainWindow(port) {
  console.log(`[Main] Creating main window for port ${port}`);
  
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'QuipWits',
    backgroundColor: '#0a0a1a',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Allow the web content to use audio/video
      autoplayPolicy: 'no-user-gesture-required'
    },
    show: true // Show immediately to debug
  });

  const url = `http://localhost:${port}/host`;
  console.log(`[Main] Loading URL: ${url}`);
  
  // Load the host interface
  mainWindow.loadURL(url);

  // Debug: log when page finishes loading
  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Main] Page finished loading');
  });

  // Debug: log load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`[Main] Failed to load: ${errorCode} - ${errorDescription}`);
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('[Main] Window ready to show');
    // Close splash window
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
    mainWindow.focus();
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost') || url.startsWith('http://127.0.0.1')) {
      return { action: 'allow' };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle window close
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create application menu
  createMenu(port);
}

/**
 * Create the application menu
 * @param {number} port - Server port for menu items
 */
function createMenu(port) {
  const template = [
    {
      label: 'QuipWits',
      submenu: [
        {
          label: 'About QuipWits',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About QuipWits',
              message: 'QuipWits',
              detail: 'A party game where clever answers compete.\n\nVersion: ' + app.getVersion()
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Alt+F4',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Network',
      submenu: [
        {
          label: `Server running on port ${port}`,
          enabled: false
        },
        { type: 'separator' },
        {
          label: 'Open Player URL',
          click: () => {
            shell.openExternal(`http://localhost:${port}/play`);
          }
        },
        {
          label: 'Copy Player URL',
          click: () => {
            const { clipboard } = require('electron');
            // Get local network IP
            const os = require('os');
            const interfaces = os.networkInterfaces();
            let localIP = 'localhost';
            
            for (const name of Object.keys(interfaces)) {
              for (const iface of interfaces[name]) {
                if (iface.family === 'IPv4' && !iface.internal) {
                  localIP = iface.address;
                  break;
                }
              }
            }
            
            clipboard.writeText(`http://${localIP}:${port}/play`);
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'URL Copied',
              message: `Player URL copied to clipboard:\nhttp://${localIP}:${port}/play`
            });
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'QuipWits Guide',
          click: () => {
            shell.openExternal('https://github.com/zachegner/QuipWits#readme');
          }
        },
        {
          label: 'Report Issue',
          click: () => {
            shell.openExternal('https://github.com/zachegner/QuipWits/issues');
          }
        }
      ]
    }
  ];

  // Add dev tools in development mode
  if (isDev) {
    template[1].submenu.push(
      { type: 'separator' },
      { role: 'toggleDevTools' }
    );
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

/**
 * Show an error dialog
 * @param {string} title - Dialog title
 * @param {string} message - Error message
 */
function showError(title, message) {
  if (splashWindow) {
    splashWindow.close();
    splashWindow = null;
  }
  
  dialog.showErrorBox(title, message);
}

/**
 * Application startup
 */
async function startApp() {
  try {
    // Show splash screen
    createSplashWindow();

    // Start the game server
    const { port } = await serverManager.startServer({
      preferredPort: 3000,
      onReady: (port) => {
        console.log(`[Main] Server ready on port ${port}`);
      },
      onError: (err) => {
        console.error('[Main] Server error:', err);
        showError('Server Error', `The game server encountered an error:\n${err.message}`);
      },
      onExit: (code, signal) => {
        console.log(`[Main] Server exited (code: ${code}, signal: ${signal})`);
        // If server exits unexpectedly while app is running, show error
        if (mainWindow && code !== 0 && signal !== 'SIGTERM') {
          showError('Server Stopped', 'The game server has stopped unexpectedly. Please restart the application.');
          app.quit();
        }
      }
    });

    // Create the main window
    createMainWindow(port);

  } catch (err) {
    console.error('[Main] Startup error:', err);
    showError('Startup Error', `Failed to start QuipWits:\n${err.message}`);
    app.quit();
  }
}

// Electron app lifecycle events

app.whenReady().then(startApp);

app.on('window-all-closed', () => {
  // On macOS, apps typically stay active until Cmd+Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    const port = serverManager.getPort();
    if (serverManager.isRunning()) {
      createMainWindow(port);
    } else {
      startApp();
    }
  }
});

app.on('before-quit', async () => {
  console.log('[Main] App quitting, stopping server...');
  await serverManager.stopServer();
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err);
  showError('Unexpected Error', `An unexpected error occurred:\n${err.message}`);
});
