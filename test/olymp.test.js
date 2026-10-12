'use strict';
// Tests für die Olympiade-Anbindung: Punkterechnung und Ticket-Prüfung. Aufruf: node test/olymp.test.js
const assert = require('assert');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');
const L = require('../js/logik.js');
const wertung = require('../wertung.js');
const olymp = require('../olymp.js');

let anzahl = 0;
async function test(name, f) { await f(); anzahl++; console.log('ok  ' + name); }
const KENNUNG = 'lauf-test-1';

(async () => {
  await test('Olympia-Strecke: für dieselbe Kennung gleich, für andere anders', () => {
    const a = L.olympLevel(KENNUNG), b = L.olympLevel(KENNUNG), c = L.olympLevel('lauf-test-2');
    assert.strictEqual(a.key, b.key); assert.notStrictEqual(a.key, c.key);
    const la = new L.Lauf(a, L.MOTOS[0], undefined, 1), lb = new L.Lauf(b, L.MOTOS[0], undefined, 1);
    assert.strictEqual(la.zielX, lb.zielX); assert.strictEqual(la.muenzen.length, lb.muenzen.length);
    assert.ok(la.zielX > 300);
  });

  await test('Punkte: Ziel schlägt Absturz, schneller schlägt langsamer, Münzen und Tricks zählen', () => {
    const ziel = z => wertung.punkte(KENNUNG, { stufe: 1 }, { ziel: true, weg: 1, zeit: z, muenzen: 20, tricks: 300 }).punkte;
    const absturz = wertung.punkte(KENNUNG, { stufe: 1 }, { ziel: false, weg: 200, zeit: 20, muenzen: 20, tricks: 300 }).punkte;
    assert.ok(ziel(60) > absturz);
    assert.ok(ziel(45) > ziel(60));
    assert.ok(wertung.punkte(KENNUNG, {}, { ziel: false, weg: 300, zeit: 30, muenzen: 5, tricks: 0 }).punkte > wertung.punkte(KENNUNG, {}, { ziel: false, weg: 100, zeit: 30, muenzen: 5, tricks: 0 }).punkte);
    assert.ok(wertung.punkte(KENNUNG, {}, { ziel: false, weg: 100, zeit: 30, muenzen: 15, tricks: 0 }).punkte > wertung.punkte(KENNUNG, {}, { ziel: false, weg: 100, zeit: 30, muenzen: 5, tricks: 0 }).punkte);
    assert.ok(/Punkte/.test(wertung.punkte(KENNUNG, {}, { ziel: true, zeit: 50, muenzen: 0, tricks: 0 }).text));
  });

  await test('Punkte: unmögliche Werte werden begrenzt', () => {
    const st = wertung.strecke(KENNUNG, 1), max = wertung.punkte(KENNUNG, { stufe: 1 }, { ziel: true, zeit: 0.1, muenzen: 1e9, tricks: 1e9 });
    // Zeit wird auf das Tempolimit angehoben, Münzen auf die Strecke begrenzt, Tricks nach Zeit gedeckelt
    assert.ok(max.punkte < 25000, 'Höchstwert plausibel: ' + max.punkte);
    const wirr = wertung.punkte(KENNUNG, {}, { ziel: 'ja', weg: 'x', zeit: NaN, muenzen: -5, tricks: null });
    assert.strictEqual(wirr.punkte, 0);
    assert.strictEqual(wertung.punkte(KENNUNG, {}, null).punkte, 0);
    // Weg über die Streckenlänge hinaus zählt nicht mehr
    const lang = wertung.punkte(KENNUNG, {}, { ziel: false, weg: 1e6, zeit: 900, muenzen: 0, tricks: 0 }).punkte;
    assert.ok(lang <= Math.round((st.zielX - 3) * 3) + 1);
  });

  await test('Ticket: nur gültige, zum Spiel passende Tickets werden angenommen', () => {
    const o = olymp({ spiel: 'schanzenloewe' }), w = olymp.werkzeug();
    const inhalt = { sp: 'schanzenloewe', l: 'x1', s: 'sp1', g: 0, m: ['sp1'], u: 'http://localhost:1', n: 'Tom', c: { stufe: 1 }, bis: Date.now() + 60000, z: 'http://localhost:1/', ti: 'Test', nr: 1, von: 2 };
    assert.ok(o.ticketPruefen(w.ausstellen(inhalt)));
    assert.strictEqual(o.ticketPruefen(w.ausstellen({ ...inhalt, sp: 'andere' })), null);
    assert.strictEqual(o.ticketPruefen(w.ausstellen({ ...inhalt, bis: Date.now() - 1 })), null);
    assert.strictEqual(o.ticketPruefen(w.ausstellen(inhalt).slice(0, -3) + 'abc'), null);
    assert.strictEqual(o.ticketPruefen('quatsch'), null);
  });

  // Server starten, Olympiade als Gegenstelle nachbauen, ganzen Ablauf prüfen
  const frei = () => new Promise(ok => { const s = net.createServer(); s.listen(0, () => { const p = s.address().port; s.close(() => ok(p)); }); });
  const empfangen = [];
  const gegenstelle = http.createServer((req, res) => {
    let d = ''; req.on('data', c => { d += c; });
    req.on('end', () => { empfangen.push({ pfad: req.url, sig: req.headers['x-olymp-signatur'], text: d }); res.writeHead(200); res.end('{}'); });
  });
  await new Promise(ok => gegenstelle.listen(0, ok));
  const port = await frei();
  const env = { ...process.env, PORT: String(port) }; delete env.ZUGANG_PASSWORT; delete env.RENDER;
  const kind = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { await fetch(`http://localhost:${port}/healthz`); break; } catch (e) { await new Promise(ok => setTimeout(ok, 100)); } }
    const post = body => fetch(`http://localhost:${port}/api/olymp`, { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }).then(async r => ({ status: r.status, d: await r.json() }));
    const w = olymp.werkzeug();
    const ticket = (s, extra) => w.ausstellen({ sp: 'schanzenloewe', l: 'srv-lauf', s, g: 0, m: ['sp1', 'sp2'], u: 'http://localhost:' + gegenstelle.address().port, n: 'Tom', c: { stufe: 1 }, bis: Date.now() + 60000, z: 'http://localhost/', ...extra });
    const werte = { ziel: true, weg: 600, zeit: 55, muenzen: 30, tricks: 400 };

    await test('Server: ohne gültiges Ticket keine Meldung', async () => {
      assert.strictEqual((await post({ art: 'ergebnis', werte })).status, 403);
      assert.strictEqual((await post({ ticket: 'a.b', art: 'ergebnis', werte })).status, 403);
      assert.strictEqual((await post({ ticket: ticket('sp1', { sp: 'loewenkart' }), art: 'ergebnis', werte })).status, 403);
      assert.strictEqual((await post({ ticket: ticket('sp1', { bis: 1 }), art: 'ergebnis', werte })).status, 403);
      await new Promise(ok => setTimeout(ok, 300));
      assert.strictEqual(empfangen.filter(e => e.pfad === '/api/ergebnis').length, 0);
    });
    await test('Server: gültiges Ticket meldet den Wert signiert an die Olympiade, nur einmal', async () => {
      const t = ticket('sp1');
      const a = await post({ ticket: t, art: 'ergebnis', werte });
      assert.strictEqual(a.status, 200); assert.ok(a.d.punkte > 0);
      const b = await post({ ticket: t, art: 'ergebnis', werte });
      assert.strictEqual(b.status, 409);
      for (let i = 0; i < 30 && !empfangen.some(e => e.pfad === '/api/ergebnis'); i++) await new Promise(ok => setTimeout(ok, 100));
      const m = empfangen.filter(e => e.pfad === '/api/ergebnis');
      assert.strictEqual(m.length, 1);
      assert.ok(w.meldungOk(m[0].text, m[0].sig), 'Signatur stimmt');
      const inh = JSON.parse(m[0].text);
      assert.strictEqual(inh.art, 'wert'); assert.strictEqual(inh.s, 'sp1'); assert.strictEqual(inh.wert, a.d.punkte); assert.strictEqual(inh.lauf, 'srv-lauf');
      // anderer Spieler im selben Lauf darf noch
      assert.strictEqual((await post({ ticket: ticket('sp2'), art: 'ergebnis', werte: { ziel: false, weg: 100, zeit: 10, muenzen: 3, tricks: 0 } })).status, 200);
    });
    await test('Server: „bin da“ und kaputte Meldungen', async () => {
      assert.strictEqual((await post({ ticket: ticket('sp3'), art: 'da' })).status, 200);
      assert.strictEqual((await post({ ticket: ticket('sp3'), art: 'ergebnis' })).status, 400);
    });
  } finally { kind.kill(); gegenstelle.close(); }
  console.log(anzahl + ' Olympiade-Tests bestanden');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
