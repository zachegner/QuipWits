# QuipWits Party Game

A hilarious QuipWits party game you can host locally on your computer! Players join via their phones and compete to write the funniest answers.

## Quick Start (No Installation Required!)

### Download

Download the executable for your operating system from the [Releases](../../releases) page:

- **Windows**: `QuipWits-Windows.exe`
- **macOS**: `QuipWits-macOS`
- **Linux**: `QuipWits-Linux`

### Running the Game

**Windows:**
1. Double-click `QuipWits-Windows.exe`
2. If Windows SmartScreen appears, click "More info" → "Run anyway"

**macOS:**
1. Double-click `QuipWits-macOS`
   - If blocked: Right-click → Open → Open
   - Or run in Terminal: `chmod +x QuipWits-macOS && ./QuipWits-macOS`

**Linux:**
1. Make executable: `chmod +x QuipWits-Linux`
2. Run: `./QuipWits-Linux`

That's it! The server will start and show you the connection info.

---

## How to Play

1. **Host**: Open the URL shown in the terminal (usually `http://localhost:3000/host`) on a TV or large screen
2. **Players**: On phones/tablets, go to the address shown (e.g., `http://192.168.1.X:3000/play`)
3. **Enter the room code** displayed on the host screen
4. **Start the game** when 3+ players have joined!

### Game Flow
- Each round, players get prompts to answer
- Everyone votes on their favorite answers
- Points awarded based on votes
- Final round: "Last Wit" where everyone answers the same prompt

---

## AI-Powered Prompts (Optional)

The game includes hundreds of pre-made prompts, but you can enable **AI-generated prompts** for endless variety!

### Setting Up AI Prompts

1. Get an API key from [console.anthropic.com](https://console.anthropic.com/)
2. **Option A**: In the host setup screen, paste your API key and click "Save"
3. **Option B**: Create a `.env` file with: `ANTHROPIC_API_KEY=sk-ant-your-key-here`

Without an API key, the game works perfectly with built-in prompts!

---

## Configuration

Settings are saved to:
- **Windows**: `%APPDATA%\QuipWits\config.json`
- **macOS**: `~/Library/Application Support/QuipWits/config.json`
- **Linux**: `~/.config/QuipWits/config.json`

### Available Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `anthropicApiKey` | `""` | Your Anthropic API key |
| `port` | `3000` | Server port |

---

## Network Setup

All players must be on the **same WiFi network** as the host computer.

1. Start the server
2. Note the IP address shown (e.g., `http://192.168.1.100:3000/play`)
3. Players enter this URL in their phone browser
4. Make sure your firewall allows connections on port 3000

### Troubleshooting Connection Issues

- Ensure all devices are on the same network
- Try disabling VPN
- Check firewall settings
- On Windows, allow Node.js through the firewall when prompted

---

## Sharing the Join Link

The easiest way to share is to:
1. Send the play URL to a group chat
2. Or display a QR code (use any QR generator with the play URL)

---

## For Developers

If you want to run from source or contribute:

```bash
# Install dependencies (first time only)
npm install

# Start the server
npm start

# Or for development with auto-reload
npm run dev

# Build standalone executables
npm run build        # Build for all platforms
npm run build:win    # Windows only
npm run build:mac    # macOS only
npm run build:linux  # Linux only
```

### Environment Variables

```bash
# Create .env file with:
ANTHROPIC_API_KEY=sk-ant-your-key
PORT=3000
```

---

## Game Features

- **Themed Games**: Enter a theme (e.g., "80s movies", "dating disasters") for themed prompts
- **Pause/Resume**: Host can pause the game anytime
- **Skip/Kick Players**: Host controls for managing players
- **Reconnection**: Players can rejoin if they disconnect
- **Score Tracking**: Full scoreboard with round-by-round points

---

## Requirements

- Modern web browser (Chrome, Firefox, Safari, Edge)
- All players on the same local network

---

## Enjoy Your Game Night!

Questions or issues? Check the terminal output for error messages.

Made for friends who appreciate adult humor! 🎭

---

## ⚖️ Disclaimer

QuipWits is an independent, fan-made project and is **not affiliated with, endorsed by, or connected to Jackbox Games, Inc.** in any way. This is a free, open-source project created for educational and entertainment purposes.

Quiplash® is a registered trademark of Jackbox Games, Inc. All rights belong to their respective owners.

If you enjoy party games like this, please support the original developers by purchasing [Jackbox Party Packs](https://www.jackboxgames.com/).
