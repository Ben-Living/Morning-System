const { google } = require('googleapis');
const db = require('./database');

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
  );
}

function getAuthUrl(state) {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state: state || '',
  });
}

async function exchangeCodeForTokens(code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  // Get user email
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const { data } = await oauth2.userinfo.get();

  return { tokens, email: data.email };
}

async function getAuthedClient(tokenRow) {
  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials({
    access_token: tokenRow.access_token,
    refresh_token: tokenRow.refresh_token,
    expiry_date: tokenRow.expiry_date,
  });

  // Auto-refresh listener
  oauth2Client.on('tokens', (newTokens) => {
    db.updateGoogleAccessToken(
      tokenRow.account_email,
      newTokens.access_token,
      newTokens.expiry_date
    );
  });

  return oauth2Client;
}

async function fetchUnreadEmails(tokenRow, maxResults = 15) {
  try {
    const auth = await getAuthedClient(tokenRow);
    const gmail = google.gmail({ version: 'v1', auth });

    // Get unread messages from inbox from last 24h
    const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: `is:unread in:inbox after:${since}`,
      maxResults,
    });

    const messages = listRes.data.messages || [];
    if (messages.length === 0) return [];

    // Fetch details for each message
    const emails = await Promise.all(
      messages.map(async (msg) => {
        try {
          const detail = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From', 'Date'],
          });

          const headers = detail.data.payload.headers || [];
          const getHeader = (name) =>
            (headers.find((h) => h.name.toLowerCase() === name.toLowerCase()) || {}).value || '';

          return {
            id: msg.id,
            subject: getHeader('Subject') || '(no subject)',
            from: getHeader('From'),
            date: getHeader('Date'),
            snippet: detail.data.snippet || '',
            account: tokenRow.account_email,
            label: tokenRow.account_label || tokenRow.account_email,
          };
        } catch {
          return null;
        }
      })
    );

    return emails.filter(Boolean);
  } catch (err) {
    console.error(`Gmail error for ${tokenRow.account_email}:`, err.message);
    return [];
  }
}

async function fetchAllAccountsEmails() {
  const tokens = db.getGoogleTokens();
  if (tokens.length === 0) return { emails: [], accountCount: 0 };

  const results = await Promise.all(tokens.map((t) => fetchUnreadEmails(t)));
  const emails = results.flat();

  // Sort by date descending
  emails.sort((a, b) => new Date(b.date) - new Date(a.date));

  return { emails, accountCount: tokens.length };
}

module.exports = { getAuthUrl, exchangeCodeForTokens, fetchAllAccountsEmails };
