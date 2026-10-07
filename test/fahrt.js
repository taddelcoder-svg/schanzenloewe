// Entwicklungswerkzeug: faehrt alle Level mit dem Autopilot und zeigt das Ergebnis.
// node test/fahrt.js [levelId] [motoId] [--flip] [--cp]
const L = require('../js/logik.js');
const args = process.argv.slice(2);
const flag = n => args.includes(n);
const pos = args.filter(a => !a.startsWith('--'));
const ids = pos[0] && pos[0] !== 'alle' ? [pos[0]] : L.LEVELS.map(l => l.id);
const moto = L.MOTOS.find(m => m.id === pos[1]) || L.MOTOS[0];
for (const id of ids) {
  const def = L.LEVELS.find(l => l.id === id);
  const t0 = Date.now();
  const r = L.simuliere(def, moto, { flipper: flag('--flip'), mitCheckpoint: flag('--cp') });
  console.log(id.padEnd(4), def.name.padEnd(16), r.status.padEnd(12), 'zeit', r.zeit.toFixed(1).padStart(5), 's  x', r.x.toFixed(0).padStart(4), '/', r.lauf.zielX.toFixed(0), ' muenzen', r.muenzen + '/' + r.muenzenGesamt, ' flips', r.flips, '/', def.flips, r.grund ? ' (' + r.grund + ')' : '', '[' + (Date.now() - t0) + ' ms]');
}
// Steilheits-Bericht: steilster Huegel/Hang pro Level (ohne Schanzen und Landehaenge)
if (flag('--steil')) {
  for (const def of L.LEVELS) {
    const lauf = new L.Lauf(def, moto);
    console.log(def.id, 'steilster Hang', (lauf.bauer.steilWert || 0).toFixed(2), '@ x', (lauf.bauer.steilX || 0).toFixed(0));
  }
}
