// 주어진 URL 페이지의 og:image(대표 이미지)를 서버에서 대신 가져와서 반환.
// 브라우저에서 직접 다른 사이트의 HTML을 fetch하면 CORS로 막히기 때문에,
// 이 서버리스 함수가 대신 요청해서(referer/CORS 제약이 없음) 이미지 URL만 뽑아 돌려줌.
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const url = req.query.url;
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url query parameter is required' });
    return;
  }

  let target;
  try {
    target = new URL(url);
    if (target.protocol !== 'http:' && target.protocol !== 'https:') {
      throw new Error('invalid protocol');
    }
  } catch (e) {
    res.status(400).json({ error: 'invalid url' });
    return;
  }

  try {
    const response = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JejuTripLinkBot/1.0; +https://test-alpha-puce-82.vercel.app)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) {
      res.setHeader('Cache-Control', 's-maxage=3600');
      res.status(200).json({ image: null });
      return;
    }

    const html = await response.text();
    let image = extractOgImage(html, target);
    if (image && isGenericPlaceholder(image)) {
      image = null;
    }

    res.setHeader('Cache-Control', 's-maxage=604800, stale-while-revalidate');
    res.status(200).json({ image });
  } catch (e) {
    res.setHeader('Cache-Control', 's-maxage=600');
    res.status(200).json({ image: null });
  }
};

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractOgImage(html, baseUrl) {
  const patterns = [
    /<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["'][^>]*>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const raw = decodeHtmlEntities(m[1]);
      try {
        return new URL(raw, baseUrl).toString();
      } catch (e) {
        return raw;
      }
    }
  }
  return null;
}

// 지도/서비스 자체의 기본 배너 이미지 등, 장소를 대표하지 않는 이미지는 걸러냄
const GENERIC_PLACEHOLDER_PATTERNS = [
  /ssl\.pstatic\.net\/static\/maps\/assets\/images\/og-map/i,
  /map\.naver\.com.*default/i,
];

function isGenericPlaceholder(imageUrl) {
  return GENERIC_PLACEHOLDER_PATTERNS.some(re => re.test(imageUrl));
}
