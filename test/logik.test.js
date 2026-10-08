'use strict';
// Tests fuer die Spiellogik: node test/logik.test.js
const assert = require('assert');
const L = require('../js/logik.js');
let anzahl = 0;
function test(name, f) { f(); anzahl++; console.log('ok  ' + name); }

const VARIANTEN = [{ kp: 2.6, kd: 1.0 }, { kp: 2.0, kd: 1.2 }, { kp: 3.5, kd: 1.0 }, { kp: 2.6, kd: 1.0, versatz: 0.12 }, { kp: 2.6, kd: 1.0, versatz: -0.12 }, { kp: 3.0, kd: 1.5 }];

test('Gelaende: Kreis auf ebenem Boden bekommt Normale nach oben', () => {
  const g = new L.Gelaende(); g.add(0, 0, 10, 0);
  const o = {}; assert.ok(g.kreis(5, 0.3, 0.4, o));
  assert.ok(Math.abs(o.d - 0.1) < 1e-9 && Math.abs(o.ny - 1) < 1e-9);
  assert.ok(!g.kreis(5, 0.5, 0.4, o));
});

test('Gelaende: Rad am Schanzenrand wird nicht nach vorn geschleudert', () => {
  // Kante bei x=5 mit senkrechter Wand nach unten; Radmitte knapp ueber der Kante und links davon
  const g = new L.Gelaende(); g.add(0, 0, 5, 0); g.add(5, 0, 5, -30);
  const o = {}; assert.ok(g.kreis(4.9, 0.3, 0.4, o));
  assert.ok(o.ny > 0.5, 'Normale zeigt nach oben, nicht nach rechts: ' + o.ny);
});

test('Level: alle Strecken sind aufgebaut, haben Ziel und Muenzen', () => {
  for (const d of L.LEVELS) {
    const l = new L.Lauf(d, L.MOTOS[0]);
    assert.ok(l.zielX > 100, d.id + ' Ziel');
    assert.ok(l.muenzen.length >= 20, d.id + ' Muenzen');
    assert.ok(Number.isFinite(l.ter.hoehe(l.zielX)), d.id + ' Boden am Ziel');
    assert.ok(Number.isFinite(l.ter.hoehe(3)), d.id + ' Boden am Start');
  }
});

test('Physik: Motorrad steht im Leerlauf ruhig auf dem Boden', () => {
  const l = new L.Lauf(L.LEVELS[0], L.MOTOS[0]);
  for (let i = 0; i < 120; i++) l.schritt({ gas: 0, bremse: 0, rot: 0 });
  assert.ok(Math.abs(l.b.vx) < 0.2 && Math.abs(l.b.vy) < 0.2, 'ruhig');
  assert.strictEqual(l.status, 'bereit');
});

test('Physik: Gas beschleunigt, Tempo bleibt unter dem Hoechstwert', () => {
  const l = new L.Lauf(L.ENDLOS, L.MOTOS[0]);
  let vmax = 0;
  for (let i = 0; i < 300; i++) { l.schritt({ gas: 1, bremse: 0, rot: 0 }); vmax = Math.max(vmax, l.b.vx); }
  assert.ok(vmax > 8, 'beschleunigt: ' + vmax);
});

test('Physik: deterministisch (gleiche Eingaben, gleiches Ergebnis)', () => {
  const a = L.simuliere(L.LEVELS[1], L.MOTOS[0], { kp: 2.6, kd: 1 }), b = L.simuliere(L.LEVELS[1], L.MOTOS[0], { kp: 2.6, kd: 1 });
  assert.strictEqual(a.bild, b.bild); assert.strictEqual(a.x, b.x); assert.strictEqual(a.muenzen, b.muenzen);
});

test('Absturz: Ueberschlag nach hinten beendet die Fahrt', () => {
  const l = new L.Lauf(L.LEVELS[0], L.MOTOS[0]);
  for (let i = 0; i < 60 * 30 && l.status !== 'abgestuerzt'; i++) l.schritt({ gas: 1, bremse: 0, rot: 1 });
  assert.strictEqual(l.status, 'abgestuerzt'); assert.ok(l.ragdoll);
});

test('Checkpoint: nach Absturz geht es vom gespeicherten Punkt weiter', () => {
  let ok = false;
  for (const v of VARIANTEN) {
    const l = new L.Lauf(L.LEVELS[1], L.MOTOS[0]);
    for (let i = 0; i < 60 * 40 && !ok; i++) {
      l.schritt(L.autopilot(l, v));
      if (l.snapshot) {
        const x = l.snapshot.x; l.b.th = 3; l.b.vx = 8; // erzwungener Ueberschlag
        for (let k = 0; k < 400 && l.status !== 'abgestuerzt'; k++) l.schritt({ gas: 0, bremse: 0, rot: 0 });
        if (l.status === 'abgestuerzt') { l.vomCheckpoint(); assert.ok(Math.abs(l.b.x - x) < 1e-6); assert.strictEqual(l.status, 'bereit'); ok = true; }
      }
    }
    if (ok) break;
  }
  assert.ok(ok, 'Checkpoint getestet');
});

test('Endlos: Strecke waechst mit und bleibt fahrbar', () => {
  const r = L.simuliere(L.ENDLOS, L.MOTOS[0], { kp: 2.6, kd: 1, seed: 11, endlosZiel: 700, maxSek: 120 });
  assert.ok(r.lauf.maxX > 150, 'kommt voran: ' + r.lauf.maxX);
  assert.ok(r.lauf.bauer.x > r.lauf.maxX + 100, 'Strecke liegt vor dem Fahrer');
});

test('Fahrbarkeit: jedes Level ist mit jedem Motorrad von mindestens einer Autopilot-Variante zu schaffen', () => {
  for (const d of L.LEVELS) for (const m of L.MOTOS) {
    const geschafft = VARIANTEN.some(v => L.simuliere(d, m, Object.assign({ mitCheckpoint: true }, v)).status === 'ziel');
    assert.ok(geschafft, 'Level ' + d.id + ' mit ' + m.id);
  }
});

const strecke = bau => ({ id: 't', welt: 0, name: 'T', flips: 0, bau(b) { b.flach(20); bau(b); b.flach(10); b.zielHier(); b.flach(26); b.schluss(); } });

test('Looping: alle Motorraeder fahren durch, es gibt den Looping-Trick', () => {
  for (const m of L.MOTOS) {
    const r = L.simuliere(strecke(b => b.looping(4.4)), m, { maxSek: 30 });
    assert.strictEqual(r.status, 'ziel', m.id); assert.strictEqual(r.lauf.loopings, 1, m.id + ' Loopings');
    assert.ok(Math.abs(r.lauf.b.th) < Math.PI, 'Winkel nach dem Looping wieder normal');
  }
});

test('Schwebeplattform: bewegt sich und traegt das Motorrad', () => {
  const l = new L.Lauf(strecke(b => { b.schwebe(10, 5, 2, 0, 4); b.landung(16, 2.2); }), L.MOTOS[0]);
  const p = l.ter.extras[0], o = {};
  l.ter.zeit(1); const x1 = p.ox; l.ter.zeit(2); assert.notStrictEqual(p.ox, x1, 'bewegt sich');
  assert.ok(p.kreis(p.x0 + p.ox + 3, p.y + p.oy + 0.3, 0.4, o) && o.ny > 0.9 && Math.abs(o.vx - p.vx) < 1e-9, 'Kontakt von oben mit Plattform-Tempo');
  let drauf = 0;
  for (let i = 0; i < 60 * 20 && (l.status === 'bereit' || l.status === 'fahrt'); i++) { l.schritt(L.autopilot(l, {})); if (l.kontakt[0] && l.b.x > p.x0 + p.ox && l.b.x < p.x1 + p.ox) drauf++; }
  assert.strictEqual(l.status, 'ziel'); assert.ok(drauf > 5, 'faehrt ueber die Plattform: ' + drauf);
});

test('Seilbruecke: haengt durch und gibt unter Last nach', () => {
  const l = new L.Lauf(strecke(b => b.bruecke(20, 0.8)), L.MOTOS[0]), e = l.ter.extras[0];
  const leer = e.hoeheBei(e.x0 + 10); e.last = 1; e.lx = e.x0 + 10;
  assert.ok(leer < e.y - 0.7 && e.hoeheBei(e.x0 + 10) < leer - 0.3);
  assert.strictEqual(L.simuliere(strecke(b => b.bruecke(20, 0.8)), L.MOTOS[0], {}).status, 'ziel');
});

test('Kombo: Tricks erhoehen den Multiplikator, Buchen am Boden, Sturz verliert sie', () => {
  const l = new L.Lauf(L.LEVELS[0], L.MOTOS[0]);
  l.trick('Backflip', 100); l.trick('Luftzeit', 50); assert.strictEqual(l.kombo.mult, 2);
  l.komboBuchen(); assert.strictEqual(l.punkte, 300); assert.strictEqual(l.kombo, null);
  l.trick('Wheelie', 80); l.status = 'fahrt'; l._crash('Kopf');
  assert.strictEqual(l.kombo, null); assert.strictEqual(l.punkte, 300);
  assert.ok(l.ereignisse.some(e => e.t === 'komboWeg'));
});

test('Level-Code: hin und zurueck, kaputte Codes werden abgelehnt', () => {
  const st = { welt: 3, name: 'Löwen-Bahn 1', teile: [{ k: 'H', s: [2, 3] }, { k: 'S', s: [8, 7] }, { k: 'C', s: [] }, { k: 'O', s: [4] }, { k: 'P', s: [2, 1] }, { k: 'B', s: [0, 4] }] };
  const code = L.streckeZuCode(st), zurueck = L.codeZuStrecke(code);
  assert.deepStrictEqual(zurueck, st);
  assert.ok(/^SL13/.test(code) && code.length < 60, code);
  for (const kaputt of ['', 'SL1', 'SL19H22', 'SL10H2', 'SL10X11', 'SL10Hz2', 'SL10O9', 'hallo']) assert.strictEqual(L.codeZuStrecke(kaputt), null, kaputt);
  const d = L.eigenesLevel(st), lauf = new L.Lauf(d, L.MOTOS[0]);
  assert.ok(lauf.zielX > 100 && lauf.checkpoints.length === 1 && lauf.ter.extras.length === 5, 'Looping, 3 Plattformen, Bruecke');
});

test('Level-Editor: jeder Baustein mit mittleren Werten ist fahrbar', () => {
  for (const t of L.TEILE) {
    const st = { welt: 0, teile: [{ k: t.k, s: t.werte.map(w => Math.floor((w[3] - 1) / 2)) }, { k: 'F', s: [2] }] };
    assert.ok(L.fahrbar(L.eigenesLevel(st)).ok, 'Baustein ' + t.name);
  }
});

test('Ghost-Code: hin und zurueck (auf 5 cm genau)', () => {
  const l = new L.Lauf(L.LEVELS[0], L.MOTOS[1]), proben = [];
  let naechste = 0;
  while (l.status !== 'ziel' && l.status !== 'abgestuerzt') { l.schritt(L.autopilot(l, {})); if (l.zeit >= naechste) { proben.push([l.b.x, l.b.y, l.b.th]); naechste += 1 / L.GHOST_HZ; } }
  const g = { key: 'l:1-1', moto: 1, zeit: l.zeit, name: 'Mätti', proben };
  const z = L.ghostAusBytes(L.ausB64(L.zuB64(L.ghostBytes(g))));
  assert.strictEqual(z.key, 'l:1-1'); assert.strictEqual(z.name, 'Mätti'); assert.strictEqual(z.moto, 1);
  assert.ok(Math.abs(z.zeit - g.zeit) < 0.01 && z.proben.length === proben.length);
  z.proben.forEach((p, i) => { assert.ok(Math.abs(p[0] - proben[i][0]) <= 0.026 && Math.abs(p[1] - proben[i][1]) <= 0.026 && Math.abs(p[2] - proben[i][2]) <= 0.013, 'Probe ' + i); });
  const mitte = L.ghostLage(z, 3.1); assert.ok(mitte.x > z.proben[15][0] && mitte.x < z.proben[16][0]);
  assert.throws(() => L.ghostAusBytes(L.ausB64('AQ')));
  assert.strictEqual(L.levelZuKey('l:4-2').name, 'Hochbahn');
});

test('Tagesstrecke: fuer ein Datum immer gleich und fahrbar', () => {
  for (const d of [20261008, 20261031, 20270214]) {
    const a = L.tagesStrecke(d), b = L.tagesStrecke(d);
    assert.strictEqual(a.code, b.code); assert.strictEqual(a.key, 't:' + d);
    assert.ok(L.fahrbar(a, L.MOTOS[0], 1).ok, 'fahrbar am ' + d);
  }
  assert.notStrictEqual(L.tagesStrecke(20261008).code, L.tagesStrecke(20261009).code);
});

console.log('\n' + anzahl + ' Tests bestanden');
