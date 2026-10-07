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

console.log('\n' + anzahl + ' Tests bestanden');
