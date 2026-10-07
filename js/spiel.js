'use strict';
// Schanzenloewe - Darstellung, Eingabe, Menues und Speicherstand. Die Regeln stehen in logik.js.
(function () {
const L = window.Logik;
const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');

// ---------------------------------------------------------------- Speicherstand
const SCHLUESSEL = 'schanzenloewe.v1';
function standardSave() { return { muenzen: 0, sterne: {}, zeiten: {}, besitz: ['flitzer'], moto: 'flitzer', endlos: 0, schwer: 1, version: 2 }; }
function ladeSave() {
  try { const s = JSON.parse(localStorage.getItem(SCHLUESSEL)); if (s && typeof s === 'object') { const n = Object.assign(standardSave(), s); if (!s.version || s.version < 2) { n.schwer = 1; n.version = 2; } return n; } } catch (e) { /* kein Speicher */ }
  return standardSave();
}
let save = ladeSave();
function speichern() { try { localStorage.setItem(SCHLUESSEL, JSON.stringify(save)); } catch (e) { /* ignorieren */ } }
const aktMoto = () => L.MOTOS.find(m => m.id === save.moto) || L.MOTOS[0];

// ---------------------------------------------------------------- Welten (Farben)
const THEMEN = [
  { himmel: ['#5ab8ff', '#cdeeff'], sonne: '#fff6c2', berge: ['#a9dcc0', '#86c79d', '#62ad7e'], boden: ['#7bd34f', '#9a6a36', '#5b3a1b'], rand: '#52b83a', deko: 'baum', wolke: '#ffffff' },
  { himmel: ['#ff9d5c', '#ffe6b8'], sonne: '#fffbe0', berge: ['#f0bf8a', '#e0a468', '#cc8a4e'], boden: ['#f0c870', '#cf9444', '#8f5e24'], rand: '#f7d98a', deko: 'kaktus', wolke: '#fff3e0' },
  { himmel: ['#7ea6e6', '#eaf3ff'], sonne: '#ffffff', berge: ['#d3e0f4', '#b4c8e6', '#95afd6'], boden: ['#eef4ff', '#aebfdc', '#6f84a8'], rand: '#ffffff', deko: 'tanne', wolke: '#f3f8ff' }
];

// ---------------------------------------------------------------- Zustand
let lauf = null, def = null, modus = 'menue';     // menue | spiel | pause
let demo = null;                                   // Hintergrund-Fahrt im Menue
let theme = THEMEN[0];
let pausiert = false;
let vorher = { x: 0, y: 0, th: 0 };
let cam = { x: 0, y: 0, s: 40 };
let zittern = 0;
let endeTimer = 0, abgerechnet = false;
let aktWelt = 0;
const partikel = [];
let W = 800, H = 600, dpr = 1;

function groesse() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
}
window.addEventListener('resize', groesse); groesse();

// ---------------------------------------------------------------- Eingabe
const tasten = {};
const tippen = { gas: false, bremse: false, hoch: false, runter: false };
const istTouch = matchMedia('(pointer: coarse)').matches;
let touchGenutzt = istTouch;
window.addEventListener('keydown', e => {
  if (e.repeat) { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); return; }
  tasten[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (modus === 'spiel' || modus === 'pause') {
    if (e.code === 'Escape' || e.code === 'KeyP') pausiere(modus === 'spiel');
    else if (e.code === 'KeyR') neustart();
    else if (e.code === 'KeyC') vomCheckpoint();
  }
});
window.addEventListener('keyup', e => { tasten[e.code] = false; });
window.addEventListener('blur', () => { for (const k in tasten) tasten[k] = false; if (modus === 'spiel') pausiere(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden && modus === 'spiel') pausiere(true); });

document.querySelectorAll('.tt').forEach(el => {
  const t = el.dataset.t;
  const an = e => { e.preventDefault(); touchGenutzt = true; tippen[t] = true; el.classList.add('druck'); try { el.setPointerCapture(e.pointerId); } catch (_) { /* ok */ } };
  const aus = e => { e.preventDefault(); tippen[t] = false; el.classList.remove('druck'); };
  el.addEventListener('pointerdown', an);
  el.addEventListener('pointerup', aus); el.addEventListener('pointercancel', aus); el.addEventListener('lostpointercapture', aus);
  el.addEventListener('contextmenu', e => e.preventDefault());
});

function eingabe() {
  const gas = tasten.ArrowUp || tasten.KeyW || tasten.Space || tippen.gas;
  const bremse = tasten.ArrowDown || tasten.KeyS || tippen.bremse;
  const hoch = tasten.ArrowLeft || tasten.KeyA || tippen.hoch;
  const runter = tasten.ArrowRight || tasten.KeyD || tippen.runter;
  return { gas: gas ? 1 : 0, bremse: bremse ? 1 : 0, rot: (hoch ? 1 : 0) - (runter ? 1 : 0) };
}

// ---------------------------------------------------------------- Menues
const SCHIRME = ['sStart', 'sLevels', 'sGarage', 'sPause', 'sCrash', 'sZiel'];
function zeige(id) { for (const s of SCHIRME) $(s).classList.toggle('an', s === id); }
function hud(an) { $('hud').classList.toggle('an', an); $('touch').classList.toggle('an', an && touchGenutzt); }
function aktualisiereMuenzen() { $('sMuenzen').textContent = save.muenzen; document.querySelectorAll('.mz').forEach(e => { e.textContent = save.muenzen; }); }

function levelOffen(i) { return i === 0 || (save.sterne[L.LEVELS[i - 1].id] || [])[0]; }
function sterneZahl(id) { return (save.sterne[id] || []).filter(Boolean).length; }
function zeitText(s) { const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(1).padStart(4, '0'); }

function baueLevelAuswahl() {
  const w = $('welten'); w.innerHTML = '';
  L.WELTEN.forEach((we, i) => {
    const b = document.createElement('button'); b.className = 'welt' + (i === aktWelt ? ' aktiv' : ''); b.textContent = we.name;
    b.onclick = () => { aktWelt = i; baueLevelAuswahl(); };
    w.appendChild(b);
  });
  const r = $('raster'); r.innerHTML = '';
  L.LEVELS.forEach((lv, i) => {
    if (lv.welt !== aktWelt) return;
    const offen = levelOffen(i), st = save.sterne[lv.id] || [];
    const k = document.createElement('button'); k.className = 'lvl' + (offen ? '' : ' zu');
    const zeit = save.zeiten[lv.id];
    k.innerHTML = '<div><div class="nr">Level ' + lv.id + '</div><div class="name">' + lv.name + '</div></div>' +
      '<div><div class="sterne">' + [0, 1, 2].map(j => st[j] ? '<b>★</b>' : '★').join('') + '</div><div class="zeit">' + (zeit ? 'Bestzeit ' + zeitText(zeit) : (offen ? 'Noch nicht geschafft' : 'Gesperrt')) + '</div></div>';
    if (offen) k.onclick = () => starteLevel(lv.id);
    r.appendChild(k);
  });
}

function baueGarage() {
  const g = $('garage'); g.innerHTML = '';
  const maxL = Math.max(...L.MOTOS.map(m => m.leistung)), maxV = Math.max(...L.MOTOS.map(m => m.vmax)), maxD = Math.max(...L.MOTOS.map(m => m.luft)), maxG = Math.max(...L.MOTOS.map(m => m.grip));
  for (const m of L.MOTOS) {
    const hat = save.besitz.includes(m.id), gew = save.moto === m.id;
    const k = document.createElement('div'); k.className = 'moto' + (gew ? ' gewaehlt' : '');
    const bal = (n, v, mx) => '<span>' + n + '</span><i><span style="width:' + Math.round(100 * v / mx) + '%"></span></i>';
    k.innerHTML = '<canvas width="560" height="220" data-moto="' + m.id + '"></canvas><h3>' + m.name + '</h3><p>' + m.info + '</p><div class="balken">' +
      bal('Tempo', m.vmax, maxV) + bal('Kraft', m.leistung, maxL) + bal('Drehung', m.luft, maxD) + bal('Grip', m.grip, maxG) + '</div>';
    const b = document.createElement('button');
    if (gew) { b.className = 'knopf klein zweit'; b.textContent = '✔ Ausgewählt'; b.disabled = true; }
    else if (hat) { b.className = 'knopf klein'; b.textContent = 'Auswählen'; b.onclick = () => { save.moto = m.id; speichern(); baueGarage(); }; }
    else { b.className = 'knopf klein gruen'; b.innerHTML = 'Kaufen · ' + m.preis + ' <span class="muenze"></span>'; b.disabled = save.muenzen < m.preis; b.onclick = () => { if (save.muenzen < m.preis) return; save.muenzen -= m.preis; save.besitz.push(m.id); save.moto = m.id; speichern(); aktualisiereMuenzen(); baueGarage(); }; }
    k.appendChild(b); g.appendChild(k);
  }
}
// kleine Vorschau-Animation in der Garage
function garageZeichnen(t) {
  if (!$('sGarage').classList.contains('an')) return;
  document.querySelectorAll('#garage canvas').forEach(c => {
    const m = L.MOTOS.find(x => x.id === c.dataset.moto), g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    const s = 105;
    g.setTransform(s, 0, 0, -s, c.width / 2, c.height * 0.72);
    const bo = -0.3 - m.radius; g.fillStyle = '#7bd34f'; g.fillRect(-4, bo - 2, 8, 2); g.fillStyle = '#52b83a'; g.fillRect(-4, bo - 0.12, 8, 0.12);
    const a = -t * 0.006;
    zeichneMoto(g, { x: 0, y: 0, th: 0.04 + Math.sin(t * 0.002) * 0.02, rad: [a, a] }, m, true, 0.1 + Math.sin(t * 0.002) * 0.3, performance.now());
  });
}

const STUFEN = ['Leicht', 'Normal', 'Schwer'];
function baueStufen() {
  const e = $('stufen'); e.innerHTML = '';
  STUFEN.forEach((n, i) => { const b = document.createElement('button'); b.className = 'welt' + (i === save.schwer ? ' aktiv' : ''); b.textContent = n; b.onclick = () => { save.schwer = i; speichern(); baueStufen(); }; e.appendChild(b); });
}
baueStufen();
$('bSpielen').onclick = () => { baueLevelAuswahl(); zeige('sLevels'); };
$('bEndlos').onclick = () => starteLevel('endlos');
$('bGarage').onclick = () => { aktualisiereMuenzen(); baueGarage(); zeige('sGarage'); };
document.querySelectorAll('[data-zurueck]').forEach(b => { b.onclick = () => { aktualisiereMuenzen(); zeige('sStart'); }; });
$('pauseKnopf').onclick = () => pausiere(true);
$('pWeiter').onclick = () => pausiere(false);
$('pNeu').onclick = () => neustart();
$('pMenue').onclick = () => zumMenue();
$('cNeu').onclick = () => neustart();
$('cCheck').onclick = () => vomCheckpoint();
$('cMenue').onclick = () => zumMenue();
$('zNeu').onclick = () => neustart();
$('zMenue').onclick = () => { zumMenue(); baueLevelAuswahl(); zeige('sLevels'); };
$('zWeiter').onclick = () => {
  const i = L.LEVELS.findIndex(l => l.id === def.id);
  if (i >= 0 && i + 1 < L.LEVELS.length && levelOffen(i + 1)) { aktWelt = L.LEVELS[i + 1].welt; starteLevel(L.LEVELS[i + 1].id); } else { zumMenue(); baueLevelAuswahl(); zeige('sLevels'); }
};

// ---------------------------------------------------------------- Ablauf
function starteLevel(id) {
  def = id === 'endlos' ? L.ENDLOS : L.LEVELS.find(l => l.id === id);
  lauf = new L.Lauf(def, aktMoto(), id === 'endlos' ? (Date.now() & 0xffffff) : undefined, save.schwer);
  theme = THEMEN[def.welt];
  aktWelt = def.welt;
  modus = 'spiel'; pausiert = false; abgerechnet = false; endeTimer = 0;
  vorher = { x: lauf.b.x, y: lauf.b.y, th: lauf.b.th };
  cam.x = lauf.b.x + 3; cam.y = lauf.b.y + 1.5;
  partikel.length = 0; $('meldungen').innerHTML = '';
  zeige(null); hud(true); aktualisiereHud(true);
}
function neustart() {
  if (!def) return;
  lauf.neustart(); modus = 'spiel'; pausiert = false; abgerechnet = false; endeTimer = 0; zittern = 0;
  vorher = { x: lauf.b.x, y: lauf.b.y, th: lauf.b.th };
  partikel.length = 0; zeige(null); hud(true);
}
function vomCheckpoint() {
  if (!lauf || lauf.status !== 'abgestuerzt' || !lauf.snapshot) return;
  lauf.vomCheckpoint(); modus = 'spiel'; pausiert = false; endeTimer = 0;
  vorher = { x: lauf.b.x, y: lauf.b.y, th: lauf.b.th };
  zeige(null);
}
function pausiere(an) {
  if (!lauf || lauf.status === 'ziel' || lauf.status === 'abgestuerzt') return;
  pausiert = an; modus = an ? 'pause' : 'spiel'; zeige(an ? 'sPause' : null);
}
function zumMenue() {
  modus = 'menue'; pausiert = false; lauf = null; def = null; zeige('sStart'); hud(false); aktualisiereMuenzen();
  neueDemo();
}
function neueDemo() {
  demo = new L.Lauf(L.ENDLOS, L.MOTOS[Math.floor(Math.random() * 3)], (Math.random() * 1e6) | 0);
  theme = THEMEN[Math.floor(Math.random() * 3)];
  cam.x = demo.b.x + 3; cam.y = demo.b.y + 1.5;
}

function meldung(text, klein) {
  const d = document.createElement('div'); d.className = 'meldung' + (klein ? ' klein' : ''); d.textContent = text;
  $('meldungen').appendChild(d); setTimeout(() => d.remove(), 1400);
  while ($('meldungen').children.length > 4) $('meldungen').firstChild.remove();
}

function ereignisse() {
  for (const e of lauf.ereignisse) {
    if (e.t === 'muenze') funken(e.x, e.y, '#ffd84a', 8, 3.5);
    else if (e.t === 'flip') {
      const n = e.n, art = e.art > 0 ? 'BACKFLIP' : 'FRONTFLIP';
      meldung((n === 2 ? 'DOPPEL-' : n === 3 ? 'DREIFACH-' : n > 3 ? n + 'x ' : '') + art + '  +' + 5 * n);
      funken(lauf.b.x, lauf.b.y + 1, '#ff9a1f', 18, 6);
    } else if (e.t === 'turbo') { meldung('TURBO!', true); funken(e.x, lauf.b.y, '#ffd84a', 20, 9); zittern = Math.max(zittern, 0.12); }
    else if (e.t === 'luft') { if (e.n > 0) meldung('Luftzeit ' + e.s.toFixed(1) + ' s  +' + e.n, true); }
    else if (e.t === 'checkpoint') meldung('⚑ Checkpoint', true);
    else if (e.t === 'crash') { zittern = 0.5; funken(lauf.b.x, lauf.b.y, '#ff5a4d', 24, 8); endeTimer = 0; }
    else if (e.t === 'ziel') { meldung('ZIEL!'); for (let i = 0; i < 4; i++) funken(lauf.b.x + i * 2, lauf.b.y + 2, ['#ff4d4d', '#ffd84a', '#4fe085', '#4ab3ff'][i], 14, 7); endeTimer = 0; }
  }
  lauf.ereignisse.length = 0;
}

function abrechnen() {
  if (abgerechnet) return; abgerechnet = true;
  if (lauf.endlos) {
    const dist = Math.round(lauf.distanz), neu = dist > save.endlos;
    if (neu) save.endlos = dist;
    save.muenzen += lauf.muenzenZahl; speichern();
    $('cTitel').textContent = 'Abgestürzt!';
    $('cText').innerHTML = '<div class="grosswert">' + dist + ' m</div>' + (neu ? 'Neuer Rekord!' : 'Rekord: ' + save.endlos + ' m') + '<br>+' + lauf.muenzenZahl + ' Münzen';
    return;
  }
  if (lauf.status === 'ziel') {
    const st = lauf.sterne(), alt = save.sterne[def.id] || [false, false, false];
    let bonus = 0; const neu = [];
    for (let i = 0; i < 3; i++) if (st[i] && !alt[i]) { bonus += 10; neu.push(i); }
    save.sterne[def.id] = [0, 1, 2].map(i => !!(st[i] || alt[i]));
    const gewinn = lauf.muenzenZahl + bonus; save.muenzen += gewinn;
    const beste = save.zeiten[def.id], rekord = !beste || lauf.zeit < beste;
    if (rekord) save.zeiten[def.id] = lauf.zeit;
    speichern();
    const mu = lauf.muenzen.filter(m => m.got).length;
    const zeilen = [
      ['Ziel erreicht', '', st[0], neu.includes(0)],
      ['Alle Münzen', mu + ' / ' + lauf.muenzen.length, st[1], neu.includes(1)],
      ['Flips', lauf.flips + ' / ' + lauf.flipZiel, st[2], neu.includes(2)]
    ];
    $('zZiele').innerHTML = zeilen.map(z => '<div class="ziel' + (z[2] ? ' ok' : '') + '"><span class="st">' + (z[2] ? '★' : '☆') + '</span>' + z[0] + '<span class="r">' + z[1] + (z[3] ? ' · +10' : '') + '</span></div>').join('');
    $('zBonus').innerHTML = '<span class="muenze"></span> +' + gewinn;
    $('zZeit').textContent = 'Zeit ' + zeitText(lauf.zeit) + (rekord ? ' · neue Bestzeit!' : ' · Bestzeit ' + zeitText(beste)) + (lauf.versuche > 1 ? ' · ' + lauf.versuche + ' Versuche' : '');
    const i = L.LEVELS.findIndex(l => l.id === def.id);
    $('zWeiter').style.display = i + 1 < L.LEVELS.length ? '' : 'none';
  }
}

// ---------------------------------------------------------------- Partikel
function funken(x, y, farbe, n, v) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = (0.4 + Math.random()) * v;
    partikel.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 1, t: 0, max: 0.5 + Math.random() * 0.5, f: farbe, g: 1, r: 0.07 + Math.random() * 0.08 });
  }
}
function staub(x, y, vx) {
  partikel.push({ x, y, vx: -vx * 0.15 + (Math.random() - 0.5), vy: 0.6 + Math.random() * 0.8, t: 0, max: 0.35 + Math.random() * 0.3, f: theme.boden[0], g: -0.5, r: 0.1 + Math.random() * 0.12 });
}
function partikelSchritt(dt) {
  for (let i = partikel.length - 1; i >= 0; i--) {
    const p = partikel[i]; p.t += dt;
    if (p.t > p.max) { partikel.splice(i, 1); continue; }
    p.vy -= 9 * p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
  }
}

// ---------------------------------------------------------------- Zeichnen: Hilfen
function linie(c, x0, y0, x1, y1, w, f) { c.strokeStyle = f; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
function kreis(c, x, y, r, f) { c.fillStyle = f; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
// Zweigelenk-Berechnung fuer Arme und Beine
function gelenk(ax, ay, bx, by, l1, l2, seite) {
  let dx = bx - ax, dy = by - ay, d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
  d = Math.min(d, l1 + l2 - 0.001);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / Math.sqrt(dx * dx + dy * dy || 1), uy = dy / Math.sqrt(dx * dx + dy * dy || 1);
  return [ax + ux * a - uy * h * seite, ay + uy * a + ux * h * seite];
}
function rad(c, x, y, r, w) {
  kreis(c, x, y, r, '#17171c');
  kreis(c, x, y, r * 0.66, '#d4d8e6');
  kreis(c, x, y, r * 0.58, '#2a2d3a');
  c.strokeStyle = '#d4d8e6'; c.lineWidth = r * 0.07; c.lineCap = 'round';
  for (let i = 0; i < 6; i++) { const a = w + i * Math.PI / 3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6); c.stroke(); }
  kreis(c, x, y, r * 0.16, '#d4d8e6');
}
function helm(c, x, y, farbe, winkel) {
  kreis(c, x, y, 0.31, '#d9731a');                  // Maehne
  kreis(c, x - 0.19, y + 0.2, 0.1, '#d9731a'); kreis(c, x + 0.06, y + 0.27, 0.09, '#d9731a');
  c.save(); c.translate(x, y); c.rotate(winkel);
  kreis(c, 0, 0, 0.23, farbe);
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-0.04, 0.22); c.lineTo(0.05, 0.22); c.lineTo(0.03, -0.1); c.lineTo(-0.06, -0.08); c.fill();
  c.fillStyle = '#20243a'; c.beginPath(); c.moveTo(0.06, 0.1); c.lineTo(0.24, 0.07); c.lineTo(0.22, -0.1); c.lineTo(0.08, -0.08); c.closePath(); c.fill();
  c.restore();
}

// ---------------------------------------------------------------- Zeichnen: Motorrad und Fahrer
// st = { x, y, th, rad:[a,b] }; lean: -1 (Rueckwaerts) .. 1 (Vorwaerts)
function zeichneMoto(c, st, m, mitFahrer, lean) {
  c.save(); c.translate(st.x, st.y); c.rotate(st.th);
  const r = m.radius, ay = -0.30, hx = -0.85, vx = 0.85;
  // Hinterrad + Schwinge + Auspuff
  rad(c, hx, ay, r, st.rad[0]);
  linie(c, hx, ay, -0.12, -0.16, 0.11, '#2b2b33');
  c.strokeStyle = '#9aa0b4'; c.lineWidth = 0.1; c.lineCap = 'round'; c.beginPath(); c.moveTo(0.18, -0.12); c.quadraticCurveTo(-0.3, -0.34, -0.92, 0.0); c.stroke();
  linie(c, -0.92, 0.0, -1.02, 0.03, 0.14, '#5a5f70');
  // Motorblock
  c.fillStyle = '#3a3a46'; c.fillRect(-0.02, -0.28, 0.5, 0.34);
  c.fillStyle = '#4c4c5c'; for (let i = 0; i < 3; i++) c.fillRect(0.04 + i * 0.14, -0.26, 0.07, 0.3);
  // Fahrer: hinteres Bein
  let hip = [-0.30, 0.36], a = 0.30 + lean * 0.45, dir = [Math.sin(a), Math.cos(a)];
  const sh = [hip[0] + dir[0] * 0.5, hip[1] + dir[1] * 0.5], kopf = [sh[0] + dir[0] * 0.26, sh[1] + dir[1] * 0.26];
  let knie;
  if (mitFahrer) { knie = gelenk(hip[0], hip[1], 0.02, -0.12, 0.42, 0.46, -1); linie(c, hip[0], hip[1], knie[0], knie[1], 0.17, '#243070'); linie(c, knie[0], knie[1], 0.02, -0.12, 0.15, '#1a2255'); linie(c, 0.02, -0.12, 0.14, -0.14, 0.14, '#222'); }
  // Karosserie
  c.fillStyle = m.farbe; c.strokeStyle = m.dunkel; c.lineWidth = 0.05; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(-0.62, 0.20); c.lineTo(-0.12, 0.26); c.quadraticCurveTo(0.12, 0.66, 0.42, 0.52); c.lineTo(0.62, 0.40); c.lineTo(0.58, 0.04); c.lineTo(-0.22, -0.06); c.lineTo(-0.64, 0.02); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#25252d'; c.beginPath(); c.moveTo(-0.76, 0.22); c.lineTo(-0.08, 0.30); c.lineTo(-0.08, 0.38); c.lineTo(-0.74, 0.31); c.closePath(); c.fill();
  // Gabel + Vorderrad
  linie(c, vx, ay, 0.62, 0.58, 0.1, '#aab0c4');
  rad(c, vx, ay, r, st.rad[1]);
  c.strokeStyle = m.farbe; c.lineWidth = 0.09; c.lineCap = 'round'; c.beginPath(); c.arc(vx, ay, r + 0.07, 0.35, 2.3); c.stroke();
  kreis(c, 0.74, 0.40, 0.09, '#ffe27a');
  if (mitFahrer) {
    // Koerper
    linie(c, hip[0], hip[1], sh[0], sh[1], 0.3, '#ffb347');
    linie(c, hip[0], hip[1] + 0.02, sh[0] - dir[0] * 0.15, sh[1] - dir[1] * 0.15, 0.14, '#e8892a');
    const hand = [0.52, 0.82], el = gelenk(sh[0], sh[1], hand[0], hand[1], 0.34, 0.34, 1);
    linie(c, sh[0], sh[1], el[0], el[1], 0.13, '#e8892a'); linie(c, el[0], el[1], hand[0], hand[1], 0.12, '#f4a640'); kreis(c, hand[0], hand[1], 0.075, '#222');
    // vorderes Bein
    const k2 = gelenk(hip[0], hip[1], 0.10, -0.10, 0.42, 0.46, -1);
    linie(c, hip[0], hip[1], k2[0], k2[1], 0.18, '#2a3a8c'); linie(c, k2[0], k2[1], 0.10, -0.10, 0.16, '#202c70'); linie(c, 0.10, -0.10, 0.24, -0.12, 0.15, '#222');
    helm(c, kopf[0], kopf[1], m.farbe, -0.2 + lean * 0.2);
  }
  // Lenker
  linie(c, 0.62, 0.58, 0.52, 0.84, 0.08, '#2b2b33'); linie(c, 0.46, 0.85, 0.58, 0.83, 0.1, '#111');
  c.restore();
}

function zeichneRagdoll(c, R, m) {
  linie(c, R.hueft.x, R.hueft.y, R.brust.x, R.brust.y, 0.3, '#ffb347');
  const k = gelenk(R.hueft.x, R.hueft.y, R.fuss.x, R.fuss.y, 0.42, 0.46, 1);
  linie(c, R.hueft.x, R.hueft.y, k[0], k[1], 0.17, '#243070'); linie(c, k[0], k[1], R.fuss.x, R.fuss.y, 0.15, '#1a2255'); kreis(c, R.fuss.x, R.fuss.y, 0.1, '#222');
  const e = gelenk(R.brust.x, R.brust.y, R.hand.x, R.hand.y, 0.34, 0.34, -1);
  linie(c, R.brust.x, R.brust.y, e[0], e[1], 0.13, '#e8892a'); linie(c, e[0], e[1], R.hand.x, R.hand.y, 0.12, '#f4a640'); kreis(c, R.hand.x, R.hand.y, 0.07, '#222');
  helm(c, R.kopf.x, R.kopf.y, m.farbe, Math.atan2(R.kopf.y - R.brust.y, R.kopf.x - R.brust.x) - Math.PI / 2);
}

// ---------------------------------------------------------------- Zeichnen: Szene
function rauschen(u) { return Math.sin(u) * 0.5 + Math.sin(u * 2.3 + 1.7) * 0.3 + Math.sin(u * 5.1 + 4.2) * 0.2; }
function hash(n) { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }

function zeichneHimmel(camX, t) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, theme.himmel[0]); g.addColorStop(1, theme.himmel[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // Sonne mit Schein
  const sx = W * 0.78, sy = H * 0.2, sr = Math.min(W, H) * 0.07;
  const gl = ctx.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 4); gl.addColorStop(0, 'rgba(255,255,230,.55)'); gl.addColorStop(1, 'rgba(255,255,230,0)');
  ctx.fillStyle = gl; ctx.fillRect(sx - sr * 4, sy - sr * 4, sr * 8, sr * 8);
  kreis(ctx, sx, sy, sr, theme.sonne);
  // Wolken
  ctx.fillStyle = theme.wolke; ctx.globalAlpha = 0.85;
  for (let i = 0; i < 7; i++) {
    const par = 0.04 + (i % 3) * 0.015, wx = ((hash(i * 7.3) * 1400 - camX * cam.s * par + t * (4 + i)) % 1500 + 1500) % 1500 - 200;
    const wy = H * (0.1 + hash(i * 3.1) * 0.25), br = 30 + hash(i * 1.7) * 40;
    ctx.beginPath(); ctx.ellipse(wx, wy, br, br * 0.38, 0, 0, 7); ctx.ellipse(wx - br * 0.6, wy + br * 0.08, br * 0.6, br * 0.28, 0, 0, 7); ctx.ellipse(wx + br * 0.6, wy + br * 0.1, br * 0.7, br * 0.3, 0, 0, 7); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // Bergketten (Parallaxe)
  const ebenen = [{ par: 0.06, base: 0.62, amp: 0.20, f: 0.55, c: theme.berge[0], s: 1 }, { par: 0.14, base: 0.70, amp: 0.15, f: 0.9, c: theme.berge[1], s: 7 }, { par: 0.28, base: 0.80, amp: 0.10, f: 1.5, c: theme.berge[2], s: 13 }];
  for (const e of ebenen) {
    ctx.fillStyle = e.c; ctx.beginPath(); ctx.moveTo(0, H);
    for (let x = 0; x <= W + 20; x += 20) {
      const u = (x + camX * cam.s * e.par) / 260 * e.f + e.s;
      ctx.lineTo(x, H * e.base - H * e.amp * (rauschen(u) * 0.5 + 0.5));
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();
  }
}

function zeichneDeko(ter, x0, x1) {
  const art = theme.deko;
  for (let i = Math.floor(x0 / 5); i <= Math.ceil(x1 / 5); i++) {
    if (hash(i * 3.3) > 0.55) continue;
    const x = i * 5 + hash(i) * 3.5, gy = ter.hoehe(x);
    if (gy !== gy) continue;
    const gr = 0.8 + hash(i * 5.1) * 0.8, y = gy - 0.15;
    if (art === 'baum') {
      ctx.fillStyle = '#6b4423'; ctx.fillRect(x - 0.13 * gr, y, 0.26 * gr, 1.5 * gr);
      kreis(ctx, x, y + 1.9 * gr, 0.95 * gr, '#3f9e45'); kreis(ctx, x - 0.55 * gr, y + 1.55 * gr, 0.6 * gr, '#4fb455'); kreis(ctx, x + 0.5 * gr, y + 1.6 * gr, 0.62 * gr, '#359040');
    } else if (art === 'kaktus') {
      linie(ctx, x, y, x, y + 1.9 * gr, 0.34 * gr, '#4f9a4a');
      linie(ctx, x, y + 0.8 * gr, x - 0.55 * gr, y + 0.8 * gr, 0.22 * gr, '#4f9a4a'); linie(ctx, x - 0.55 * gr, y + 0.8 * gr, x - 0.55 * gr, y + 1.4 * gr, 0.22 * gr, '#4f9a4a');
      linie(ctx, x, y + 1.2 * gr, x + 0.5 * gr, y + 1.2 * gr, 0.22 * gr, '#4f9a4a'); linie(ctx, x + 0.5 * gr, y + 1.2 * gr, x + 0.5 * gr, y + 1.75 * gr, 0.22 * gr, '#4f9a4a');
    } else {
      ctx.fillStyle = '#5a3d27'; ctx.fillRect(x - 0.1, y, 0.2, 0.6);
      for (let k = 0; k < 3; k++) { ctx.fillStyle = k % 2 ? '#2f7a56' : '#38905f'; ctx.beginPath(); ctx.moveTo(x - (1.0 - k * 0.22) * gr, y + 0.5 + k * 0.85 * gr); ctx.lineTo(x + (1.0 - k * 0.22) * gr, y + 0.5 + k * 0.85 * gr); ctx.lineTo(x, y + 1.7 * gr + k * 0.85 * gr); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x - 0.35 * gr, y + 1.35 * gr + k * 0.85 * gr); ctx.lineTo(x + 0.35 * gr, y + 1.35 * gr + k * 0.85 * gr); ctx.lineTo(x, y + 1.7 * gr + k * 0.85 * gr); ctx.closePath(); ctx.fill(); }
    }
  }
}

function zeichneGelaende(ter, x0, x1, yUnten, yOben) {
  const th = theme;
  const fuell = ctx.createLinearGradient(0, yOben, 0, yUnten); fuell.addColorStop(0, th.boden[1]); fuell.addColorStop(1, th.boden[2]);
  const runs = []; let run = null;
  for (let i = ter.erste(x0 - 2); i < ter.x0.length && ter.x0[i] <= x1 + 2; i++) {
    const dx = ter.x1[i] - ter.x0[i]; if (dx < 1e-6) continue;
    if (!run || Math.abs(ter.x0[i] - run.ex) > 1e-4) { run = { p: [[ter.x0[i], ter.y0[i]]], ex: 0 }; runs.push(run); }
    else if (Math.abs(ter.y0[i] - run.p[run.p.length - 1][1]) > 1e-4) run.p.push([ter.x0[i], ter.y0[i]]);
    run.p.push([ter.x1[i], ter.y1[i]]); run.ex = ter.x1[i];
  }
  // Abgruende zwischen den Stuecken
  for (let k = 0; k + 1 < runs.length; k++) {
    const a = runs[k].p[runs[k].p.length - 1], b = runs[k + 1].p[0];
    if (b[0] - a[0] > 0.05) {
      const top = Math.min(a[1], b[1]), g = ctx.createLinearGradient(0, top, 0, yUnten); g.addColorStop(0, '#2a1d3f'); g.addColorStop(1, '#0b0714');
      ctx.fillStyle = g; ctx.fillRect(a[0], yUnten, b[0] - a[0], top - yUnten);
    }
  }
  for (const r of runs) {
    const p = r.p;
    ctx.fillStyle = fuell; ctx.beginPath(); ctx.moveTo(p[0][0], yUnten);
    for (const q of p) ctx.lineTo(q[0], q[1]);
    ctx.lineTo(p[p.length - 1][0], yUnten); ctx.closePath(); ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    for (const [w, f] of [[1.1, th.boden[0]], [0.36, th.rand]]) {
      ctx.save(); ctx.translate(0, -w / 2); ctx.strokeStyle = f; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.stroke(); ctx.restore();
    }
  }
}

function zeichneMuenzen(lf, x0, x1, t) {
  for (const m of lf.muenzen) {
    if (m.got || m.x < x0 || m.x > x1) continue;
    const sx = Math.abs(Math.cos(t * 3 + m.x * 0.7));
    ctx.save(); ctx.translate(m.x, m.y + Math.sin(t * 2 + m.x) * 0.07); ctx.scale(Math.max(0.15, sx), 1);
    kreis(ctx, 0, 0, 0.34, '#e6a800'); kreis(ctx, 0, 0, 0.27, '#ffd84a'); kreis(ctx, -0.07, 0.08, 0.1, '#fff3b0');
    ctx.restore();
  }
}

function zeichneTurbos(lf, x0, x1, t) {
  for (const p of lf.turbos) {
    if (p.x < x0 - 3 || p.x > x1 + 3) continue;
    const gy = lf.ter.hoehe(p.x); if (gy !== gy) continue;
    const w = lf.ter.winkel(p.x);
    ctx.save(); ctx.translate(p.x, gy); ctx.rotate(w);
    ctx.globalAlpha = p.benutzt ? 0.3 : 1;
    ctx.fillStyle = 'rgba(30,20,0,.45)'; ctx.fillRect(-1.9, 0.0, 3.8, 0.1);
    for (let i = 0; i < 3; i++) {
      const x = -1.2 + i * 1.2, pulse = p.benutzt ? 0 : (Math.sin(t * 8 - i * 1.2) * 0.5 + 0.5);
      ctx.fillStyle = pulse > 0.5 ? '#ffe45a' : '#ff9a1f';
      ctx.beginPath(); ctx.moveTo(x - 0.5, 0.1); ctx.lineTo(x, 0.1); ctx.lineTo(x + 0.45, 0.45); ctx.lineTo(x, 0.8); ctx.lineTo(x - 0.5, 0.8); ctx.lineTo(x - 0.05, 0.45); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
}

function zeichneMarken(lf, x0, x1, t) {
  const ter = lf.ter;
  lf.checkpoints.forEach((cx, i) => {
    if (cx < x0 - 2 || cx > x1 + 2) return;
    const gy = ter.hoehe(cx); if (gy !== gy) return;
    const erreicht = lf.cpIndex >= i;
    linie(ctx, cx, gy, cx, gy + 2.6, 0.11, '#e8e8f0');
    ctx.fillStyle = erreicht ? '#3ecf6e' : '#ff5a4d';
    const w = Math.sin(t * 4 + i) * 0.08; ctx.beginPath(); ctx.moveTo(cx, gy + 2.6); ctx.lineTo(cx + 1.0, gy + 2.3 + w); ctx.lineTo(cx, gy + 1.9); ctx.closePath(); ctx.fill();
  });
  if (!lf.endlos && lf.zielX > x0 - 3 && lf.zielX < x1 + 3) {
    const gy = ter.hoehe(lf.zielX); if (gy === gy) {
      linie(ctx, lf.zielX, gy, lf.zielX, gy + 4.4, 0.18, '#e8e8f0'); linie(ctx, lf.zielX + 4, gy, lf.zielX + 4, gy + 4.4, 0.18, '#e8e8f0');
      for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; ctx.fillRect(lf.zielX + i * 0.5, gy + 3.9 - j * 0.5, 0.5, 0.5); }
    }
  }
}

function zeichnePartikel() {
  for (const p of partikel) { ctx.globalAlpha = Math.max(0, 1 - p.t / p.max); kreis(ctx, p.x, p.y, p.r, p.f); }
  ctx.globalAlpha = 1;
}

// Wetter: Schnee (Welt 3) und Sandstaub (Welt 2) im Bildschirmraum
const flocken = []; for (let i = 0; i < 90; i++) flocken.push({ x: Math.random(), y: Math.random(), z: Math.random() });
function zeichneWetter(dt, dCam) {
  const welt = theme === THEMEN[2] ? 2 : theme === THEMEN[1] ? 1 : 0; if (!welt) return;
  ctx.fillStyle = welt === 2 ? '#fff' : 'rgba(255,240,200,.7)';
  for (const f of flocken) {
    f.x += (welt === 2 ? -0.02 : -0.35) * dt * (0.5 + f.z) - dCam * (0.4 + f.z) / W;
    f.y += (welt === 2 ? 0.06 + f.z * 0.08 : 0.01) * dt;
    if (f.x < 0) f.x += 1; if (f.x > 1) f.x -= 1; if (f.y > 1) f.y -= 1;
    if (welt === 2) { ctx.beginPath(); ctx.arc(f.x * W, f.y * H, 1.2 + f.z * 2.2, 0, 7); ctx.fill(); } else ctx.fillRect(f.x * W, f.y * H, 4 + f.z * 8, 1.2);
  }
}

let letzteCamX = 0, zeitAnim = 0;
function zeichne(alpha, dt) {
  zeitAnim += dt;
  const lf = lauf || demo; if (!lf) return;
  const b = lf.b;
  // interpolierte Lage fuer Kamera und Motorrad
  const ix = vorher.x + (b.x - vorher.x) * alpha, iy = vorher.y + (b.y - vorher.y) * alpha, ith = vorher.th + (b.th - vorher.th) * alpha;
  // Kamera
  const basis = Math.min(H / (touchGenutzt ? 10.5 : 12.5), W / 22);
  const tempo = Math.hypot(b.vx, b.vy);
  const gy = lf.ter.hoehe(ix), hoeheUeber = gy === gy ? iy - gy : 0;
  const zielS = basis * (1 - Math.min(0.2, tempo / 110)) * (hoeheUeber > 4 ? 0.9 : 1);
  const mitte = lf.status === 'abgestuerzt' && lf.ragdoll ? lf.ragdoll.brust : { x: ix, y: iy };
  const tx = mitte.x + Math.max(-3, Math.min(8, b.vx * 0.4)) + 2.5, ty = mitte.y + (touchGenutzt ? 0.3 : 1.6) + (hoeheUeber > 3 ? 1 : 0);
  const k = Math.min(1, dt * 4.5);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * Math.min(1, dt * 3.5); cam.s += (zielS - cam.s) * Math.min(1, dt * 2.5);
  if (Math.abs(cam.x - tx) > 40) cam.x = tx;
  const s = cam.s;
  const sh = zittern > 0 ? [(Math.random() - 0.5) * zittern * 8, (Math.random() - 0.5) * zittern * 8] : [0, 0];
  if (zittern > 0) zittern = Math.max(0, zittern - dt * 1.5);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  zeichneHimmel(cam.x, zeitAnim);
  zeichneWetter(dt, (cam.x - letzteCamX) * s); letzteCamX = cam.x;

  ctx.setTransform(dpr * s, 0, 0, -dpr * s, dpr * (W / 2 - cam.x * s + sh[0]), dpr * (H / 2 + cam.y * s + sh[1]));
  const x0 = cam.x - W / 2 / s - 1, x1 = cam.x + W / 2 / s + 1, yOben = cam.y + H / 2 / s + 1, yUnten = cam.y - H / 2 / s - 3;
  zeichneDeko(lf.ter, x0, x1);
  zeichneGelaende(lf.ter, x0, x1, yUnten, yOben);
  zeichneTurbos(lf, x0, x1, zeitAnim);
  zeichneMarken(lf, x0, x1, zeitAnim);
  zeichneMuenzen(lf, x0, x1, zeitAnim);

  // Motorrad und Fahrer
  const moto = lf.moto;
  const lean = lf.status === 'abgestuerzt' ? 0 : (lf.leanAnim = (lf.leanAnim || 0) + ((lf === lauf ? -(eingabe().rot) * 0.9 + (eingabe().gas ? -0.15 : 0.1) : 0) - (lf.leanAnim || 0)) * Math.min(1, dt * 8));
  zeichneMoto(ctx, { x: ix, y: iy, th: ith, rad: lf.rad }, moto, lf.fahrer, lean || 0);
  if (lf.ragdoll) zeichneRagdoll(ctx, lf.ragdoll, moto);

  // Staub an den Reifen
  if (lf === lauf && lf.status === 'fahrt' && (lf.kontakt[0] || lf.kontakt[1]) && Math.abs(b.vx) > 3 && Math.random() < dt * 40) {
    const c = Math.cos(b.th), sn = Math.sin(b.th);
    staub(b.x + c * -L.RAD_X + sn * (L.ACHSE + moto.radius), b.y + sn * -L.RAD_X - c * (L.ACHSE + moto.radius), b.vx);
  }
  zeichnePartikel();

  // Tempolinien am Bildschirmrand
  if (lf === lauf && tempo > 15 && lf.status === 'fahrt') {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(0.4, (tempo - 15) / 30).toFixed(2) + ')'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const y = hash(i * 9.7 + Math.floor(zeitAnim * 14)) * H, x = hash(i * 4.1 + Math.floor(zeitAnim * 14) * 0.3) * W, len = 40 + hash(i) * 90;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len, y); ctx.stroke();
    }
  }
}

// ---------------------------------------------------------------- HUD
let hudCache = {};
function setzeText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function aktualisiereHud(erzwingen) {
  if (!lauf) return;
  if (erzwingen) hudCache = {};
  setzeText('hMuenzen', lauf.muenzenZahl);
  setzeText('hInfo', lauf.endlos ? Math.round(lauf.distanz) + ' m' : zeitText(lauf.zeit));
  const f = lauf.endlos ? Math.min(1, (lauf.distanz % 500) / 500) : lauf.fortschritt;
  $('fortschritt').firstElementChild.style.width = (f * 100).toFixed(1) + '%';
  const tipp = lauf.status === 'bereit' ? (touchGenutzt ? 'GAS drücken zum Start' : '↑ Gas geben zum Start') : '';
  setzeText('tipp', tipp);
}

// ---------------------------------------------------------------- Hauptschleife
let letzte = 0, acc = 0;
function schleife(zeit) {
  requestAnimationFrame(schleife);
  let dt = (zeit - letzte) / 1000; letzte = zeit; if (!(dt > 0)) dt = 1 / 60; if (dt > 0.1) dt = 0.1;
  vorwaerts(dt, zeit);
}
function vorwaerts(dt, zeit) {
  if (modus === 'spiel' && lauf) {
    acc += dt;
    while (acc >= 1 / 60) {
      vorher.x = lauf.b.x; vorher.y = lauf.b.y; vorher.th = lauf.b.th;
      lauf.schritt(eingabe());
      ereignisse();
      acc -= 1 / 60;
      if (lauf.status === 'abgestuerzt' || lauf.status === 'ziel') {
        endeTimer += 1 / 60;
        if (lauf.status === 'abgestuerzt' && endeTimer > 0.9) zeigeEnde();
        if (lauf.status === 'ziel' && endeTimer > 1.3) zeigeEnde();
      }
    }
    partikelSchritt(dt);
    aktualisiereHud();
    zeichne(acc * 60, dt);
  } else if (modus === 'menue') {
    if (!demo) neueDemo();
    acc += dt;
    while (acc >= 1 / 60) {
      vorher.x = demo.b.x; vorher.y = demo.b.y; vorher.th = demo.b.th;
      demo.schritt(L.autopilot(demo, { kp: 2.6, kd: 1 })); demo.ereignisse.length = 0; acc -= 1 / 60;
      if (demo.status === 'abgestuerzt' && demo.tAbgestuerzt > 1.2 || demo.distanz > 1500) neueDemo();
    }
    partikelSchritt(dt);
    zeichne(acc * 60, dt);
  } else if (modus === 'pause' && lauf) {
    zeichne(acc * 60, 0);
  }
  garageZeichnen(zeit);
}
function zeigeEnde() {
  if (lauf.status === 'ziel') { abrechnen(); zeige('sZiel'); modus = 'pause'; pausiert = true; }
  else {
    abrechnen();
    $('cCheck').style.display = lauf.snapshot ? '' : 'none';
    if (!lauf.endlos) {
      $('cTitel').textContent = lauf.crashGrund === 'Sturz' ? 'Runtergefallen!' : 'Abgestürzt!';
      $('cText').textContent = lauf.snapshot ? 'Weiter am letzten Checkpoint oder von vorn?' : 'Noch mal versuchen?';
    }
    zeige('sCrash'); modus = 'pause'; pausiert = true;
  }
}

aktualisiereMuenzen();
requestAnimationFrame(t => { letzte = t; schleife(t); });

// Test- und Entwicklungshilfen
window.schanzenloewe = {
  get lauf() { return lauf; }, get save() { return save; }, L, THEMEN,
  start: starteLevel, menue: zumMenue,
  // Simuliert sek Sekunden mit Autopilot (Browser-Tab im Hintergrund pausiert requestAnimationFrame)
  sim(sek, opt) { if (!lauf) return null; for (let i = 0; i < sek * 60 && lauf.status !== 'abgestuerzt' && lauf.status !== 'ziel'; i++) { vorher.x = lauf.b.x; vorher.y = lauf.b.y; vorher.th = lauf.b.th; lauf.schritt(L.autopilot(lauf, opt || {})); ereignisse(); } return { status: lauf.status, x: lauf.b.x, flips: lauf.flips, muenzen: lauf.muenzenZahl }; },
  // Test: Spiel anhalten, Kamera nachfuehren und Bild zeichnen
  halt(an) { modus = an ? 'pause' : 'spiel'; },
  // Test: die echte Spielschleife n Bilder lang laufen lassen (auch wenn der Tab keine Animationsbilder liefert)
  tick(n) { for (let i = 0; i < (n || 1); i++) vorwaerts(1 / 60, performance.now()); },
  bild(n) { for (let i = 0; i < (n || 1); i++) zeichne(0, 1 / 60); },
  // Test: springt bis zum n-ten Flug von mind. min Sekunden Luftzeit (Autopilot)
  bisLuft(minZeit, opt) { for (let i = 0; i < 60 * 120 && lauf.status !== 'abgestuerzt' && lauf.status !== 'ziel'; i++) { vorher.x = lauf.b.x; vorher.y = lauf.b.y; vorher.th = lauf.b.th; lauf.schritt(L.autopilot(lauf, opt || {})); ereignisse(); if (lauf.luftZeit > minZeit) return true; } return false; },
  reset() { save = standardSave(); speichern(); aktualisiereMuenzen(); }
};
})();
