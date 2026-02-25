#!/usr/bin/env node
/**
 * Morning System — Mac Background Agent
 *
 * Runs every 30 minutes (via launchd).
 * Extracts Apple Notes and Reminders via AppleScript,
 * then POSTs a JSON snapshot to the cloud app.
 *
 * Setup: see README.md or run ./setup.sh
 */

require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');

const execFileAsync = promisify(execFile);

const CLOUD_URL = process.env.CLOUD_URL;
const AGENT_SECRET = process.env.AGENT_SECRET;
const DRY_RUN = process.argv.includes('--dry-run');
const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, 'agent.log');

// ── Logging ────────────────────────────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}

function logError(msg, err) {
  const line = `[${new Date().toISOString()}] ERROR: ${msg}${err ? ': ' + err.message : ''}`;
  console.error(line);
  try {
    fs.appendFileSync(LOG_FILE, line + '\n');
  } catch {}
}

// ── AppleScript execution ──────────────────────────────────────────────────

async function runAppleScript(scriptPath) {
  try {
    const { stdout } = await execFileAsync('osascript', [scriptPath], {
      timeout: 120000,
    });
    return stdout.trim();
  } catch (err) {
    throw new Error(`AppleScript failed: ${err.message}`);
  }
}

// ── Extract Notes ──────────────────────────────────────────────────────────

async function extractNotes() {
  const scriptPath = path.join(__dirname, 'extract-notes.applescript');

  try {
    const result = await runAppleScript(scriptPath);
    const data = JSON.parse(result);
    return {
      notes: data.notes || [],
      active_note: data.active_note || null,
    };
  } catch (err) {
    logError('Notes extraction failed', err);
    return { notes: [], active_note: null };
  }
}

// ── Extract Reminders ──────────────────────────────────────────────────────

async function extractReminders() {
  const scriptPath = path.join(__dirname, 'extract-reminders.applescript');

  try {
    const result = await runAppleScript(scriptPath);
    if (!result) return [];

    return result
      .split('\n')
      .filter(line => line.trim() !== '')
      .map(line => {
        const [name, list, dueDate] = line.split('|||');
        return { name: name || '', list: list || '', dueDate: dueDate || '' };
      });
  } catch (err) {
    logError('Reminders extraction failed', err);
    return [];
  }
}

// ── Post Snapshot ──────────────────────────────────────────────────────────

async function postSnapshot(payload) {
  // Dynamic import for node-fetch
  const { default: fetch } = await import('node-fetch');

  const res = await fetch(`${CLOUD_URL}/api/snapshot`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-agent-secret': AGENT_SECRET,
    },
    body: JSON.stringify(payload),
    timeout: 15000,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Server returned ${res.status}: ${text}`);
  }

  return res.json();
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  log('Starting extraction');

  if (!CLOUD_URL) {
    logError('CLOUD_URL not set in .env');
    process.exit(1);
  }

  if (!AGENT_SECRET) {
    logError('AGENT_SECRET not set in .env');
    process.exit(1);
  }

  // Extract Notes and Reminders in parallel
  const [notesData, reminders] = await Promise.all([
    extractNotes(),
    extractReminders(),
  ]);

  const payload = {
    notes: notesData.notes,
    active_note: notesData.active_note,
    reminders,
  };

  log(`Extracted: ${notesData.notes.length} notes, ${reminders.length} reminders` +
    (notesData.active_note ? ', Active note present' : ''));

  if (DRY_RUN) {
    console.log('\n── Dry run — not posting ──');
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  try {
    const result = await postSnapshot(payload);
    log(`Snapshot posted successfully (received_at: ${result.received_at})`);
  } catch (err) {
    logError('Failed to post snapshot', err);
    process.exit(1);
  }
}

main().catch((err) => {
  logError('Unhandled error', err);
  process.exit(1);
});
