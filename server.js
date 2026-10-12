'use strict';
// Schanzenlöwe – Server: liefert nur die Dateien aus. Das ganze Spiel läuft im Browser,
// der Spielstand liegt im localStorage des Spielers. Als Olympia-Disziplin (?olymp=Ticket) rechnet er die Punkte (wertung.js).
const http = require('http');
const fs = require('fs');
const path = require('path');
const zugang = require('./zugang')({ titel:'Schanzenlöwe' });
const olymp = require('./olymp')({ spiel:'schanzenloewe' });
const wertung = require('./wertung');

const PORT = Number(process.env.PORT) || 11000;

const SEITEN = { '/':'index.html', '/index.html':'index.html' };
const TYPEN = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.woff2':'font/woff2', '.txt':'text/plain; charset=utf-8', '.svg':'image/svg+xml'
};

/* Olympiade: Der Versuch läuft im Browser. Der meldet hier „bin da“ und am Ende seine rohen Werte;
   die Punktzahl rechnet der Server aus und schickt sie an die Olympiade. Pro Ticket zählt nur die erste Meldung. */
const olympGemeldet = new Set();
function olympAnfrage(req, res) {
  let d = '';
  req.on('data', c => { d += c; if (d.length > 8000) req.destroy(); });
  req.on('end', () => {
    const antwort = (status, daten) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); res.end(JSON.stringify(daten)); };
    let m;
    try { m = JSON.parse(d); } catch (_) { return antwort(400, { fehler:'JSON' }); }
    const t = olymp.ticketPruefen(m && m.ticket);
    if (!t) return antwort(403, { fehler:'Das Olympia-Ticket ist ungültig oder abgelaufen.' });
    const schluessel = t.l + ':' + t.s;
    if (m.art === 'da') { olymp.da(t, t.s); return antwort(200, { ok:true, schonGespielt:olympGemeldet.has(schluessel) }); }
    if (m.art !== 'ergebnis' || !m.werte || typeof m.werte !== 'object') return antwort(400, { fehler:'Meldung unvollständig' });
    const w = wertung.punkte(t.l, t.c, m.werte);
    if (olympGemeldet.has(schluessel)) return antwort(409, { fehler:'Dein Versuch ist schon gewertet.', ...w });
    olympGemeldet.add(schluessel);
    olymp.wertMelden(t, t.s, w.punkte, w.text);
    antwort(200, { ok:true, ...w });
  });
}

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
  if (req.method === 'POST' && url.pathname === '/api/olymp') return olympAnfrage(req, res);
  // Passwort für Familie und Freunde (zugang.js)
  if (zugang.pruefen(req, res)) return;
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { 'Content-Type':'text/plain; charset=utf-8', Allow:'GET, HEAD' }); return res.end('Nicht erlaubt'); }
  if (SEITEN[url.pathname]) return senden(res, path.join(__dirname, SEITEN[url.pathname]), 'no-cache');
  if (/^\/fonts\/[\w.-]+\.(woff2|txt)$/.test(url.pathname)) return senden(res, path.join(__dirname, url.pathname.slice(1)), 'public, max-age=604800');
  const js = /^\/js\/([a-z0-9-]+\.(js|css))$/.exec(url.pathname);
  if (js) return senden(res, path.join(__dirname, 'js', js[1]), 'no-cache');
  res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
  res.end('Nicht gefunden');
});

server.listen(PORT, () => console.log('Schanzenlöwe läuft auf http://localhost:' + PORT));
