module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const results = {};

  // Check ESPN scoreboard
  try {
    const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard');
    const d = await r.json();
    const events = d.events || [];
    results.espn_scoreboard = {
      status: r.status,
      eventCount: events.length,
      events: events.map(e => ({
        id: e.id,
        name: e.name,
        competitorCount: (e.competitions || []).flatMap(c => c.competitors || []).length,
        firstFewCompetitors: (e.competitions || []).flatMap(c => c.competitors || []).slice(0, 3).map(c => ({
          name: c.athlete?.displayName,
          score: c.score?.displayValue,
        })),
      })),
    };
  } catch (e) {
    results.espn_scoreboard = { error: e.message };
  }

  // Check Masters.com feeds
  for (const url of [
    'https://www.masters.com/en_US/scores/feeds/2026/scores.json',
    'https://www.masters.com/en_US/scores/feeds/scores.json',
  ]) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.masters.com/' },
      });
      const text = await r.text();
      let parsed = null;
      try { parsed = JSON.parse(text); } catch (_) {}
      results[url] = {
        status: r.status,
        bodyPreview: text.slice(0, 500),
        playerCount: parsed?.data?.player?.length ?? null,
        firstPlayer: parsed?.data?.player?.[0] ?? null,
      };
    } catch (e) {
      results[url] = { error: e.message };
    }
  }

  res.json(results);
};
