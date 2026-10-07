'use strict';
// Schanzenloewe - Spiellogik: Physik, Gelaende, Level, Autopilot.
// Reine Logik ohne Browser-Zugriff (UMD), deshalb auch in Node testbar. Y zeigt nach oben, Einheit = Meter.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logik = factory();
})(typeof self !== 'undefined' ? self : this, function () {

const G = 11.5;            // Schwerkraft (etwas kraeftiger als echt, wirkt knackiger)
const DT = 1 / 480;        // Physik-Teilschritt
const SUB = 8;             // Teilschritte pro 60-Hz-Bild
// Schwierigkeit 0/1/2 (leicht/normal/schwer): Luecken-Faktor und steilster Hang (tan) bei Huegeln
const LUECKEN_F = [0.5, 0.72, 0.92], STEIL_MAX = [0.5, 0.6, 0.7], HILFE = [1, 0.6, 0];
const WAND = 30;           // Tiefe der senkrechten Waende an Gelaende-Enden
const ZWEI_PI = Math.PI * 2;

// Fahrzeug-Geometrie im Koerperkoordinatensystem (Ursprung = Schwerpunkt)
const RAD_X = 0.85, ACHSE = 0.30, TRAEGHEIT = 1.3;
const KOPF = { x: 0.12, y: 1.05, r: 0.22 };
const BRUST = { x: -0.10, y: 0.62, r: 0.28 };
// Federung der Reifen
const FED_K = 1700, DAEMPF_ZU = 100, DAEMPF_WEG = 40, FED_MAX = 2600;

const MOTOS = [
  { id: 'flitzer', name: 'Flitzer', preis: 0,   leistung: 10.5, vmax: 23, luft: 10,  boden: 5.5, grip: 1.35, radius: 0.40, farbe: '#e8452c', dunkel: '#a82a18', info: 'Der Allrounder: kann alles ein bisschen.' },
  { id: 'huepfer', name: 'Hüpfer',  preis: 180, leistung: 9.6, vmax: 21.5, luft: 14.5, boden: 6.5, grip: 1.25, radius: 0.36, farbe: '#2fb5a4', dunkel: '#1c7d70', info: 'Leicht und wendig: dreht in der Luft am schnellsten, perfekt für Flips.' },
  { id: 'bulle',   name: 'Bulle',   preis: 420, leistung: 13, vmax: 26, luft: 7.8,  boden: 4.5, grip: 1.6, radius: 0.46, farbe: '#8a4bd1', dunkel: '#5a2d8e', info: 'Schwer und stark: klettert fast überall hoch und ist am schnellsten.' }
];

function rng(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const klemme = (v, a, b) => v < a ? a : v > b ? b : v;

// ---------------------------------------------------------------- Gelaende
// Liste von Strecken (Segmenten), nach x sortiert. Nach oben zeigende Normale = (-dy, dx) / len.
// Luecken sind einfach "keine Segmente"; Enden bekommen senkrechte Waende.
class Gelaende {
  constructor() { this.x0 = []; this.y0 = []; this.x1 = []; this.y1 = []; }
  add(x0, y0, x1, y1) { this.x0.push(x0); this.y0.push(y0); this.x1.push(x1); this.y1.push(y1); }
  erste(x) {
    let lo = 0, hi = this.x1.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.x1[m] < x) lo = m + 1; else hi = m; }
    return lo;
  }
  // Hoehe der Oberflaeche bei x, NaN in Luecken
  hoehe(x) {
    for (let i = this.erste(x); i < this.x0.length && this.x0[i] <= x; i++) {
      const dx = this.x1[i] - this.x0[i];
      if (dx > 1e-6 && x >= this.x0[i] && x <= this.x1[i]) return this.y0[i] + (this.y1[i] - this.y0[i]) * ((x - this.x0[i]) / dx);
    }
    return NaN;
  }
  // Steigungswinkel bei x (0 in Luecken)
  winkel(x) {
    const a = this.hoehe(x - 0.3), b = this.hoehe(x + 0.3);
    if (a !== a || b !== b) return 0;
    return Math.atan2(b - a, 0.6);
  }
  tiefstes(xa, xb) {
    let m = Infinity;
    for (let i = this.erste(xa); i < this.x0.length && this.x0[i] <= xb; i++) { if (this.y0[i] < m) m = this.y0[i]; if (this.y1[i] < m) m = this.y1[i]; }
    return m;
  }
  // Tiefste Durchdringung des Kreises (cx,cy,r); Ergebnis in out {d,nx,ny}
  kreis(cx, cy, r, out) {
    let bestD = 0, bnx = 0, bny = 1, treffer = false;
    const r2 = r * r;
    for (let i = this.erste(cx - r); i < this.x0.length && this.x0[i] <= cx + r; i++) {
      const x0 = this.x0[i], y0 = this.y0[i], dx = this.x1[i] - x0, dy = this.y1[i] - y0;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-9) continue;
      let t = ((cx - x0) * dx + (cy - y0) * dy) / len2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = cx - (x0 + t * dx), ey = cy - (y0 + t * dy);
      const d2 = ex * ex + ey * ey;
      if (d2 >= r2) continue;
      const len = Math.sqrt(len2), dist = Math.sqrt(d2);
      const side = (cx - x0) * (-dy) + (cy - y0) * dx;   // >0: Kreismitte liegt ueber der Strecke
      let nx, ny, d;
      if (side < 0 && t > 0 && t < 1) { nx = -dy / len; ny = dx / len; d = r + dist; }   // Mitte steckt im Boden (nur bei Treffer mitten auf der Strecke)
      else if (dist > 1e-6) { nx = ex / dist; ny = ey / dist; d = r - dist; }
      else { nx = -dy / len; ny = dx / len; d = r; }
      if (d > bestD) { bestD = d; bnx = nx; bny = ny; treffer = true; }
    }
    if (treffer) { out.d = bestD; out.nx = bnx; out.ny = bny; }
    return treffer;
  }
}

// ---------------------------------------------------------------- Baukasten fuer Strecken
class Bauer {
  constructor(ter, zufall, x, y, schwer) {
    this.schwer = schwer || 0; this.lf = LUECKEN_F[this.schwer]; this.sm = STEIL_MAX[this.schwer];
    this.ter = ter; this.z = zufall; this.x = x; this.y = y;
    this.offen = false; this.muenzen = []; this.turbos = []; this.checkpoints = []; this.zielX = 0;
    this.von = x; this.bis = x;
  }
  _beginne() { if (!this.offen) { this.ter.add(this.x, this.y - WAND, this.x, this.y); this.offen = true; } }
  _pkt(x, y) { this._beginne(); this.ter.add(this.x, this.y, x, y); this.x = x; this.y = y; }
  _ende() { if (this.offen) { this.ter.add(this.x, this.y, this.x, this.y - WAND); this.offen = false; } }
  _kurve(len, f, art) {
    this.von = this.x;
    const x0 = this.x, y0 = this.y, n = Math.max(2, Math.ceil(len / 0.6));
    let st = 0, vy = y0;
    for (let i = 1; i <= n; i++) { const t = i / n, y = y0 + f(t); st = Math.max(st, Math.abs(y - vy) / (len / n)); vy = y; this._pkt(x0 + len * t, y); }
    if (art !== 'rampe' && art !== 'landung') this.steilste = Math.max(this.steilste || 0, st);
    if (st > (this.steilWert || 0) && art !== 'rampe' && art !== 'landung') { this.steilWert = st; this.steilX = x0; }
    this.bis = this.x;
  }
  flach(len) { this.von = this.x; this._pkt(this.x + len, this.y); this.bis = this.x; return this; }
  lin(len, dy) { this.von = this.x; this._pkt(this.x + len, this.y + dy); this.bis = this.x; return this; }
  glatt(len, dy) { len = Math.max(len, Math.abs(dy) * Math.PI / (2 * this.sm)); this._kurve(len, t => dy * (1 - Math.cos(Math.PI * t)) / 2); return this; }
  huegel(len, h) { len = Math.max(len, h * Math.PI / this.sm); this._kurve(len, t => h * (1 - Math.cos(ZWEI_PI * t)) / 2); return this; }
  wellen(n, wl, h) { for (let i = 0; i < n; i++) this.huegel(wl, h); return this; }
  // Schanze: gekruemmter Anstieg, endet abrupt an der Kante
  rampe(len, h, p) { p = p || 1.5; if (this.offen) this.turbos.push({ x: this.x - 3.5, benutzt: false }); this._kurve(len, t => h * Math.pow(t, p), 'rampe'); return this; }
  // Landehang: erst steil, dann flach auslaufend
  landung(len, h) { this._kurve(len, t => -h * (1 - (1 - t) * (1 - t)), 'landung'); return this; }
  // senkrechte Stufe nach unten (oder oben bei negativem Wert)
  abfall(drop) { this._pkt(this.x, this.y - drop); return this; }
  luecke(len, dy) { this._ende(); this.x += len * this.lf; this.y += (dy || 0); return this; }
  checkpoint() { this.checkpoints.push(this.x); return this; }
  zielHier() { this.zielX = this.x; return this; }
  schluss() { this._ende(); return this; }
  // Muenzen in einer Reihe ueber dem zuletzt gebauten Stueck
  reihe(n, h) {
    h = h || 1.4;
    const a = this.von + 1, b = this.bis - 1;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? (a + b) / 2 : a + (b - a) * i / (n - 1);
      const gy = this.ter.hoehe(x);
      if (gy === gy) this.muenzen.push({ x, y: gy + h, got: false });
    }
    return this;
  }
  // Muenzbogen in der Luft ab der aktuellen Kante
  bogen(n, len, hoch, yRel) {
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      this.muenzen.push({ x: this.x + 1 + len * t, y: this.y + (yRel === undefined ? 2.2 : yRel) + hoch * 4 * t * (1 - t), got: false });
    }
    return this;
  }
}

// ---------------------------------------------------------------- Level
const WELTEN = [
  { id: 'wiese', name: 'Sonnenwiese' },
  { id: 'wueste', name: 'Dünenpiste' },
  { id: 'schnee', name: 'Winterberg' }
];

const LEVELS = [
  // ---- Welt 1: Sonnenwiese
  { id: '1-1', welt: 0, name: 'Warmfahren', flips: 1, bau(b) {
    b.flach(16); b.huegel(18, 1.2); b.reihe(5); b.flach(6);
    b.huegel(22, 2.0); b.reihe(6); b.flach(8);
    b.rampe(6.5, 1.8); b.bogen(4, 7, 1.4); b.luecke(5, -0.5); b.landung(14, 1.3); b.flach(8); b.checkpoint();
    b.wellen(4, 11, 1.1); b.reihe(6); b.flach(8);
    b.rampe(7, 2.0); b.bogen(5, 9, 1.8); b.luecke(7, -1.0); b.landung(16, 1.8); b.reihe(4);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  { id: '1-2', welt: 0, name: 'Hügelland', flips: 1, bau(b) {
    b.flach(14); b.huegel(24, 2.6); b.reihe(6); b.glatt(16, 1.5); b.huegel(18, 2.0); b.reihe(5);
    b.flach(6); b.rampe(7, 2.2); b.bogen(5, 9, 1.8); b.luecke(8, -1.0); b.landung(16, 1.8); b.flach(6); b.checkpoint();
    b.wellen(3, 14, 2.2); b.reihe(8); b.glatt(14, -2.5); b.flach(10);
    b.rampe(7.5, 2.4); b.bogen(6, 10, 2.2); b.luecke(9, -1.2); b.landung(18, 2.2); b.flach(6);
    b.huegel(28, 3.0); b.reihe(8); b.checkpoint(); b.flach(8);
    b.rampe(7, 2.2); b.bogen(5, 9, 2); b.luecke(8, -1.5); b.landung(18, 2.2);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  { id: '1-3', welt: 0, name: 'Schanzenpark', flips: 2, bau(b) {
    b.flach(20);
    for (let i = 0; i < 3; i++) { b.rampe(6.5, 2.0 + i * 0.3); b.bogen(4, 8 + i, 1.8 + i * 0.4, 2.2); b.luecke(6 + i * 1.5, -1.2); b.landung(14, 1.6 + i * 0.3); b.reihe(3); b.flach(12); }
    b.checkpoint();
    b.huegel(18, 2.0); b.glatt(14, 2.0); b.flach(18);
    b.rampe(8, 3.0); b.bogen(6, 12, 3, 2.6); b.luecke(11, -2.0); b.landung(20, 3.0); b.flach(14); b.checkpoint();
    b.wellen(5, 10, 1.4); b.reihe(10); b.flach(10);
    b.rampe(8, 3.2); b.bogen(6, 12, 3.2, 2.6); b.luecke(12, -2.0); b.landung(20, 3.2);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  { id: '1-4', welt: 0, name: 'Kuppelritt', flips: 2, bau(b) {
    b.flach(12); b.glatt(20, 3.5); b.huegel(20, 2.4); b.reihe(6); b.glatt(20, -3.0); b.flach(6);
    b.rampe(8, 3.0); b.bogen(6, 12, 3.2, 2.6); b.luecke(12, -2.4); b.landung(20, 3.0); b.flach(6); b.checkpoint();
    b.glatt(24, 4.0); b.huegel(16, 1.6); b.reihe(5); b.glatt(18, -4.0); b.flach(6);
    b.rampe(8, 3.2); b.bogen(7, 14, 3.6, 2.8); b.luecke(14, -2.4); b.landung(22, 3.4); b.checkpoint(); b.flach(6);
    b.wellen(4, 12, 2.4); b.reihe(10); b.flach(16);
    b.rampe(8.5, 3.4); b.bogen(7, 14, 3.6, 3); b.luecke(13, -3.0); b.landung(22, 3.6); b.flach(16);
    b.rampe(8.5, 3.4); b.bogen(7, 15, 4, 3); b.luecke(14, -2.8); b.landung(24, 3.6);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  // ---- Welt 2: Duenenpiste
  { id: '2-1', welt: 1, name: 'Sandsturm', flips: 2, bau(b) {
    b.flach(14); b.wellen(4, 18, 2.2); b.reihe(10); b.flach(6);
    b.rampe(7, 2.4); b.bogen(5, 10, 2, 2.2); b.luecke(9, -1.2); b.landung(18, 2.0); b.flach(6); b.checkpoint();
    b.wellen(3, 24, 3.2); b.reihe(8); b.flach(6);
    b.rampe(8, 3.0); b.bogen(6, 12, 3, 2.6); b.luecke(12, -2.0); b.landung(20, 3.0); b.flach(8);
    b.huegel(30, 3.6); b.reihe(8); b.flach(8);
    b.rampe(8, 3.0); b.bogen(6, 12, 3, 2.6); b.luecke(13, -2.2); b.landung(20, 3.2);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  { id: '2-2', welt: 1, name: 'Canyon-Sprung', flips: 2, bau(b) {
    b.flach(14); b.glatt(18, 2.0); b.flach(8);
    b.rampe(8, 3.0); b.bogen(6, 12, 3.2, 2.6); b.luecke(12, -2.2); b.landung(20, 3.0); b.flach(8); b.checkpoint();
    b.huegel(22, 2.4); b.reihe(6); b.flach(6);
    b.rampe(8.5, 3.4); b.bogen(7, 14, 3.6, 3); b.luecke(13, -2.8); b.landung(22, 3.4); b.flach(8);
    b.glatt(20, 3.0); b.flach(6); b.checkpoint();
    b.rampe(8.5, 3.4); b.bogen(7, 15, 4, 3); b.luecke(14, -3.0); b.landung(24, 3.6); b.reihe(5); b.flach(8);
    b.wellen(3, 14, 2.8); b.reihe(8);
    b.rampe(9, 3.8); b.bogen(8, 16, 4.2, 3.2); b.luecke(15, -3.2); b.landung(26, 4.0);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  { id: '2-3', welt: 1, name: 'Fata Morgana', flips: 3, bau(b) {
    b.flach(12); b.wellen(5, 14, 2.4); b.reihe(12); b.flach(6);
    for (let i = 0; i < 4; i++) { b.rampe(7.5, 2.8 + i * 0.3); b.bogen(5, 9 + i, 2 + i * 0.4, 2.4); b.luecke(8 + i * 1.5, -1.6); b.landung(16, 2.4 + i * 0.3); b.flach(12); if (i === 1) b.checkpoint(); }
    b.glatt(26, 4.0); b.huegel(18, 2.0); b.reihe(6); b.glatt(22, -4.0); b.flach(8); b.checkpoint();
    b.rampe(9, 4.0); b.bogen(8, 16, 4.4, 3.2); b.luecke(18, -3.2); b.landung(26, 4.0);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  { id: '2-4', welt: 1, name: 'Vulkan-Rampe', flips: 3, bau(b) {
    b.flach(12); b.glatt(24, 4.0); b.reihe(6); b.huegel(20, 2.4); b.flach(6);
    b.rampe(9, 4.0); b.bogen(8, 15, 4, 3.4); b.luecke(15, -3.0); b.landung(24, 3.8); b.flach(8); b.checkpoint();
    b.wellen(4, 16, 3.0); b.reihe(10); b.flach(6);
    b.rampe(9, 4.0); b.bogen(8, 16, 4.4, 3.4); b.luecke(16, -3.4); b.landung(26, 4.2); b.flach(6);
    b.glatt(24, 5.0); b.flach(6); b.checkpoint();
    b.rampe(9.5, 4.4); b.bogen(8, 17, 4.8, 3.6); b.luecke(17, -3.6); b.landung(28, 4.6); b.reihe(5); b.flach(8);
    b.rampe(9.5, 4.4); b.bogen(8, 18, 5, 3.6); b.luecke(18, -3.8); b.landung(30, 4.6);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  // ---- Welt 3: Winterberg
  { id: '3-1', welt: 2, name: 'Schneeschmelze', flips: 2, bau(b) {
    b.flach(12); b.glatt(30, -5.0); b.reihe(8); b.flach(8);
    b.rampe(8, 3.0); b.bogen(6, 12, 3, 2.6); b.luecke(12, -1.8); b.landung(22, 3.2); b.flach(8); b.checkpoint();
    b.glatt(24, 3.0); b.huegel(20, 2.4); b.reihe(6); b.glatt(24, -4.0); b.flach(6);
    b.rampe(8.5, 3.4); b.bogen(7, 14, 3.6, 3); b.luecke(14, -2.6); b.landung(24, 3.6); b.flach(8);
    b.wellen(3, 16, 2.8); b.reihe(8); b.flach(6);
    b.rampe(8.5, 3.4); b.bogen(7, 14, 3.6, 3); b.luecke(15, -2.8); b.landung(24, 3.8);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  { id: '3-2', welt: 2, name: 'Eisbahn', flips: 3, bau(b) {
    b.flach(12); b.glatt(34, -6.0); b.flach(6);
    b.rampe(9, 4.0); b.bogen(8, 15, 4, 3.4); b.luecke(14, -2.8); b.landung(26, 4.0); b.flach(8); b.checkpoint();
    b.glatt(20, 2.4); b.wellen(3, 14, 2.6); b.reihe(8); b.flach(6);
    b.rampe(9, 4.0); b.bogen(8, 16, 4.4, 3.4); b.luecke(15, -3.2); b.landung(26, 4.2); b.flach(8);
    b.glatt(30, -5.0); b.flach(6); b.checkpoint();
    b.rampe(9.5, 4.4); b.bogen(8, 17, 4.8, 3.6); b.luecke(16, -3.4); b.landung(28, 4.6); b.reihe(5);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  { id: '3-3', welt: 2, name: 'Lawine', flips: 3, bau(b) {
    b.flach(12); b.glatt(36, -7.0); b.reihe(8); b.flach(4);
    b.rampe(9, 4.2); b.bogen(8, 17, 4.4, 3.4); b.luecke(18, -3.6); b.landung(28, 4.4); b.flach(6); b.checkpoint();
    b.glatt(22, 3.0); b.huegel(24, 3.2); b.reihe(8); b.glatt(24, -3.0); b.flach(6);
    b.rampe(9.5, 4.4); b.bogen(8, 18, 4.8, 3.6); b.luecke(20, -4.0); b.landung(30, 4.6); b.flach(6); b.checkpoint();
    b.wellen(4, 16, 3.0); b.reihe(10);
    b.glatt(30, -6.0); b.flach(4);
    b.rampe(10, 4.8); b.bogen(9, 19, 5.2, 3.8); b.luecke(21, -4.4); b.landung(32, 5.0);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  { id: '3-4', welt: 2, name: 'Gipfelsturm', flips: 4, bau(b) {
    b.flach(12); b.glatt(34, 5.0); b.huegel(22, 2.6); b.reihe(6); b.glatt(34, -6.0); b.flach(4);
    b.rampe(9.5, 4.4); b.bogen(8, 18, 4.8, 3.6); b.luecke(16, -3.8); b.landung(30, 4.6); b.flach(6); b.checkpoint();
    b.wellen(4, 14, 3.0); b.reihe(10); b.flach(6);
    b.rampe(10, 4.8); b.bogen(9, 19, 5.2, 3.8); b.luecke(17, -3.8); b.landung(32, 5.0); b.flach(6);
    b.glatt(30, 6.0); b.flach(6); b.checkpoint();
    b.rampe(10, 4.8); b.bogen(9, 20, 5.4, 3.8); b.luecke(18, -4.0); b.landung(34, 5.2); b.reihe(5); b.flach(6);
    b.rampe(10, 4.8); b.bogen(9, 21, 5.6, 4); b.luecke(18, -4.2); b.landung(36, 5.4);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } }
];

// Endlos-Modus: Strecke wird beim Fahren nachgebaut, die Schwierigkeit waechst mit der Entfernung
function endlosStueck(b) {
  const z = b.z, d = Math.min(1.3, b.x / 1800 + b.schwer * 0.2);
  if (b.y > 7) { b.glatt(20 + z() * 10, -(3 + z() * 3)); return; }
  if (b.y < -6) { b.glatt(20 + z() * 10, 3 + z() * 3); return; }
  const w = z();
  if (w < 0.18) { b.flach(5 + z() * 6); b.reihe(3); }
  else if (w < 0.38) { b.huegel(12 + z() * 12, 0.8 + z() * (1.2 + 2 * d)); b.reihe(4); }
  else if (w < 0.52) { b.wellen(3, 9 + z() * 5, 0.8 + z() * (1 + 1.6 * d)); b.reihe(6); }
  else if (w < 0.82) {
    const h = 1.8 + z() * 1.2 + d * 1.6;
    b.flach(4 + z() * 3); b.rampe(6.5 + h, h); b.bogen(5, 8 + d * 8, 1.6 + d * 2.4, 2.2);
    b.luecke(5 + z() * 3 + d * 8, -1 - z());
    b.landung(14 + h * 2, h * 0.9 + 0.6);
  } else if (w < 0.92) {
    b.rampe(7, 2.4); b.abfall(2 + z() * 2 + d * 2); b.flach(6 + z() * 4);
  } else { b.glatt(14 + z() * 8, (z() < 0.5 ? -1 : 1) * (1.5 + z() * 2)); b.reihe(4); }
}
const ENDLOS = { id: 'endlos', welt: 0, name: 'Endlos', endlos: true, flips: 0, seed: 7 };

// ---------------------------------------------------------------- Lauf (eine Fahrt)
const K = { d: 0, nx: 0, ny: 1 };

class Lauf {
  constructor(def, moto, seed, schwer) {
    this.def = def; this.moto = moto; this.endlos = !!def.endlos; this.schwer = schwer || 0;
    this.flipZiel = (def.flips || 0) + (this.schwer === 2 && def.flips ? 1 : 0);
    this.hilfe = HILFE[this.schwer];
    this.ter = new Gelaende();
    this.z = rng(seed || def.seed || 1);
    this.bauer = new Bauer(this.ter, this.z, 0, 0, this.schwer);
    if (this.endlos) {
      this.bauer.flach(30);
      while (this.bauer.x < 300) endlosStueck(this.bauer);
      this.zielX = Infinity;
    } else {
      def.bau(this.bauer);
      this.zielX = this.bauer.zielX;
    }
    this.muenzen = this.bauer.muenzen;
    this.turbos = this.bauer.turbos;
    // Schwer: nur jeder zweite Checkpoint (der erste faellt weg)
    if (this.schwer === 2) this.bauer.checkpoints = this.bauer.checkpoints.filter((_, i) => i % 2 === 1);
    this.checkpoints = this.bauer.checkpoints;
    this.ereignisse = [];
    this.snapshot = null;
    this.neustart();
  }

  platziere(x) {
    const m = this.moto, gy = this.ter.hoehe(x);
    this.b = { x, y: gy + ACHSE + m.radius + 0.02, th: this.ter.winkel(x), vx: 0, vy: 0, w: 0 };
    this.rad = [0, 0];                // Drehwinkel der Raeder (nur Optik)
    this.radW = 0;                    // Drehgeschwindigkeit Hinterrad
    this.lean = 0;                    // Fahrer-Neigung fuer die Optik
    this.kontakt = [false, false];
    this.luftZeit = 0; this.luftWinkel = 0; this.offeneFlips = 0; this.flipTimer = 0; this.offeneFlipArt = 0;
    this.fahrer = true; this.ragdoll = null;
    this.grace = 0.25;
  }

  neustart() {
    this.platziere(3);
    this.status = 'bereit';           // bereit | fahrt | abgestuerzt | ziel
    this.zeit = 0; this.flips = 0; this.muenzenZahl = 0; this.versuche = 1;
    for (const m of this.muenzen) m.got = false;
    for (const t of this.turbos) t.benutzt = false;
    this.cpIndex = -1; this.snapshot = null; this.cpWartet = -1;
    this.crashGrund = ''; this.tAbgestuerzt = 0;
    this.maxX = 3;
    this.ereignisse.length = 0;
  }

  vomCheckpoint() {
    if (!this.snapshot) return this.neustart();
    const s = this.snapshot;
    this.platziere(s.x);
    this.status = 'bereit';
    this.flips = s.flips; this.muenzenZahl = s.muenzen; this.zeit = this.zeit; // Zeit laeuft weiter
    for (let i = 0; i < this.muenzen.length; i++) this.muenzen[i].got = s.got[i];
    this.cpIndex = s.index; this.cpWartet = -1;
    for (const t of this.turbos) t.benutzt = t.x < s.x;
    this.crashGrund = ''; this.tAbgestuerzt = 0;
    this.versuche++;
    this.ereignisse.length = 0;
  }

  neueFlips(n, art) {
    this.flips += n;
    this.muenzenZahl += 5 * n;
    this.ereignisse.push({ t: 'flip', n, art });
  }

  // Ein 60-Hz-Bild. inp = { gas: 0..1, bremse: 0..1, rot: -1..1 } (rot > 0: Nase hoch)
  schritt(inp) {
    if (this.status === 'bereit' && (inp.gas > 0 || inp.bremse > 0)) this.status = 'fahrt';
    for (let i = 0; i < SUB; i++) this._teil(inp, DT);
    this._nachBild(inp);
  }

  _teil(inp, dt) {
    const m = this.moto, b = this.b, ter = this.ter;
    const lebt = this.status !== 'abgestuerzt';
    const aktiv = this.status === 'fahrt' || this.status === 'bereit';
    const gas = aktiv ? klemme(inp.gas, 0, 1) : 0;
    let bremse = aktiv ? klemme(inp.bremse, 0, 1) : (this.status === 'ziel' ? 0.6 : 0);
    const rot = aktiv ? klemme(inp.rot, -1, 1) : 0;
    const c = Math.cos(b.th), s = Math.sin(b.th);
    let ax = 0, ay = -G, al = 0, am = 0;
    this.kontakt[0] = this.kontakt[1] = false;
    for (let i = 0; i < 2; i++) {
      const lx = i === 0 ? -RAD_X : RAD_X, ly = -ACHSE;
      const rx = c * lx - s * ly, ry = s * lx + c * ly;
      if (!ter.kreis(b.x + rx, b.y + ry, m.radius, K)) continue;
      this.kontakt[i] = true;
      am++;
      const nx = K.nx, ny = K.ny;
      const pvx = b.vx - b.w * ry, pvy = b.vy + b.w * rx;
      const vn = pvx * nx + pvy * ny;
      let fn = FED_K * K.d - (vn < 0 ? DAEMPF_ZU : DAEMPF_WEG) * vn;
      fn = klemme(fn, 0, FED_MAX);
      let fx = fn * nx, fy = fn * ny;
      if (ny > 0.3) {
        const tx = ny, ty = -nx;
        const vt = pvx * tx + pvy * ty;
        let ft = 0;
        if (i === 0 && gas > 0) ft += gas * m.leistung * Math.max(0, 1 - Math.pow(Math.max(0, vt) / m.vmax, 2.5));
        if (bremse > 0) {
          if (vt > 0.5) ft -= bremse * 6.5 * Math.min(1, vt / 1.5);
          else if (i === 0) ft -= bremse * 0.45 * m.leistung * Math.max(0, 1 + vt / 6);
        }
        ft -= vt * 0.05;
        const lim = m.grip * fn;
        ft = klemme(ft, -lim, lim);
        fx += ft * tx; fy += ft * ty;
      }
      ax += fx; ay += fy;
      al += (rx * fy - ry * fx) / TRAEGHEIT;
    }
    const luft = am === 0;
    if (lebt) al += rot * (luft ? m.luft : m.boden);
    if (luft && lebt) al += (gas - bremse) * 2.6;
    al -= b.w * (luft ? (Math.abs(rot) > 0.01 || !lebt ? 0.35 : 2.2) : 0.9);
    if (luft && lebt && Math.abs(rot) < 0.01 && this.hilfe > 0 && this.landeW !== undefined) {
      // Landehilfe: ohne Eingabe richtet sich das Motorrad sanft nach dem Landehang aus (kuerzester Weg)
      let dw = this.landeW - b.th; dw -= ZWEI_PI * Math.round(dw / ZWEI_PI);
      al += this.hilfe * klemme(7 * dw, -7, 7);
    }
    b.vx += ax * dt; b.vy += ay * dt; b.w = klemme(b.w + al * dt, -9, 9);
    b.x += b.vx * dt; b.y += b.vy * dt; b.th += b.w * dt;
  }

  _nachBild() {
    const b = this.b, m = this.moto, dt = SUB * DT;
    if (this.grace > 0) this.grace -= dt;
    const luft = !this.kontakt[0] && !this.kontakt[1];
    // Optik: Raeder und Fahrer
    const vt = b.vx * Math.cos(b.th) + b.vy * Math.sin(b.th);
    if (this.kontakt[0] || this.kontakt[1]) this.radW += (-vt / m.radius - this.radW) * 0.5;
    else this.radW *= 0.995;
    this.rad[0] += this.radW * dt; this.rad[1] += (this.kontakt[1] ? -vt / m.radius : this.radW * 0.6) * dt;
    if (this.status !== 'abgestuerzt') this.zeit += this.status === 'fahrt' ? dt : 0;

    if (this.status === 'abgestuerzt') {
      this.tAbgestuerzt += dt;
      if (this.ragdoll) this._ragdollSchritt();
      return;
    }
    if (this.b.x > this.maxX) this.maxX = this.b.x;

    // Flips: Drehung in der Luft aufsummieren
    if (luft) this.landeW = this.landeWinkel();
    if (luft) {
      this.luftZeit += dt; this.luftWinkel += b.w * dt;
    } else {
      if (this.luftZeit > 1.0 && this.status === 'fahrt') {
        const n = Math.floor((this.luftZeit - 0.8) * 5); this.muenzenZahl += n; this.ereignisse.push({ t: 'luft', s: this.luftZeit, n });
      }
      if (this.luftZeit > 0.3) {
        const n = Math.floor(Math.abs(this.luftWinkel) / ZWEI_PI + 0.28);
        if (n > 0) { this.offeneFlips += n; this.offeneFlipArt = this.luftWinkel > 0 ? 1 : -1; this.flipTimer = 0.45; }
      }
      this.luftZeit = 0; this.luftWinkel = 0;
    }
    if (this.offeneFlips > 0 && !luft) {
      this.flipTimer -= dt;
      if (this.flipTimer <= 0) { this.neueFlips(this.offeneFlips, this.offeneFlipArt); this.offeneFlips = 0; }
    }

    // Turbo-Streifen: kurzer Schub nach vorn, wenn man ueberfaehrt
    if (this.status === 'fahrt') for (const t of this.turbos) {
      if (t.benutzt || Math.abs(t.x - b.x) > 1.6) continue;
      if (!(this.kontakt[0] || this.kontakt[1])) continue;
      t.benutzt = true;
      const c = Math.cos(b.th), sn = Math.sin(b.th);
      b.vx += c * 7; b.vy += sn * 7;
      this.ereignisse.push({ t: 'turbo', x: t.x });
    }

    // Muenzen
    const pts = this._beruehrPunkte();
    for (const mu of this.muenzen) {
      if (mu.got) continue;
      if (Math.abs(mu.x - b.x) > 3) continue;
      for (const p of pts) {
        const dx = mu.x - p[0], dy = mu.y - p[1];
        if (dx * dx + dy * dy < p[2] * p[2]) { mu.got = true; this.muenzenZahl++; this.ereignisse.push({ t: 'muenze', x: mu.x, y: mu.y }); break; }
      }
    }

    // Checkpoints: Stand erst speichern, wenn das Motorrad sicher am Boden steht
    if (!this.endlos) {
      const naechster = this.cpIndex + 1;
      if (naechster < this.checkpoints.length && b.x >= this.checkpoints[naechster] && this.cpWartet < 0) this.cpWartet = naechster;
      if (this.cpWartet >= 0 && this.kontakt[0] && this.kontakt[1] && Math.abs(b.th) < 0.5 && this.luftZeit === 0 && this.offeneFlips === 0) {
        this.cpIndex = this.cpWartet; this.cpWartet = -1;
        this.snapshot = { x: b.x, flips: this.flips, muenzen: this.muenzenZahl, got: this.muenzen.map(mu => mu.got), index: this.cpIndex };
        this.ereignisse.push({ t: 'checkpoint' });
      }
    }

    // Ziel
    if (!this.endlos && b.x >= this.zielX && this.status === 'fahrt') {
      this.status = 'ziel';
      if (this.offeneFlips > 0) { this.neueFlips(this.offeneFlips, this.offeneFlipArt); this.offeneFlips = 0; }
      this.ereignisse.push({ t: 'ziel' });
    }

    // Absturz: Kopf oder Brust beruehrt den Boden, oder runtergefallen
    if (this.status === 'fahrt' && this.grace <= 0) {
      const kopf = this._lokal(KOPF.x, KOPF.y);
      if (this.ter.kreis(kopf[0], kopf[1], KOPF.r, K) && K.d > 0.06) this._crash('Kopf');
      else if (b.y < this.ter.tiefstes(b.x - 90, b.x + 90) - 14) this._crash('Sturz');
    }

    if (this.endlos && this.status !== 'abgestuerzt' && b.x > this.bauer.x - 160) {
      while (this.bauer.x < b.x + 300) endlosStueck(this.bauer);
    }
  }

  // Hangneigung am voraussichtlichen Landepunkt (Wurfparabel)
  landeWinkel() {
    const b = this.b, ter = this.ter;
    let lx = b.x + 4;
    for (let t = 0; t < 3; t += 0.04) {
      const x = b.x + b.vx * t, y = b.y + b.vy * t - 0.5 * G * t * t, gy = ter.hoehe(x);
      lx = x;
      if (gy === gy && y < gy + 0.9) break;
    }
    return ter.winkel(lx);
  }

  _lokal(lx, ly) {
    const b = this.b, c = Math.cos(b.th), s = Math.sin(b.th);
    return [b.x + c * lx - s * ly, b.y + s * lx + c * ly];
  }
  _beruehrPunkte() {
    const m = this.moto, b = this.b;
    const k = this._lokal(KOPF.x, KOPF.y), h = this._lokal(-RAD_X, -ACHSE), v = this._lokal(RAD_X, -ACHSE);
    return [[b.x, b.y, 1.1], [k[0], k[1], 0.9], [h[0], h[1], m.radius + 0.55], [v[0], v[1], m.radius + 0.55]];
  }

  _crash(grund) {
    this.status = 'abgestuerzt'; this.crashGrund = grund; this.fahrer = false; this.tAbgestuerzt = 0;
    this.offeneFlips = 0;
    this.ereignisse.push({ t: 'crash', grund });
    // Fahrer wird zur Ragdoll
    const b = this.b, z = this.z;
    const p = (lx, ly) => { const w = this._lokal(lx, ly); return { x: w[0], y: w[1], px: w[0] - b.vx * DT * 4 + (z() - 0.5) * 0.06, py: w[1] - b.vy * DT * 4 + (z() - 0.5) * 0.06 }; };
    this.ragdoll = {
      kopf: p(KOPF.x, KOPF.y), brust: p(BRUST.x, BRUST.y), hueft: p(-0.20, 0.30),
      hand: p(0.62, 0.62), fuss: p(0.05, -0.10),
      lim: [['kopf', 'brust', 0.42], ['brust', 'hueft', 0.52], ['brust', 'hand', 0.70], ['hueft', 'fuss', 0.88], ['kopf', 'hueft', 0.9]]
    };
  }

  _ragdollSchritt() {
    const R = this.ragdoll, ter = this.ter;
    const d = 1 / 240;
    const namen = ['kopf', 'brust', 'hueft', 'hand', 'fuss'];
    for (let sub = 0; sub < 4; sub++) {
      for (const n of namen) {
        const p = R[n];
        const vx = (p.x - p.px) * 0.998, vy = (p.y - p.py) * 0.998;
        p.px = p.x; p.py = p.y;
        p.x += vx; p.y += vy - G * d * d;
      }
      for (let it = 0; it < 4; it++) {
        for (const [a, bn, l] of R.lim) {
          const A = R[a], B = R[bn];
          let dx = B.x - A.x, dy = B.y - A.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1e-6;
          const diff = (dist - l) / dist * 0.5;
          dx *= diff; dy *= diff;
          A.x += dx; A.y += dy; B.x -= dx; B.y -= dy;
        }
        for (const n of namen) {
          const p = R[n];
          if (ter.kreis(p.x, p.y, 0.14, K)) {
            p.x += K.nx * K.d; p.y += K.ny * K.d;
            // Reibung: Geschwindigkeit entlang der Oberflaeche bremsen
            const vx = p.x - p.px, vy = p.y - p.py;
            const vn = vx * K.nx + vy * K.ny;
            const tx = vx - vn * K.nx, ty = vy - vn * K.ny;
            p.px = p.x - (tx * 0.8 + (vn > 0 ? vn * K.nx : 0));
            p.py = p.y - (ty * 0.8 + (vn > 0 ? vn * K.ny : 0));
          }
        }
      }
    }
  }

  // Aktuelle Entfernung in Metern (fuer Endlos-Wertung)
  get distanz() { return Math.max(0, this.maxX - 3); }
  get fortschritt() { return this.endlos ? 0 : klemme((this.b.x - 3) / (this.zielX - 3), 0, 1); }
  // Sterne: [Ziel, alle Muenzen, genug Flips]
  sterne() {
    if (this.status !== 'ziel') return [false, false, false];
    return [true, this.muenzen.every(m => m.got), this.flips >= this.flipZiel];
  }
}

// ---------------------------------------------------------------- Autopilot (fuer Tests und Entwicklung)
// flipper: versucht, in grossen Spruengen Rueckwaertssaltos zu drehen.
function autopilot(lauf, opt) {
  opt = opt || {};
  const b = lauf.b, ter = lauf.ter;
  const luft = !lauf.kontakt[0] && !lauf.kontakt[1];
  let zielW;
  if (luft) {
    // Landepunkt per Wurfparabel schaetzen und dort die Hangneigung anpeilen
    zielW = lauf.landeWinkel();
    if (opt.flipper && lauf.luftZeit > 0.15 && lauf.flipZiel > lauf.flips + lauf.offeneFlips) {
      const noetig = ZWEI_PI * (Math.floor(lauf.luftWinkel / ZWEI_PI) + 1) - 0.35;
      if (b.y - (ter.hoehe(b.x) || b.y - 20) > 3 && lauf.luftWinkel < noetig && lauf.luftZeit < 1.3) return { gas: 0, bremse: 0, rot: 1 };
    }
  } else {
    zielW = Math.max(ter.winkel(b.x + 1.2), ter.winkel(b.x - 1.2));
    zielW = ter.winkel(b.x + 1.5);
  }
  let d = zielW - b.th;
  const rot = klemme((opt.kp || 2.6) * (d + (opt.versatz || 0)) - (opt.kd || 1.0) * b.w, -1, 1);
  let gas = 1, bremse = 0;
  if (!luft && b.th > 0.7) gas = 0.3;
  if (luft && opt.luftBremse) { gas = 0; bremse = 0.3; }
  return { gas, bremse, rot };
}

// Fahrt mit Autopilot simulieren; Ergebnis: { status, zeit, bild, flips, muenzen }
function simuliere(def, moto, opt) {
  opt = opt || {};
  const lauf = new Lauf(def, moto || MOTOS[0], opt.seed, opt.schwer);
  const maxBilder = (opt.maxSek || 150) * 60;
  let bild = 0, cpNutzen = 0;
  while (bild < maxBilder) {
    const inp = autopilot(lauf, opt);
    lauf.schritt(inp); bild++;
    lauf.ereignisse.length = 0;
    if (lauf.status === 'ziel') break;
    if (lauf.status === 'abgestuerzt') {
      if (lauf.tAbgestuerzt > 0.5) {
        if (opt.mitCheckpoint && lauf.snapshot && cpNutzen < 6) { cpNutzen++; lauf.vomCheckpoint(); } else break;
      }
    }
    if (lauf.endlos && lauf.maxX > (opt.endlosZiel || 1e9)) break;
  }
  return { status: lauf.status, zeit: lauf.zeit, bild, flips: lauf.flips, muenzen: lauf.muenzenZahl, muenzenGesamt: lauf.muenzen.length, x: lauf.b.x, grund: lauf.crashGrund, lauf };
}

return { Lauf, Gelaende, Bauer, LEVELS, WELTEN, MOTOS, ENDLOS, KOPF, BRUST, RAD_X, ACHSE, rng, autopilot, simuliere, G, DT, SUB, klemme };
});
