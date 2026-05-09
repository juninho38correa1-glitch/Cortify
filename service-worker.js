// ============================================
// CORTIFY - Service Worker
// ============================================

const CACHE_VERSION = 'cortify-v1';
const CACHE_ASSETS = [
  './',
  './app.html',
  './admin.html',
  './index.html',
  './css/styles.css',
  './js/config.js',
  './js/supabase-client.js',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ===== INSTALAÇÃO =====
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      // addAll falha se algum recurso não responder, então usamos add individual
      return Promise.allSettled(
        CACHE_ASSETS.map(asset => cache.add(asset).catch(err => {
          console.warn('[SW] Cache failed for:', asset, err);
        }))
      );
    })
  );
  self.skipWaiting(); // ativa logo a nova versão
});

// ===== ATIVAÇÃO =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// ===== FETCH (estratégia network-first com fallback pra cache) =====
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Não interceptar chamadas pra Supabase (sempre online)
  if (request.url.includes('supabase.co') || request.url.includes('supabase.in')) {
    return;
  }

  // Apenas GETs
  if (request.method !== 'GET') return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cacheia a resposta nova
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Sem rede: tenta o cache
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // Página HTML offline: retorna app.html como fallback
          if (request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./app.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});

// ===== PUSH NOTIFICATIONS =====
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Cortify', body: event.data ? event.data.text() : 'Nova notificação' };
  }

  const title = data.title || 'Cortify';
  const options = {
    body: data.body || '',
    icon: data.icon || './icons/icon-192.png',
    badge: data.badge || './icons/icon-192.png',
    tag: data.tag || 'cortify-notification',
    data: data.data || {},
    requireInteraction: data.requireInteraction || false,
    vibrate: [200, 100, 200],
    actions: data.actions || [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ===== CLIQUE NA NOTIFICAÇÃO =====
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || './app.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Se já tem janela aberta, foca nela
      for (const client of clients) {
        if (client.url.includes(self.location.origin)) {
          client.focus();
          if ('navigate' in client) client.navigate(url);
          return;
        }
      }
      // Senão abre nova
      return self.clients.openWindow(url);
    })
  );
});

// ===== NOTIFICAÇÃO FECHADA =====
self.addEventListener('notificationclose', (event) => {
  // Pode logar dados de analytics se quiser
});
