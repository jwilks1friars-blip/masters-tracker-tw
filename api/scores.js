module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  // --- Attempt 1: Masters.com official live scores feed ---
  for (const url of [
    'https://www.masters.com/en_US/scores/feeds/2026/scores.json',
    'https://www.masters.com/en_US/scores/feeds/scores.json',
  ]) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.masters.com/' },
      });
      if (!r.ok) continue;
      const d = await r.json();
      const rawPlayers = d?.data?.player || [];
      if (rawPlayers.length === 0) continue;

      const players = rawPlayers.map(p => {
        const toparStr = (p.topar || '').trim();
        let topar = null, mc = false;
        if (/^(MC|CUT|WD|DQ)$/i.test(toparStr)) {
          mc = true;
        } else if (toparStr.toUpperCase() === 'E' || toparStr === '0') {
          topar = 0;
        } else {
          const n = parseInt(toparStr, 10);
          if (!isNaN(n)) topar = n;
        }
        return {
          name: p.display_name || '',
          topar,
          mc,
        };
      }).filter(p => p.name);

      if (players.length > 0) {
        return res.json({ players, eventName: 'Masters Tournament 2026', updated: new Date().toISOString(), source: 'masters.com' });
      }
    } catch (_) {}
  }

  // --- Attempt 2: ESPN scoreboard (competitors embedded in event) ---
  try {
    const sbRes = await fetch('https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard');
    if (sbRes.ok) {
      const sb = await sbRes.json();
      const events = sb.events || [];
      const event = events.find(e => /masters/i.test(e.name || ''));
      if (event) {
        const competitors = (event.competitions || []).flatMap(c => c.competitors || []);
        if (competitors.length > 0) {
          const players = parseESPNCompetitors(competitors);
          if (players.length > 0) {
            return res.json({ players, eventName: event.name, updated: new Date().toISOString(), source: 'espn-scoreboard' });
          }
        }

        // --- Attempt 3: ESPN summary endpoint ---
        const lbRes = await fetch(
          `https://site.api.espn.com/apis/site/v2/sports/golf/pga/summary?event=${event.id}`
        );
        if (lbRes.ok) {
          const lb = await lbRes.json();
          const competitors2 = lb.leaderboard?.competitors || [];
          if (competitors2.length > 0) {
            const players = parseESPNCompetitors(competitors2);
            return res.json({ players, eventName: event.name, updated: new Date().toISOString(), source: 'espn-summary' });
          }
        }
      }
    }
  } catch (_) {}

  return res.status(503).json({ error: 'No live score data available — check /api/debug for diagnostics' });
};

function parseESPNCompetitors(competitors) {
  return competitors.map(c => {
    const displayValue = (c.score?.displayValue || '').trim();
    let topar = null, mc = false;
    if (!displayValue || displayValue === '--') {
      topar = null;
    } else if (/^(MC|CUT|WD|DQ|W\/D)$/i.test(displayValue)) {
      mc = true;
    } else if (displayValue.toUpperCase() === 'E') {
      topar = 0;
    } else {
      const n = parseInt(displayValue, 10);
      topar = isNaN(n) ? null : n;
    }
    return { name: c.athlete?.displayName || '', topar, mc };
  }).filter(p => p.name);
}
