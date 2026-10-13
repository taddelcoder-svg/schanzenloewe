'use strict';
// Schanzenloewe - Darstellung, Eingabe, Menues und Speicherstand. Die Regeln stehen in logik.js.
(function () {
const L = window.Logik;
const $ = id => document.getElementById(id);
const cv = $('c'), ctx = cv.getContext('2d');

// ---------------------------------------------------------------- Speicherstand
const SCHLUESSEL = 'schanzenloewe.v1';
function standardSave() { return { muenzen: 0, sterne: {}, zeiten: {}, punkte: {}, tages: {}, eigene: [], name: '', besitz: ['flitzer'], moto: 'flitzer', endlos: 0, schwer: 1, version: 3 }; }
function ladeSave() {
  try { const s = JSON.parse(localStorage.getItem(SCHLUESSEL)); if (s && typeof s === 'object') { const n = Object.assign(standardSave(), s); if (!s.version || s.version < 2) { n.schwer = 1; n.version = 2; } return n; } } catch (e) { /* kein Speicher */ }
  return standardSave();
}
let save = ladeSave();
function speichern() { try { localStorage.setItem(SCHLUESSEL, JSON.stringify(save)); } catch (e) { /* ignorieren */ } }
const aktMoto = () => L.MOTOS.find(m => m.id === save.moto) || L.MOTOS[0];

// Ghosts: die beste eigene Fahrt je Strecke als Code (eigener Speicherplatz, damit der Spielstand klein bleibt)
const GHOST_SCHLUESSEL = 'schanzenloewe.ghosts';
function ladeGhosts() { try { return JSON.parse(localStorage.getItem(GHOST_SCHLUESSEL)) || {}; } catch (e) { return {}; } }
function ghostCode(g) { return 'SG1' + L.zuB64(L.ghostBytes(g)); }
function ghostAusCode(c) { c = String(c || '').replace(/\s+/g, ''); if (!c.startsWith('SG1')) throw new Error('Kein Ghost-Code'); return L.ghostAusBytes(L.ausB64(c.slice(3))); }
function eigenerGhostCode(key) { return ladeGhosts()[key] || null; }
function eigenerGhost(key) { const c = eigenerGhostCode(key); if (!c) return null; try { return ghostAusCode(c); } catch (e) { return null; } }
function speichereGhost(key, code) {
  const g = ladeGhosts(); delete g[key]; g[key] = code;
  const keys = Object.keys(g); while (keys.length > 40) delete g[keys.shift()];
  try { localStorage.setItem(GHOST_SCHLUESSEL, JSON.stringify(g)); } catch (e) { /* ignorieren */ }
}

// ---------------------------------------------------------------- Welten (Farben)
const THEMEN = [
  { himmel: ['#5ab8ff', '#cdeeff'], sonne: '#fff6c2', berge: ['#a9dcc0', '#86c79d', '#62ad7e'], boden: ['#7bd34f', '#9a6a36', '#5b3a1b'], rand: '#52b83a', deko: 'baum', wolke: '#ffffff', tex: 'erde', gestalt: ['h', 'h', 'h'], kappe: ['#e4ffd0', 0.32, 0.45], ferndeko: 'baum', vogel: true },
  { himmel: ['#ff9d5c', '#ffe6b8'], sonne: '#fffbe0', berge: ['#f0bf8a', '#e0a468', '#cc8a4e'], boden: ['#f0c870', '#cf9444', '#8f5e24'], rand: '#f7d98a', deko: 'kaktus', wolke: '#fff3e0', tex: 'sand', gestalt: ['m', 'h', 'h'], kappe: ['#fff0c8', 0.38, 0.5], ferndeko: 'kaktus' },
  { himmel: ['#7ea6e6', '#eaf3ff'], sonne: '#ffffff', berge: ['#d3e0f4', '#b4c8e6', '#95afd6'], boden: ['#eef4ff', '#aebfdc', '#6f84a8'], rand: '#ffffff', deko: 'tanne', wolke: '#f3f8ff', wetter: 'schnee', tex: 'eis', gestalt: ['s', 's', 'h'], kappe: ['#ffffff', 0.95, 0.6], ferndeko: 'tanne' },
  { himmel: ['#070b24', '#2b2f72'], sonne: '#f6f2d4', nacht: true, skyline: true, berge: ['#1c2150', '#141839', '#0c0f27'], boden: ['#454b63', '#2c3144', '#161925'], rand: '#43f0ff', deko: 'laterne', wolke: '#363c7a', bahn: '#ff4fd8', tex: 'beton', neon: true, licht: true },
  { himmel: ['#2a0707', '#c9461b'], sonne: '#ffb36b', vulkan: true, berge: ['#561f17', '#3d1611', '#24100c'], boden: ['#4a3530', '#2c201d', '#120b0a'], rand: '#ff7a1a', deko: 'fels', wolke: '#4a2420', lava: true, wetter: 'glut', bahn: '#ffb02e', tex: 'lava', gestalt: ['s', 'h', 'h'], kappe: ['#ff7a1a', 0.2, 0.4], licht: true }
];
THEMEN[1].wetter = 'sand';

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
// Grafikstufe: 'hoch' mit Bodenmuster, Vignette und Lichtstrahlen, 'niedrig' ohne die teuren Fuellflaechen.
// Automatisch: wird die Fahrt dauerhaft zu langsam (schwaches Handy), schaltet das Spiel selbst auf niedrig. Mit ?grafik=hoch / ?grafik=niedrig festlegbar.
let lite = false, grafikFest = false, langsamZ = 0;
try { const q = /[?&]grafik=(hoch|niedrig)/.exec(location.search); if (q) { grafikFest = true; lite = q[1] === 'niedrig'; } } catch (e) { /* egal */ }

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
  if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.repeat) { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault(); return; }
  tasten[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (modus === 'spiel' || modus === 'pause') {
    if (e.code === 'Escape' || e.code === 'KeyP') pausiere(modus === 'spiel');
    else if (e.code === 'KeyR' && !olympia) neustart();
    else if (e.code === 'KeyC' && !olympia) vomCheckpoint();
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
const SCHIRME = ['sStart', 'sLevels', 'sGarage', 'sPause', 'sCrash', 'sZiel', 'sEditor', 'sDialog', 'sOlymp'];
function zeige(id) { for (const s of SCHIRME) $(s).classList.toggle('an', s === id); }
function hud(an) { $('hud').classList.toggle('an', an); $('touch').classList.toggle('an', an && touchGenutzt); }
function aktualisiereMuenzen() { $('sMuenzen').textContent = save.muenzen; document.querySelectorAll('.mz').forEach(e => { e.textContent = save.muenzen; }); aktualisiereTagesKnopf(); }

function levelOffen(i) { return i === 0 || (save.sterne[L.LEVELS[i - 1].id] || [])[0]; }
function sterneZahl(id) { return (save.sterne[id] || []).filter(Boolean).length; }
function zeitText(s) { const m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(1).padStart(4, '0'); }
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function baueLevelAuswahl() {
  const w = $('welten'); w.innerHTML = '';
  L.WELTEN.forEach((we, i) => {
    const b = document.createElement('button'); b.className = 'welt' + (i === aktWelt ? ' aktiv' : ''); b.textContent = we.name;
    if (i >= 3) b.textContent += ' ✦';
    b.onclick = () => { aktWelt = i; baueLevelAuswahl(); };
    w.appendChild(b);
  });
  const r = $('raster'); r.innerHTML = '';
  L.LEVELS.forEach((lv, i) => {
    if (lv.welt !== aktWelt) return;
    const offen = levelOffen(i), st = save.sterne[lv.id] || [];
    const k = document.createElement('button'); k.className = 'lvl' + (offen ? '' : ' zu');
    const zeit = save.zeiten[lv.id], pk = save.punkte[lv.id];
    k.innerHTML = '<div><div class="nr">Level ' + lv.id + (eigenerGhostCode(lv.key) ? ' · 👻' : '') + '</div><div class="name">' + lv.name + '</div></div>' +
      '<div><div class="sterne">' + [0, 1, 2].map(j => st[j] ? '<b>★</b>' : '★').join('') + '</div><div class="zeit">' + (zeit ? 'Bestzeit ' + zeitText(zeit) : (offen ? 'Noch nicht geschafft' : 'Gesperrt')) + (pk ? ' · ' + pk + ' P' : '') + '</div></div>';
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
    // Buehne: weicher Lichtkegel auf dem Boden, Podest mit Lichtkante
    const bg = g.createRadialGradient(c.width / 2, c.height * 0.55, 10, c.width / 2, c.height * 0.55, c.width * 0.55);
    bg.addColorStop(0, rgba(m.farbe, 0.42)); bg.addColorStop(1, rgba(m.farbe, 0)); g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
    const s = 92;
    g.setTransform(s, 0, 0, -s, c.width / 2, c.height * 0.76);
    const bo = -0.3 - m.radius;
    const pg = g.createLinearGradient(0, bo, 0, bo - 0.5); pg.addColorStop(0, '#5a6078'); pg.addColorStop(1, '#2a2e40');
    g.fillStyle = pg; g.fillRect(-3.2, bo - 0.5, 6.4, 0.5); g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(-3.2, bo - 0.04, 6.4, 0.04);
    g.fillStyle = 'rgba(0,0,0,.28)'; g.beginPath(); g.ellipse(0, bo + 0.02, 1.5, 0.13, 0, 0, 7); g.fill();
    const a = -t * 0.006;
    zeichneMoto(g, { x: 0, y: 0, th: 0.04 + Math.sin(t * 0.002) * 0.02, rad: [a, a] }, m, true, 0.1 + Math.sin(t * 0.002) * 0.3, { gas: 1, tempo: 12, turbo: 0, licht: false });
  });
}

const STUFEN = ['Leicht', 'Normal', 'Schwer'];
function baueStufen() {
  const e = $('stufen'); e.innerHTML = '';
  STUFEN.forEach((n, i) => { const b = document.createElement('button'); b.className = 'welt' + (i === save.schwer ? ' aktiv' : ''); b.textContent = n; b.onclick = () => { save.schwer = i; speichern(); baueStufen(); }; e.appendChild(b); });
}
baueStufen();

// Tagesstrecke: fuer alle gleich, jeden Tag neu (Datum in Ortszeit)
function heute() { const d = new Date(); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
let tagesCache = null;
function tagesDef() { const t = heute(); if (!tagesCache || tagesCache.datum !== t) tagesCache = L.tagesStrecke(t); return tagesCache; }
function aktualisiereTagesKnopf() {
  const b = save.tages[heute()];
  $('bTages').innerHTML = '📅 Tagesstrecke' + (b ? ' <small>· ' + zeitText(b) + '</small>' : '');
}

$('bSpielen').onclick = () => { baueLevelAuswahl(); zeige('sLevels'); };
$('bEndlos').onclick = () => starteLevel('endlos');
$('bTages').onclick = () => starteDef(tagesDef());
$('bEditor').onclick = () => oeffneEditor();
$('bCode').onclick = () => codeEingeben();
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
$('zMenue').onclick = () => zumMenue();
$('zGhost').onclick = () => ghostTeilen();
$('zWeiter').onclick = () => {
  const i = L.LEVELS.findIndex(l => l.id === def.id);
  if (i >= 0 && i + 1 < L.LEVELS.length && levelOffen(i + 1)) { aktWelt = L.LEVELS[i + 1].welt; starteLevel(L.LEVELS[i + 1].id); } else zumMenue();
};

// ---------------------------------------------------------------- Dialog (Codes zeigen und eingeben)
function dialog(o) {
  $('dTitel').textContent = o.titel; $('dText').innerHTML = o.text || '';
  const f = $('dFeld'); f.value = o.wert || ''; f.readOnly = !!o.nurLesen; f.placeholder = o.platzhalter || '';
  f.style.display = o.feld === false ? 'none' : '';
  $('dFehler').textContent = '';
  const k = $('dKnoepfe'); k.innerHTML = '';
  for (const kn of o.knoepfe) {
    const b = document.createElement('button'); b.className = 'knopf ' + (kn.art || ''); b.textContent = kn.text;
    b.onclick = () => kn.tun(f.value, b);
    k.appendChild(b);
  }
  zeige('sDialog');
  if (o.nurLesen) setTimeout(() => { f.focus(); f.select(); }, 30);
}
function kopieren(text, knopf) {
  const fertig = () => { if (knopf) { const t = knopf.textContent; knopf.textContent = '✔ Kopiert'; setTimeout(() => { knopf.textContent = t; }, 1400); } };
  const alt = () => { const f = $('dFeld'); f.focus(); f.select(); try { document.execCommand('copy'); fertig(); } catch (e) { /* Nutzer kopiert selbst */ } };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(fertig, alt); else alt();
}
function teilen(titel, text, code, zurueck) {
  const link = location.origin + '/#' + code;
  dialog({ titel, text, wert: link, nurLesen: true, knoepfe: [
    { text: '📋 Link kopieren', art: 'gruen', tun: (v, b) => kopieren(link, b) },
    { text: 'Nur Code', art: 'zweit', tun: () => { $('dFeld').value = code; kopieren(code); } },
    { text: '← Zurück', art: 'zweit', tun: zurueck }
  ] });
}
function codeEingeben(vorgabe) {
  dialog({ titel: 'Code eingeben', text: 'Füg hier einen <b>Ghost-Code</b> (fang an mit SG1) oder einen <b>Strecken-Code</b> (SL1) von Freunden ein. Links gehen auch.',
    wert: vorgabe || '', platzhalter: 'SG1… oder SL1…', knoepfe: [
      { text: '▶ Los', art: 'gruen', tun: v => { const f = codeAusfuehren(v); if (f) $('dFehler').textContent = f; } },
      { text: '← Zurück', art: 'zweit', tun: () => zeige('sStart') }
    ] });
}
// fuehrt einen Code aus; gibt bei Problemen einen Fehlertext zurueck
function codeAusfuehren(text) {
  const c = String(text || '').replace(/^.*#/, '').replace(/\s+/g, '');
  if (c.startsWith('SL1')) {
    const st = L.codeZuStrecke(c); if (!st) return 'Der Strecken-Code ist nicht vollständig.';
    oeffneEditor(st); return '';
  }
  if (c.startsWith('SG1')) {
    let g; try { g = ghostAusCode(c); } catch (e) { return 'Der Ghost-Code ist nicht vollständig.'; }
    const d = L.levelZuKey(g.key); if (!d) return 'Zu diesem Ghost gibt es die Strecke nicht.';
    const i = L.LEVELS.indexOf(d);
    if (i >= 0 && !levelOffen(i)) return 'Level ' + d.id + ' ist bei dir noch gesperrt. Schalte es erst frei!';
    starteDef(d, { ghost: g, fremd: true }); return '';
  }
  return 'Das ist kein Schanzenlöwe-Code.';
}

// ---------------------------------------------------------------- Ablauf
let ghost = null, ghostFremd = false;          // Ghost, gegen den gefahren wird
let aufnahme = [], naechsteProbe = 0;          // eigene Fahrt fuer den Ghost
let zurueckZu = 'sStart';
function starteLevel(id) {
  if (id === 'endlos') return starteDef(L.ENDLOS);
  starteDef(L.LEVELS.find(l => l.id === id));
}
function starteDef(d, opt) {
  opt = opt || {};
  def = d;
  lauf = new L.Lauf(def, opt.moto || aktMoto(), def.endlos ? (Date.now() & 0xffffff) : undefined, opt.schwer !== undefined ? opt.schwer : save.schwer);
  theme = THEMEN[def.welt];
  if (!def.eigen && !def.tages && !def.endlos) aktWelt = def.welt;
  zurueckZu = def.eigen ? 'sEditor' : def.tages || def.endlos ? 'sStart' : 'sLevels';
  ghost = def.endlos ? null : opt.ghost || eigenerGhost(def.key); ghostFremd = !!opt.fremd;
  if (ghost && !ghostFremd) ghost.name = 'Bestzeit';
  modus = 'spiel'; pausiert = false; abgerechnet = false; endeTimer = 0;
  vorher = { x: lauf.b.x, y: lauf.b.y, th: lauf.b.th };
  cam.x = lauf.b.x + 3; cam.y = lauf.b.y + 1.5;
  aufnahme = []; naechsteProbe = 0;
  partikel.length = 0; $('meldungen').innerHTML = '';
  zeige(null); hud(true); aktualisiereHud(true);
  if (ghostFremd) meldung('👻 gegen ' + (ghost.name || 'Ghost') + ' · ' + zeitText(ghost.zeit), true);
}
function neustart() {
  if (!def || olympia) return;
  lauf.neustart(); modus = 'spiel'; pausiert = false; abgerechnet = false; endeTimer = 0; zittern = 0;
  vorher = { x: lauf.b.x, y: lauf.b.y, th: lauf.b.th };
  aufnahme = []; naechsteProbe = 0;
  partikel.length = 0; zeige(null); hud(true);
}
function vomCheckpoint() {
  if (olympia || !lauf || lauf.status !== 'abgestuerzt' || !lauf.snapshot) return;
  lauf.vomCheckpoint(); modus = 'spiel'; pausiert = false; endeTimer = 0;
  vorher = { x: lauf.b.x, y: lauf.b.y, th: lauf.b.th };
  zeige(null);
}
function pausiere(an) {
  if (!lauf || lauf.status === 'ziel' || lauf.status === 'abgestuerzt') return;
  pausiert = an; modus = an ? 'pause' : 'spiel'; zeige(an ? 'sPause' : null);
  if (an && olympia) olympAufgebenReset();
}
function zumMenue() {
  const ziel = zurueckZu;
  modus = 'menue'; pausiert = false; lauf = null; def = null; ghost = null; hud(false); aktualisiereMuenzen();
  if (ziel === 'sLevels') { baueLevelAuswahl(); zeige('sLevels'); }
  else if (ziel === 'sEditor') { zeige('sEditor'); editorZeichnen(); }
  else zeige('sStart');
  zurueckZu = 'sStart';
  neueDemo();
}
function neueDemo() {
  demo = new L.Lauf(L.ENDLOS, L.MOTOS[Math.floor(Math.random() * 3)], (Math.random() * 1e6) | 0);
  theme = THEMEN[Math.floor(Math.random() * THEMEN.length)];
  cam.x = demo.b.x + 3; cam.y = demo.b.y + 1.5;
}

function meldung(text, klein) {
  const d = document.createElement('div'); d.className = 'meldung' + (klein ? ' klein' : ''); d.textContent = text;
  $('meldungen').appendChild(d); setTimeout(() => d.remove(), 1400);
  while ($('meldungen').children.length > 4) $('meldungen').firstChild.remove();
}

function ereignisse() {
  for (const e of lauf.ereignisse) {
    if (e.t === 'muenze') { funken(e.x, e.y, '#ffd84a', 8, 3.5); sterne(e.x, e.y, '#fff3b0', 5, 3); ring(e.x, e.y, '#ffd84a', 1.1, 0.35); }
    else if (e.t === 'flip') { funken(lauf.b.x, lauf.b.y + 1, '#ff9a1f', 18, 6); sterne(lauf.b.x, lauf.b.y + 0.6, '#ffe45a', 8, 5); ring(lauf.b.x, lauf.b.y + 0.4, '#ff9a1f', 2.4, 0.5); }
    else if (e.t === 'trick') meldung(e.name.toUpperCase() + '  +' + e.p, e.p < 100);
    else if (e.t === 'kombo') { if (e.mult >= 2) { meldung('KOMBO ×' + e.mult + ' = ' + e.gesamt + (e.bonus ? '  +' + e.bonus + ' 🪙' : '')); sterne(lauf.b.x, lauf.b.y + 1.2, '#ff7ae0', 6, 4); } }
    else if (e.t === 'komboWeg') { if (e.summe > 0) meldung('Kombo verloren (' + e.summe + ')', true); }
    else if (e.t === 'turbo') { meldung('TURBO!', true); funken(e.x, lauf.b.y, '#ffd84a', 20, 9); ring(e.x, lauf.b.y, '#ffb02e', 2.6, 0.5); turboT = 0.9; zittern = Math.max(zittern, 0.12); }
    else if (e.t === 'checkpoint') { meldung('⚑ Checkpoint', true); sterne(lauf.b.x, lauf.b.y + 1.5, '#7dffa8', 8, 4); ring(lauf.b.x, lauf.b.y + 1, '#3ecf6e', 2.2, 0.55); }
    else if (e.t === 'crash') {
      zittern = 0.5; funken(lauf.b.x, lauf.b.y, '#ff5a4d', 24, 8); funken(lauf.b.x, lauf.b.y, '#ffd84a', 10, 6); ring(lauf.b.x, lauf.b.y, '#ff5a4d', 3, 0.5);
      for (let i = 0; i < 10; i++) staub(lauf.b.x + (Math.random() - 0.5) * 1.6, lauf.b.y - 0.3, (Math.random() - 0.5) * 20, 1.8);
      for (let i = 0; i < 8; i++) brocken(lauf.b.x, lauf.b.y, 14);
      endeTimer = 0;
    }
    else if (e.t === 'ziel') { meldung('ZIEL!'); for (let i = 0; i < 4; i++) funken(lauf.b.x + i * 2, lauf.b.y + 2, ['#ff4d4d', '#ffd84a', '#4fe085', '#4ab3ff'][i], 14, 7); konfetti(lauf.b.x, lauf.b.y + 1, 50, 9); konfetti(lauf.b.x + 4, lauf.b.y + 2, 30, 7); endeTimer = 0; }
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
    $('cText').innerHTML = '<div class="grosswert">' + dist + ' m</div>' + (neu ? 'Neuer Rekord!' : 'Rekord: ' + save.endlos + ' m') + '<br>+' + lauf.muenzenZahl + ' Münzen · ' + lauf.punkte + ' Trickpunkte';
    return;
  }
  if (lauf.status !== 'ziel') return;
  const zeilen = [];
  let gewinn = 0, beste, rekord;
  if (def.eigen) {
    // eigene Strecken: zum Ueben, Muenzen gibt es hier nicht
    beste = (save.eigene.find(e => e.code === def.code) || {}).zeit;
    rekord = !beste || lauf.zeit < beste;
    const e = save.eigene.find(x => x.code === def.code); if (e && rekord) e.zeit = lauf.zeit;
    zeilen.push(['Ziel erreicht', '', true, false], ['Trickpunkte', lauf.punkte, lauf.punkte > 0, false]);
  } else if (def.tages) {
    beste = save.tages[def.datum]; rekord = !beste || lauf.zeit < beste;
    if (rekord) save.tages[def.datum] = lauf.zeit;
    for (const k of Object.keys(save.tages)) if (+k < def.datum - 100) delete save.tages[k];
    gewinn = lauf.muenzenZahl;
    zeilen.push(['Tagesstrecke geschafft', '', true, false], ['Trickpunkte', lauf.punkte, lauf.punkte > 0, false]);
  } else {
    const st = lauf.sterne(), alt = save.sterne[def.id] || [false, false, false];
    let bonus = 0; const neu = [];
    for (let i = 0; i < 3; i++) if (st[i] && !alt[i]) { bonus += 10; neu.push(i); }
    save.sterne[def.id] = [0, 1, 2].map(i => !!(st[i] || alt[i]));
    gewinn = lauf.muenzenZahl + bonus;
    beste = save.zeiten[def.id]; rekord = !beste || lauf.zeit < beste;
    if (rekord) save.zeiten[def.id] = lauf.zeit;
    const altP = save.punkte[def.id] || 0;
    if (lauf.punkte > altP) save.punkte[def.id] = lauf.punkte;
    const mu = lauf.muenzen.filter(m => m.got).length;
    zeilen.push(['Ziel erreicht', '', st[0], neu.includes(0)], ['Alle Münzen', mu + ' / ' + lauf.muenzen.length, st[1], neu.includes(1)], ['Flips', lauf.flips + ' / ' + lauf.flipZiel, st[2], neu.includes(2)],
      ['Trickpunkte', lauf.punkte + (lauf.punkte > altP && altP ? ' · Rekord!' : altP ? ' · Best ' + altP : ''), lauf.punkte > 0, false]);
  }
  save.muenzen += gewinn;
  // eigene Bestzeit als Ghost merken
  if (rekord) {
    aufnahme.push([lauf.b.x, lauf.b.y, lauf.b.th]);
    speichereGhost(def.key, ghostCode({ key: def.key, moto: L.MOTOS.indexOf(lauf.moto), zeit: lauf.zeit, name: save.name || 'Löwe', proben: aufnahme }));
  }
  speichern();
  $('zZiele').innerHTML = zeilen.map((z, i) => '<div class="ziel' + (z[2] ? ' ok' : '') + '"><span class="st">' + (i === 3 || (zeilen.length === 2 && i === 1) ? (z[2] ? '✦' : '✧') : (z[2] ? '★' : '☆')) + '</span>' + z[0] + '<span class="r">' + z[1] + (z[3] ? ' · +10' : '') + '</span></div>').join('');
  $('zBonus').innerHTML = def.eigen ? 'Übungsstrecke · keine Münzen' : '<span class="muenze"></span> +' + gewinn;
  let txt = 'Zeit ' + zeitText(lauf.zeit) + (rekord ? ' · neue Bestzeit!' : ' · Bestzeit ' + zeitText(beste)) + (lauf.versuche > 1 ? ' · ' + lauf.versuche + ' Versuche' : '');
  if (ghost && ghostFremd) { const d = ghost.zeit - lauf.zeit; txt += '<br><b>' + (d > 0 ? '👑 ' + d.toFixed(1) + ' s schneller als ' : '👻 ' + (-d).toFixed(1) + ' s langsamer als ') + esc(ghost.name || 'Ghost') + '</b>'; }
  $('zZeit').innerHTML = txt;
  const i = L.LEVELS.findIndex(l => l.id === def.id);
  $('zWeiter').style.display = i >= 0 && i + 1 < L.LEVELS.length ? '' : 'none';
  $('zMenue').textContent = def.eigen ? '🛠 Editor' : def.tages ? '☰ Menü' : '☰ Level';
  $('zGhost').style.display = eigenerGhostCode(def.key) ? '' : 'none';
  konfetti($('sZiel').firstElementChild);
}

function konfetti(el) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const alt = el.querySelector('.konfetti'); if (alt) alt.remove();
  const k = document.createElement('div'); k.className = 'konfetti';
  const farben = ['#ffc928', '#ff8a1f', '#3ecf6e', '#4ab3ff', '#ff5d5d'];
  for (let i = 0; i < 24; i++) {
    const e = document.createElement('i'); e.style.left = (Math.random() * 100) + '%'; e.style.background = farben[i % farben.length];
    e.style.animationDelay = (Math.random() * 0.6).toFixed(2) + 's'; e.style.animationDuration = (1.8 + Math.random() * 1.2).toFixed(2) + 's'; k.appendChild(e);
  }
  el.prepend(k); setTimeout(() => k.remove(), 3800);
}

function ghostTeilen() {
  const code = eigenerGhostCode(def.key);
  if (!code) return;
  const zurueck = () => zeige('sZiel');
  const g = ghostAusCode(code);
  const weiter = () => teilen('Ghost teilen', 'Deine Bestzeit <b>' + zeitText(g.zeit) + '</b> als Ghost. Wer den Link öffnet, fährt gegen dich' + (def.eigen ? ' (die Strecke steckt mit im Code).' : '.'), code, zurueck);
  if (save.name) return weiter();
  dialog({ titel: 'Wie heißt du?', text: 'Der Name steht über deinem Ghost.', wert: '', platzhalter: 'Dein Name', knoepfe: [
    { text: 'OK', art: 'gruen', tun: v => {
      save.name = v.trim().slice(0, 16) || 'Löwe'; speichern();
      g.name = save.name; const neu = ghostCode(g); speichereGhost(def.key, neu);
      teilen('Ghost teilen', 'Deine Bestzeit <b>' + zeitText(g.zeit) + '</b> als Ghost. Wer den Link öffnet, fährt gegen dich.', neu, zurueck);
    } },
    { text: '← Zurück', art: 'zweit', tun: zurueck }
  ] });
}

// ---------------------------------------------------------------- Level-Editor
let ed = null;
function neueStrecke() { return { welt: 0, name: '', sel: -1, teile: [{ k: 'H', s: [2, 2] }, { k: 'S', s: [3, 3] }, { k: 'C', s: [] }, { k: 'O', s: [2] }, { k: 'W', s: [1, 2] }, { k: 'S', s: [5, 4] }] }; }
function oeffneEditor(st) {
  if (st) ed = { welt: st.welt, name: st.name || '', sel: -1, teile: st.teile.map(t => ({ k: t.k, s: t.s.slice() })) };
  else if (!ed) ed = neueStrecke();
  $('eMeldung').textContent = '';
  zeige('sEditor'); baueEditor();
}
function edStrecke() { return { welt: ed.welt, name: ed.name.trim(), teile: ed.teile }; }
function wertText(t, i, s) {
  const w = t.werte[i], v = L.teilWert(t, i, s);
  if (w[0] === 'Bewegung') return ['steht still', 'auf und ab', 'seitlich'][s];
  if (w[0] === 'Anzahl') return String(Math.round(v));
  return (v > 0 && w[1] < 0 ? '+' : '') + (Math.round(v * 10) / 10).toString().replace('.', ',') + ' m';
}
function geaendert() { $('eMeldung').textContent = ''; baueEditor(); }
function baueEditor() {
  $('eName').value = ed.name;
  const w = $('eWelten'); w.innerHTML = '';
  L.WELTEN.forEach((we, i) => { const b = document.createElement('button'); b.className = 'welt' + (i === ed.welt ? ' aktiv' : ''); b.textContent = we.name; b.onclick = () => { ed.welt = i; geaendert(); }; w.appendChild(b); });
  const liste = $('eTeile'); liste.innerHTML = '';
  ed.teile.forEach((t, i) => {
    const d = L.TEIL[t.k], b = document.createElement('button');
    b.className = 'teil' + (i === ed.sel ? ' aktiv' : '');
    b.innerHTML = '<small>' + (i + 1) + '</small> ' + d.name;
    b.onclick = () => { ed.sel = ed.sel === i ? -1 : i; baueEditor(); };
    liste.appendChild(b);
  });
  if (!ed.teile.length) liste.innerHTML = '<span class="hinweis">Noch leer. Füg unten Bausteine hinzu!</span>';
  const werte = $('eWerte'); werte.innerHTML = '';
  if (ed.sel >= 0 && ed.teile[ed.sel]) {
    const t = ed.teile[ed.sel], d = L.TEIL[t.k];
    werte.innerHTML = '<b>' + (ed.sel + 1) + '. ' + d.name + '</b>';
    d.werte.forEach((wd, j) => {
      const z = document.createElement('label'); z.className = 'regler';
      z.innerHTML = '<span>' + wd[0] + '</span><input type="range" min="0" max="' + (wd[3] - 1) + '" step="1" value="' + t.s[j] + '"><em>' + wertText(d, j, t.s[j]) + '</em>';
      z.querySelector('input').oninput = e => { t.s[j] = +e.target.value; z.querySelector('em').textContent = wertText(d, j, t.s[j]); $('eMeldung').textContent = ''; editorZeichnen(); };
      werte.appendChild(z);
    });
    const r = document.createElement('div'); r.className = 'reihe';
    const knopf = (txt, f, art) => { const b = document.createElement('button'); b.className = 'knopf klein ' + (art || 'zweit'); b.textContent = txt; b.onclick = f; r.appendChild(b); };
    knopf('◀', () => { if (ed.sel > 0) { const i = ed.sel; [ed.teile[i - 1], ed.teile[i]] = [ed.teile[i], ed.teile[i - 1]]; ed.sel--; geaendert(); } });
    knopf('▶', () => { const i = ed.sel; if (i < ed.teile.length - 1) { [ed.teile[i + 1], ed.teile[i]] = [ed.teile[i], ed.teile[i + 1]]; ed.sel++; geaendert(); } });
    knopf('Kopie', () => { if (ed.teile.length >= L.MAX_TEILE) return; ed.teile.splice(ed.sel + 1, 0, { k: t.k, s: t.s.slice() }); ed.sel++; geaendert(); });
    knopf('✕ Weg', () => { ed.teile.splice(ed.sel, 1); ed.sel = Math.min(ed.sel, ed.teile.length - 1); geaendert(); }, 'gefahr');
    werte.appendChild(r);
  } else werte.innerHTML = '<span class="hinweis">Wähl oben einen Baustein aus, um ihn einzustellen, zu verschieben oder zu löschen.</span>';
  const pal = $('ePalette'); pal.innerHTML = '';
  for (const d of L.TEILE) {
    const b = document.createElement('button'); b.className = 'knopf klein'; b.textContent = '+ ' + d.name;
    b.onclick = () => {
      if (ed.teile.length >= L.MAX_TEILE) { $('eMeldung').textContent = 'Mehr als ' + L.MAX_TEILE + ' Bausteine gehen nicht.'; return; }
      const pos = ed.sel >= 0 ? ed.sel + 1 : ed.teile.length;
      ed.teile.splice(pos, 0, { k: d.k, s: d.werte.map(w => Math.floor((w[3] - 1) / 2)) }); ed.sel = pos; geaendert();
    };
    pal.appendChild(b);
  }
  baueEigeneListe();
  editorZeichnen();
}
function baueEigeneListe() {
  const l = $('eListe'); l.innerHTML = '';
  if (!save.eigene.length) { l.innerHTML = '<span class="hinweis">Gespeicherte Strecken erscheinen hier.</span>'; return; }
  save.eigene.forEach((e, i) => {
    const st = L.codeZuStrecke(e.code); if (!st) return;
    const z = document.createElement('div'); z.className = 'eigene';
    z.innerHTML = '<div><b>' + esc(e.name || 'Ohne Namen') + '</b><small>' + L.WELTEN[st.welt].name + ' · ' + st.teile.length + ' Bausteine' + (e.zeit ? ' · Bestzeit ' + zeitText(e.zeit) : '') + '</small></div>';
    const k = (txt, f, art) => { const b = document.createElement('button'); b.className = 'knopf klein ' + (art || 'zweit'); b.textContent = txt; b.onclick = f; z.appendChild(b); };
    k('▶', () => starteDef(L.eigenesLevel(st)), 'gruen');
    k('✎', () => oeffneEditor(st));
    k('✕', () => { if (confirm('„' + (e.name || 'Ohne Namen') + '“ löschen?')) { save.eigene.splice(i, 1); speichern(); baueEigeneListe(); } }, 'gefahr');
    l.appendChild(z);
  });
}
// Vorschau: ganze Strecke klein von der Seite
function editorZeichnen() {
  if (!ed || !$('sEditor').classList.contains('an')) return;
  const c = $('eVorschau'), g = c.getContext('2d'), cw = c.clientWidth || 600, ch = c.clientHeight || 140;
  c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr);
  const th = THEMEN[ed.welt];
  const grad = g.createLinearGradient(0, 0, 0, c.height); grad.addColorStop(0, th.himmel[0]); grad.addColorStop(1, th.himmel[1]);
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  if (!ed.teile.length) return;
  const lf = new L.Lauf(L.eigenesLevel(edStrecke()), L.MOTOS[0]), ter = lf.ter;
  let ymin = Infinity, ymax = -Infinity;
  for (let i = 0; i < ter.x0.length; i++) { if (ter.x1[i] - ter.x0[i] < 1e-6) continue; ymin = Math.min(ymin, ter.y0[i], ter.y1[i]); ymax = Math.max(ymax, ter.y0[i], ter.y1[i]); }
  for (const e of ter.extras) { if (e.art === 'schleife') ymax = Math.max(ymax, e.cy + e.R); }
  const xmax = lf.zielX + 8, rand = 6;
  // waagrecht passend, senkrecht bis zu 3-fach ueberhoeht, damit man Huegel und Schanzen erkennt
  const s = (c.width - 2 * rand * dpr) / xmax, sy = Math.min(s * 3, (c.height - 2 * rand * dpr) / (ymax - ymin + 6));
  const X = x => rand * dpr + x * s, Y = y => c.height - rand * dpr - (y - ymin + 2) * sy;
  // markierter Baustein
  const gr = lf.bauer.teilGrenzen;
  if (ed.sel >= 0 && gr && gr[ed.sel + 1] !== undefined) { g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(X(gr[ed.sel]), 0, X(gr[ed.sel + 1]) - X(gr[ed.sel]), c.height); }
  // Boden
  g.fillStyle = th.boden[1]; g.strokeStyle = th.rand; g.lineWidth = Math.max(1.5, dpr * 1.5);
  let ende = null;
  g.beginPath();
  for (let i = 0; i < ter.x0.length; i++) {
    if (ter.x1[i] - ter.x0[i] < 1e-6) continue;
    if (ende === null || Math.abs(ter.x0[i] - ende) > 1e-4) {
      if (ende !== null) g.lineTo(X(ende), c.height);
      g.moveTo(X(ter.x0[i]), c.height); g.lineTo(X(ter.x0[i]), Y(ter.y0[i]));
    }
    g.lineTo(X(ter.x1[i]), Y(ter.y1[i])); ende = ter.x1[i];
  }
  if (ende !== null) g.lineTo(X(ende), c.height);
  g.fill();
  for (const e of ter.extras) {
    g.strokeStyle = th.bahn || '#ff8a1f'; g.fillStyle = th.bahn || '#ff8a1f'; g.lineWidth = Math.max(2, s * 0.4);
    if (e.art === 'schleife') { g.beginPath(); g.ellipse(X(e.cx), Y(e.cy), e.R * s, e.R * sy, 0, 0, 7); g.stroke(); }
    else if (e.art === 'plattform') g.fillRect(X(e.x0), Y(e.y), (e.x1 - e.x0) * s, Math.max(2, e.dicke * sy));
    else if (e.art === 'bruecke') { g.strokeStyle = '#c9a26b'; g.beginPath(); for (let x = e.x0; x <= e.x1; x += 0.5) { const y = e.hoeheBei(x); if (x === e.x0) g.moveTo(X(x), Y(y)); else g.lineTo(X(x), Y(y)); } g.stroke(); }
  }
  g.fillStyle = '#3ecf6e'; for (const cx of lf.checkpoints) { const y = ter.hoehe(cx); g.fillRect(X(cx) - 1, Y(y) - 12 * dpr, 2 * dpr, 12 * dpr); }
  const zy = ter.hoehe(lf.zielX); g.fillStyle = '#fff'; g.fillRect(X(lf.zielX), Y(zy) - 16 * dpr, 3 * dpr, 16 * dpr);
  c.onclick = ev => { const r = c.getBoundingClientRect(), x = ((ev.clientX - r.left) * dpr - rand * dpr) / s; const i = gr ? gr.findIndex((a, k) => k < gr.length - 1 && x >= a && x < gr[k + 1]) : -1; ed.sel = i; baueEditor(); };
  $('eLaenge').textContent = Math.round(lf.zielX) + ' m · ' + ed.teile.length + ' Bausteine';
}
$('eName').oninput = e => { ed.name = e.target.value; };
$('eNeu').onclick = () => { if (ed.teile.length && !confirm('Neue Strecke anfangen? Nicht gespeicherte Änderungen gehen verloren.')) return; ed = neueStrecke(); ed.teile = []; geaendert(); };
$('eTest').onclick = () => { if (!ed.teile.length) { $('eMeldung').textContent = 'Füg zuerst Bausteine hinzu.'; return; } starteDef(L.eigenesLevel(edStrecke())); };
$('ePruefen').onclick = () => {
  if (!ed.teile.length) return;
  $('eMeldung').textContent = 'Der Autopilot fährt die Strecke ab …';
  setTimeout(() => {
    const d = L.eigenesLevel(edStrecke());
    const erg = L.MOTOS.map(m => (L.fahrbar(d, m, save.schwer).ok ? '✔ ' : '✘ ') + m.name);
    const alle = erg.every(e => e[0] === '✔');
    $('eMeldung').textContent = (alle ? 'Fahrbar! ' : erg.some(e => e[0] === '✔') ? 'Teilweise fahrbar: ' : 'Der Autopilot schafft es nicht. Vielleicht zu schwer? ') + erg.join(' · ') + ' (Stufe ' + STUFEN[save.schwer] + ')';
  }, 30);
};
$('eTeilen').onclick = () => { if (!ed.teile.length) return; const code = L.streckeZuCode(edStrecke()); teilen('Strecke teilen', 'Mit diesem Link (oder Code) können deine Freunde die Strecke fahren und im Editor ansehen.', code, () => zeige('sEditor')); };
$('eSpeichern').onclick = () => {
  if (!ed.teile.length) return;
  if (!ed.name.trim()) { ed.name = 'Strecke ' + (save.eigene.length + 1); $('eName').value = ed.name; }
  const code = L.streckeZuCode(edStrecke()), alt = save.eigene.findIndex(e => e.name === ed.name.trim());
  const eintrag = { name: ed.name.trim(), code };
  if (alt >= 0) save.eigene[alt] = eintrag; else save.eigene.unshift(eintrag);
  save.eigene = save.eigene.slice(0, 30); speichern(); baueEigeneListe();
  $('eMeldung').textContent = '💾 Gespeichert.';
};
window.addEventListener('resize', () => editorZeichnen());

// Codes im Link (#SL1… oder #SG1…)
function linkCode() {
  if (olympia) return;
  const h = decodeURIComponent(location.hash.slice(1));
  if (!/^S[LG]1/.test(h)) return;
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* egal */ }
  const f = codeAusfuehren(h);
  if (f) { codeEingeben(h); $('dFehler').textContent = f; }
}

// ---------------------------------------------------------------- Zeichnen: Farben, Sprites
// Farben immer als #rrggbb mischen (Ergebnis ist wieder #rrggbb und kann weiter gemischt werden)
const farbCache = new Map();
function rgbVon(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
function mix(a, b, t) {
  const k = a + b + ((t * 100) | 0); let v = farbCache.get(k); if (v) return v;
  const A = rgbVon(a), B = rgbVon(b);
  v = '#' + A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, '0')).join(''); farbCache.set(k, v); return v;
}
const hell = (f, t) => mix(f, '#ffffff', t), dunk = (f, t) => mix(f, '#000000', t);
const rgba = (f, a) => { const c = rgbVon(f); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };

// kleine Bild-Bausteine (weiche Lichtflecken, Wolken, Boden-Muster), einmal erzeugt und dann nur noch kopiert
const sprites = new Map();
function sprite(key, w, h, zeichner) {
  let s = sprites.get(key);
  if (!s) { s = document.createElement('canvas'); s.width = w; s.height = h; zeichner(s.getContext('2d'), w, h); sprites.set(key, s); }
  return s;
}
function leuchtSprite(f) {
  return sprite('glow' + f, 64, 64, g => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, rgba(f, 1)); r.addColorStop(0.3, rgba(f, 0.5)); r.addColorStop(0.65, rgba(f, 0.14)); r.addColorStop(1, rgba(f, 0));
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  });
}
// niedrige Grafikstufe: Lichtflecken weglassen (ausser mit immer = true)
function leuchten(c, x, y, r, f, a, immer) { if (lite && !immer) return; c.globalAlpha = a; c.drawImage(leuchtSprite(f), x - r, y - r, r * 2, r * 2); c.globalAlpha = 1; }

// ---------------------------------------------------------------- Partikel
const STAUBFARBE = {};
function staubFarbe() { const k = theme.boden[1]; return STAUBFARBE[k] || (STAUBFARBE[k] = hell(k, 0.3)); }
const KONFETTI = ['#ff4d4d', '#ffd84a', '#4fe085', '#4ab3ff', '#ff7ae0', '#ffffff'];
function neuP(p) { if (partikel.length < 420) partikel.push(p); }
// Funken: leuchtende Striche mit Schwerkraft
function funken(x, y, farbe, n, v) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = (0.4 + Math.random()) * v;
    neuP({ k: 'f', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 1, t: 0, max: 0.45 + Math.random() * 0.5, f: farbe, g: 1, r: 0.05 + Math.random() * 0.06 });
  }
}
// weiche Staubwolke
function staub(x, y, vx, gross) {
  const g = gross || 1;
  neuP({ k: 'p', x, y, vx: -vx * 0.15 + (Math.random() - 0.5) * g, vy: 0.5 + Math.random() * 0.9, t: 0, max: 0.45 + Math.random() * 0.4, f: staubFarbe(), g: -0.45, r: (0.12 + Math.random() * 0.14) * g });
}
// kleine Erdbrocken vom Hinterrad
function brocken(x, y, vx) {
  neuP({ k: 'd', x, y, vx: -Math.abs(vx) * 0.25 - Math.random() * 2, vy: 2 + Math.random() * 3, t: 0, max: 0.5 + Math.random() * 0.3, f: dunk(theme.boden[1], 0.1 + Math.random() * 0.2), g: 1, r: 0.03 + Math.random() * 0.04 });
}
function ring(x, y, farbe, r, max) { neuP({ k: 'r', x, y, vx: 0, vy: 0, t: 0, max: max || 0.45, f: farbe, g: 0, r }); }
function sterne(x, y, farbe, n, v) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = (0.3 + Math.random()) * v;
    neuP({ k: 's', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, max: 0.5 + Math.random() * 0.4, f: farbe, g: 0.2, r: 0.1 + Math.random() * 0.12, rot: Math.random() * 3 });
  }
}
function konfetti(x, y, n, v) {
  for (let i = 0; i < n; i++) {
    const a = -0.3 + Math.random() * (Math.PI + 0.6), s = (0.3 + Math.random()) * v;
    neuP({ k: 'c', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, max: 1.4 + Math.random() * 1.2, f: KONFETTI[i % KONFETTI.length], g: 0.8, r: 0.07 + Math.random() * 0.06, rot: Math.random() * 6 });
  }
}
function partikelSchritt(dt) {
  for (let i = partikel.length - 1; i >= 0; i--) {
    const p = partikel[i]; p.t += dt;
    if (p.t > p.max) { partikel.splice(i, 1); continue; }
    p.vy -= 9 * p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.k === 'p') { p.vx *= 1 - dt * 1.2; }
  }
}
function zeichnePartikel() {
  // Teil 1: deckende Teilchen
  for (const p of partikel) {
    const a = Math.max(0, 1 - p.t / p.max);
    if (p.k === 'p') leuchten(ctx, p.x, p.y, p.r * (1.2 + 2.2 * (1 - a)), p.f, 0.55 * a, true);
    else if (p.k === 'd') { ctx.globalAlpha = a; kreis(ctx, p.x, p.y, p.r, p.f); ctx.globalAlpha = 1; }
    else if (p.k === 'c') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.t * 6); ctx.scale(1, Math.cos(p.t * 9 + p.rot)); ctx.globalAlpha = Math.min(1, a * 2);
      ctx.fillStyle = p.f; ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r); ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  // Teil 2: leuchtende Teilchen (additiv gemischt)
  ctx.globalCompositeOperation = 'lighter';
  for (const p of partikel) {
    const a = Math.max(0, 1 - p.t / p.max);
    if (p.k === 'f') {
      ctx.globalAlpha = a; linie(ctx, p.x, p.y, p.x - p.vx * 0.05, p.y - p.vy * 0.05, p.r * 1.4, p.f);
      leuchten(ctx, p.x, p.y, p.r * 4, p.f, 0.45 * a);
    } else if (p.k === 's') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.t * 3); const s = p.r * (0.6 + 0.8 * a); ctx.globalAlpha = a;
      ctx.fillStyle = p.f; ctx.beginPath(); ctx.moveTo(0, s * 1.5); ctx.lineTo(s * 0.32, s * 0.32); ctx.lineTo(s * 1.5, 0); ctx.lineTo(s * 0.32, -s * 0.32); ctx.lineTo(0, -s * 1.5); ctx.lineTo(-s * 0.32, -s * 0.32); ctx.lineTo(-s * 1.5, 0); ctx.lineTo(-s * 0.32, s * 0.32); ctx.closePath(); ctx.fill(); ctx.restore();
    } else if (p.k === 'r') {
      const q = p.t / p.max; ctx.globalAlpha = a * 0.8; ctx.strokeStyle = p.f; ctx.lineWidth = 0.14 * a + 0.02;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.3 + q), 0, 7); ctx.stroke();
    }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- Zeichnen: Hilfen
function linie(c, x0, y0, x1, y1, w, f) { c.strokeStyle = f; c.lineWidth = w; c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); }
function kreis(c, x, y, r, f) { c.fillStyle = f; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
// Glied mit dunkler Kontur (Arme, Beine, Koerper)
function glied(c, x0, y0, x1, y1, w, f) { linie(c, x0, y0, x1, y1, w + 0.05, dunk(f, 0.5)); linie(c, x0, y0, x1, y1, w, f); }
// Zweigelenk-Berechnung fuer Arme und Beine
function gelenk(ax, ay, bx, by, l1, l2, seite) {
  let dx = bx - ax, dy = by - ay, d = Math.sqrt(dx * dx + dy * dy) || 1e-6;
  d = Math.min(d, l1 + l2 - 0.001);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / Math.sqrt(dx * dx + dy * dy || 1), uy = dy / Math.sqrt(dx * dx + dy * dy || 1);
  return [ax + ux * a - uy * h * seite, ay + uy * a + ux * h * seite];
}
// Rad: Stollenreifen, Felge mit Speichen, Bremsscheibe, Nabe
function rad(c, x, y, r, w, m) {
  kreis(c, x, y, r, '#121218');
  c.strokeStyle = '#2d303c'; c.lineWidth = r * 0.12; c.lineCap = 'butt'; c.setLineDash([r * 0.17, r * 0.13]); c.lineDashOffset = -w * r * 0.93;
  c.beginPath(); c.arc(x, y, r * 0.92, 0, Math.PI * 2); c.stroke(); c.setLineDash([]);
  c.strokeStyle = 'rgba(255,255,255,.16)'; c.lineWidth = r * 0.06; c.beginPath(); c.arc(x, y, r * 0.78, 2.4, 3.9); c.stroke();
  kreis(c, x, y, r * 0.66, '#e1e5f2');
  kreis(c, x, y, r * 0.58, '#262935');
  c.strokeStyle = '#c9cfe0'; c.lineWidth = r * 0.05; c.lineCap = 'round';
  c.beginPath(); for (let i = 0; i < 8; i++) { const a = w + i * Math.PI / 4; c.moveTo(x + Math.cos(a) * r * 0.16, y + Math.sin(a) * r * 0.16); c.lineTo(x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58); } c.stroke();
  c.strokeStyle = '#8a90a6'; c.lineWidth = r * 0.07; c.beginPath(); c.arc(x, y, r * 0.3, 0, 7); c.stroke();
  kreis(c, x, y, r * 0.15, m ? m.farbe : '#d4d8e6'); kreis(c, x, y, r * 0.07, '#f4f6ff');
}
// Fahrer-Kopf: Loewe mit Maehne, Ohren, Helm und Brille. (x,y) = Kopfmitte, winkel = Neigung
function helm(c, x, y, m, winkel, wind) {
  const F = m.farbe, t = zeitAnim, w = wind || 0;
  c.save(); c.translate(x, y); c.rotate(winkel);
  // Maehne: dichter Kranz hinter dem Helm, flattert im Fahrtwind
  kreis(c, -0.05, -0.02, 0.3, '#b85a14');
  const tuft = ['#d9731a', '#c4661a', '#e8892a', '#a85212'];
  for (let k = 0; k < 8; k++) {
    const a = 1.85 + k * 0.5, fl = Math.sin(t * 9 + k * 1.7) * 0.03 + w * 0.06 * (k % 3), rx = 0.17 - (k % 3) * 0.02;
    c.fillStyle = tuft[k % 4]; c.beginPath(); c.ellipse(Math.cos(a) * (0.27 + fl) - w * 0.05, Math.sin(a) * (0.26 + fl), rx, rx * 0.58, a + Math.sin(t * 7 + k) * 0.12, 0, 7); c.fill();
  }
  // Ohren schauen oben aus dem Helm
  kreis(c, -0.08, 0.2, 0.078, '#d9731a'); kreis(c, -0.08, 0.205, 0.04, '#f2a79a');
  kreis(c, 0.09, 0.19, 0.07, '#e8892a'); kreis(c, 0.09, 0.195, 0.036, '#f2a79a');
  // Helmschale mit Verlauf
  const g = c.createRadialGradient(0.07, 0.09, 0.02, 0, 0, 0.26);
  g.addColorStop(0, hell(F, 0.5)); g.addColorStop(0.45, F); g.addColorStop(1, dunk(F, 0.38));
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.235, 0, 7); c.fill();
  c.strokeStyle = dunk(F, 0.5); c.lineWidth = 0.025; c.stroke();
  // Rennstreifen
  c.fillStyle = 'rgba(255,255,255,.92)'; c.beginPath(); c.moveTo(-0.05, 0.225); c.lineTo(0.04, 0.228); c.lineTo(0.03, -0.02); c.lineTo(-0.07, -0.015); c.closePath(); c.fill();
  // Schirm
  c.fillStyle = dunk(F, 0.25); c.beginPath(); c.moveTo(0.08, 0.205); c.quadraticCurveTo(0.27, 0.19, 0.31, 0.1); c.lineTo(0.22, 0.1); c.quadraticCurveTo(0.19, 0.15, 0.1, 0.16); c.closePath(); c.fill();
  // Kinnbuegel mit Luftschlitzen
  c.fillStyle = dunk(F, 0.18); c.beginPath(); c.ellipse(0.17, -0.14, 0.085, 0.065, -0.4, 0, 7); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 0.02; c.beginPath(); c.moveTo(0.14, -0.15); c.lineTo(0.21, -0.12); c.moveTo(0.12, -0.18); c.lineTo(0.19, -0.155); c.stroke();
  // Brille mit spiegelndem Glas
  c.fillStyle = '#12142a'; c.beginPath(); c.moveTo(0.04, 0.115); c.lineTo(0.255, 0.095); c.quadraticCurveTo(0.28, -0.02, 0.235, -0.1); c.lineTo(0.07, -0.085); c.closePath(); c.fill();
  const lg = c.createLinearGradient(0.05, 0.1, 0.24, -0.08); lg.addColorStop(0, '#9fe4ff'); lg.addColorStop(0.55, '#3ea0e0'); lg.addColorStop(1, '#2a58b8');
  c.fillStyle = lg; c.beginPath(); c.moveTo(0.065, 0.09); c.lineTo(0.235, 0.075); c.quadraticCurveTo(0.255, -0.01, 0.215, -0.075); c.lineTo(0.085, -0.065); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 0.025; c.beginPath(); c.moveTo(0.09, 0.06); c.lineTo(0.15, 0.065); c.stroke();
  c.strokeStyle = '#12142a'; c.lineWidth = 0.05; c.beginPath(); c.moveTo(0.05, 0.02); c.lineTo(-0.22, 0.03); c.stroke();    // Brillenband
  c.restore();
}

// ---------------------------------------------------------------- Zeichnen: Motorrad und Fahrer
const FX0 = { gas: 0, tempo: 0, turbo: 0, licht: false };
const MOTO_NR = { flitzer: '7', huepfer: '3', bulle: '1' };
// Bein: Huefte -> Knie -> Fuss, mit Knieschuetzer und Stiefel
function bein(c, hx, hy, fx, fy, hinten, zehe) {
  const k = gelenk(hx, hy, fx, fy, 0.42, 0.46, -1), h1 = hinten ? '#1a2255' : '#2a3a8c', h2 = hinten ? '#141a45' : '#202c70';
  glied(c, hx, hy, k[0], k[1], 0.17, h1); glied(c, k[0], k[1], fx, fy, 0.15, h2);
  kreis(c, k[0], k[1], 0.095, '#aab2c8'); kreis(c, k[0], k[1], 0.06, hinten ? '#7d869e' : '#cfd5e6');
  glied(c, fx, fy, fx + (zehe === undefined ? 0.14 : zehe), fy - 0.02, 0.15, hinten ? '#17171e' : '#25252e');
  linie(c, fx - 0.02, fy + 0.04, fx + 0.04, fy + 0.07, 0.04, '#ffd84a');
}
// Loewenschwanz mit Quaste, wedelt
function schwanz(c, x, y, wind) {
  const w = Math.sin(zeitAnim * 5) * 0.1 * (0.5 + wind), ex = x - 0.78 - wind * 0.15, ey = y + 0.08 + w * 2;
  c.strokeStyle = dunk('#e8892a', 0.45); c.lineWidth = 0.1; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x - 0.3, y - 0.06 + w, x - 0.55, y + 0.16 + w * 1.6, ex, ey); c.stroke();
  c.strokeStyle = '#e8892a'; c.lineWidth = 0.065; c.stroke();
  kreis(c, ex - 0.03, ey, 0.1, '#7a3d12'); kreis(c, ex - 0.04, ey + 0.01, 0.06, '#a85a1c');
}
// Schal, der im Fahrtwind flattert
function schal(c, x, y, wind, F) {
  const t = zeitAnim, n = 6, len = 0.16 * (1 + wind * 0.8), top = [], bot = [];
  for (let i = 0; i <= n; i++) {
    const wv = Math.sin(t * 10 - i * 0.95) * (0.02 + i * 0.012) * (0.5 + wind), bw = 0.075 * (1 - i / (n + 1));
    top.push([x - i * len, y + 0.02 - i * 0.012 + wv + bw]); bot.push([x - i * len, y + 0.02 - i * 0.012 + wv - bw]);
  }
  c.fillStyle = '#ffd84a'; c.strokeStyle = dunk('#ffd84a', 0.45); c.lineWidth = 0.02; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(top[0][0], top[0][1]); for (const p of top) c.lineTo(p[0], p[1]); for (let i = n; i >= 0; i--) c.lineTo(bot[i][0], bot[i][1]); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = dunk(F, 0.1); c.beginPath(); c.moveTo(top[2][0], top[2][1]); c.lineTo(top[3][0], top[3][1]); c.lineTo(bot[3][0], bot[3][1]); c.lineTo(bot[2][0], bot[2][1]); c.closePath(); c.fill();
}
// Auspuffflamme (Gas) und Turbo-Feuerstrahl
function flamme(c, x, y, fx) {
  if (fx.gas < 0.1 && fx.turbo <= 0) return;
  const t = zeitAnim, tb = fx.turbo > 0, L = (tb ? 0.9 + fx.turbo * 0.5 : 0.16 + 0.08 * Math.sin(t * 50)) * (0.7 + 0.3 * Math.sin(t * 37));
  c.fillStyle = tb ? '#7fd6ff' : '#ff9a1f'; c.beginPath(); c.moveTo(x, y + 0.07); c.lineTo(x - L, y + 0.01); c.lineTo(x, y - 0.07); c.closePath(); c.fill();
  c.fillStyle = tb ? '#ffffff' : '#ffe45a'; c.beginPath(); c.moveTo(x, y + 0.035); c.lineTo(x - L * 0.6, y + 0.01); c.lineTo(x, y - 0.035); c.closePath(); c.fill();
}

// st = { x, y, th, rad:[a,b] }; lean: -1 (Rueckwaerts) .. 1 (Vorwaerts); fx = { gas, tempo, turbo, licht }
function zeichneMoto(c, st, m, mitFahrer, lean, fx) {
  fx = fx || FX0;
  c.save(); c.translate(st.x, st.y); c.rotate(st.th);
  const r = m.radius, ay = -0.30, hx = -0.85, vx = 0.85, F = m.farbe, D = m.dunkel, FH = hell(F, 0.4), FD = dunk(F, 0.32);
  const stil = m.id === 'huepfer' ? 1 : m.id === 'bulle' ? 2 : 0, wind = Math.min(1, fx.tempo / 22);
  c.lineJoin = 'round'; c.lineCap = 'round';
  // Scheinwerferkegel (nur Nacht-Welten), hinter dem Rad
  if (fx.licht) {
    const lg = c.createLinearGradient(0.8, 0, 6.5, 0); lg.addColorStop(0, 'rgba(255,240,170,.42)'); lg.addColorStop(1, 'rgba(255,240,170,0)');
    c.fillStyle = lg; c.beginPath(); c.moveTo(0.8, 0.43); c.lineTo(6.5, 1.5); c.lineTo(6.5, -1.5); c.lineTo(0.8, 0.37); c.closePath(); c.fill();
  }
  // Hinterrad + Schwinge + Federbein + Kette
  rad(c, hx, ay, r, st.rad[0], m);
  c.strokeStyle = dunk(F, 0.3); c.lineWidth = 0.06; c.beginPath(); c.arc(hx, ay, r + 0.06, 1.7, 2.9); c.stroke();    // Schutzblech hinten
  glied(c, hx, ay, -0.12, -0.16, 0.1, '#2b2d38'); linie(c, hx + 0.03, ay + 0.02, -0.12, -0.14, 0.03, '#6a6f86');
  kreis(c, hx, ay, 0.12, '#8a90a6'); kreis(c, hx, ay, 0.07, '#4a4f64');
  linie(c, hx, ay + 0.1, 0.08, -0.12, 0.022, '#3a3d4c'); linie(c, hx, ay - 0.1, 0.08, -0.24, 0.022, '#3a3d4c');
  {
    const ax = -0.2, ayy = 0.14, bx = -0.52, by = -0.12;
    c.strokeStyle = '#c9ccd8'; c.lineWidth = 0.05; c.beginPath(); c.moveTo(ax, ayy); c.lineTo(bx, by); c.stroke();
    c.strokeStyle = stil === 1 ? '#ffd84a' : F; c.lineWidth = 0.045; c.beginPath(); c.moveTo(ax, ayy);
    const dx = bx - ax, dy = by - ayy, ln = Math.hypot(dx, dy) || 1, nx = -dy / ln * 0.05, ny = dx / ln * 0.05;
    for (let i = 1; i <= 7; i++) { const q = i / 8, s = i % 2 ? 1 : -1; c.lineTo(ax + (bx - ax) * q + nx * s, ayy + (by - ayy) * q + ny * s); }
    c.lineTo(bx, by); c.stroke();
  }
  // Auspuff: Rohr, Endtopf, Chromkappe
  c.strokeStyle = '#7d839a'; c.lineWidth = 0.11; c.beginPath(); c.moveTo(0.18, -0.12); c.quadraticCurveTo(-0.3, -0.34, -0.82, -0.02); c.stroke();
  c.strokeStyle = '#d5d9e8'; c.lineWidth = 0.035; c.beginPath(); c.moveTo(0.16, -0.09); c.quadraticCurveTo(-0.3, -0.31, -0.8, 0.01); c.stroke();
  glied(c, -0.7, -0.02, -1.0, 0.06, 0.15, stil === 2 ? '#3c3f50' : '#5a5f70'); linie(c, -0.7, 0.03, -1.0, 0.1, 0.03, '#aeb4c8');
  kreis(c, -1.03, 0.07, 0.07, '#e1e5f2'); kreis(c, -1.03, 0.07, 0.04, '#15161c');
  flamme(c, -1.08, 0.07, fx);
  if (stil === 2) { c.strokeStyle = '#9aa0b6'; c.lineWidth = 0.07; c.beginPath(); c.moveTo(0.2, -0.2); c.quadraticCurveTo(-0.3, -0.5, -0.78, -0.18); c.stroke(); }
  // Motorblock mit Kuehlrippen und Kurbelgehaeuse
  const eb = stil === 2 ? 0.58 : 0.5;
  c.fillStyle = '#2d2f3b'; c.beginPath(); c.roundRect ? c.roundRect(-0.04, -0.3, eb + 0.02, 0.36, 0.05) : c.rect(-0.04, -0.3, eb + 0.02, 0.36); c.fill();
  c.fillStyle = '#4f5266'; for (let i = 0; i < 3; i++) c.fillRect(0.06 + i * 0.14, -0.04, 0.07, 0.17);
  c.fillStyle = '#3c3f50'; c.fillRect(0.0, 0.02, eb - 0.03, 0.06);
  kreis(c, 0.14, -0.17, 0.11, '#656a82'); kreis(c, 0.14, -0.17, 0.075, dunk(F, 0.15)); kreis(c, 0.14, -0.17, 0.035, '#d5d9e8');
  c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(-0.02, -0.28, eb, 0.04);
  // hinteres Bein (liegt hinter dem Rahmen)
  let hip = [-0.30, 0.36], a = 0.30 + lean * 0.45, dir = [Math.sin(a), Math.cos(a)];
  const sh = [hip[0] + dir[0] * 0.5, hip[1] + dir[1] * 0.5], kopf = [sh[0] + dir[0] * 0.26, sh[1] + dir[1] * 0.26];
  if (mitFahrer) bein(c, hip[0], hip[1], 0.02, -0.12, true, 0.14);
  // Karosserie: Heck + Tank in einem Stueck, mit Verlauf, Glanz und Streifen
  const kor = new Path2D();
  kor.moveTo(-0.66, 0.2); kor.lineTo(-0.12, 0.26); kor.quadraticCurveTo(0.12, 0.66, 0.42, 0.52); kor.lineTo(0.62, 0.4); kor.lineTo(0.58, 0.04); kor.lineTo(-0.22, -0.06); kor.lineTo(-0.66, 0.02); kor.closePath();
  const kg = c.createLinearGradient(0, 0.62, 0, -0.06); kg.addColorStop(0, FH); kg.addColorStop(0.35, F); kg.addColorStop(1, FD);
  c.fillStyle = kg; c.fill(kor); c.strokeStyle = dunk(D, 0.35); c.lineWidth = 0.045; c.stroke(kor);
  c.save(); c.clip(kor);
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = stil === 2 ? 0.1 : 0.06; c.lineCap = 'butt'; c.beginPath(); c.moveTo(-0.7, 0.1); c.quadraticCurveTo(0.0, 0.16, 0.7, 0.3); c.stroke();
  if (stil === 1) { c.strokeStyle = '#ffd84a'; c.lineWidth = 0.04; c.beginPath(); c.moveTo(-0.7, 0.05); c.quadraticCurveTo(0.0, 0.1, 0.7, 0.22); c.stroke(); }
  c.fillStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.moveTo(-0.04, 0.3); c.quadraticCurveTo(0.14, 0.62, 0.44, 0.5); c.lineTo(0.52, 0.45); c.quadraticCurveTo(0.17, 0.46, -0.02, 0.24); c.closePath(); c.fill();
  c.restore();
  // Startnummer-Schild an der Seite
  kreis(c, -0.4, 0.11, 0.15, '#f4f6ff'); kreis(c, -0.4, 0.11, 0.115, '#ffffff'); c.strokeStyle = FD; c.lineWidth = 0.025; c.beginPath(); c.arc(-0.4, 0.11, 0.135, 0, 7); c.stroke();
  c.save(); c.translate(-0.4, 0.062); c.scale(0.2, -0.2); c.fillStyle = '#20243a'; c.font = '800 1px "Bricolage Grotesque","Trebuchet MS",sans-serif'; c.textAlign = 'center'; c.fillText(MOTO_NR[m.id] || '1', 0, 0); c.restore();
  // Sitzbank mit Glanzkante, Rueckleuchte
  c.fillStyle = '#23232b'; c.beginPath(); c.moveTo(-0.78, 0.22); c.lineTo(-0.08, 0.3); c.lineTo(-0.08, 0.38); c.quadraticCurveTo(-0.4, 0.36, -0.74, 0.32); c.closePath(); c.fill();
  linie(c, -0.7, 0.325, -0.14, 0.372, 0.025, 'rgba(255,255,255,.28)');
  c.fillStyle = '#ff3a3a'; c.beginPath(); c.roundRect ? c.roundRect(-0.8, 0.2, 0.07, 0.1, 0.02) : c.rect(-0.8, 0.2, 0.07, 0.1); c.fill();
  leuchten(c, -0.82, 0.25, 0.28, '#ff3a3a', fx.gas > 0 ? 0.35 : 0.2);
  // Gabel: Standrohre, Federbein-Manschette, Bremssattel, Vorderrad, Schutzblech
  const gx = 0.62, gy = 0.58, mx = vx + (gx - vx) * 0.55, my = ay + (gy - ay) * 0.55;
  glied(c, vx, ay, mx, my, 0.085, '#b3b9cc'); glied(c, mx, my, gx, gy, 0.065, stil === 1 ? '#e6b83a' : '#8f96ac');
  rad(c, vx, ay, r, st.rad[1], m);
  kreis(c, vx + 0.1, ay + 0.1, 0.05, '#e8392c');
  c.strokeStyle = F; c.lineWidth = stil === 2 ? 0.12 : 0.09; c.lineCap = 'round';
  c.beginPath(); c.arc(vx, ay, r + (stil === 1 ? 0.11 : 0.07), stil === 1 ? 0.2 : 0.35, stil === 1 ? 2.2 : 2.3); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 0.025; c.beginPath(); c.arc(vx, ay, r + (stil === 1 ? 0.11 : 0.07) + 0.03, 0.9, 1.9); c.stroke();
  // Scheinwerfer (bzw. Nummerntafel beim Enduro) und Windschild
  if (stil === 1) { kreis(c, 0.76, 0.5, 0.17, '#f4f6ff'); kreis(c, 0.76, 0.5, 0.13, '#fff'); c.save(); c.translate(0.76, 0.455); c.scale(0.2, -0.2); c.fillStyle = '#20243a'; c.font = '800 1px "Bricolage Grotesque","Trebuchet MS",sans-serif'; c.textAlign = 'center'; c.fillText('3', 0, 0); c.restore(); kreis(c, 0.72, 0.34, 0.06, '#ffe27a'); }
  else {
    if (stil === 0) { c.fillStyle = 'rgba(160,225,255,.45)'; c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 0.02; c.beginPath(); c.moveTo(0.5, 0.58); c.quadraticCurveTo(0.58, 0.82, 0.7, 0.78); c.lineTo(0.7, 0.56); c.closePath(); c.fill(); c.stroke(); }
    kreis(c, 0.72, 0.42, 0.125, '#d9deec'); kreis(c, 0.74, 0.42, 0.09, '#fff1b0'); kreis(c, 0.71, 0.45, 0.03, '#ffffff');
  }
  leuchten(c, 0.76, 0.42, fx.licht ? 0.9 : 0.4, '#ffe27a', fx.licht ? 0.8 : 0.35);
  // Lenker mit Griff, Bremshebel, Spiegel
  linie(c, gx, gy, 0.52, 0.84, 0.08, '#2b2d38'); linie(c, 0.46, 0.85, 0.58, 0.83, 0.1, '#111');
  linie(c, 0.58, 0.83, 0.78, 0.8, 0.025, '#c9ccd8'); linie(c, 0.5, 0.86, 0.46, 1.0, 0.02, '#c9ccd8'); c.fillStyle = '#c9ccd8'; c.beginPath(); c.ellipse(0.45, 1.03, 0.05, 0.035, 0.3, 0, 7); c.fill();
  if (stil === 1) { linie(c, 0.5, 0.86, 0.66, 0.9, 0.05, F); }
  if (mitFahrer) {
    // vorderes Bein
    bein(c, hip[0], hip[1], 0.10, -0.10, false, 0.14);
    // Koerper: Hose, Trikot mit Streifen
    glied(c, hip[0], hip[1], hip[0] + dir[0] * 0.2, hip[1] + dir[1] * 0.2, 0.3, '#2a3a8c');
    glied(c, hip[0] + dir[0] * 0.14, hip[1] + dir[1] * 0.14, sh[0], sh[1], 0.3, F);
    linie(c, hip[0] + dir[0] * 0.22, hip[1] + dir[1] * 0.22, sh[0] - dir[0] * 0.05, sh[1] - dir[1] * 0.05, 0.07, 'rgba(255,255,255,.85)');
    // Arm: Aermel, Handschuh
    const hand = [0.52, 0.82], el = gelenk(sh[0], sh[1], hand[0], hand[1], 0.34, 0.34, 1);
    glied(c, sh[0], sh[1], el[0], el[1], 0.13, F); glied(c, el[0], el[1], hand[0], hand[1], 0.12, FD);
    linie(c, el[0] + (hand[0] - el[0]) * 0.72, el[1] + (hand[1] - el[1]) * 0.72, el[0] + (hand[0] - el[0]) * 0.78, el[1] + (hand[1] - el[1]) * 0.78, 0.13, '#f4f6ff');
    kreis(c, hand[0], hand[1], 0.085, '#1a1a22'); kreis(c, hand[0] - 0.015, hand[1] + 0.02, 0.04, '#3a3a48');
    schwanz(c, hip[0] - 0.05, hip[1] - 0.02, wind);
    schal(c, sh[0] + dir[0] * 0.1 - 0.06, sh[1] + dir[1] * 0.1, wind, F);
    helm(c, kopf[0], kopf[1], m, -0.2 + lean * 0.2, wind);
  }
  c.restore();
}

function zeichneRagdoll(c, R, m) {
  schwanz(c, R.hueft.x, R.hueft.y, 0);
  glied(c, R.hueft.x, R.hueft.y, R.brust.x, R.brust.y, 0.3, m.farbe);
  bein(c, R.hueft.x, R.hueft.y, R.fuss.x, R.fuss.y, false, 0.1);
  const e = gelenk(R.brust.x, R.brust.y, R.hand.x, R.hand.y, 0.34, 0.34, -1);
  glied(c, R.brust.x, R.brust.y, e[0], e[1], 0.13, m.farbe); glied(c, e[0], e[1], R.hand.x, R.hand.y, 0.12, dunk(m.farbe, 0.32)); kreis(c, R.hand.x, R.hand.y, 0.085, '#1a1a22');
  helm(c, R.kopf.x, R.kopf.y, m, Math.atan2(R.kopf.y - R.brust.y, R.kopf.x - R.brust.x) - Math.PI / 2, 0);
}

// ---------------------------------------------------------------- Zeichnen: Szene
function rauschen(u) { return Math.sin(u) * 0.5 + Math.sin(u * 2.3 + 1.7) * 0.3 + Math.sin(u * 5.1 + 4.2) * 0.2; }
function hash(n) { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }
const sanft = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Wolken-Bausteine: flache Unterseite, Schattenverlauf, Lichtkante
function wolkenSprite(v) {
  const th = theme;
  return sprite('wolke' + th.wolke + th.himmel[0] + v, 260, 110, g => {
    const top = hell(th.wolke, th.nacht ? 0.18 : 0.5), unten = mix(th.wolke, th.himmel[0], th.nacht ? 0.5 : 0.38);
    const gr = g.createLinearGradient(0, 18, 0, 86); gr.addColorStop(0, top); gr.addColorStop(0.5, th.wolke); gr.addColorStop(1, unten);
    g.save(); g.beginPath(); g.rect(0, 0, 260, 86); g.clip(); g.fillStyle = gr;
    for (let i = 0; i < 8; i++) {
      const u = i / 7, hump = Math.sin(u * Math.PI), cx = 34 + u * 192 + (hash(v * 9 + i) - 0.5) * 16, rr = 17 + hump * 22 + hash(v * 5 + i) * 8;
      g.beginPath(); g.arc(cx, 86 - rr * 0.8, rr, 0, 7); g.fill();
    }
    g.fillRect(24, 66, 212, 20); g.restore();
  });
}
let vignette = null;
function vignetteSprite() {
  return vignette || (vignette = sprite('vignette', 128, 72, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, h * 0.45, w / 2, h / 2, w * 0.62);
    r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,.42)'); g.fillStyle = r; g.fillRect(0, 0, w, h);
  }));
}

function zeichneHimmel(camX, t) {
  const th = theme;
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, th.himmel[0]); g.addColorStop(0.55, mix(th.himmel[0], th.himmel[1], 0.62)); g.addColorStop(1, th.himmel[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // Sterne (Nacht)
  if (th.nacht) {
    ctx.fillStyle = '#fff';
    for (let i = 0; i < 70; i++) {
      const x = ((hash(i * 2.7) * W * 1.5 - camX * cam.s * 0.01) % W + W) % W, y = hash(i * 5.3) * H * 0.55, s = 1.4 + hash(i * 9.1) * 1.4;
      ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * (0.6 + hash(i) * 2) + i));
      ctx.fillRect(x, y, s, s);
      if (i % 9 === 0) { ctx.fillRect(x - s * 1.6, y + s * 0.35, s * 4.2, s * 0.3); ctx.fillRect(x + s * 0.35, y - s * 1.6, s * 0.3, s * 4.2); }
    }
    ctx.globalAlpha = 1;
    const ph = (t % 8) / 8;           // Sternschnuppe
    if (ph < 0.07) { const q = ph / 0.07, sx0 = W * 0.18 + q * W * 0.2, sy0 = H * 0.08 + q * H * 0.12; ctx.strokeStyle = 'rgba(255,255,255,' + (1 - q) + ')'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(sx0, sy0); ctx.lineTo(sx0 - 60, sy0 - 26); ctx.stroke(); }
  }
  // Sonne bzw. Mond mit Schein und Strahlen
  const sx = W * 0.78, sy = H * 0.2, sr = Math.min(W, H) * (th.vulkan ? 0.11 : 0.07);
  const schein = th.nacht ? '#dce6ff' : th.vulkan ? '#ff8c3c' : '#fffbe0';
  leuchten(ctx, sx, sy, sr * 6, schein, th.nacht ? 0.5 : 0.65, true);
  if (!th.nacht && !lite) {
    ctx.fillStyle = rgba(schein, th.vulkan ? 0.045 : 0.055); ctx.beginPath();
    for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6 + t * 0.03; ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(a - 0.07) * sr * 14, sy + Math.sin(a - 0.07) * sr * 14); ctx.lineTo(sx + Math.cos(a + 0.07) * sr * 14, sy + Math.sin(a + 0.07) * sr * 14); }
    ctx.fill();
  }
  const sg = ctx.createRadialGradient(sx - sr * 0.25, sy - sr * 0.25, sr * 0.1, sx, sy, sr);
  sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.55, th.sonne); sg.addColorStop(1, th.nacht ? '#c9d4f0' : th.vulkan ? '#ff9a4a' : '#ffe48a');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, sy, sr, 0, 7); ctx.fill();
  if (th.nacht) { ctx.fillStyle = 'rgba(120,135,180,.32)'; for (const [dx, dy, rr] of [[-0.3, -0.2, 0.2], [0.25, 0.1, 0.26], [-0.1, 0.45, 0.14], [0.35, -0.4, 0.1]]) { ctx.beginPath(); ctx.arc(sx + dx * sr, sy + dy * sr, rr * sr, 0, 7); ctx.fill(); } }
  // Wolken (Bausteine, Parallaxe)
  ctx.globalAlpha = th.nacht ? 0.8 : 0.93;
  for (let i = 0; i < 7; i++) {
    const par = 0.04 + (i % 3) * 0.015, wx = ((hash(i * 7.3) * 1400 - camX * cam.s * par + t * (4 + i)) % 1500 + 1500) % 1500 - 260;
    const wy = H * (0.07 + hash(i * 3.1) * 0.27), bw = 120 + hash(i * 1.7) * 130;
    ctx.drawImage(wolkenSprite(i % 3), wx, wy, bw, bw * 110 / 260);
  }
  ctx.globalAlpha = 1;
  if (th.vogel) {           // Voegel
    ctx.strokeStyle = 'rgba(40,60,80,.7)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const bx = ((hash(i * 4.4) * W * 1.4 + t * (16 + i * 3) - camX * cam.s * 0.02) % (W * 1.3) + W * 1.3) % (W * 1.3) - W * 0.15, by = H * (0.2 + hash(i * 8.8) * 0.2) + Math.sin(t * 0.9 + i) * 8, fl = Math.sin(t * 7 + i * 2) * 4;
      ctx.beginPath(); ctx.moveTo(bx - 8, by - fl); ctx.quadraticCurveTo(bx - 3, by - 3, bx, by); ctx.quadraticCurveTo(bx + 3, by - 3, bx + 8, by - fl); ctx.stroke();
    }
  }
  if (th.skyline) return zeichneSkyline(camX, t);
  // Vulkan im Hintergrund: Lavastroeme, Glut im Krater, Rauchsaeule, Funken
  if (th.vulkan) {
    const vx = ((W * 0.35 - camX * cam.s * 0.03) % (W * 1.6) + W * 1.6) % (W * 1.6) - W * 0.3, vb = H * 0.66, vh = H * 0.42, vw = H * 0.55;
    leuchten(ctx, vx, vb - vh, vh * 1.1, '#ff8a2a', 0.8);
    const kg = ctx.createLinearGradient(0, vb - vh, 0, vb); kg.addColorStop(0, '#4a1a12'); kg.addColorStop(1, '#2a0c09');
    ctx.fillStyle = kg; ctx.beginPath(); ctx.moveTo(vx - vw, vb + 10); ctx.lineTo(vx - vw * 0.55, vb - vh * 0.45); ctx.lineTo(vx - vw * 0.12, vb - vh); ctx.lineTo(vx + vw * 0.12, vb - vh); ctx.lineTo(vx + vw * 0.5, vb - vh * 0.5); ctx.lineTo(vx + vw, vb + 10); ctx.closePath(); ctx.fill();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [ox, w2, ph] of [[-0.04, -0.3, 0], [0.05, 0.22, 1.4], [0, 0.06, 2.6]]) {
      ctx.beginPath(); ctx.moveTo(vx + ox * vw, vb - vh);
      for (let k = 1; k <= 5; k++) ctx.lineTo(vx + (ox + w2 * k / 5 * 0.9) * vw + Math.sin(k * 2.1 + ph) * vw * 0.025, vb - vh + vh * k / 5.2);
      ctx.strokeStyle = 'rgba(255,100,20,.35)'; ctx.lineWidth = 9; ctx.stroke(); ctx.strokeStyle = 'rgba(255,190,80,' + (0.75 + 0.2 * Math.sin(t * 3 + ph)) + ')'; ctx.lineWidth = 2.6; ctx.stroke();
    }
    ctx.strokeStyle = '#ffae3a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(vx - vw * 0.12, vb - vh); ctx.lineTo(vx + vw * 0.12, vb - vh); ctx.stroke();
    for (let i = 0; i < 5; i++) { const rr = vh * (0.14 + i * 0.05), py = vb - vh - rr - i * vh * 0.12 - (t * 6 % (vh * 0.12)); leuchten(ctx, vx + Math.sin(t * 0.3 + i) * 12 + i * 12, py, rr * 1.5, '#3a2220', 0.5 - i * 0.05); }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 12; i++) { const ph = (t * 0.55 + i * 0.37) % 1, ex = vx + (hash(i * 3.3) - 0.5) * vw * 0.5 + (hash(i * 7.1) - 0.5) * ph * vw * 0.8, ey = vb - vh - Math.sin(ph * Math.PI) * vh * (0.35 + hash(i) * 0.4) + ph * ph * vh * 0.35; leuchten(ctx, ex, ey, 3 + hash(i * 2.2) * 3, '#ffae3a', 1 - ph); }
    ctx.globalCompositeOperation = 'source-over';
  }
  // Bergketten (Parallaxe) mit Dunst, Lichtkante, Schneekappen und Silhouetten
  const gestalt = th.gestalt || ['h', 'h', 'h'];
  const ebenen = [{ par: 0.06, base: 0.62, amp: 0.20, f: 0.55, c: th.berge[0], s: 1 }, { par: 0.14, base: 0.70, amp: 0.15, f: 0.9, c: th.berge[1], s: 7 }, { par: 0.28, base: 0.80, amp: 0.10, f: 1.5, c: th.berge[2], s: 13 }];
  ebenen.forEach((e, k) => {
    const fm = gestalt[k], step = fm === 's' ? 12 : 20, ys = [];
    for (let x = 0; x <= W + step; x += step) {
      const u = (x + camX * cam.s * e.par) / 260 * e.f + e.s;
      let n = rauschen(u) * 0.5 + 0.5;
      if (fm === 's') n = Math.pow(1 - Math.abs(rauschen(u) * 0.95), 1.4);              // spitze Gipfel
      else if (fm === 'm') { const q = n * 3, fl = Math.floor(q); n = Math.min(1, (fl + sanft(q - fl, 0.72, 1)) / 3 * 1.2); }   // Tafelberge
      ys.push(H * e.base - H * e.amp * n);
    }
    const top = H * (e.base - e.amp);
    const p = new Path2D(); p.moveTo(0, H); ys.forEach((y, i) => p.lineTo(i * step, y)); p.lineTo(W + step, H); p.closePath();
    const fg = ctx.createLinearGradient(0, top, 0, H * e.base + H * 0.12); fg.addColorStop(0, e.c); fg.addColorStop(1, mix(e.c, th.himmel[1], 0.55));
    ctx.fillStyle = fg; ctx.fill(p);
    if (th.kappe && k < 2) {
      ctx.save(); ctx.clip(p); const kh = H * e.amp * (th.kappe[2] || 0.5), kg2 = ctx.createLinearGradient(0, top, 0, top + kh);
      kg2.addColorStop(0, rgba(th.kappe[0], th.kappe[1])); kg2.addColorStop(1, rgba(th.kappe[0], 0)); ctx.fillStyle = kg2; ctx.fillRect(0, top, W, kh + 4); ctx.restore();
    }
    ctx.strokeStyle = rgba(hell(e.c, 0.55), 0.55); ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.beginPath(); ys.forEach((y, i) => i ? ctx.lineTo(i * step, y) : ctx.moveTo(0, y)); ctx.stroke();
    if (th.ferndeko && k >= 1 && !(lite && k === 1)) fernDeko(e, ys, step, camX, k);
  });
}
// kleine Silhouetten auf den Bergruecken (Baeume, Kakteen, Tannen)
function fernDeko(e, ys, step, camX, k) {
  const th = theme, f = dunk(e.c, 0.16 + k * 0.05), sp = k === 1 ? 52 : 40, off = camX * cam.s * e.par;
  ctx.fillStyle = f; ctx.strokeStyle = f; ctx.lineCap = 'round';
  for (let i = Math.floor(off / sp) - 1; i < (off + W) / sp + 1; i++) {
    if (hash(i * 3.7 + k) > 0.62) continue;
    const x = i * sp + hash(i * 1.9 + k) * sp * 0.6 - off, idx = Math.round(x / step); if (idx < 0 || idx >= ys.length) continue;
    const y = ys[idx], s = (k === 1 ? 0.8 : 1.25) * (0.7 + hash(i * 2.3) * 0.7);
    if (th.ferndeko === 'baum') { ctx.fillRect(x - 1, y - 4 * s, 2, 5 * s); ctx.beginPath(); ctx.arc(x, y - 9 * s, 6 * s, 0, 7); ctx.arc(x - 4 * s, y - 6 * s, 4 * s, 0, 7); ctx.arc(x + 4 * s, y - 6.5 * s, 4.4 * s, 0, 7); ctx.fill(); }
    else if (th.ferndeko === 'tanne') { ctx.beginPath(); ctx.moveTo(x - 5 * s, y); ctx.lineTo(x, y - 13 * s); ctx.lineTo(x + 5 * s, y); ctx.moveTo(x - 4 * s, y - 6 * s); ctx.lineTo(x, y - 17 * s); ctx.lineTo(x + 4 * s, y - 6 * s); ctx.fill(); }
    else if (th.ferndeko === 'kaktus') { ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x, y - 12 * s); ctx.moveTo(x, y - 5 * s); ctx.lineTo(x - 4.5 * s, y - 5 * s); ctx.lineTo(x - 4.5 * s, y - 9 * s); ctx.moveTo(x, y - 7 * s); ctx.lineTo(x + 4 * s, y - 7 * s); ctx.lineTo(x + 4 * s, y - 10 * s); ctx.stroke(); }
  }
}

// Nachtstadt: Hochhaeuser mit Fenstern, Neonschildern und Dunst statt Bergen
function zeichneSkyline(camX, t) {
  const th = theme;
  const ebenen = [{ par: 0.05, base: 0.66, hmax: 0.42, br: 70, c: th.berge[0], s: 3 }, { par: 0.12, base: 0.76, hmax: 0.36, br: 90, c: th.berge[1], s: 11 }, { par: 0.24, base: 0.86, hmax: 0.3, br: 120, c: th.berge[2], s: 23 }];
  const neon = ['#ff4fd8', '#43f0ff', '#ffd84a'];
  ebenen.forEach((e, k) => {
    const off = camX * cam.s * e.par, i0 = Math.floor(off / e.br) - 1;
    for (let i = i0; i < i0 + W / e.br + 3; i++) {
      const x = i * e.br - off, h = H * e.hmax * (0.35 + 0.65 * hash(i * 1.3 + e.s)), w = e.br * (0.7 + hash(i * 2.1 + e.s) * 0.28), y = H * e.base - h;
      let bg = mix(e.c, '#ff4fd8', 0.06);
      if (!lite) { bg = ctx.createLinearGradient(0, y, 0, H * e.base + 20); bg.addColorStop(0, mix(e.c, '#ff4fd8', 0.1)); bg.addColorStop(1, mix(e.c, th.himmel[1], 0.4)); }
      ctx.fillStyle = bg; ctx.fillRect(x, y, w, H - y);
      ctx.fillStyle = 'rgba(120,230,255,' + (0.1 + k * 0.05) + ')'; ctx.fillRect(x, y, 2, H - y); ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(x, y, w, 2);
      const dach = hash(i * 4.7 + e.s);
      if (dach > 0.7) { ctx.fillStyle = e.c; ctx.fillRect(x + w * 0.45, y - 18, 3, 18); ctx.fillStyle = Math.sin(t * 3 + i) > 0 ? '#ff4d5a' : '#7a2030'; ctx.fillRect(x + w * 0.45 - 1, y - 20, 5, 4); }
      else if (dach < 0.25) { ctx.fillStyle = dunk(e.c, 0.2); ctx.fillRect(x + w * 0.15, y - 8, w * 0.3, 8); ctx.fillRect(x + w * 0.6, y - 5, w * 0.2, 5); }
      const fw = 4 + k * 1.5, fh = 5 + k * 1.5;
      for (let fx = x + 6; fx < x + w - fw - 4; fx += fw * 2.2) for (let fy = y + 8; fy < H * e.base + 40; fy += fh * 2.2) {
        const r = hash(fx * 0.37 + fy * 1.91 + i);
        if (r > 0.38) continue;
        ctx.fillStyle = r < 0.06 ? '#9ff3ff' : r < 0.12 ? '#ffb4ec' : '#ffe39a';
        ctx.globalAlpha = (0.35 + k * 0.15) * (r < 0.02 ? 0.55 + 0.45 * Math.sin(t * 4 + fx) : 1); ctx.fillRect(fx, fy, fw, fh);
      }
      ctx.globalAlpha = 1;
      if (k === 1 && hash(i * 6.1 + e.s) > 0.62) {          // Neon-Leuchtschild an der Hauswand
        const nc = neon[Math.floor(hash(i * 9.3) * 3)], ny = y + h * 0.22, flick = 0.8 + 0.2 * Math.sin(t * 6 + i * 3);
        leuchten(ctx, x + w * 0.5, ny + 10, w * 0.7, nc, 0.4 * flick);
        ctx.fillStyle = nc; ctx.globalAlpha = flick; ctx.fillRect(x + w * 0.2, ny, w * 0.6, 3); ctx.fillRect(x + w * 0.2, ny + 12, w * 0.35, 3); ctx.fillRect(x + w * 0.2, ny, 3, 15); ctx.globalAlpha = 1;
      }
    }
  });
  const dg = ctx.createLinearGradient(0, H * 0.55, 0, H * 0.92); dg.addColorStop(0, 'rgba(255,79,216,0)'); dg.addColorStop(1, 'rgba(255,79,216,.2)');
  ctx.fillStyle = dg; ctx.fillRect(0, H * 0.55, W, H * 0.4);
}

// ---------------------------------------------------------------- Zeichnen: Gelaende und Dekoration
// Boden-Muster je Welt: Steinchen, Wurzeln, Sandschichten, Eisrisse, Betonfugen, Lavaadern
function bodenMuster(th) {
  return sprite('tex' + th.tex, 256, 256, g => {
    const S = 256, mal = (x, y, fn) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { const X = x + dx, Y = y + dy; if (X > -50 && X < S + 50 && Y > -50 && Y < S + 50) fn(X, Y); } };
    const R = (i, n) => hash(i * 1.37 + n * 91.7 + th.tex.length * 13.3);
    const stein = (i, hellA, dunkelA, gross) => mal(R(i, 1) * S, R(i, 2) * S, (X, Y) => {
      const rr = (2 + R(i, 3) * 4) * gross; g.fillStyle = 'rgba(0,0,0,' + dunkelA + ')'; g.beginPath(); g.ellipse(X, Y, rr, rr * 0.7, R(i, 4), 0, 7); g.fill();
      g.fillStyle = 'rgba(255,255,255,' + hellA + ')'; g.beginPath(); g.ellipse(X - rr * 0.2, Y - rr * 0.25, rr * 0.7, rr * 0.45, R(i, 4), 0, 7); g.fill();
    });
    if (th.tex === 'sand') {
      for (let k = 0; k < 9; k++) { g.strokeStyle = k % 2 ? 'rgba(255,255,255,.1)' : 'rgba(90,40,0,.12)'; g.lineWidth = 2 + (k % 3); g.beginPath(); for (let x = 0; x <= S; x += 8) { const y = k * 28 + 12 + Math.sin(x / S * Math.PI * 2 * (1 + k % 2) + k) * 6; if (x) g.lineTo(x, y); else g.moveTo(x, y); } g.stroke(); }
      for (let i = 0; i < 60; i++) stein(i, 0.12, 0.12, 0.5);
    } else if (th.tex === 'eis') {
      for (let i = 0; i < 70; i++) stein(i, 0.35, 0.05, 0.6);
      g.strokeStyle = 'rgba(70,110,170,.25)'; g.lineWidth = 1.4; for (let i = 0; i < 7; i++) mal(R(i, 5) * S, R(i, 6) * S, (X, Y) => { g.beginPath(); g.moveTo(X, Y); g.lineTo(X + 14, Y + 10 * (R(i, 7) - 0.5) * 2); g.lineTo(X + 26, Y + 8 + 10 * R(i, 8)); g.stroke(); });
    } else if (th.tex === 'beton') {
      g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 2; for (let x = 0; x < S; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); } for (let y = 0; y < S; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(S, y); g.stroke(); }
      g.strokeStyle = 'rgba(255,255,255,.07)'; for (let x = 3; x < S; x += 128) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, S); g.stroke(); }
      for (let i = 0; i < 70; i++) stein(i, 0.06, 0.18, 0.35);
      for (let x = 14; x < S; x += 128) for (let y = 12; y < S; y += 64) { kreis(g, x, y, 2.4, 'rgba(0,0,0,.35)'); kreis(g, x - 0.5, y - 0.5, 1.2, 'rgba(255,255,255,.2)'); }
    } else if (th.tex === 'lava') {
      for (let i = 0; i < 50; i++) stein(i, 0.07, 0.3, 1);
      for (let i = 0; i < 6; i++) mal(R(i, 5) * S, R(i, 6) * S, (X, Y) => {
        g.lineJoin = 'round'; g.lineCap = 'round'; g.beginPath(); g.moveTo(X, Y); let px = X, py = Y; for (let k = 0; k < 4; k++) { px += 12 + R(i + k, 9) * 14; py += (R(i + k, 10) - 0.4) * 24; g.lineTo(px, py); }
        g.strokeStyle = 'rgba(255,90,10,.35)'; g.lineWidth = 6; g.stroke(); g.strokeStyle = 'rgba(255,190,70,.8)'; g.lineWidth = 1.8; g.stroke();
      });
    } else {          // Erde
      for (let i = 0; i < 90; i++) stein(i, 0.16, 0.2, 1);
      g.strokeStyle = 'rgba(40,20,5,.22)'; g.lineWidth = 2; g.lineCap = 'round'; for (let i = 0; i < 6; i++) mal(R(i, 5) * S, R(i, 6) * S, (X, Y) => { g.beginPath(); g.moveTo(X, Y); g.quadraticCurveTo(X + 10, Y + 14 + R(i, 7) * 10, X + 4 + R(i, 8) * 14, Y + 34); g.stroke(); });
    }
  });
}
const muster = new Map();
function bodenFarbe(th) {
  let p = muster.get(th.tex);
  if (!p) { p = ctx.createPattern(bodenMuster(th), 'repeat'); if (p && p.setTransform) p.setTransform(new DOMMatrix([5 / 256, 0, 0, -5 / 256, 0, 0])); muster.set(th.tex, p); }
  return p;
}

// Hilfe fuer Dekoration: Laubkugel mit Licht von rechts oben
function laub(x, y, r, f) { kreis(ctx, x, y, r, dunk(f, 0.3)); kreis(ctx, x + r * 0.05, y + r * 0.08, r * 0.9, f); kreis(ctx, x + r * 0.26, y + r * 0.3, r * 0.52, hell(f, 0.22)); kreis(ctx, x + r * 0.36, y + r * 0.42, r * 0.2, hell(f, 0.45)); }
function stamm(x, y, h, w, f) {
  ctx.fillStyle = dunk(f, 0.15); ctx.beginPath(); ctx.moveTo(x - w * 0.7, y - 0.05); ctx.lineTo(x - w * 0.4, y + h); ctx.lineTo(x + w * 0.4, y + h); ctx.lineTo(x + w * 0.7, y - 0.05); ctx.closePath(); ctx.fill();
  ctx.fillStyle = f; ctx.beginPath(); ctx.moveTo(x + w * 0.05, y - 0.05); ctx.lineTo(x + w * 0.05, y + h); ctx.lineTo(x + w * 0.4, y + h); ctx.lineTo(x + w * 0.7, y - 0.05); ctx.closePath(); ctx.fill();
}
function zeichneDeko(ter, x0, x1, t) {
  const art = theme.deko;
  // kleine Dinge dazwischen (Gras, Blumen, Steine, ...)
  if (!lite) for (let i = Math.floor(x0 / 2.5); i <= Math.ceil(x1 / 2.5); i++) {
    if (hash(i * 6.1) > 0.55) continue;
    const x = i * 2.5 + hash(i * 1.3) * 2, gy = ter.hoehe(x); if (gy !== gy) continue;
    ctx.save(); ctx.translate(x, gy); ctx.rotate(ter.winkel(x) * 0.5);
    const s = 0.7 + hash(i * 4.7) * 0.7, v = hash(i * 9.9);
    if (art === 'baum') {
      if (v < 0.5) { laub(0, 0.28 * s, 0.34 * s, '#3f9e45'); laub(0.42 * s, 0.2 * s, 0.26 * s, '#4fb455'); }
      else { for (let k = 0; k < 4; k++) { const fx = (k - 1.5) * 0.17 * s; linie(ctx, fx, 0, fx + 0.03, 0.3 * s, 0.03, '#3f8f3a'); kreis(ctx, fx + 0.03, 0.32 * s, 0.075 * s, ['#fff', '#ffd84a', '#ff7ab8', '#ff5a4d'][k]); } }
    } else if (art === 'kaktus') {
      if (v < 0.5) { ctx.fillStyle = '#9a7a52'; ctx.beginPath(); ctx.moveTo(-0.4 * s, 0); ctx.lineTo(-0.28 * s, 0.3 * s); ctx.lineTo(0.05 * s, 0.38 * s); ctx.lineTo(0.38 * s, 0.14 * s); ctx.lineTo(0.45 * s, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#c4a070'; ctx.beginPath(); ctx.moveTo(0.05 * s, 0.38 * s); ctx.lineTo(0.38 * s, 0.14 * s); ctx.lineTo(0.45 * s, 0); ctx.lineTo(0.2 * s, 0.04); ctx.closePath(); ctx.fill(); }
      else { ctx.strokeStyle = '#8a6a3c'; ctx.lineWidth = 0.035; ctx.lineCap = 'round'; ctx.beginPath(); for (let k = 0; k < 5; k++) { ctx.moveTo(0, 0.02); ctx.lineTo((k - 2) * 0.12 * s, (0.2 + (k % 2) * 0.12) * s); } ctx.stroke(); }
    } else if (art === 'tanne') {
      ctx.fillStyle = '#f4f8ff'; ctx.beginPath(); ctx.ellipse(0, 0.04, 0.38 * s, 0.2 * s, 0, 0, Math.PI, false); ctx.fill(); ctx.fillStyle = '#c9d8f0'; ctx.beginPath(); ctx.ellipse(0.12 * s, 0.03, 0.22 * s, 0.1 * s, 0, 0, Math.PI, false); ctx.fill();
    } else if (art === 'laterne') {
      if (v < 0.5) { ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(-0.14 * s, 0); ctx.lineTo(-0.05 * s, 0.4 * s); ctx.lineTo(0.05 * s, 0.4 * s); ctx.lineTo(0.14 * s, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(-0.1 * s, 0.17 * s, 0.2 * s, 0.07 * s); ctx.fillStyle = '#d9d9e4'; ctx.fillRect(-0.18 * s, -0.02, 0.36 * s, 0.05); }
      else { ctx.fillStyle = '#2a2d3e'; ctx.fillRect(-0.3 * s, 0, 0.6 * s, 0.34 * s); ctx.fillStyle = '#ffd84a'; for (let k = 0; k < 3; k++) ctx.fillRect(-0.26 * s + k * 0.2 * s, 0.1 * s, 0.1 * s, 0.1 * s); }
    } else {
      ctx.fillStyle = '#2a1d1b'; ctx.beginPath(); ctx.moveTo(-0.3 * s, 0); ctx.lineTo(-0.18 * s, 0.28 * s); ctx.lineTo(0.12 * s, 0.3 * s); ctx.lineTo(0.32 * s, 0); ctx.closePath(); ctx.fill();
      leuchten(ctx, 0, 0.1 * s, 0.5 * s, '#ff7a1a', 0.35 + 0.15 * Math.sin(t * 3 + i)); ctx.strokeStyle = '#ff8a2a'; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(-0.1 * s, 0.04); ctx.lineTo(0.02 * s, 0.17 * s); ctx.lineTo(0.14 * s, 0.1 * s); ctx.stroke();
    }
    ctx.restore();
  }
  // grosse Dekoration
  for (let i = Math.floor(x0 / 5); i <= Math.ceil(x1 / 5); i++) {
    if (hash(i * 3.3) > 0.55) continue;
    const x = i * 5 + hash(i) * 3.5, gy = ter.hoehe(x);
    if (gy !== gy) continue;
    const gr = 0.8 + hash(i * 5.1) * 0.8, v = hash(i * 8.3);
    ctx.save(); ctx.translate(x, gy - 0.15); ctx.rotate(ter.winkel(x) * 0.35);
    // weicher Standschatten
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(0.2 * gr, 0.12, 1.0 * gr, 0.14, 0, 0, 7); ctx.fill();
    if (art === 'baum') {
      if (v < 0.5) {           // Eiche
        stamm(0, 0, 1.55 * gr, 0.36 * gr, '#7a4e2a');
        laub(0, 1.95 * gr, 1.0 * gr, '#3f9e45'); laub(-0.62 * gr, 1.5 * gr, 0.62 * gr, '#4fb455'); laub(0.6 * gr, 1.58 * gr, 0.66 * gr, '#359040'); laub(-0.18 * gr, 2.55 * gr, 0.52 * gr, '#58bd5c');
      } else if (v < 0.8) {    // Pappel / Birke
        stamm(0, 0, 1.1 * gr, 0.2 * gr, '#e8e4d8'); ctx.fillStyle = '#3b3a36'; for (let k = 0; k < 3; k++) ctx.fillRect(-0.08 * gr, (0.25 + k * 0.3) * gr, 0.12 * gr, 0.05);
        for (let k = 0; k < 4; k++) laub((k % 2 - 0.5) * 0.28 * gr, (1.2 + k * 0.5) * gr, (0.62 - k * 0.08) * gr, ['#5cb85c', '#4aa84e', '#6cc766', '#3f9a47'][k]);
      } else {                 // Busch mit Beeren
        laub(-0.4 * gr, 0.45 * gr, 0.5 * gr, '#3f9e45'); laub(0.35 * gr, 0.5 * gr, 0.58 * gr, '#4fb455'); laub(0, 0.75 * gr, 0.45 * gr, '#359040');
        for (let k = 0; k < 5; k++) kreis(ctx, (k - 2) * 0.22 * gr, (0.45 + (k % 3) * 0.18) * gr, 0.06 * gr, '#ff4d5a');
      }
    } else if (art === 'kaktus') {
      const g1 = '#4f9a4a', g2 = '#6fba5e', g0 = '#2f6e36';
      if (v < 0.7) {           // Saguaro mit Rippen und Bluete
        for (const [a, b, c2, d, w] of [[0, 0, 0, 1.9, 0.34], [0, 0.8, -0.55, 0.8, 0.22], [-0.55, 0.8, -0.55, 1.4, 0.22], [0, 1.2, 0.5, 1.2, 0.22], [0.5, 1.2, 0.5, 1.75, 0.22]]) { const A = a * gr, B = b * gr, C = c2 * gr, D = d * gr; linie(ctx, A, B, C, D, w * gr + 0.05, g0); linie(ctx, A, B, C, D, w * gr, g1); linie(ctx, A + w * gr * 0.18, B, C + w * gr * 0.18, D, w * gr * 0.4, g2); }
        ctx.strokeStyle = 'rgba(20,60,30,.5)'; ctx.lineWidth = 0.025; ctx.beginPath(); for (const o of [-0.08, 0.08]) { ctx.moveTo(o * gr, 0.1); ctx.lineTo(o * gr, 1.8 * gr); } ctx.stroke();
        kreis(ctx, 0, 1.98 * gr, 0.1 * gr, '#ff6aa8'); kreis(ctx, 0, 1.98 * gr, 0.05 * gr, '#ffd84a');
        ctx.strokeStyle = '#f4f0d8'; ctx.lineWidth = 0.02; ctx.beginPath(); for (let k = 0; k < 8; k++) { const yy = (0.3 + k * 0.2) * gr; ctx.moveTo(-0.17 * gr, yy); ctx.lineTo(-0.23 * gr, yy + 0.05); ctx.moveTo(0.17 * gr, yy); ctx.lineTo(0.23 * gr, yy + 0.05); } ctx.stroke();
      } else {                 // Kugelkaktus mit Bluete
        ctx.fillStyle = g0; ctx.beginPath(); ctx.ellipse(0, 0.45 * gr, 0.5 * gr, 0.5 * gr, 0, 0, 7); ctx.fill(); ctx.fillStyle = g1; ctx.beginPath(); ctx.ellipse(0.04, 0.47 * gr, 0.44 * gr, 0.45 * gr, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = g2; ctx.lineWidth = 0.05; for (const o of [-0.22, 0, 0.22]) { ctx.beginPath(); ctx.ellipse(o * gr, 0.45 * gr, 0.1 * gr, 0.42 * gr, 0, 0, 7); ctx.stroke(); }
        kreis(ctx, 0.05 * gr, 0.95 * gr, 0.12 * gr, '#ff6aa8'); kreis(ctx, 0.05 * gr, 0.95 * gr, 0.06 * gr, '#ffd84a');
      }
    } else if (art === 'laterne') {
      if (v < 0.5) {
        const l = ctx.createLinearGradient(0, 3.4, 0, 0); l.addColorStop(0, 'rgba(255,230,150,.3)'); l.addColorStop(1, 'rgba(255,230,150,0)');
        ctx.fillStyle = l; ctx.beginPath(); ctx.moveTo(0.5, 3.35); ctx.lineTo(-1.5, 0.15); ctx.lineTo(2.5, 0.15); ctx.closePath(); ctx.fill();
        leuchten(ctx, 0.6, 3.3, 2.7, '#ffe296', 0.55);
        stamm(0, 0, 3.5, 0.2, '#262a3c'); linie(ctx, 0, 3.5, 0.55, 3.45, 0.1, '#262a3c'); ctx.fillStyle = '#262a3c'; ctx.fillRect(-0.18, -0.05, 0.36, 0.22);
        kreis(ctx, 0.6, 3.3, 0.17, '#fff6d0');
      } else if (v < 0.8) {   // Neonschild auf Mast
        const nc = hash(i * 2.1) > 0.5 ? '#ff4fd8' : '#43f0ff', fl = 0.8 + 0.2 * Math.sin(t * 7 + i);
        stamm(0, 0, 2.3, 0.14, '#262a3c'); leuchten(ctx, 0.2, 2.9, 2.1, nc, 0.45 * fl);
        ctx.fillStyle = '#12142a'; ctx.fillRect(-0.7, 2.35, 1.8, 1.1); ctx.strokeStyle = nc; ctx.lineWidth = 0.06; ctx.globalAlpha = fl; ctx.strokeRect(-0.62, 2.43, 1.64, 0.94);
        ctx.fillStyle = nc; ctx.fillRect(-0.4, 3.0, 1.2, 0.08); ctx.fillRect(-0.4, 2.75, 0.7, 0.08); ctx.globalAlpha = 1;
      } else {                // Absperrung mit Warnlicht
        ctx.fillStyle = '#2a2d3e'; ctx.fillRect(-0.6, 0.0, 0.12, 0.8); ctx.fillRect(0.5, 0.0, 0.12, 0.8);
        for (let k = 0; k < 6; k++) { ctx.fillStyle = k % 2 ? '#fff' : '#ff7a1a'; ctx.fillRect(-0.6 + k * 0.2, 0.55, 0.2, 0.25); }
        const bl = Math.sin(t * 6 + i) > 0; kreis(ctx, 0, 0.98, 0.1, bl ? '#ffd84a' : '#7a6420'); if (bl) leuchten(ctx, 0, 0.98, 0.7, '#ffd84a', 0.6);
      }
    } else if (art === 'tanne') {
      if (v < 0.7) {           // Tanne mit Schneehauben
        stamm(0, 0, 0.7, 0.26, '#5a3d27');
        for (let k = 0; k < 4; k++) {
          const yb = (0.5 + k * 0.78) * gr, w2 = (1.2 - k * 0.2) * gr, hh = 1.15 * gr;
          ctx.fillStyle = '#2a6e4c'; ctx.beginPath(); ctx.moveTo(-w2, yb); ctx.lineTo(0, yb + hh); ctx.lineTo(w2, yb); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#3a8f62'; ctx.beginPath(); ctx.moveTo(0.1 * w2, yb); ctx.lineTo(0, yb + hh); ctx.lineTo(w2, yb); ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#f4f8ff'; ctx.beginPath(); ctx.moveTo(-w2 * 0.55, yb + hh * 0.45); ctx.quadraticCurveTo(-w2 * 0.25, yb + hh * 0.34, 0, yb + hh * 0.46); ctx.quadraticCurveTo(w2 * 0.3, yb + hh * 0.32, w2 * 0.55, yb + hh * 0.45); ctx.lineTo(0, yb + hh); ctx.closePath(); ctx.fill();
        }
      } else if (v < 0.88) {   // Schneemann
        kreis(ctx, 0, 0.5, 0.5, '#dfe9f8'); kreis(ctx, 0.04, 0.54, 0.46, '#fff'); kreis(ctx, 0, 1.3, 0.38, '#dfe9f8'); kreis(ctx, 0.03, 1.33, 0.34, '#fff'); kreis(ctx, 0, 1.9, 0.28, '#dfe9f8'); kreis(ctx, 0.03, 1.92, 0.25, '#fff');
        kreis(ctx, 0.1, 1.96, 0.035, '#222'); kreis(ctx, -0.06, 1.96, 0.035, '#222'); ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(0.1, 1.88); ctx.lineTo(0.42, 1.84); ctx.lineTo(0.1, 1.84); ctx.fill();
        ctx.fillStyle = '#e8392c'; ctx.fillRect(-0.3, 1.62, 0.6, 0.1); ctx.fillStyle = '#222'; ctx.fillRect(-0.2, 2.12, 0.4, 0.1); ctx.fillRect(-0.13, 2.2, 0.26, 0.25);
        for (let k = 0; k < 3; k++) kreis(ctx, 0.03, 0.95 + k * 0.2 - 0.3 + 0.3, 0.035, '#222');
      } else {                 // Eiskristalle
        for (const [dx, hh] of [[-0.35, 0.9], [0, 1.5], [0.4, 1.1]]) { ctx.fillStyle = 'rgba(160,215,255,.85)'; ctx.beginPath(); ctx.moveTo(dx * gr - 0.16 * gr, 0); ctx.lineTo(dx * gr, hh * gr); ctx.lineTo(dx * gr + 0.18 * gr, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(dx * gr, 0); ctx.lineTo(dx * gr, hh * gr); ctx.lineTo(dx * gr + 0.18 * gr, 0); ctx.closePath(); ctx.fill(); }
        leuchten(ctx, 0, 0.8 * gr, 1.2 * gr, '#a8dcff', 0.3);
      }
    } else if (art === 'fels') {
      if (v < 0.65) {          // Fels mit glimmenden Lavaadern
        ctx.fillStyle = '#2a1d1b'; ctx.beginPath(); ctx.moveTo(-0.9 * gr, 0); ctx.lineTo(-0.6 * gr, 0.8 * gr); ctx.lineTo(0.1 * gr, 1.15 * gr); ctx.lineTo(0.8 * gr, 0.6 * gr); ctx.lineTo(1.0 * gr, 0); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#4a3430'; ctx.beginPath(); ctx.moveTo(0.1 * gr, 1.15 * gr); ctx.lineTo(0.8 * gr, 0.6 * gr); ctx.lineTo(1.0 * gr, 0); ctx.lineTo(0.3 * gr, 0.1); ctx.closePath(); ctx.fill();
        const fl = 0.75 + 0.25 * Math.sin(t * 3 + i * 2);
        ctx.strokeStyle = 'rgba(255,100,20,.4)'; ctx.lineWidth = 0.18; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-0.3 * gr, 0.1); ctx.lineTo(-0.1 * gr, 0.5 * gr); ctx.lineTo(0.25 * gr, 0.75 * gr); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,200,90,' + fl + ')'; ctx.lineWidth = 0.06; ctx.stroke(); leuchten(ctx, 0, 0.4 * gr, 1.4 * gr, '#ff7a1a', 0.3 * fl);
      } else if (v < 0.85) {   // toter Baum
        ctx.strokeStyle = '#1a1210'; ctx.lineCap = 'round'; ctx.lineWidth = 0.22; ctx.beginPath(); ctx.moveTo(0, -0.05); ctx.lineTo(0.05, 1.7 * gr); ctx.stroke();
        ctx.lineWidth = 0.1; ctx.beginPath(); ctx.moveTo(0.02, 0.9 * gr); ctx.lineTo(-0.6 * gr, 1.5 * gr); ctx.lineTo(-0.7 * gr, 1.9 * gr); ctx.moveTo(0.04, 1.3 * gr); ctx.lineTo(0.55 * gr, 1.9 * gr); ctx.moveTo(0.05, 1.7 * gr); ctx.lineTo(-0.1 * gr, 2.3 * gr); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,110,30,.5)'; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.moveTo(0.1, 0.1); ctx.lineTo(0.1, 1.0 * gr); ctx.stroke();
      } else {                 // Lavafeuer
        const fl = Math.sin(t * 9 + i) * 0.08;
        leuchten(ctx, 0, 0.6, 2.2, '#ff7a1a', 0.5);
        for (const [c2, w2, h2] of [['#c8350c', 0.5, 1.1], ['#ff7a1a', 0.36, 0.85], ['#ffd84a', 0.2, 0.5]]) { ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(-w2, 0); ctx.quadraticCurveTo(-w2 * 0.8, h2 * 0.6, fl, h2 + fl); ctx.quadraticCurveTo(w2 * 0.8, h2 * 0.5, w2, 0); ctx.closePath(); ctx.fill(); }
      }
    }
    ctx.restore();
  }
}

function zeichneGelaende(ter, x0, x1, yUnten, yOben, t) {
  const th = theme;
  const fuell = ctx.createLinearGradient(0, yOben, 0, yUnten); fuell.addColorStop(0, th.boden[1]); fuell.addColorStop(1, th.boden[2]);
  const mu = bodenFarbe(th);
  const runs = []; let run = null;
  for (let i = ter.erste(x0 - 60); i < ter.x0.length && ter.x0[i] <= x1 + 60; i++) {   // weiter Rand, damit Abgruende auch am Bildrand gefuellt werden
    const dx = ter.x1[i] - ter.x0[i]; if (dx < 1e-6) continue;
    if (!run || Math.abs(ter.x0[i] - run.ex) > 1e-4) { run = { p: [[ter.x0[i], ter.y0[i]]], ex: 0 }; runs.push(run); }
    else if (Math.abs(ter.y0[i] - run.p[run.p.length - 1][1]) > 1e-4) run.p.push([ter.x0[i], ter.y0[i]]);
    run.p.push([ter.x1[i], ter.y1[i]]); run.ex = ter.x1[i];
  }
  // Abgruende zwischen den Stuecken
  for (let k = 0; k + 1 < runs.length; k++) {
    const a = runs[k].p[runs[k].p.length - 1], b = runs[k + 1].p[0];
    if (b[0] - a[0] > 0.05) {
      const top = Math.min(a[1], b[1]), g = ctx.createLinearGradient(0, top, 0, yUnten);
      if (th.lava) {
        const ly = top - 3.2;
        g.addColorStop(0, '#2a0d08'); g.addColorStop(1, '#100404'); ctx.fillStyle = g; ctx.fillRect(a[0], ly, b[0] - a[0], top - ly);
        const gl = ctx.createLinearGradient(0, ly, 0, ly - 4); gl.addColorStop(0, '#ffcc3a'); gl.addColorStop(0.25, '#ff6a12'); gl.addColorStop(1, '#8a1404');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.moveTo(a[0], yUnten);
        for (let x = a[0]; x <= b[0] + 0.01; x += 0.5) ctx.lineTo(Math.min(x, b[0]), ly + Math.sin(x * 1.3 + zeitAnim * 2.5) * 0.12);
        ctx.lineTo(b[0], yUnten); ctx.closePath(); ctx.fill();
        const gs = ctx.createLinearGradient(0, ly, 0, ly + 3); gs.addColorStop(0, 'rgba(255,120,30,.45)'); gs.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = gs; ctx.fillRect(a[0], ly, b[0] - a[0], 3);
        // Blasen und Gluthitze ueber der Lava
        ctx.globalCompositeOperation = 'lighter';
        for (let q = 0; q < Math.ceil((b[0] - a[0]) / 2.2); q++) { const bx = a[0] + 0.8 + q * 2.2 + hash(q * 3.1 + a[0]) * 1.2, ph = (zeitAnim * 0.6 + hash(q + a[0])) % 1; if (bx < b[0]) { leuchten(ctx, bx, ly + 0.1 + ph * 1.2, 0.35 + ph * 0.3, '#ffae3a', 0.7 * (1 - ph)); } }
        leuchten(ctx, (a[0] + b[0]) / 2, ly + 0.4, Math.max(3, (b[0] - a[0]) * 0.55), '#ff6a12', 0.28);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        g.addColorStop(0, th.nacht ? '#0b0c1c' : '#2a1d3f'); g.addColorStop(1, th.nacht ? '#000' : '#0b0714');
        ctx.fillStyle = g; ctx.fillRect(a[0], yUnten, b[0] - a[0], top - yUnten);
      }
    }
  }
  for (const r of runs) {
    const p = r.p, P = new Path2D(), S = new Path2D();
    P.moveTo(p[0][0], yUnten); S.moveTo(p[0][0], p[0][1]);
    for (let i = 0; i < p.length; i++) { P.lineTo(p[i][0], p[i][1]); if (i) S.lineTo(p[i][0], p[i][1]); }
    P.lineTo(p[p.length - 1][0], yUnten); P.closePath();
    ctx.fillStyle = fuell; ctx.fill(P);
    if (mu && !lite) { ctx.fillStyle = mu; ctx.fill(P); }
    // Tiefenschatten unter der Kante, dann Rasen/Schnee/Asphalt mit Lichtkante
    ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
    const bahn = [[0.9, 'rgba(0,0,0,.16)', 1.35], [1.15, dunk(th.boden[0], 0.28), 0.575], [0.92, th.boden[0], 0.46], [0.34, th.rand, 0.17], [0.07, hell(th.rand, 0.6), 0.035]];
    for (const [w, f, o] of bahn) { ctx.save(); ctx.translate(0, -o); ctx.strokeStyle = f; ctx.lineWidth = w; ctx.stroke(S); ctx.restore(); }
    if (th.neon) { ctx.globalCompositeOperation = 'lighter'; ctx.save(); ctx.translate(0, -0.1); ctx.strokeStyle = rgba(th.rand, 0.22); ctx.lineWidth = 0.9; ctx.stroke(S); ctx.strokeStyle = rgba(th.rand, 0.5); ctx.lineWidth = 0.22; ctx.stroke(S); ctx.restore(); ctx.globalCompositeOperation = 'source-over'; }
    if (th.lava) { ctx.globalCompositeOperation = 'lighter'; ctx.save(); ctx.translate(0, -0.15); ctx.strokeStyle = 'rgba(255,100,20,' + (0.2 + 0.08 * Math.sin(t * 2)) + ')'; ctx.lineWidth = 0.8; ctx.stroke(S); ctx.restore(); ctx.globalCompositeOperation = 'source-over'; }
  }
  zeichneOberflaeche(ter, x0, x1, t);
}

// Details auf der Oberflaeche je Welt: Grashalme, Blumen, Sandrippen, Schneehaeufchen, Mittelstreifen, Glutrisse
function zeichneOberflaeche(ter, x0, x1, t) {
  const th = theme, step = 0.32, i0 = Math.floor(x0 / step), i1 = Math.ceil(x1 / step);
  if (th.tex === 'erde') {
    const A = new Path2D(), B = new Path2D(), bl = [];
    for (let i = i0; i <= i1; i++) {
      const x = i * step + hash(i * 1.7) * step, gy = ter.hoehe(x); if (gy !== gy) continue;
      const h = 0.2 + hash(i * 3.1) * 0.32, sw = Math.sin(t * 1.6 + x * 0.9) * 0.05, P = i % 2 ? A : B;
      P.moveTo(x - 0.06, gy - 0.08); P.quadraticCurveTo(x, gy + h * 0.55, x + sw + 0.01, gy + h); P.lineTo(x + 0.07, gy - 0.08); P.closePath();
      if (hash(i * 5.3) > 0.9) bl.push([x + 0.25, gy, h, i]);
    }
    ctx.fillStyle = dunk(th.rand, 0.22); ctx.fill(B); ctx.fillStyle = hell(th.rand, 0.12); ctx.fill(A);
    for (const [x, gy, h, i] of bl) { linie(ctx, x, gy, x + 0.02, gy + h + 0.12, 0.03, '#3f8f3a'); kreis(ctx, x + 0.02, gy + h + 0.15, 0.09, ['#fff', '#ffd84a', '#ff7ab8', '#ff5a4d'][i & 3]); kreis(ctx, x + 0.02, gy + h + 0.15, 0.035, '#ffb020'); }
  } else if (th.tex === 'sand') {
    ctx.strokeStyle = 'rgba(255,245,210,.5)'; ctx.lineWidth = 0.05; ctx.lineCap = 'round'; ctx.beginPath();
    for (let i = Math.floor(x0 / 1.1); i <= Math.ceil(x1 / 1.1); i++) { const x = i * 1.1 + hash(i) * 0.5, gy = ter.hoehe(x); if (gy !== gy) continue; ctx.moveTo(x, gy - 0.22); ctx.quadraticCurveTo(x + 0.25, gy - 0.3, x + 0.55, gy - 0.22); }
    ctx.stroke();
    for (let i = i0; i <= i1; i++) { const r = hash(i * 7.7); if (r < 0.88) continue; const x = i * step, gy = ter.hoehe(x); if (gy !== gy) continue; kreis(ctx, x, gy + 0.03, 0.05 + hash(i) * 0.07, '#a87a3c'); kreis(ctx, x + 0.015, gy + 0.05, 0.03, '#d8b070'); }
  } else if (th.tex === 'eis') {
    ctx.fillStyle = '#ffffff';
    for (let i = i0; i <= i1; i++) { const r = hash(i * 7.7); if (r < 0.82) continue; const x = i * step, gy = ter.hoehe(x); if (gy !== gy) continue; const s = 0.1 + hash(i * 2.2) * 0.2; ctx.beginPath(); ctx.ellipse(x, gy - 0.02, s * 1.5, s, 0, 0, Math.PI, false); ctx.fill(); }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = i0; i <= i1; i++) { if (hash(i * 4.4) < 0.9) continue; const x = i * step, gy = ter.hoehe(x); if (gy !== gy) continue; const s = 0.5 + 0.5 * Math.sin(t * 4 + i); leuchten(ctx, x, gy - 0.3 - hash(i) * 0.4, 0.22 * s + 0.05, '#c8e8ff', s); }
    ctx.globalCompositeOperation = 'source-over';
  } else if (th.tex === 'beton') {
    ctx.strokeStyle = 'rgba(255,214,74,.85)'; ctx.lineWidth = 0.09; ctx.lineCap = 'butt'; ctx.beginPath();
    for (let x = Math.floor(x0 / 1.8) * 1.8; x < x1; x += 1.8) { const ya = ter.hoehe(x), yb = ter.hoehe(x + 0.9); if (ya !== ya || yb !== yb) continue; ctx.moveTo(x, ya - 0.58); ctx.lineTo(x + 0.9, yb - 0.58); }
    ctx.stroke();
  } else if (th.tex === 'lava') {
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let i = Math.floor(x0 / 1.4); i <= Math.ceil(x1 / 1.4); i++) {
      if (hash(i * 5.9) < 0.45) continue; const x = i * 1.4 + hash(i) * 0.6, gy = ter.hoehe(x); if (gy !== gy) continue;
      const fl = 0.6 + 0.4 * Math.sin(t * 3 + i * 1.7);
      ctx.strokeStyle = 'rgba(255,100,20,' + 0.4 * fl + ')'; ctx.lineWidth = 0.14; ctx.beginPath(); ctx.moveTo(x, gy - 0.1); ctx.lineTo(x + 0.12, gy - 0.35); ctx.lineTo(x - 0.02, gy - 0.6); ctx.lineTo(x + 0.14, gy - 0.82); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,200,90,' + fl + ')'; ctx.lineWidth = 0.04; ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

function zeichneMuenzen(lf, x0, x1, t) {
  for (const m of lf.muenzen) {
    if (m.got || m.x < x0 || m.x > x1) continue;
    const ph = t * 3 + m.x * 0.7, sx = Math.abs(Math.cos(ph)), by = m.y + Math.sin(t * 2 + m.x) * 0.07;
    leuchten(ctx, m.x, by, 0.62, '#ffd84a', 0.4 + 0.15 * Math.sin(t * 4 + m.x));
    ctx.save(); ctx.translate(m.x, by); ctx.scale(Math.max(0.12, sx), 1);
    kreis(ctx, 0, 0, 0.36, '#b87a00'); kreis(ctx, 0, 0, 0.32, '#e6a800'); kreis(ctx, 0, 0, 0.27, '#ffd84a');
    ctx.strokeStyle = '#d99a00'; ctx.lineWidth = 0.035; ctx.beginPath(); ctx.arc(0, 0, 0.22, 0, 7); ctx.stroke();
    ctx.fillStyle = '#e6a800'; ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? 0.05 : 0.13; if (k) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.moveTo(-0.22, 0.14); ctx.quadraticCurveTo(-0.2, 0.26, -0.05, 0.28); ctx.quadraticCurveTo(-0.17, 0.2, -0.22, 0.14); ctx.fill();
    ctx.restore();
    const gl = (t * 1.3 + hash(m.x * 3.7)) % 1;       // Funkeln
    if (gl < 0.25) { const q = Math.sin(gl / 0.25 * Math.PI), sx2 = m.x + 0.2, sy2 = by + 0.22; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(sx2, sy2 + 0.2 * q); ctx.lineTo(sx2 + 0.04 * q, sy2 + 0.04 * q); ctx.lineTo(sx2 + 0.2 * q, sy2); ctx.lineTo(sx2 + 0.04 * q, sy2 - 0.04 * q); ctx.lineTo(sx2, sy2 - 0.2 * q); ctx.lineTo(sx2 - 0.04 * q, sy2 - 0.04 * q); ctx.lineTo(sx2 - 0.2 * q, sy2); ctx.lineTo(sx2 - 0.04 * q, sy2 + 0.04 * q); ctx.closePath(); ctx.fill(); }
  }
}

function zeichneTurbos(lf, x0, x1, t) {
  for (const p of lf.turbos) {
    if (p.x < x0 - 3 || p.x > x1 + 3) continue;
    const gy = lf.ter.hoehe(p.x); if (gy !== gy) continue;
    const w = lf.ter.winkel(p.x), an = !p.benutzt;
    ctx.save(); ctx.translate(p.x, gy); ctx.rotate(w);
    ctx.globalAlpha = an ? 1 : 0.4;
    // Sockelplatte mit Warnstreifen und Lichtpunkten
    ctx.fillStyle = '#2a2d3a'; ctx.fillRect(-1.95, -0.02, 3.9, 0.16);
    ctx.fillStyle = '#4a4f62'; ctx.fillRect(-1.95, 0.1, 3.9, 0.05);
    for (let k = 0; k < 8; k++) { ctx.fillStyle = k % 2 ? '#ffd84a' : '#222'; ctx.fillRect(-1.95 + k * 0.49, 0.0, 0.49, 0.05); }
    if (an) leuchten(ctx, 0, 0.5, 2.0, '#ffb02e', 0.28 + 0.1 * Math.sin(t * 6));
    for (let i = 0; i < 3; i++) {
      const x = -1.2 + i * 1.2, pulse = an ? (Math.sin(t * 8 - i * 1.2) * 0.5 + 0.5) : 0;
      const pf = new Path2D(); pf.moveTo(x - 0.5, 0.15); pf.lineTo(x, 0.15); pf.lineTo(x + 0.45, 0.47); pf.lineTo(x, 0.8); pf.lineTo(x - 0.5, 0.8); pf.lineTo(x - 0.05, 0.47); pf.closePath();
      const cg = ctx.createLinearGradient(0, 0.15, 0, 0.8); cg.addColorStop(0, pulse > 0.5 ? '#fff0a0' : '#ffc23a'); cg.addColorStop(1, pulse > 0.5 ? '#ffd23a' : '#ff8a1f');
      ctx.fillStyle = cg; ctx.fill(pf); ctx.strokeStyle = '#a84a00'; ctx.lineWidth = 0.05; ctx.lineJoin = 'round'; ctx.stroke(pf);
      ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.beginPath(); ctx.moveTo(x - 0.4, 0.72); ctx.lineTo(x - 0.1, 0.72); ctx.lineTo(x + 0.28, 0.47); ctx.lineTo(x + 0.18, 0.47); ctx.closePath(); ctx.fill();
      if (pulse > 0.6) leuchten(ctx, x, 0.47, 0.6, '#fff0a0', 0.5);
    }
    ctx.restore();
  }
}

function zeichneMarken(lf, x0, x1, t) {
  const ter = lf.ter;
  lf.checkpoints.forEach((cx, i) => {
    if (cx < x0 - 2 || cx > x1 + 2) return;
    const gy = ter.hoehe(cx); if (gy !== gy) return;
    const erreicht = lf.cpIndex >= i, f = erreicht ? '#3ecf6e' : '#ff5a4d';
    ctx.fillStyle = '#2a2d3a'; ctx.fillRect(cx - 0.3, gy - 0.02, 0.6, 0.12); ctx.fillStyle = '#4a4f62'; ctx.fillRect(cx - 0.22, gy + 0.08, 0.44, 0.06);
    linie(ctx, cx, gy, cx, gy + 2.7, 0.12, '#aab0c4'); linie(ctx, cx + 0.025, gy, cx + 0.025, gy + 2.7, 0.04, '#eef0f8');
    kreis(ctx, cx, gy + 2.78, 0.1, '#ffd84a');
    if (erreicht) leuchten(ctx, cx + 0.5, gy + 2.2, 1.8, '#3ecf6e', 0.35 + 0.1 * Math.sin(t * 4));
    // Fahne mit Wellen im Stoff
    ctx.fillStyle = f; ctx.strokeStyle = dunk(f, 0.35); ctx.lineWidth = 0.04; ctx.lineJoin = 'round';
    ctx.beginPath(); const n = 8;
    for (let k = 0; k <= n; k++) { const q = k / n, wv = Math.sin(t * 5 + i - q * 5) * 0.09 * q; if (k) ctx.lineTo(cx + 0.05 + q * 1.05, gy + 2.62 - q * 0.22 + wv); else ctx.moveTo(cx + 0.05, gy + 2.62); }
    for (let k = n; k >= 0; k--) { const q = k / n, wv = Math.sin(t * 5 + i - q * 5) * 0.09 * q; ctx.lineTo(cx + 0.05 + q * 1.05, gy + 2.0 + q * 0.18 + wv); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.beginPath(); ctx.moveTo(cx + 0.05, gy + 2.62); ctx.lineTo(cx + 0.7, gy + 2.5); ctx.lineTo(cx + 0.7, gy + 2.36); ctx.lineTo(cx + 0.05, gy + 2.46); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + 0.45, gy + 2.3, 0.1, 0, 7); ctx.fill();
  });
  if (!lf.endlos && lf.zielX > x0 - 3 && lf.zielX < x1 + 3) {
    const gy = ter.hoehe(lf.zielX); if (gy === gy) {
      const z = lf.zielX, hy = gy + 4.4;
      for (const px of [z, z + 4]) { ctx.fillStyle = '#2a2d3a'; ctx.fillRect(px - 0.35, gy - 0.02, 0.7, 0.14); linie(ctx, px, gy, px, hy, 0.2, '#c9cfe0'); linie(ctx, px + 0.04, gy, px + 0.04, hy, 0.06, '#fff'); kreis(ctx, px, hy + 0.15, 0.17, '#ffd84a'); }
      linie(ctx, z, hy, z + 4, hy, 0.16, '#aab0c4');
      for (let k = 0; k < 9; k++) { const on = Math.sin(t * 6 - k * 0.8) > 0; kreis(ctx, z + k * 0.5, hy - 0.18, 0.06, on ? '#ffd84a' : '#8a7020'); }
      leuchten(ctx, z + 2, hy - 0.3, 3.2, '#ffd84a', 0.18);
      for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? '#111' : '#fff'; const wv = Math.sin(t * 3 + i * 0.7) * 0.05; ctx.fillRect(z + i * 0.5, gy + 3.9 - j * 0.5 + wv, 0.5, 0.5); }
      ctx.save(); ctx.translate(z + 2, gy + 3.1); ctx.scale(0.55, -0.55); ctx.font = '800 1px "Bricolage Grotesque","Trebuchet MS",sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 0.18; ctx.strokeText('ZIEL', 0, 0); ctx.fillText('ZIEL', 0, 0); ctx.restore();
      // Zielstreifen am Boden
      for (let i = 0; i < 16; i++) { const xx = z + i * 0.25, yy = ter.hoehe(xx); if (yy !== yy) continue; ctx.fillStyle = i % 2 ? '#111' : '#fff'; ctx.fillRect(xx, yy - 0.04, 0.25, 0.1); }
    }
  }
}

// Looping, Schwebeplattformen und Seilbruecken
function zeichneExtras(lf, x0, x1) {
  const th = theme, bahn = th.bahn || '#ff8a1f';
  for (const e of lf.ter.extras) {
    if (e.xb < x0 - 2 || e.xa > x1 + 2) continue;
    if (e.art === 'schleife') {
      const fy = e.cy - e.R;
      for (const sx of [-0.55, 0.55]) { ctx.fillStyle = th.boden[2]; ctx.fillRect(e.cx + sx * e.R - 0.18, fy, 0.36, e.R * 0.9); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(e.cx + sx * e.R - 0.18, fy, 0.08, e.R * 0.9); }
      ctx.lineWidth = 0.7; ctx.strokeStyle = th.boden[2]; ctx.beginPath(); ctx.arc(e.cx, e.cy, e.R + 0.35, 0, 7); ctx.stroke();
      ctx.lineWidth = 0.18; ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.beginPath(); ctx.arc(e.cx, e.cy, e.R + 0.55, 0, 7); ctx.stroke();
      ctx.globalCompositeOperation = 'lighter'; ctx.lineWidth = 0.6; ctx.strokeStyle = rgba(bahn, 0.22); ctx.beginPath(); ctx.arc(e.cx, e.cy, e.R + 0.1, 0, 7); ctx.stroke(); ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 0.22; ctx.strokeStyle = bahn; ctx.beginPath(); ctx.arc(e.cx, e.cy, e.R + 0.1, 0, 7); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.05; ctx.setLineDash([0.4, 0.5]); ctx.lineDashOffset = -zeitAnim * 1.5; ctx.beginPath(); ctx.arc(e.cx, e.cy, e.R + 0.5, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    } else if (e.art === 'plattform') {
      const xa = e.x0 + e.ox, yt = e.y + e.oy, w = e.x1 - e.x0;
      if (e.ay) { linie(ctx, xa + 0.6, yt, xa + 0.6, yt + 30, 0.06, 'rgba(200,210,230,.5)'); linie(ctx, xa + w - 0.6, yt, xa + w - 0.6, yt + 30, 0.06, 'rgba(200,210,230,.5)'); }
      const pg = ctx.createLinearGradient(0, yt, 0, yt - e.dicke); pg.addColorStop(0, '#3a3f52'); pg.addColorStop(1, '#262a38');
      ctx.fillStyle = pg; ctx.fillRect(xa, yt - e.dicke, w, e.dicke);
      ctx.fillStyle = bahn; ctx.fillRect(xa, yt - 0.14, w, 0.14); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(xa, yt - 0.04, w, 0.04);
      ctx.fillStyle = '#ffd84a';
      for (let x = xa + 0.3; x < xa + w - 0.3; x += 0.9) { ctx.beginPath(); ctx.moveTo(x, yt - e.dicke); ctx.lineTo(x + 0.4, yt - e.dicke); ctx.lineTo(x + 0.15, yt - 0.18); ctx.lineTo(x - 0.25, yt - 0.18); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,255,255,.25)'; for (const nx of [xa + 0.15, xa + w - 0.15]) kreis(ctx, nx, yt - e.dicke / 2, 0.05, '#cfd4e4');
      if (e.ax) { ctx.fillStyle = 'rgba(255,255,255,.55)'; const d = e.vx > 0 ? 1 : -1, mx = xa + w / 2; ctx.beginPath(); ctx.moveTo(mx + d * 0.5, yt - e.dicke / 2); ctx.lineTo(mx - d * 0.2, yt - e.dicke + 0.08); ctx.lineTo(mx - d * 0.2, yt - 0.2); ctx.closePath(); ctx.fill(); }
      if (e.ay) leuchten(ctx, xa + w / 2, yt - 0.1, w * 0.6, bahn, 0.18);
    } else if (e.art === 'bruecke') {
      for (const px of [e.x0, e.x1]) { stamm(px, e.y - 0.2, 1.9, 0.2, '#6a4a2c'); kreis(ctx, px, e.y + 1.7, 0.14, '#3c2716'); }
      ctx.strokeStyle = '#c9a26b'; ctx.lineWidth = 0.07; ctx.beginPath();
      for (let x = e.x0; x <= e.x1 + 0.01; x += 0.5) { const y = e.hoeheBei(Math.min(x, e.x1)) + 1.0 + 0.7 * (1 - Math.sin(Math.PI * (x - e.x0) / (e.x1 - e.x0))); if (x === e.x0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
      for (let x = e.x0 + 0.3; x < e.x1; x += 0.62) {
        const y = e.hoeheBei(x), w = Math.atan2(e.hoeheBei(Math.min(e.x1, x + 0.2)) - e.hoeheBei(Math.max(e.x0, x - 0.2)), 0.4);
        const yr = e.hoeheBei(x) + 1.0 + 0.7 * (1 - Math.sin(Math.PI * (x - e.x0) / (e.x1 - e.x0)));
        if (Math.round((x - e.x0) / 0.62) % 3 === 0) linie(ctx, x, y, x, yr, 0.04, '#c9a26b');
        ctx.save(); ctx.translate(x, y); ctx.rotate(w); ctx.fillStyle = '#8a5a30'; ctx.fillRect(-0.27, -0.2, 0.54, 0.2); ctx.fillStyle = '#a8703c'; ctx.fillRect(-0.27, -0.06, 0.54, 0.06); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-0.27, -0.2, 0.54, 0.03); ctx.restore();
      }
    }
  }
}

// Ghost: halb durchsichtiges Motorrad mit Namen
function zeichneGhost(lf) {
  if (!ghost || lf !== lauf) return;
  const p = L.ghostLage(ghost, lauf.zeit); if (!p) return;
  const m = L.MOTOS[ghost.moto] || L.MOTOS[0], a = zeitAnim * 8;
  ctx.globalAlpha = 0.42;
  zeichneMoto(ctx, { x: p.x, y: p.y, th: p.th, rad: [-a, -a] }, m, true, 0);
  ctx.globalAlpha = 1;
  ctx.save(); ctx.translate(p.x, p.y + 1.9); ctx.scale(1 / cam.s, -1 / cam.s);
  ctx.font = '700 13px "Bricolage Grotesque","Trebuchet MS",sans-serif'; ctx.textAlign = 'center';
  const gt = '👻 ' + (ghost.name || 'Ghost'), gw = ctx.measureText(gt).width + 16;
  ctx.fillStyle = 'rgba(10,18,40,.62)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-gw / 2, -15, gw, 22, 11); else ctx.rect(-gw / 2, -15, gw, 22); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(gt, 0, 0); ctx.restore();
}

// Wetter: Schnee (Welt 3), Sandstaub (Welt 2) und Glut (Welt 5) im Bildschirmraum
const flocken = []; for (let i = 0; i < 90; i++) flocken.push({ x: Math.random(), y: Math.random(), z: Math.random() });
function zeichneWetter(dt, dCam) {
  const art = theme.wetter; if (!art) return;
  ctx.fillStyle = art === 'schnee' ? '#fff' : art === 'glut' ? '#ffae3a' : 'rgba(255,240,200,.7)';
  for (const f of flocken) {
    f.x += (art === 'schnee' ? -0.02 : art === 'glut' ? -0.04 : -0.35) * dt * (0.5 + f.z) - dCam * (0.4 + f.z) / W;
    f.y += (art === 'schnee' ? 0.06 + f.z * 0.08 : art === 'glut' ? -0.05 - f.z * 0.06 : 0.01) * dt;
    if (f.x < 0) f.x += 1; if (f.x > 1) f.x -= 1; if (f.y > 1) f.y -= 1; if (f.y < 0) f.y += 1;
    if (art === 'schnee') { const r = 1.2 + f.z * 2.2; ctx.globalAlpha = 0.5 + 0.5 * f.z; ctx.beginPath(); ctx.arc(f.x * W + Math.sin(zeitAnim * 1.2 + f.z * 30) * 6, f.y * H, r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    else if (art === 'glut') { ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(zeitAnim * 3 + f.z * 20)); const r = 1.5 + f.z * 2; ctx.fillRect(f.x * W, f.y * H, r, r); leuchten(ctx, f.x * W + r / 2, f.y * H + r / 2, r * 3.5, '#ff9a2a', 0.5); ctx.globalAlpha = 1; }
    else ctx.fillRect(f.x * W, f.y * H, 4 + f.z * 8, 1.2);
  }
  ctx.globalAlpha = 1;
}

let letzteCamX = 0, zeitAnim = 0, turboT = 0;
function zeichne(alpha, dt) {
  zeitAnim += dt; turboT = Math.max(0, turboT - dt);
  const lf = lauf || demo; if (!lf) return;
  const b = lf.b;
  // interpolierte Lage fuer Kamera und Motorrad
  let dth = b.th - vorher.th; dth -= Math.PI * 2 * Math.round(dth / (Math.PI * 2));
  const ix = vorher.x + (b.x - vorher.x) * alpha, iy = vorher.y + (b.y - vorher.y) * alpha, ith = vorher.th + dth * alpha;
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
  zeichneDeko(lf.ter, x0, x1, zeitAnim);
  zeichneExtras(lf, x0, x1);
  zeichneGelaende(lf.ter, x0, x1, yUnten, yOben, zeitAnim);
  zeichneTurbos(lf, x0, x1, zeitAnim);
  zeichneMarken(lf, x0, x1, zeitAnim);
  zeichneMuenzen(lf, x0, x1, zeitAnim);

  zeichneGhost(lf);
  // weicher Schatten unter dem Motorrad, schrumpft mit der Hoehe
  if (gy === gy && hoeheUeber < 8) {
    const q = Math.max(0, 1 - hoeheUeber / 8);
    ctx.save(); ctx.translate(ix, gy + 0.02); ctx.rotate(lf.ter.winkel(ix)); ctx.globalAlpha = 0.32 * q; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(0, 0, 1.25 + 0.5 * (1 - q), 0.15, 0, 0, 7); ctx.fill(); ctx.restore();
  }
  // Motorrad und Fahrer
  const moto = lf.moto, eing = lf === lauf ? eingabe() : null;
  const lean = lf.status === 'abgestuerzt' ? 0 : (lf.leanAnim = (lf.leanAnim || 0) + ((eing ? -(eing.rot) * 0.9 + (eing.gas ? -0.15 : 0.1) : 0) - (lf.leanAnim || 0)) * Math.min(1, dt * 8));
  const fahrt = lf.status === 'fahrt';
  fxLauf.gas = fahrt && (eing ? eing.gas : lf === demo) ? 1 : 0; fxLauf.tempo = tempo; fxLauf.turbo = lf === lauf ? turboT : 0; fxLauf.licht = !!theme.licht;
  zeichneMoto(ctx, { x: ix, y: iy, th: ith, rad: lf.rad }, moto, lf.fahrer, lean || 0, fxLauf);
  if (lf.ragdoll) zeichneRagdoll(ctx, lf.ragdoll, moto);

  // Staub und Erdbrocken an den Reifen, Landungswolke
  const kont = lf.kontakt[0] || lf.kontakt[1];
  if ((lf === lauf || lf === demo) && fahrt) {
    const c = Math.cos(b.th), sn = Math.sin(b.th);
    if (kont && Math.abs(b.vx) > 3 && Math.random() < dt * 40) staub(b.x + c * -L.RAD_X + sn * (L.ACHSE + moto.radius), b.y + sn * -L.RAD_X - c * (L.ACHSE + moto.radius), b.vx);
    if (kont && fxLauf.gas && Math.abs(b.vx) > 4 && Math.random() < dt * 14) brocken(b.x + c * -L.RAD_X + sn * (L.ACHSE + moto.radius * 0.8), b.y + sn * -L.RAD_X - c * (L.ACHSE + moto.radius * 0.8), b.vx);
    if (!kont) lf._luft = (lf._luft || 0) + dt;
    else {
      if ((lf._luft || 0) > 0.35 && !lf._k0) {
        const n = Math.min(9, 3 + Math.round(lf._luft * 4));
        for (let i = 0; i < n; i++) staub(b.x + (Math.random() - 0.5) * 2, b.y - L.ACHSE - moto.radius, i % 2 ? 6 : -6, 1.5);
        ring(b.x, b.y - L.ACHSE - moto.radius, staubFarbe(), 1.2, 0.4);
      }
      lf._luft = 0;
    }
    lf._k0 = kont;
  }
  zeichnePartikel();

  // Tempolinien am Bildschirmrand, dann weiche Vignette
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (lf === lauf && tempo > 15 && lf.status === 'fahrt') {
    ctx.strokeStyle = 'rgba(255,255,255,' + Math.min(0.4, (tempo - 15) / 30).toFixed(2) + ')'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (let i = 0; i < 14; i++) {
      const y = hash(i * 9.7 + Math.floor(zeitAnim * 14)) * H, x = hash(i * 4.1 + Math.floor(zeitAnim * 14) * 0.3) * W, len = 40 + hash(i) * 90;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - len, y); ctx.stroke();
    }
  }
  if (!lite) { ctx.globalAlpha = theme.nacht ? 0.9 : 0.6; ctx.drawImage(vignetteSprite(), 0, 0, W, H); ctx.globalAlpha = 1; }
}
const fxLauf = { gas: 0, tempo: 0, turbo: 0, licht: false };

// ---------------------------------------------------------------- HUD
let hudCache = {};
function setzeText(id, v) { if (hudCache[id] !== v) { hudCache[id] = v; $(id).textContent = v; } }
function aktualisiereHud(erzwingen) {
  if (!lauf) return;
  if (erzwingen) hudCache = {};
  setzeText('hMuenzen', lauf.muenzenZahl);
  setzeText('hPunkte', lauf.punkte + ' P');
  const k = lauf.kombo;
  setzeText('kombo', k && k.mult >= 1 ? 'KOMBO ×' + k.mult + ' · ' + k.punkte : '');
  $('kombo').style.setProperty('--rest', k ? Math.max(0, k.timer / 2.2).toFixed(2) : 0);
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
  if (!grafikFest && !lite && modus === 'spiel' && !document.hidden) { langsamZ = dt > 0.036 ? langsamZ + 1 : Math.max(0, langsamZ - 2); if (langsamZ > 90) lite = true; }
  vorwaerts(dt, zeit);
}
// ein 60-Hz-Bild der Fahrt, dabei die Fahrt fuer den Ghost aufzeichnen
function bildSchritt(inp) {
  vorher.x = lauf.b.x; vorher.y = lauf.b.y; vorher.th = lauf.b.th;
  lauf.schritt(inp);
  if (lauf.status === 'fahrt' && lauf.zeit >= naechsteProbe) { aufnahme.push([lauf.b.x, lauf.b.y, lauf.b.th]); naechsteProbe += 1 / L.GHOST_HZ; }
  ereignisse();
}
function vorwaerts(dt, zeit) {
  if (modus === 'spiel' && lauf) {
    acc += dt;
    while (acc >= 1 / 60) {
      bildSchritt(eingabe());
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
  } else if ((modus === 'pause' || modus === 'zaehlt') && lauf) {
    zeichne(acc * 60, 0);
  }
  garageZeichnen(zeit);
}
function zeigeEnde() {
  if (olympia) { modus = 'pause'; pausiert = true; return olympEnde(); }
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

// ---------------------------------------------------------------- Olympiade
// Mit ?olymp=<Ticket> ist das Spiel eine Disziplin der Swimming-Lions-Olympiade: ein Versuch auf der Strecke, die aus der
// Lauf-Kennung entsteht (für alle gleich), mit dem Flitzer. Der Server rechnet die Punkte aus den gemeldeten Rohwerten (wertung.js).
const olympia = (() => {
  let ticket = null;
  try { ticket = new URLSearchParams(location.search).get('olymp'); if (ticket) sessionStorage.setItem('schanzenloewe-olymp', ticket); else ticket = sessionStorage.getItem('schanzenloewe-olymp'); } catch (e) { /* ohne Speicher */ }
  if (!ticket) return null;
  let info;
  try { info = JSON.parse(decodeURIComponent(escape(atob(ticket.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))))); } catch (e) { return null; }
  if (!info || typeof info.l !== 'string' || typeof info.s !== 'string') return null;
  try { history.replaceState(null, '', location.pathname); } catch (e) { /* egal */ }
  const c = info.c || {};
  return { ticket, info, stufe: c.stufe === 0 || c.stufe === 2 ? c.stufe : 1, key: 'schanzenloewe-olymp-' + info.l + ':' + info.s };
})();
function olympMerke(wert) { try { if (wert === null) localStorage.removeItem(olympia.key); else localStorage.setItem(olympia.key, wert); } catch (e) { /* egal */ } }
function olympStand() { try { return localStorage.getItem(olympia.key); } catch (e) { return null; } }
function zurOlympiade() { try { sessionStorage.removeItem('schanzenloewe-olymp'); } catch (e) { /* egal */ } location.href = /^https?:\/\//.test(olympia.info.z || '') ? olympia.info.z : '/'; }
function olympKarte(o) {
  const i = olympia.info;
  $('oKarte').dataset.art = o.art;
  $('oKopf').textContent = '🏅 ' + (i.ti || 'Olympiade') + (i.nr ? ' · Disziplin ' + i.nr + (i.von ? '/' + i.von : '') : '');
  $('oTitel').textContent = o.titel;
  $('oText').innerHTML = o.text || '';
  $('oWert').hidden = o.wert === undefined; $('oWert').textContent = o.wert === undefined ? '' : o.wert;
  $('oListe').innerHTML = (o.zeilen || []).map(z => '<div class="ziel' + (z[2] ? ' ok' : '') + '"><span class="st">' + (z[2] ? '★' : '☆') + '</span>' + z[0] + '<span class="r">' + z[1] + '</span></div>').join('');
  const st = $('oStart'); st.hidden = !o.knopf; if (o.knopf) { st.textContent = o.knopf; st.onclick = o.tun; st.className = 'knopf ' + (o.knopfArt || ''); }
  $('oZurueck').onclick = zurOlympiade; $('oZurueck').hidden = !o.zurueck;
  zeige('sOlymp');
}
function olympPost(inhalt) {
  return fetch('/api/olymp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ ticket: olympia.ticket }, inhalt)) })
    .then(r => r.json().then(d => ({ status: r.status, d })));
}
function olympIntro() {
  const i = olympia.info, stand = olympStand();
  if (stand === 'gestartet') return olympMelden({ ziel: false, weg: 0, zeit: 0, muenzen: 0, tricks: 0 }, 'Dein Versuch wurde unterbrochen (die Seite wurde neu geladen).');
  if (stand === 'gespielt') return olympKarte({ art: 'ergebnis', titel: 'Schon gewertet', text: 'Du hast deinen Versuch schon gespielt. Die Wertung siehst du in der Olympiade.', zurueck: true });
  if (stand && stand[0] === '{') { try { const g = JSON.parse(stand); return olympKarte({ art: 'ergebnis', titel: 'Schon gewertet', wert: g.punkte.toLocaleString('de-DE') + ' Punkte', text: 'Du hast deinen Versuch schon gespielt. Die Wertung siehst du in der Olympiade.<br>' + esc(g.text), zurueck: true }); } catch (e) { /* weiter */ } }
  olympKarte({ art: 'intro', titel: 'Schanzenlöwe',
    text: 'Hallo <b>' + esc(i.n || 'Spieler') + '</b>! Alle fahren dieselbe Strecke mit dem Flitzer. <b>Ein Versuch:</b> ein Sturz beendet die Fahrt, Neuladen auch. Punkte gibt es für Strecke, Ziel, Zeit, Münzen und Tricks.',
    zeilen: [['Strecke', 'für alle gleich', true], ['Stufe', STUFEN[olympia.stufe], true]], knopf: '▶ Los geht’s', tun: olympStart, zurueck: true });
}
function olympStart() {
  olympMerke('gestartet');
  const d = L.olympLevel(olympia.info.l);
  starteDef(d, { moto: L.MOTOS[0], schwer: olympia.stufe });
  modus = 'zaehlt';
  const z = $('zaehler'); z.classList.add('an');
  const schritte = ['3', '2', '1', 'LOS!'];
  schritte.forEach((t, k) => setTimeout(() => {
    z.innerHTML = '<span>' + t + '</span>';
    if (k === schritte.length - 1) { modus = 'spiel'; setTimeout(() => { z.classList.remove('an'); z.innerHTML = ''; }, 800); }
  }, k * 900));
}
async function olympMelden(werte, vorText) {
  olympKarte({ art: 'ergebnis', titel: werte.ziel ? 'Geschafft!' : 'Fahrt beendet', text: (vorText ? vorText + '<br>' : '') + 'Wird gewertet …', zeilen: olympZeilen(werte) });
  for (let versuch = 0; versuch < 4; versuch++) {
    try {
      const r = await olympPost({ art: 'ergebnis', werte });
      const d = r.d;
      if (d.punkte !== undefined && (r.status === 200 || r.status === 409)) {
        if (r.status === 200) olympMerke(JSON.stringify({ punkte: d.punkte, text: d.text }));
        olympKarte({ art: 'ergebnis', titel: werte.ziel ? 'Geschafft!' : 'Fahrt beendet', wert: d.punkte.toLocaleString('de-DE') + ' Punkte',
          text: (vorText ? vorText + '<br>' : '') + (r.status === 200 ? 'Eingetragen. Zurück zur Olympiade, dort siehst du die Wertung.' : 'Dein Versuch war schon gewertet.'), zeilen: olympZeilen(werte), zurueck: true });
        if (werte.ziel) konfetti($('oKarte'));
        return;
      }
      if (r.status === 403 || r.status === 400) return olympKarte({ art: 'fehler', titel: 'Nicht gewertet', text: esc(d.fehler || 'Die Meldung wurde abgelehnt.'), zurueck: true });
    } catch (e) { /* nochmal */ }
    await new Promise(ok => setTimeout(ok, 2000 * (versuch + 1)));
  }
  olympKarte({ art: 'fehler', titel: 'Keine Verbindung', text: 'Dein Ergebnis konnte nicht gemeldet werden. Versuch es noch einmal oder sag der Leitung Bescheid.', zeilen: olympZeilen(werte), knopf: '↻ Nochmal melden', tun: () => olympMelden(werte, vorText), zurueck: true });
}
function olympZeilen(w) {
  return [[w.ziel ? 'Ziel erreicht' : 'Strecke', w.ziel ? zeitText(w.zeit) : Math.round(w.weg) + ' m', !!w.ziel], ['Münzen', w.muenzen, w.muenzen > 0], ['Trickpunkte', w.tricks, w.tricks > 0]];
}
let aufgeben = false;
function olympAufgebenReset() { aufgeben = false; $('pMenue').textContent = '🏳 Aufgeben'; $('pMenue').classList.remove('gefahr'); $('pMenue').classList.add('zweit'); }
function olympEnde() {
  const w = { ziel: lauf.status === 'ziel', weg: lauf.distanz, zeit: lauf.zeit, muenzen: lauf.muenzenZahl, tricks: lauf.punkte };
  hud(false);
  olympMelden(w);
}
if (olympia) {
  document.body.classList.add('olymp');
  $('pNeu').style.display = 'none';
  olympAufgebenReset();
  $('pMenue').onclick = () => {
    if (!aufgeben) { aufgeben = true; $('pMenue').textContent = 'Wirklich aufgeben?'; $('pMenue').classList.add('gefahr'); $('pMenue').classList.remove('zweit'); return; }
    olympEnde();
  };
  $('bTages').onclick = null;
  fetch('/api/olymp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ticket: olympia.ticket, art: 'da' }) })
    .then(r => r.json()).then(d => { if (d && d.schonGespielt && !olympStand() && modus === 'menue') { olympMerke('gespielt'); olympIntro(); } }).catch(() => {});
  neueDemo(); modus = 'menue';
  olympIntro();
}

aktualisiereMuenzen();
requestAnimationFrame(t => { letzte = t; schleife(t); });
linkCode();
window.addEventListener('hashchange', linkCode);

// Test- und Entwicklungshilfen
window.schanzenloewe = {
  get lauf() { return lauf; }, get save() { return save; }, L, THEMEN,
  start: starteLevel, starteDef, menue: zumMenue, editor: oeffneEditor, code: codeAusfuehren, get ghost() { return ghost; }, get aufnahme() { return aufnahme; },
  // Simuliert sek Sekunden mit Autopilot (Browser-Tab im Hintergrund pausiert requestAnimationFrame)
  sim(sek, opt) { if (!lauf) return null; for (let i = 0; i < sek * 60 && lauf.status !== 'abgestuerzt' && lauf.status !== 'ziel'; i++) bildSchritt(L.autopilot(lauf, opt || {})); return { status: lauf.status, x: lauf.b.x, flips: lauf.flips, muenzen: lauf.muenzenZahl, punkte: lauf.punkte }; },
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
