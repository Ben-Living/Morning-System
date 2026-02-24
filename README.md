# Morning System

A single-user, cloud-hosted web application that conducts daily AI-assisted check-ins, integrating Gmail, Google Calendar, Apple Notes, and Reminders to generate curated daily dashboards and evening reviews.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Mac (runs in background every 30 min)              │
│  ┌──────────────────────────────────────────────┐   │
│  │  mac-agent/agent.js                          │   │
│  │  AppleScript → Notes + Reminders → POST      │   │
│  └──────────────────────────┬───────────────────┘   │
└─────────────────────────────┼───────────────────────┘
                              │ /api/snapshot
                              ▼
┌─────────────────────────────────────────────────────┐
│  Cloud App (Railway/Render)                         │
│  ┌──────────────────────────────────────────────┐   │
│  │  Express + SQLite                            │   │
│  │  • Gmail API (3 accounts)                    │   │
│  │  • Google Calendar API                       │   │
│  │  • Claude API (streaming SSE)                │   │
│  │  • Session persistence                       │   │
│  └──────────────────────────┬───────────────────┘   │
└─────────────────────────────┼───────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────┐
│  Browser (mobile-optimised)                         │
│  Check-In │ Dashboard │ Evening Review              │
└─────────────────────────────────────────────────────┘
```

---

## Setup

### Step 1 — Google Cloud Console

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or use an existing one)
3. Enable these APIs:
   - **Gmail API**
   - **Google Calendar API**
   - **Google People API** (for email address lookup)
4. Go to **Credentials → Create Credentials → OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Authorised redirect URIs: add both
     - `http://localhost:3000/auth/google/callback` (local dev)
     - `https://your-app.railway.app/auth/google/callback` (production)
5. Download the client ID and secret

### Step 2 — Configure the Cloud App

```bash
cd cloud-app
cp .env.example .env
# Edit .env with your values
```

Required environment variables:
| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Your Anthropic API key |
| `GOOGLE_CLIENT_ID` | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | From Google Cloud Console |
| `GOOGLE_REDIRECT_URI` | Must match what's registered in Google |
| `SESSION_SECRET` | Random hex string (32+ bytes) |
| `AGENT_SECRET` | Random hex string (24+ bytes), shared with Mac agent |

### Step 3 — Deploy to Railway (or Render)

**Railway:**
```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
railway new
railway up
# Set environment variables in Railway dashboard
```

**Or run locally:**
```bash
cd cloud-app
npm install
npm start
# Open http://localhost:3000
```

### Step 4 — Connect Google Accounts

1. Open the app in your browser
2. Tap **⋯ → Settings**
3. Under **Google Accounts**, optionally add a label (e.g. "personal"), then tap **Connect Google account**
4. Repeat for each Gmail account (up to 3 or more)

### Step 5 — Install the Mac Agent

```bash
cd mac-agent
cp .env.example .env
# Edit .env: set CLOUD_URL and AGENT_SECRET
chmod +x setup.sh
./setup.sh
```

The setup script will:
- Install Node dependencies
- Update the launchd plist with your paths
- Install and start the launchd daemon

**Test the agent:**
```bash
node mac-agent/agent.js --dry-run
```

**View logs:**
```bash
tail -f mac-agent/agent.log
```

### Step 6 — Grant Permissions

The first time the Mac agent runs, macOS will ask for permission to access:
- **Notes** — for extracting note content
- **Reminders** — for extracting incomplete reminders

Grant both. If you accidentally deny, go to **System Settings → Privacy & Security → Automation** and enable access for Terminal (or whichever app runs the agent).

### Step 7 — Update the System Prompt

The system prompt in `cloud-app/src/claude.js` encodes Ben's context. Update the **heart-wish** and **developmental intention** sections every 1-2 weeks as this evolves.

---

## Daily Usage

### Morning
1. Open the app (bookmark it, add to home screen)
2. Claude opens the check-in with a contextualised question
3. Have a conversation — share what's on your mind, what matters today
4. When done, tap **Generate dashboard →**
5. Switch to the **Dashboard** tab for your daily summary

### Evening
1. Return to the app
2. Tap the **Evening** tab
3. Claude invites reflection on the day
4. When done, tap **Complete day & save summary**
5. The summary is saved and will inform tomorrow's check-in

---

## Files

```
morning-system/
├── cloud-app/
│   ├── server.js              # Express app & all routes
│   ├── src/
│   │   ├── database.js        # SQLite schema & queries
│   │   ├── claude.js          # Claude integration + system prompt
│   │   ├── gmail.js           # Gmail OAuth & email fetching
│   │   └── calendar.js        # Google Calendar fetching
│   ├── public/
│   │   ├── index.html         # Single-page app shell
│   │   ├── styles.css         # Mobile-optimised styles
│   │   └── app.js             # Browser JavaScript
│   ├── .env.example
│   └── package.json
├── mac-agent/
│   ├── agent.js               # Main agent script
│   ├── extract-notes.applescript
│   ├── extract-reminders.applescript
│   ├── com.ben.morning-agent.plist  # launchd config
│   ├── setup.sh               # One-time setup script
│   ├── .env.example
│   └── package.json
└── README.md
```

---

## Maintenance

**Updating the system prompt** (every 1-2 weeks):
Edit `cloud-app/src/claude.js` — update the `SYSTEM_PROMPT` constant. Specifically the "Current heart-wish" and any developmental themes. Redeploy after changes.

**Mac agent not running:**
```bash
# Check status
launchctl list | grep morning

# Restart
launchctl unload ~/Library/LaunchAgents/com.ben.morning-agent.plist
launchctl load ~/Library/LaunchAgents/com.ben.morning-agent.plist
```

**Database location:**
By default: `cloud-app/data/morning.db`
Override with `DB_PATH` environment variable.

---

## Privacy

All data is stored in your own SQLite database on your own server. No data is sent anywhere except:
- To the Anthropic API (conversation content + context)
- To Google's APIs (read-only access to Gmail and Calendar)
