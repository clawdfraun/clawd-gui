// Claude usage fetcher — called by upload-server.js on demand.
// Returns { windows, updatedAt } or { error, updatedAt }.

const SESSION_KEY = process.env.CLAUDE_WEB_SESSION_KEY || process.env.CLAUDE_AI_SESSION_KEY;

const headers = {
  Cookie: `sessionKey=${SESSION_KEY}`,
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

export async function fetchClaudeUsage() {
  if (!SESSION_KEY) {
    return { error: 'No CLAUDE_WEB_SESSION_KEY set', updatedAt: Date.now() };
  }

  try {
    const orgRes = await fetch('https://claude.ai/api/organizations', { headers });
    if (!orgRes.ok) {
      return { error: `Orgs HTTP ${orgRes.status}`, updatedAt: Date.now() };
    }
    const orgs = await orgRes.json();
    const orgId = orgs?.[0]?.uuid;
    if (!orgId) {
      return { error: 'No org found', updatedAt: Date.now() };
    }

    const usageRes = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, { headers });
    if (!usageRes.ok) {
      return { error: `Usage HTTP ${usageRes.status}`, updatedAt: Date.now() };
    }
    const data = await usageRes.json();

    const windows = [];
    if (data.five_hour?.utilization !== undefined) {
      windows.push({
        label: 'Current session',
        usedPercent: data.five_hour.utilization,
        resetAt: data.five_hour.resets_at || null,
      });
    }
    if (data.seven_day?.utilization !== undefined) {
      windows.push({
        label: 'Current week (all models)',
        usedPercent: data.seven_day.utilization,
        resetAt: data.seven_day.resets_at || null,
      });
    }
    if (data.seven_day_sonnet?.utilization !== undefined) {
      windows.push({
        label: 'Current week (Sonnet only)',
        usedPercent: data.seven_day_sonnet.utilization,
        resetAt: data.seven_day_sonnet.resets_at || null,
      });
    }
    if (data.seven_day_opus?.utilization !== undefined) {
      windows.push({
        label: 'Current week (Opus only)',
        usedPercent: data.seven_day_opus.utilization,
        resetAt: data.seven_day_opus.resets_at || null,
      });
    }

    // Include server's timezone for correct display on clients
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return { windows, updatedAt: Date.now(), timezone };
  } catch (err) {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return { error: err.message, updatedAt: Date.now(), timezone };
  }
}
