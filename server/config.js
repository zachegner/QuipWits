/**
 * Configuration Manager for QuipWits
 * Handles loading/saving API keys and settings from a config file
 * Compatible with pkg bundled executables
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

// Determine config directory based on OS
function getConfigDir() {
  const appName = 'QuipWits';
  
  switch (process.platform) {
    case 'win32':
      return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), appName);
    case 'darwin':
      return path.join(os.homedir(), 'Library', 'Application Support', appName);
    default: // Linux and others
      return path.join(os.homedir(), '.config', appName);
  }
}

const CONFIG_DIR = getConfigDir();
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

// Default configuration
const DEFAULT_CONFIG = {
  anthropicApiKey: '',
  port: 3000,
  autoOpenBrowser: true
};

// In-memory config cache
let configCache = null;

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load configuration from file
 * @returns {Object} Configuration object
 */
function loadConfig() {
  if (configCache) {
    return configCache;
  }
  
  try {
    ensureConfigDir();
    
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf8');
      configCache = { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    } else {
      // Create default config file
      configCache = { ...DEFAULT_CONFIG };
      saveConfig(configCache);
    }
  } catch (error) {
    console.error('Error loading config:', error.message);
    configCache = { ...DEFAULT_CONFIG };
  }
  
  return configCache;
}

/**
 * Save configuration to file
 * @param {Object} config - Configuration object to save
 */
function saveConfig(config) {
  try {
    ensureConfigDir();
    configCache = { ...DEFAULT_CONFIG, ...config };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configCache, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving config:', error.message);
    return false;
  }
}

/**
 * Get a specific config value
 * @param {string} key - Config key
 * @returns {*} Config value
 */
function get(key) {
  const config = loadConfig();
  return config[key];
}

/**
 * Set a specific config value
 * @param {string} key - Config key
 * @param {*} value - Config value
 */
function set(key, value) {
  const config = loadConfig();
  config[key] = value;
  return saveConfig(config);
}

/**
 * Get the Anthropic API key (from config or environment)
 * Environment variable takes precedence
 * @returns {string|null} API key or null
 */
function getAnthropicApiKey() {
  // Environment variable takes precedence
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  
  // Fall back to config file
  const config = loadConfig();
  return config.anthropicApiKey || null;
}

/**
 * Set the Anthropic API key
 * @param {string} apiKey - API key to save
 * @param {boolean} persist - Whether to save to config file (default: true)
 */
function setAnthropicApiKey(apiKey, persist = true) {
  // Always set in environment for current session
  process.env.ANTHROPIC_API_KEY = apiKey;
  
  // Optionally persist to config file
  if (persist) {
    set('anthropicApiKey', apiKey);
  }
  
  return true;
}

/**
 * Check if API key is configured (either env or config)
 * @returns {boolean}
 */
function hasAnthropicApiKey() {
  return !!getAnthropicApiKey();
}

/**
 * Get config file path (for display to user)
 * @returns {string}
 */
function getConfigPath() {
  return CONFIG_FILE;
}

/**
 * Clear the config cache (useful after external changes)
 */
function clearCache() {
  configCache = null;
}

module.exports = {
  loadConfig,
  saveConfig,
  get,
  set,
  getAnthropicApiKey,
  setAnthropicApiKey,
  hasAnthropicApiKey,
  getConfigPath,
  getConfigDir,
  clearCache,
  DEFAULT_CONFIG
};
