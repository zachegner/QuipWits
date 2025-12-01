/**
 * electron-builder configuration for QuipWits
 * Builds native executables for Windows, macOS, and Linux
 */
module.exports = {
  appId: 'com.quipwits.app',
  productName: 'QuipWits',
  copyright: 'Copyright © 2025 QuipWits',
  
  // Directories
  directories: {
    output: 'dist',
    buildResources: 'build'
  },
  
  // Files to include in the app
  files: [
    'electron/**/*',
    'server/**/*',
    'client-host/**/*',
    'client-phone/**/*',
    'shared/**/*',
    'prompts/**/*',
    'package.json',
    '!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}',
    '!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}',
    '!**/node_modules/*.d.ts',
    '!**/node_modules/.bin',
    '!**/*.{iml,o,hprof,orig,pyc,pyo,rbc,swp,csproj,sln,xproj}',
    '!.editorconfig',
    '!**/._*',
    '!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}',
    '!**/{__pycache__,thumbs.db,.flowconfig,.idea,.vs,.nyc_output}',
    '!**/{appveyor.yml,.travis.yml,circle.yml}',
    '!**/{npm-debug.log,yarn.lock,.yarn-integrity,.yarn-metadata.json}',
    '!tests/**/*',
    '!dist/**/*',
    '!build/**/*',
    '!*.md',
    '!*.bat',
    '!*.command',
    '!jest.config.js',
    '!electron-builder.config.js',
    '!.env*'
  ],
  
  // Don't bundle these - they're part of the app files
  asar: true,
  
  // macOS configuration
  mac: {
    category: 'public.app-category.games',
    target: [
      {
        target: 'dmg',
        arch: ['x64', 'arm64']
      },
      {
        target: 'zip',
        arch: ['x64', 'arm64']
      }
    ],
    darkModeSupport: true,
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: 'build/entitlements.mac.plist',
    entitlementsInherit: 'build/entitlements.mac.plist',
    // Code signing - will use identity from keychain
    identity: null, // Set to your Apple Developer ID, or null for ad-hoc
    notarize: false // Enable when ready: { teamId: 'YOUR_TEAM_ID' }
  },
  
  // DMG configuration
  dmg: {
    contents: [
      {
        x: 130,
        y: 220
      },
      {
        x: 410,
        y: 220,
        type: 'link',
        path: '/Applications'
      }
    ],
    window: {
      width: 540,
      height: 380
    }
  },
  
  // Windows configuration
  win: {
    target: [
      {
        target: 'nsis',
        arch: ['x64']
      },
      {
        target: 'portable',
        arch: ['x64']
      }
    ],
    // Code signing - uncomment when you have a certificate
    // certificateFile: 'path/to/certificate.pfx',
    // certificatePassword: process.env.WIN_CSC_KEY_PASSWORD,
  },
  
  // NSIS installer configuration
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    deleteAppDataOnUninstall: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: 'QuipWits'
  },
  
  // Linux configuration
  linux: {
    target: [
      {
        target: 'AppImage',
        arch: ['x64']
      },
      {
        target: 'deb',
        arch: ['x64']
      }
    ],
    category: 'Game',
    desktop: {
      Name: 'QuipWits',
      Comment: 'A party game where clever answers compete',
      Categories: 'Game;PartyGame;'
    }
  },
  
  // Portable version configuration
  portable: {
    artifactName: '${productName}-${version}-portable.${ext}'
  },
  
  // Publish configuration (for auto-updates - optional)
  publish: {
    provider: 'github',
    owner: 'zachegner',
    repo: 'QuipWits',
    releaseType: 'release'
  },
  
  // Extra resources (files outside of app.asar)
  extraResources: [
    // Add any resources that need to be outside the asar archive
  ],
  
  // After pack hook - can be used for additional processing
  afterPack: async (context) => {
    console.log(`Packed ${context.electronPlatformName} (${context.arch})`);
  }
};
