// Vercel serverless function: GET /api/news
// Fetches RSS feeds (local + global), merges, de-duplicates, sorts by date.
const Parser = require('rss-parser');
const parser = new Parser({ timeout: 8000 });

const gnews = (q, local) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-${local ? 'BD' : 'US'}&gl=${local ? 'BD' : 'US'}&ceid=${local ? 'BD:en' : 'US:en'}`;

// Add or remove feeds here. region: "local" or "global"
const FEEDS = [
  { name: 'Google News: Insurance Bangladesh', region: 'local', url: gnews('insurance Bangladesh when:3d', true) },
  { name: 'Google News: IDRA / Bangladesh insurers', region: 'local', url: gnews('IDRA OR "insurance development and regulatory authority" Bangladesh when:7d', true) },
  { name: 'Google News: Insurtech', region: 'global', url: gnews('insurtech when:2d', false) },
  { name: 'Google News: Insurance industry', region: 'global', url: gnews('insurance industry AI when:2d', false) },
  { name: 'Insurance Journal', region: 'global', url: 'https://www.insurancejournal.com/feed/' },
  { name: 'Reinsurance News', region: 'global', url: 'https://www.reinsurancene.ws/feed/' },
  { name: 'Artemis', region: 'global', url: 'https://www.artemis.bm/feed/' }
];

module.exports = async (req, res) => {
  const results = await Promise.allSettled(FEEDS.map(f => parser.parseURL(f.url)));
  const items = [];
  const failed = [];
  results.forEach((r, i) => {
    const f = FEEDS[i];
    if (r.status !== 'fulfilled') { failed.push(f.name); return; }
    r.value.items.slice(0, 15).forEach(it => {
      items.push({
        title: (it.title || '').trim(),
        link: it.link,
        source: f.name.replace('Google News: ', 'Google News · '),
        region: f.region,
        date: it.isoDate || it.pubDate || null,
        snippet: (it.contentSnippet || '').slice(0, 220)
      });
    });
  });

  const seen = new Set();
  const unique = items
    .filter(x => x.title && x.link)
    .filter(x => { const k = x.title.toLowerCase().slice(0, 60); if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  // Cache at Vercel's edge for 15 min so the site stays fast
  res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
  res.status(200).json({ updated: new Date().toISOString(), failed, items: unique });
};
