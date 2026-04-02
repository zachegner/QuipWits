/**
 * Configuration Manager for QuipWits
 * Handles loading/saving API keys and settings from a config file
 * Compatible with pkg bundled executables
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

// Supported AI providers
const PROVIDERS = {
  ANTHROPIC: 'anthropic',
  XAI: 'xai'
};

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
  aiProvider: PROVIDERS.ANTHROPIC,
  anthropicApiKey: '',
  xaiApiKey: '',
  adultMode: false,
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
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }
  const config = loadConfig();
  return config.anthropicApiKey || null;
}

/**
 * Set the Anthropic API key
 * @param {string} apiKey - API key to save
 * @param {boolean} persist - Whether to save to config file (default: true)
 */
function setAnthropicApiKey(apiKey, persist = true) {
  process.env.ANTHROPIC_API_KEY = apiKey;
  if (persist) {
    set('anthropicApiKey', apiKey);
  }
  return true;
}

/**
 * Check if Anthropic API key is configured (either env or config)
 * @returns {boolean}
 */
function hasAnthropicApiKey() {
  return !!getAnthropicApiKey();
}

/**
 * Get the xAI API key (from config or environment)
 * Environment variable takes precedence
 * @returns {string|null} API key or null
 */
function getXaiApiKey() {
  if (process.env.XAI_API_KEY) {
    return process.env.XAI_API_KEY;
  }
  const config = loadConfig();
  return config.xaiApiKey || null;
}

/**
 * Set the xAI API key
 * @param {string} apiKey - API key to save
 * @param {boolean} persist - Whether to save to config file (default: true)
 */
function setXaiApiKey(apiKey, persist = true) {
  process.env.XAI_API_KEY = apiKey;
  if (persist) {
    set('xaiApiKey', apiKey);
  }
  return true;
}

/**
 * Check if xAI API key is configured (either env or config)
 * @returns {boolean}
 */
function hasXaiApiKey() {
  return !!getXaiApiKey();
}

/**
 * Get the active AI provider
 * @returns {string} provider name ('anthropic' or 'xai')
 */
function getActiveProvider() {
  const config = loadConfig();
  return config.aiProvider || PROVIDERS.ANTHROPIC;
}

/**
 * Get adult mode setting
 * @returns {boolean} Whether adult mode is enabled
 */
function getAdultMode() {
  const config = loadConfig();
  return !!config.adultMode;
}

/**
 * Set adult mode setting
 * @param {boolean} enabled - Whether to enable adult mode
 * @param {boolean} persist - Whether to save to config file (default: true)
 */
function setAdultMode(enabled, persist = true) {
  if (persist) {
    set('adultMode', !!enabled);
  }
  return true;
}

/**
 * Set the active AI provider
 * @param {string} provider - 'anthropic' or 'xai'
 * @param {boolean} persist - Whether to save to config file (default: true)
 */
function setActiveProvider(provider, persist = true) {
  if (!Object.values(PROVIDERS).includes(provider)) {
    throw new Error(`Unknown provider: ${provider}`);
  }
  if (persist) {
    set('aiProvider', provider);
  }
  return true;
}

/**
 * Get the API key for the active provider
 * @returns {string|null}
 */
function getActiveApiKey() {
  const provider = getActiveProvider();
  if (provider === PROVIDERS.XAI) {
    return getXaiApiKey();
  }
  return getAnthropicApiKey();
}

/**
 * Check if the active provider has an API key configured
 * @returns {boolean}
 */
function hasActiveApiKey() {
  return !!getActiveApiKey();
}

/**
 * Set API key for a given provider and optionally switch active provider
 * @param {string} provider - 'anthropic' or 'xai'
 * @param {string} apiKey - API key
 * @param {boolean} persist - Whether to persist to config file
 */
function setProviderApiKey(provider, apiKey, persist = true) {
  if (provider === PROVIDERS.XAI) {
    setXaiApiKey(apiKey, persist);
  } else {
    setAnthropicApiKey(apiKey, persist);
  }
  setActiveProvider(provider, persist);
  return true;
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
  PROVIDERS,
  loadConfig,
  saveConfig,
  get,
  set,
  getAnthropicApiKey,
  setAnthropicApiKey,
  hasAnthropicApiKey,
  getXaiApiKey,
  setXaiApiKey,
  hasXaiApiKey,
  getActiveProvider,
  setActiveProvider,
  getActiveApiKey,
  hasActiveApiKey,
  setProviderApiKey,
  getAdultMode,
  setAdultMode,
  getConfigPath,
  getConfigDir,
  clearCache,
  DEFAULT_CONFIG
};
