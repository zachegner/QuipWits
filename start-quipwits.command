#!/bin/bash
# QuipWits Server Launcher for macOS/Linux
# Double-click this file or run: ./start-quipwits.command

echo ""
echo "=========================================="
echo "      QUIPWITS GAME SERVER LAUNCHER"
echo "=========================================="
echo ""

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js is not installed!"
    echo ""
    echo "Please install Node.js:"
    echo "  macOS: brew install node"
    echo "  or download from https://nodejs.org/"
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies... This may take a minute."
    echo ""
    npm install
    if [ $? -ne 0 ]; then
        echo ""
        echo "ERROR: Failed to install dependencies!"
        read -p "Press Enter to exit..."
        exit 1
    fi
    echo ""
fi

echo "Starting QuipWits server..."
echo ""
echo "=========================================="
echo "TIP: To stop the server, press Ctrl+C"
echo "=========================================="
echo ""

# Run the server
node server/index.js

# If we get here, the server has stopped
echo ""
echo "Server stopped."
read -p "Press Enter to exit..."
