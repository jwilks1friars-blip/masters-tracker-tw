module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=30');

  try {
    const sbRes = await fetch(
      'https://site.api.espn.com/apis/site/v2/sports/golf/pga/scoreboard'
    );
    if (!sbRes.ok) throw new Error(`ESPN scoreboard: HTTP ${sbRes.status}`);
    const sb = await sbRes.json();

    const events = sb.events || [];
    const event = events.find(e =>
      /masters/i.test(e.name || '') || /masters/i.test(e.shortName || '')
    );

    if (!event) {
      return res.status(404).json({
        error: 'Masters not found in current ESPN events',
        availableEvents: events.map(e => ({ name: e.name, id: e.id })),
      });
    }

    // Pull competitors directly from the scoreboard competition data —
    // avoids a second round-trip and the unreliable /summary endpoint.
    let competitors = (event.competitions || []).flatMap(c => c.competitors || []);

    // Fallback: try the summary endpoint if scoreboard had no competitors
    if (competitors.length === 0) {
      const lbRes = await fetch(
        `https://site.api.espn.com/apis/site/v2/sports/golf/pga/summary?event=${event.id}`
      );
      if (lbRes.ok) {
        const lb = await lbRes.json();
        competitors = lb.leaderboard?.competitors || [];
      }
    }

    if (competitors.length === 0) {
      return res.status(503).json({ error: 'No competitor data available yet — tournament may not have started' });
    }

    const players = competitors.map(c => {
      const displayValue = (c.score?.displayValue || '').trim();
      let topar = null;
      let mc = false;

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

      return {
        name: c.athlete?.displayName || c.athlete?.fullName || '',
        topar,
        mc,
      };
    }).filter(p => p.name);

    return res.json({
      players,
      eventName: event.name,
      updated: new Date().toISOString(),
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
