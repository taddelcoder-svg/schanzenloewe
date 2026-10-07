'use strict';
// Schanzenlöwe – Server: liefert nur die Dateien aus. Das ganze Spiel läuft im Browser,
// der Spielstand liegt im localStorage des Spielers.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zugang = require('./zugang')({ titel:'Schanzenlöwe' });

const PORT = Number(process.env.PORT) || 11000;

const SEITEN = { '/':'index.html', '/index.html':'index.html' };
const TYPEN = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8', '.svg':'image/svg+xml'
};

function senden(res, datei, cache) {
  fs.stat(datei, (fehler, info) => {
    if (fehler || !info.isFile()) { res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' }); return res.end('Nicht gefunden'); }
    res.writeHead(200, { 'Content-Type':TYPEN[path.extname(datei)] || 'application/octet-stream', 'Cache-Control':cache, 'X-Content-Type-Options':'nosniff' });
    fs.createReadStream(datei).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let url;
  try { url = new URL(req.url, 'http://x'); } catch (_) { res.writeHead(400); return res.end(); }
  if (url.pathname === '/healthz') { res.writeHead(200, { 'Content-Type':'application/json' }); return res.end('{"ok":true}'); }
  if (url.pathname === '/datenschutz' || url.pathname === '/datenschutz.html') return senden(res, path.join(__dirname, 'datenschutz.html'), 'no-cache');
  // Passwort für Familie und Freunde (zugang.js)
  if (zugang.pruefen(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { 'Content-Type':'text/plain; charset=utf-8', Allow:'GET, HEAD' }); return res.end('Nicht erlaubt'); }
  if (SEITEN[url.pathname]) return senden(res, path.join(__dirname, SEITEN[url.pathname]), 'no-cache');
  const js = /^\/js\/([a-z0-9-]+\.(js|css))$/.exec(url.pathname);
  if (js) return senden(res, path.join(__dirname, 'js', js[1]), 'no-cache');
  res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
  res.end('Nicht gefunden');
});

server.listen(PORT, () => console.log('Schanzenlöwe läuft auf http://localhost:' + PORT));
