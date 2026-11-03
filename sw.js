// Хранит файлы приложения на телефоне, чтобы оно открывалось без интернета.
// При изменении файлов увеличьте номер версии.
const VERSION = 'spisok-v19';
const FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Событие для календаря: cal.ics?t=Название&s=2026-12-01T10:00 — работает и без интернета
function pad2(n) { return String(n).padStart(2, '0'); }
function icsResponse(url) {
  const title = url.searchParams.get('t') || 'Напоминание';
  const start = new Date(url.searchParams.get('s'));
  if (isNaN(start)) return new Response('Нет даты', {status: 400});
  const end = new Date(start.getTime() + 30 * 60000);
  const f = x => x.getFullYear() + pad2(x.getMonth()+1) + pad2(x.getDate()) + 'T' + pad2(x.getHours()) + pad2(x.getMinutes()) + '00';
  const esc = t => String(t).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const body = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Spisok//RU','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    'UID:' + Date.now() + Math.random().toString(36).slice(2) + '@spisok','DTSTAMP:' + stamp,
    'DTSTART:' + f(start),'DTEND:' + f(end),'SUMMARY:' + esc(title),
    'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:' + esc(title),'TRIGGER:PT0M','END:VALARM',
    'END:VEVENT','END:VCALENDAR'].join('\r\n');
  return new Response(body, {headers: {'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="napominanie.ics"'}});
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  const u = new URL(req.url);
  if (u.pathname.endsWith('/cal.ics')) { e.respondWith(icsResponse(u)); return; }
  // Сама страница: сначала из сети (чтобы обновления приходили сразу), без сети — сохранённая копия
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const r = await fetch(req, {signal: ctrl.signal, cache: 'no-store'});
        clearTimeout(t);
        if (r.ok) cache.put('./index.html', r.clone());
        return r;
      } catch (_) {
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }
  // Остальные файлы: сразу из сохранённого, в фоне обновляем
  e.respondWith(caches.open(VERSION).then(async cache => {
    const cached = await cache.match(req, {ignoreSearch: true});
    const fresh = fetch(req).then(r => { if (r.ok) cache.put(req, r.clone()); return r; }).catch(() => null);
    return cached || (await fresh) || Response.error();
  }));
});
