/**
 * Server Manager for QuipWits Electron App
 * Handles spawning, monitoring, and graceful shutdown of the game server
 */
const { spawn } = require('child_process');
const path = require('path');
const net = require('net');
const { app } = require('electron');

let serverProcess = null;
let currentPort = 3000;

/**
 * Check if a port is available
 * @param {number} port - Port to check
 * @returns {Promise<boolean>} - True if port is available
 */
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        resolve(false);
      }
    });
    
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find an available port starting from the preferred port
 * @param {number} preferredPort - Preferred starting port
 * @param {number} maxAttempts - Maximum number of ports to try
 * @returns {Promise<number>} - Available port number
 */
async function findAvailablePort(preferredPort = 3000, maxAttempts = 100) {
  for (let i = 0; i < maxAttempts; i++) {
    const port = preferredPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`Could not find an available port after ${maxAttempts} attempts`);
}

/**
 * Check if we're running in development or packaged mode
 * @returns {boolean}
 */
function isDev() {
  return !app.isPackaged;
}

/**
 * Get the path to the server entry point
 * Works both in development and when packaged with electron-builder
 * @returns {string} - Path to server/index.js
 */
function getServerPath() {
  if (isDev()) {
    // Development: relative to electron folder
    return path.join(__dirname, '..', 'server', 'index.js');
  } else {
    // Production: files are in app.asar, use asarUnpack or access via asar path
    // electron-builder puts the asar at resources/app.asar
    return path.join(process.resourcesPath, 'app.asar', 'server', 'index.js');
  }
}

/**
 * Start the game server
 * @param {Object} options - Server options
 * @param {number} options.preferredPort - Preferred port (default: 3000)
 * @param {function} options.onReady - Callback when server is ready
 * @param {function} options.onError - Callback on server error
 * @param {function} options.onExit - Callback when server exits
 * @returns {Promise<{port: number, process: ChildProcess}>}
 */
async function startServer(options = {}) {
  const {
    preferredPort = 3000,
    onReady = () => {},
    onError = () => {},
    onExit = () => {}
  } = options;

  // Stop existing server if running
  await stopServer();

  // Find available port
  currentPort = await findAvailablePort(preferredPort);
  console.log(`[ServerManager] Using port ${currentPort}`);

  const serverPath = getServerPath();
  console.log(`[ServerManager] Starting server from: ${serverPath}`);
  console.log(`[ServerManager] isDev: ${isDev()}`);
  console.log(`[ServerManager] resourcesPath: ${process.resourcesPath}`);

  return new Promise((resolve, reject) => {
    // Use spawn with node instead of fork (fork doesn't work well with asar)
    const nodeExecutable = process.execPath;
    
    serverProcess = spawn(nodeExecutable, [serverPath], {
      env: {
        ...process.env,
        PORT: currentPort.toString(),
        ELECTRON_RUN_AS_NODE: '1'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let serverReady = false;
    let startupTimeout = null;

    // Set a timeout for server startup
    startupTimeout = setTimeout(() => {
      if (!serverReady) {
        reject(new Error('Server startup timed out'));
        stopServer();
      }
    }, 30000); // 30 second timeout

    // Listen for stdout to detect when server is ready
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`[Server] ${output}`);
      
      // Server prints this when ready
      if (output.includes('QUIPWITS SERVER RUNNING') && !serverReady) {
        serverReady = true;
        clearTimeout(startupTimeout);
        onReady(currentPort);
        resolve({ port: currentPort, process: serverProcess });
      }
    });

    serverProcess.stderr.on('data', (data) => {
      console.error(`[Server Error] ${data.toString()}`);
    });

    serverProcess.on('error', (err) => {
      console.error('[ServerManager] Server process error:', err);
      clearTimeout(startupTimeout);
      onError(err);
      if (!serverReady) {
        reject(err);
      }
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(`[ServerManager] Server exited with code ${code}, signal ${signal}`);
      clearTimeout(startupTimeout);
      serverProcess = null;
      onExit(code, signal);
    });
  });
}

/**
 * Stop the game server gracefully
 * @returns {Promise<void>}
 */
function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) {
      resolve();
      return;
    }

    console.log('[ServerManager] Stopping server...');

    // Set a timeout for graceful shutdown
    const forceKillTimeout = setTimeout(() => {
      if (serverProcess) {
        console.log('[ServerManager] Force killing server...');
        serverProcess.kill('SIGKILL');
      }
    }, 5000); // 5 second grace period

    serverProcess.once('exit', () => {
      clearTimeout(forceKillTimeout);
      serverProcess = null;
      console.log('[ServerManager] Server stopped');
      resolve();
    });

    // Send SIGTERM for graceful shutdown
    serverProcess.kill('SIGTERM');
  });
}

/**
 * Get the current server port
 * @returns {number} - Current port number
 */
function getPort() {
  return currentPort;
}

/**
 * Check if server is running
 * @returns {boolean}
 */
function isRunning() {
  return serverProcess !== null && !serverProcess.killed;
}

/**
 * Get the server process
 * @returns {ChildProcess|null}
 */
function getProcess() {
  return serverProcess;
}

module.exports = {
  startServer,
  stopServer,
  getPort,
  isRunning,
  getProcess,
  findAvailablePort,
  isPortAvailable
};
