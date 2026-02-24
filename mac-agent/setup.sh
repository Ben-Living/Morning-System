#!/bin/bash
# Morning System — Mac Agent Setup Script
# Run once to install the launchd daemon

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_NAME="com.ben.morning-agent"
PLIST_SRC="$SCRIPT_DIR/$PLIST_NAME.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME.plist"
ENV_FILE="$SCRIPT_DIR/.env"

echo "=== Morning System Mac Agent Setup ==="
echo ""

# Check Node.js
if ! command -v node &>/dev/null; then
  echo "ERROR: Node.js not found. Install from https://nodejs.org/"
  exit 1
fi

NODE_PATH=$(which node)
echo "Node.js found at: $NODE_PATH"

# Install dependencies
echo ""
echo "Installing dependencies..."
cd "$SCRIPT_DIR"
npm install

# Create .env if it doesn't exist
if [ ! -f "$ENV_FILE" ]; then
  echo ""
  echo "Creating .env file..."
  cat > "$ENV_FILE" << 'ENVEOF'
# Cloud app URL (no trailing slash)
CLOUD_URL=https://your-app.railway.app

# Must match AGENT_SECRET in cloud app .env
AGENT_SECRET=change-me-to-a-random-secret
ENVEOF
  echo "Created $ENV_FILE — please edit it with your values before continuing."
  echo ""
  echo "Required values:"
  echo "  CLOUD_URL    — your cloud app URL"
  echo "  AGENT_SECRET — must match the cloud app's AGENT_SECRET"
  echo ""
  read -p "Press Enter when .env is configured, or Ctrl+C to exit..."
fi

# Update plist with actual paths
echo ""
echo "Updating launchd plist..."
sed -i '' "s|/usr/local/bin/node|$NODE_PATH|g" "$PLIST_SRC"
sed -i '' "s|/Users/ben/morning-system/mac-agent|$SCRIPT_DIR|g" "$PLIST_SRC"

# Install plist
echo "Installing to ~/Library/LaunchAgents/..."
cp "$PLIST_SRC" "$PLIST_DEST"
chmod 644 "$PLIST_DEST"

# Unload if already loaded
launchctl unload "$PLIST_DEST" 2>/dev/null || true

# Load it
launchctl load "$PLIST_DEST"

echo ""
echo "=== Setup complete! ==="
echo ""
echo "The agent will run every 30 minutes and on each login."
echo ""
echo "Test it now:"
echo "  node $SCRIPT_DIR/agent.js --dry-run"
echo ""
echo "View logs:"
echo "  tail -f $SCRIPT_DIR/agent.log"
echo ""
echo "Stop the agent:"
echo "  launchctl unload $PLIST_DEST"
echo ""
echo "Restart the agent:"
echo "  launchctl unload $PLIST_DEST && launchctl load $PLIST_DEST"
