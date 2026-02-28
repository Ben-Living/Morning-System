const db = require('./database');

const CLIENT_ID = process.env.OURA_CLIENT_ID;
const CLIENT_SECRET = process.env.OURA_CLIENT_SECRET;
const API_BASE = 'https://api.ouraring.com/v2';

// ─── OAuth ─────────────────────────────────────────────────────────────────────

function getAuthUrl(redirectUri) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    scope: 'daily',
  });
  return `https://cloud.ouraring.com/oauth/authorize?${params}`;
}

async function exchangeCodeForTokens(code, redirectUri) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const res = await fetch('https://api.ouraring.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Oura token exchange failed (${res.status}): ${text}`);
  }

  return res.json();
}

async function refreshAccessToken(refreshToken) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  });

  const res = await fetch('https://api.ouraring.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) throw new Error(`Oura token refresh failed: ${res.status}`);
  return res.json();
}

async function getValidAccessToken() {
  const tokenRow = await db.getOuraToken();
  if (!tokenRow) return null;

  const fiveMinutes = 5 * 60 * 1000;
  if (tokenRow.expiry_date && Date.now() > tokenRow.expiry_date - fiveMinutes) {
    try {
      const refreshed = await refreshAccessToken(tokenRow.refresh_token);
      const expiryDate = Date.now() + (refreshed.expires_in || 86400) * 1000;
      await db.saveOuraToken(
        refreshed.access_token,
        refreshed.refresh_token || tokenRow.refresh_token,
        expiryDate
      );
      return refreshed.access_token;
    } catch (err) {
      console.error('Oura token refresh failed:', err.message);
      return null;
    }
  }

  return tokenRow.access_token;
}

// ─── Data Fetching ─────────────────────────────────────────────────────────────

async function fetchOuraData(dateStr) {
  let accessToken;
  try {
    accessToken = await getValidAccessToken();
  } catch (err) {
    console.error('Oura auth error:', err.message);
    return null;
  }

  if (!accessToken) return null;

  const headers = { Authorization: `Bearer ${accessToken}` };

  try {
    const [readinessRes, sleepRes, sleepDetailRes] = await Promise.all([
      fetch(`${API_BASE}/usercollection/daily_readiness?start_date=${dateStr}&end_date=${dateStr}`, { headers }),
      fetch(`${API_BASE}/usercollection/daily_sleep?start_date=${dateStr}&end_date=${dateStr}`, { headers }),
      fetch(`${API_BASE}/usercollection/sleep?start_date=${dateStr}&end_date=${dateStr}`, { headers }),
    ]);

    const [readinessJson, sleepJson, sleepDetailJson] = await Promise.all([
      readinessRes.ok ? readinessRes.json() : null,
      sleepRes.ok ? sleepRes.json() : null,
      sleepDetailRes.ok ? sleepDetailRes.json() : null,
    ]);

    const readiness = readinessJson?.data?.[0] || null;
    const sleep = sleepJson?.data?.[0] || null;

    // Use the longest sleep session for detailed metrics
    const sessions = (sleepDetailJson?.data || []).filter((s) => s.type !== 'rest');
    const main = sessions.sort((a, b) => (b.total_sleep_duration || 0) - (a.total_sleep_duration || 0))[0] || null;

    if (!readiness && !sleep && !main) return null;

    return {
      readinessScore: readiness?.score ?? null,
      sleepScore: sleep?.score ?? null,
      temperatureDeviation: readiness?.temperature_deviation ?? null,
      avgHrv: main?.average_hrv ?? null,
      lowestHR: main?.lowest_heart_rate ?? null,
      totalSleepSeconds: main?.total_sleep_duration ?? null,
      deepSleepSeconds: main?.deep_sleep_duration ?? null,
    };
  } catch (err) {
    console.error('Oura data fetch error:', err.message);
    return null;
  }
}

async function isConnected() {
  const token = await db.getOuraToken();
  return !!token;
}

module.exports = { getAuthUrl, exchangeCodeForTokens, fetchOuraData, isConnected };
