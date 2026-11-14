/* Service worker for the Appointments owner app.
   It caches only this app's own static shell files. Every other request —
   the public website, every .php page and the whole /api/ folder — is left
   entirely alone, so sign-in, availability and bookings are never served
   from a cache and the customer-facing site behaves exactly as before. */

const CACHE = 'appointments-shell-v9';

const SHELL = [
    '/css/appointments-app.css',
    '/Js/appointments-app.js',
    '/appointments-app.webmanifest',
    '/Images/app-icon-192.png',
    '/Images/app-icon-512.png',
    '/Images/app-icon-maskable-512.png',
    '/Images/app-icon-180.png'
];

const SHELL_PATHS = new Set(SHELL);

// The app's own code is taken from the network whenever the network answers,
// so an update is never one reload behind. Caching it by path alone made a new
// ?v= hit the old entry, which served yesterday's code against today's page.
const ALWAYS_FRESH = new Set(['/css/appointments-app.css', '/Js/appointments-app.js']);

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await Promise.all(SHELL.map((path) => cache.add(new Request(path, { cache: 'reload' })).catch(() => {})));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET') return;
    let url;
    try { url = new URL(request.url); } catch { return; }
    if (url.origin !== self.location.origin) return;
    // Anything that is not one of this app's own static files falls through to
    // the network untouched, including /api/ and every .php page.
    if (!SHELL_PATHS.has(url.pathname)) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        if (ALWAYS_FRESH.has(url.pathname)) {
            try {
                const fresh = await fetch(request);
                if (fresh && fresh.ok) { cache.put(url.pathname, fresh.clone()); return fresh; }
            } catch { /* offline: the cached copy below is the fallback */ }
            return (await cache.match(request, { ignoreSearch: true })) || Response.error();
        }
        const cached = await cache.match(request, { ignoreSearch: true });
        const network = fetch(request).then((response) => {
            if (response && response.ok) cache.put(url.pathname, response.clone());
            return response;
        }).catch(() => null);
        return cached || (await network) || Response.error();
    })());
});
