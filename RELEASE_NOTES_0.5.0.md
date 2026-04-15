# QuipWits v0.5.0 Release Notes

## Highlights

This release adds **multi-theme games**, **multiple AI providers** (including xAI Grok), an **adult content mode**, and **rejoin resume** so players pick up at the right prompt after disconnecting.

---

## Downloads

### Windows
- **Installer**: `QuipWits Setup 0.5.0.exe` — Full installer with Start Menu and Desktop shortcuts
- **Portable**: `QuipWits-0.5.0-portable.exe` — No installation required

### macOS
- **DMG**: `QuipWits-0.5.0.dmg` — Drag-and-drop installation
- **ZIP**: `QuipWits-0.5.0-mac.zip` — Portable archive

### Linux
- **AppImage**: `QuipWits-0.5.0.AppImage` — Universal binary
- **Debian package**: `quipwits_0.5.0_amd64.deb` — Debian/Ubuntu

---

## New features

### Themes and lobby
- **Theme chips in the lobby**: Enter multiple themes as chips; the game uses them for prompt variety.
- **Multi-theme prompts**: Prompts can draw from several themes in one session; Last Wit labels reflect theme context more clearly.

### AI providers and content
- **Multi-provider AI**: Choose Anthropic, OpenAI, or **xAI** in host setup; configure API keys in the UI or via environment variables.
- **Adult mode**: Optional setting for mature prompt content where supported by your provider and configuration.

### Reconnection and phone client
- **Resume after rejoin**: Server tracks where each player left off; players resume at the correct prompt instead of restarting the round flow blindly.
- **`answer_failed` handling**: Clearer handling when an answer cannot be accepted; phone client stays in sync with the server.

### Tooling
- **`test:script:multiplayer`**: npm script for multiplayer end-to-end simulation.

---

## Technical details

- **Electron**: 33.x (see lockfile for exact patch)
- **Build**: electron-builder 25.x
- **Platforms**: Windows (x64), macOS (x64), Linux (x64)

---

## Upgrade notes

- Settings remain in the same config paths as v0.4.0; new options (providers, adult mode, themes) appear in the host UI and config as you use them.
- Add API keys and provider choice in host setup, or set the documented environment variables for your chosen provider.

---

## Known issues

- macOS builds may use ad-hoc signing unless you configure Apple Developer ID signing and notarization.
- Windows builds are unsigned unless you configure a code-signing certificate.
- Some automated test scenarios (e.g. timeouts) may be timing-sensitive in CI or slow machines.

---

## Disclaimer

QuipWits is an independent, fan-made project and is **not affiliated with, endorsed by, or connected to Jackbox Games, Inc.** Quiplash® is a registered trademark of Jackbox Games, Inc.

---

**Release date**: April 2026  
**Version**: 0.5.0
