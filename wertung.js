'use strict';
// Olympiade: Punkte für den Einzelversuch auf der Olympia-Strecke. Der Browser meldet nur rohe Werte,
// die Punkte rechnet der Server aus – gestützt auf die Strecke, die er selbst aus der Lauf-Kennung baut.
const L = require('./js/logik.js');

const MAX_TEMPO = 40;      // m/s: schneller kommt auch mit Turbo und Gefälle niemand voran
const strecken = new Map();

function stufeVon(c) { const s = Number(c && c.stufe); return s === 0 || s === 2 ? s : 1; }

// Strecke zur Lauf-Kennung (Länge, Münzen) – gebaut wie im Browser, danach gemerkt
function strecke(kennung, stufe) {
  const key = kennung + '|' + stufe;
  if (!strecken.has(key)) {
    if (strecken.size > 40) strecken.delete(strecken.keys().next().value);
    const lf = new L.Lauf(L.olympLevel(kennung), L.MOTOS[0], undefined, stufe);
    strecken.set(key, { zielX: lf.zielX, muenzenX: lf.muenzen.map(m => m.x).sort((a, b) => a - b) });
  }
  return strecken.get(key);
}

const zahl = (v, max) => { v = Number(v); return Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0; };
const zeitText = s => { const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(1).padStart(4, '0'); };

// kennung = Lauf-Kennung aus dem Ticket, c = Einstellungen aus dem Ticket, w = gemeldete Werte
function punkte(kennung, c, w) {
  w = w && typeof w === 'object' ? w : {};
  const st = strecke(kennung, stufeVon(c)), laenge = st.zielX - 3;
  const ziel = w.ziel === true;
  let weg = ziel ? laenge : zahl(w.weg, laenge);
  let zeit = zahl(w.zeit, 900);
  zeit = Math.max(zeit, weg / MAX_TEMPO);                       // schneller als MAX_TEMPO geht nicht
  const muenzenFrei = st.muenzenX.filter(x => x <= 3 + weg + 1).length;
  const muenzen = Math.floor(Math.min(zahl(w.muenzen, 1000), muenzenFrei * 3));   // Kombo-Boni zählen als Münzen mit
  const tricks = Math.floor(Math.min(zahl(w.tricks, 100000), zeit * 300));        // gebuchte Trickpunkte, nach Zeit gedeckelt
  const bonus = ziel ? 2000 + Math.max(0, Math.round((st.zielX / 8 - zeit) * 40)) : 0;
  const summe = Math.round(weg * 3) + bonus + muenzen * 10 + Math.round(tricks / 5);
  const teile = [ziel ? 'Ziel in ' + zeitText(zeit) : Math.round(weg) + ' von ' + Math.round(laenge) + ' m', muenzen + ' Münzen', tricks + ' Trickpunkte'];
  return { punkte: summe, text: summe.toLocaleString('de-DE') + ' Punkte · ' + teile.join(' · ') };
}

module.exports = { punkte, strecke, stufeVon };
