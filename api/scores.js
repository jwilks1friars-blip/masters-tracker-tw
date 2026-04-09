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
        availableEvents: events.map(e => e.name || e.shortName || e.id),
      });
    }

    const lbRes = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/golf/pga/summary?event=${event.id}`
    );
    if (!lbRes.ok) throw new Error(`ESPN leaderboard: HTTP ${lbRes.status}`);
    const lb = await lbRes.json();

    const competitors = lb.leaderboard?.competitors || [];

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
        name: c.athlete?.displayName || '',
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
