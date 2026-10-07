// Entwicklungswerkzeug: probiert mehrere Autopilot-Varianten pro Level und Motorrad.
// Ein Level gilt als fahrbar, wenn mindestens eine Variante ins Ziel kommt; die Zahl zeigt, wie viele von N es schaffen.
const L = require('../js/logik.js');
const V = [
  { kp: 2.6, kd: 1.0 }, { kp: 2.0, kd: 1.2 }, { kp: 3.5, kd: 1.0 }, { kp: 2.6, kd: 1.0, versatz: 0.12 },
  { kp: 2.6, kd: 1.0, versatz: -0.12 }, { kp: 2.6, kd: 1.0, luftBremse: true }, { kp: 3.0, kd: 1.5 }, { kp: 2.2, kd: 0.8, versatz: 0.2 }
];
const cp = process.argv.includes('--cp');
const schwer = +(process.argv.find(a => a.startsWith('--schwer=')) || '--schwer=0').split('=')[1];
for (const def of L.LEVELS) {
  const zeile = [];
  for (const moto of L.MOTOS) {
    let ok = 0;
    for (const v of V) { const r = L.simuliere(def, moto, Object.assign({ mitCheckpoint: cp, schwer }, v)); if (r.status === 'ziel') ok++; }
    zeile.push(moto.id.padEnd(8) + ok + '/' + V.length);
  }
  console.log(def.id, def.name.padEnd(16), zeile.join('   '));
}
