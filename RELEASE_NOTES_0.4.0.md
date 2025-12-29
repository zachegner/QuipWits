# QuipWits v0.4.0 Release Notes

## 🎉 Stable Release

We're excited to announce **QuipWits v0.4.0**, the first stable release! This version includes important bug fixes, improved stability, and enhanced game reliability.

---

## 📦 Downloads

### Windows
- **Installer**: `QuipWits Setup 0.4.0.exe` - Full installer with Start Menu and Desktop shortcuts
- **Portable**: `QuipWits-0.4.0-portable.exe` - No installation required, just run and play

### macOS
- **DMG**: `QuipWits-0.4.0.dmg` - Drag and drop installation
- **ZIP**: `QuipWits-0.4.0-mac.zip` - Portable version

### Linux
- **AppImage**: `QuipWits-0.4.0.AppImage` - Universal Linux binary
- **Debian Package**: `quipwits_0.4.0_amd64.deb` - For Debian/Ubuntu systems

---

## 🐛 Bug Fixes & Improvements

### Event Handling & Timing Fixes
- **Fixed vote matchup event handling**: Resolved issues where events could arrive before listeners were set up, causing game timeouts
- **Improved event resolution**: Fixed duplicate event resolution that could cause multiple resolves from the same event
- **Last Wit mode reveal timing**: Corrected timing issue where mode reveal events could arrive during score delays

### Game Stability
- **Enhanced event flow management**: Improved reliability of game state transitions
- **Better error handling**: More robust handling of edge cases during gameplay
- **Improved test coverage**: Comprehensive test suite now passing (5/6 test scenarios fully validated)

### Technical Improvements
- **Event waiter pattern**: Implemented proper event waiter setup before triggering actions
- **Socket event management**: Optimized event handling to prevent race conditions
- **Game flow reliability**: Enhanced stability throughout all game phases

---

## 🎮 Game Features

All existing features remain fully functional:

- ✅ **Multiplayer Support**: 3-10 players via phone/tablet browsers
- ✅ **Themed Games**: Custom themes for personalized prompts
- ✅ **AI-Powered Prompts**: Optional Anthropic API integration for endless prompt variety
- ✅ **The Last Wit**: Exciting final round with three random modes:
  - **Flashback Lash**: Complete the story
  - **Word Lash**: Create phrases from starting letters
  - **Acro Lash**: Expand acronyms creatively
- ✅ **Host Controls**: Pause, resume, skip, and kick players
- ✅ **Score Tracking**: Full scoreboard with round-by-round points
- ✅ **Reconnection Support**: Players can rejoin if disconnected

---

## 🔧 Technical Details

- **Electron Version**: 33.4.11
- **Node.js**: Latest LTS
- **Build System**: electron-builder 25.1.8
- **Platforms**: Windows (x64), macOS (x64), Linux (x64)

---

## 📝 Upgrade Notes

### From v0.3.0-alpha
- This is a **stable release** - no breaking changes
- All game data and configurations are compatible
- Simply replace the old executable with the new version

### Configuration
Settings are preserved in the same location:
- **Windows**: `%APPDATA%\QuipWits\config.json`
- **macOS**: `~/Library/Application Support/QuipWits/config.json`
- **Linux**: `~/.config/QuipWits/config.json`

---

## 🚀 Getting Started

1. **Download** the appropriate file for your operating system
2. **Run** the executable (no installation required for portable versions)
3. **Open** the host URL in a browser on your TV/large screen
4. **Share** the play URL with players on the same WiFi network
5. **Start playing** when 3+ players have joined!

For detailed instructions, see the [README.md](README.md).

---

## 🐛 Known Issues

- Timeout test scenario may occasionally require longer wait times (non-blocking, test-only issue)
- macOS code signing not configured (ad-hoc signing used)
- Windows code signing not configured (unsigned builds)

---

## 🙏 Thank You

Thank you for playing QuipWits! We hope you enjoy this stable release and have many hilarious game nights ahead.

---

## 📄 License

ISC License - See LICENSE file for details

---

## ⚖️ Disclaimer

QuipWits is an independent, fan-made project and is **not affiliated with, endorsed by, or connected to Jackbox Games, Inc.** in any way. This is a free, open-source project created for educational and entertainment purposes.

Quiplash® is a registered trademark of Jackbox Games, Inc. All rights belong to their respective owners.

If you enjoy party games like this, please support the original developers by purchasing [Jackbox Party Packs](https://www.jackboxgames.com/).

---

**Release Date**: January 2025  
**Version**: 0.4.0  
**Status**: Stable Release

