const { google } = require('googleapis');
const { DateTime } = require('luxon');
const db = require('./database');

const NZ_TZ = 'Pacific/Auckland';

function createOAuth2Client(tokenRow) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
  );
  oauth2Client.setCredentials({
    access_token: tokenRow.access_token,
    refresh_token: tokenRow.refresh_token,
    expiry_date: tokenRow.expiry_date,
  });
  oauth2Client.on('tokens', (newTokens) => {
    db.updateGoogleAccessToken(
      tokenRow.account_email,
      newTokens.access_token,
      newTokens.expiry_date
    );
  });
  return oauth2Client;
}

async function fetchTodaysEvents(tokenRow, dateStr) {
  try {
    const auth = createOAuth2Client(tokenRow);
    const calendar = google.calendar({ version: 'v3', auth });

    // Build time window for the given NZ date
    const startOfDay = DateTime.fromISO(dateStr, { zone: NZ_TZ }).startOf('day');
    const endOfDay = startOfDay.endOf('day');

    const res = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay.toISO(),
      timeMax: endOfDay.toISO(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 50,
    });

    const events = (res.data.items || []).map((e) => {
      const start = e.start.dateTime || e.start.date;
      const end = e.end.dateTime || e.end.date;
      const isAllDay = !e.start.dateTime;

      let startFormatted = '';
      if (!isAllDay) {
        startFormatted = DateTime.fromISO(start, { zone: 'UTC' })
          .setZone(NZ_TZ)
          .toFormat('h:mm a');
      }

      return {
        id: e.id,
        summary: e.summary || '(untitled)',
        start,
        end,
        startFormatted,
        isAllDay,
        location: e.location || null,
        description: e.description ? e.description.slice(0, 200) : null,
        account: tokenRow.account_email,
        label: tokenRow.account_label || tokenRow.account_email,
      };
    });

    return events;
  } catch (err) {
    console.error(`Calendar error for ${tokenRow.account_email}:`, err.message);
    return [];
  }
}

async function fetchAllAccountsEvents(dateStr) {
  const tokens = db.getGoogleTokens();
  if (tokens.length === 0) return [];

  const results = await Promise.all(tokens.map((t) => fetchTodaysEvents(t, dateStr)));
  const events = results.flat();

  // Sort by start time; all-day events first
  events.sort((a, b) => {
    if (a.isAllDay && !b.isAllDay) return -1;
    if (!a.isAllDay && b.isAllDay) return 1;
    return new Date(a.start) - new Date(b.start);
  });

  // Deduplicate by summary + start (same event on multiple calendars)
  const seen = new Set();
  return events.filter((e) => {
    const key = `${e.summary}::${e.start}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

module.exports = { fetchAllAccountsEvents };
