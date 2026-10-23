const CACHE = 'mangrove-mrv-shell-v1';
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_SHELL') return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const urls = [...new Set(['/', ...(event.data.urls || [])])].filter(url => {
      const u = new URL(url, self.location.origin);
      return u.origin === self.location.origin && !u.pathname.startsWith('/api/') && !u.pathname.includes('signin') && !u.pathname.includes('signout');
    });
    const results = await Promise.allSettled(urls.map(async url => {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok || response.redirected) throw new Error('Cache failed');
      await cache.put(url, response);
    }));
    event.source?.postMessage({ type: 'SHELL_CACHED', ok: results.length > 0 && results.every(r => r.status === 'fulfilled'), count: results.filter(r => r.status === 'fulfilled').length });
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.includes('signin') || url.pathname.includes('signout')) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(event.request);
      if (response.ok && !response.redirected) await cache.put(event.request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      if (event.request.mode === 'navigate') {
        const shell = await cache.match('/'); if (shell) return shell;
      }
      return new Response('Offline — เปิดแอปออนไลน์และดาวน์โหลดข้อมูลก่อนลงพื้นที่', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
  })());
});
