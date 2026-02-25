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
  oauth2Client.on('tokens', async (newTokens) => {
    try {
      await db.updateGoogleAccessToken(
        tokenRow.account_email,
        newTokens.access_token,
        newTokens.expiry_date
      );
    } catch (err) {
      console.error('Token refresh save error:', err.message);
    }
  });

  return oauth2Client;
}

async function fetchEmailDetails(gmail, messages, accountEmail, accountLabel) {
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
          account: accountEmail,
          label: accountLabel || accountEmail,
          threadId: msg.threadId || msg.id,
        };
      } catch {
        return null;
      }
    })
  );
  return emails.filter(Boolean);
}

// Unread emails from last 72 hours
async function fetchUnreadEmails(tokenRow, maxResults = 20) {
  try {
    const auth = await getAuthedClient(tokenRow);
    const gmail = google.gmail({ version: 'v1', auth });

    const since = Math.floor((Date.now() - 72 * 60 * 60 * 1000) / 1000);
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: `is:unread in:inbox after:${since}`,
      maxResults,
    });

    const messages = listRes.data.messages || [];
    if (messages.length === 0) return [];

    return fetchEmailDetails(gmail, messages, tokenRow.account_email, tokenRow.account_label);
  } catch (err) {
    console.error(`Gmail unread error for ${tokenRow.account_email}:`, err.message);
    return [];
  }
}

// Starred emails from last 3 weeks
async function fetchStarredEmails(tokenRow, maxResults = 30) {
  try {
    const auth = await getAuthedClient(tokenRow);
    const gmail = google.gmail({ version: 'v1', auth });

    const since = Math.floor((Date.now() - 21 * 24 * 60 * 60 * 1000) / 1000);
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      q: `is:starred after:${since}`,
      maxResults,
    });

    const messages = listRes.data.messages || [];
    if (messages.length === 0) return [];

    const emails = await fetchEmailDetails(gmail, messages, tokenRow.account_email, tokenRow.account_label);

    // Annotate each starred email with whether it might be resolved
    // (heuristic: if snippet contains words like "done", "resolved", "closed", "thanks", "confirmed")
    const resolvedKeywords = /\b(done|resolved|closed|confirmed|sorted|completed|thanks|thank you|cheers|no worries|sounds good|all good|will do)\b/i;
    return emails.map((e) => ({
      ...e,
      starred: true,
      looksResolved: resolvedKeywords.test(e.snippet),
    }));
  } catch (err) {
    console.error(`Gmail starred error for ${tokenRow.account_email}:`, err.message);
    return [];
  }
}

async function fetchAllAccountsEmails() {
  const tokens = await db.getGoogleTokens();
  if (tokens.length === 0) return { emails: [], starredEmails: [], accountCount: 0 };

  const [unreadResults, starredResults] = await Promise.all([
    Promise.all(tokens.map((t) => fetchUnreadEmails(t))),
    Promise.all(tokens.map((t) => fetchStarredEmails(t))),
  ]);

  const emails = unreadResults.flat();
  const starredEmails = starredResults.flat();

  // Sort by date descending
  const sortByDate = (a, b) => new Date(b.date) - new Date(a.date);
  emails.sort(sortByDate);
  starredEmails.sort(sortByDate);

  return { emails, starredEmails, accountCount: tokens.length };
}

module.exports = { getAuthUrl, exchangeCodeForTokens, fetchAllAccountsEmails };
