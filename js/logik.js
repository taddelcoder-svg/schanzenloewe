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
  constructor() { this.x0 = []; this.y0 = []; this.x1 = []; this.y1 = []; this.extras = []; }
  // bewegliche oder besondere Teile (Looping, Plattform, Seilbruecke) auf die Zeit t stellen
  zeit(t) { for (const e of this.extras) if (e.lage) e.lage(t); }
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
    if (treffer) { out.d = bestD; out.nx = bnx; out.ny = bny; out.vx = 0; out.vy = 0; }
    for (const e of this.extras) {
      if (cx + r < e.xa || cx - r > e.xb || !e.kreis(cx, cy, r, KE) || KE.d <= bestD) continue;
      bestD = KE.d; treffer = true;
      out.d = KE.d; out.nx = KE.nx; out.ny = KE.ny; out.vx = KE.vx; out.vy = KE.vy;
    }
    return treffer;
  }
}
const KE = { d: 0, nx: 0, ny: 1, vx: 0, vy: 0 };

// Looping: Kreisbahn, auf der man innen faehrt. Damit man hinein- und wieder herauskommt, ist je nach Phase
// ein Viertel offen: vor der Fahrt das linke untere (Einfahrt von links), danach das rechte untere (Ausfahrt).
class Schleife {
  constructor(cx, cy, R) { this.art = 'schleife'; this.cx = cx; this.cy = cy; this.R = R; this.phase = 0; this.xa = cx - R - 1; this.xb = cx + R + 1; }
  offen(a) { return this.phase === 0 ? a < -Math.PI / 2 : (a > -Math.PI / 2 && a < 0); }
  kreis(cx, cy, r, out) {
    const dx = cx - this.cx, dy = cy - this.cy, dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < this.R - r || dist > this.R + 0.35 + r || this.offen(Math.atan2(dy, dx))) return false;
    if (dist < this.R) { out.d = dist - (this.R - r); out.nx = -dx / dist; out.ny = -dy / dist; }   // innen: die Fahrbahn
    else { out.d = this.R + 0.35 + r - dist; out.nx = dx / dist; out.ny = dy / dist; }               // aussen: Rueckseite der Bahn
    out.vx = 0; out.vy = 0;
    return true;
  }
}

// Schwebeplattform: Block, der sich hin- und herbewegt (seitlich ax, hoch/runter ay, Periode p Sekunden)
class Plattform {
  constructor(x0, x1, y, ax, ay, p, ph) {
    this.art = 'plattform'; this.x0 = x0; this.x1 = x1; this.y = y; this.ax = ax; this.ay = ay; this.p = p; this.ph = ph || 0; this.dicke = 0.55;
    this.xa = x0 - Math.abs(ax) - 1; this.xb = x1 + Math.abs(ax) + 1;
    this.lage(0);
  }
  lage(t) {
    const w = ZWEI_PI / this.p, s = Math.sin(w * t + this.ph), c = Math.cos(w * t + this.ph);
    this.ox = this.ax * s; this.oy = this.ay * s; this.vx = this.ax * w * c; this.vy = this.ay * w * c;
  }
  kreis(cx, cy, r, out) {
    const xa = this.x0 + this.ox, xb = this.x1 + this.ox, yt = this.y + this.oy, yb = yt - this.dicke;
    const px = klemme(cx, xa, xb), py = klemme(cy, yb, yt), ex = cx - px, ey = cy - py, d2 = ex * ex + ey * ey;
    if (d2 >= r * r) return false;
    if (d2 > 1e-12) { const dist = Math.sqrt(d2); out.d = r - dist; out.nx = ex / dist; out.ny = ey / dist; }
    else { out.d = yt - cy + r; out.nx = 0; out.ny = 1; }
    out.vx = this.vx; out.vy = this.vy;
    return true;
  }
}

// Seilbruecke: haengt durch und gibt dort nach, wo das Motorrad gerade steht
class Bruecke {
  constructor(x0, x1, y, sag) { this.art = 'bruecke'; this.x0 = x0; this.x1 = x1; this.y = y; this.sag = sag; this.last = 0; this.lx = (x0 + x1) / 2; this.xa = x0; this.xb = x1; }
  hoeheBei(x) {
    const u = (x - this.x0) / (this.x1 - this.x0);
    if (u < 0 || u > 1) return NaN;
    const ub = klemme((this.lx - this.x0) / (this.x1 - this.x0), 0.05, 0.95);
    const punkt = u < ub ? u / ub : (1 - u) / (1 - ub);
    return this.y - this.sag * Math.sin(Math.PI * u) - this.last * 2.4 * ub * (1 - ub) * punkt;
  }
  kreis(cx, cy, r, out) {
    const y0 = this.hoeheBei(cx);
    if (y0 !== y0) return false;
    const a = this.hoeheBei(Math.max(this.x0, cx - 0.2)), b = this.hoeheBei(Math.min(this.x1, cx + 0.2));
    const w = Math.atan2(b - a, Math.min(this.x1, cx + 0.2) - Math.max(this.x0, cx - 0.2)), c = Math.cos(w);
    const dist = (cy - y0) * c;
    if (dist >= r || dist < -0.5) return false;
    out.d = r - dist; out.nx = -Math.sin(w); out.ny = c; out.vx = 0; out.vy = 0;
    return true;
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
  // Looping auf ebenem Boden, mit Turbo-Streifen davor und Muenzen oben im Kreis
  looping(R) {
    R = R || 4.4;
    this.flach(3); if (this.offen) this.turbos.push({ x: this.x - 1.5, benutzt: false });
    this.flach(6);
    const cx = this.x + R + 1.5, cy = this.y + R;
    this.flach(2 * R + 8);
    this.ter.extras.push(new Schleife(cx, cy, R));
    for (let i = 0; i < 5; i++) { const a = Math.PI / 2 + (i - 2) * 0.42; this.muenzen.push({ x: cx + Math.cos(a) * (R - 1.25), y: cy + Math.sin(a) * (R - 1.25), got: false }); }
    return this;
  }
  // Schwebeplattform: Luecke, dann ein Block (tief Meter unter der Kante), der sich bewegen kann.
  // Danach geht es nach einer weiteren Luecke etwas tiefer weiter: noch eine Plattform oder landung().
  schwebe(len, spalt, ax, ay, p, tief) {
    this._ende();
    const s = spalt * this.lf, x0 = this.x + s, y = this.y - (tief === undefined ? 1.0 : tief);
    this.ter.extras.push(new Plattform(x0, x0 + len, y, ax || 0, ay || 0, p || 3.2, (x0 * 0.37) % ZWEI_PI));
    for (let i = 0; i < 3; i++) this.muenzen.push({ x: x0 + 2 + (len - 4) * i / 2, y: y + Math.abs(ay || 0) + 1.5, got: false });
    this.von = x0; this.x = x0 + len + Math.min(s, 3 + s * 0.4); this.y = y - Math.abs(ay || 0) - 0.6; this.bis = this.x;
    return this;
  }
  // Seilbruecke ueber eine Luecke auf gleicher Hoehe
  bruecke(len, sag) {
    sag = sag === undefined ? 0.8 : sag;
    this._ende();
    this.ter.extras.push(new Bruecke(this.x, this.x + len, this.y, sag));
    const n = Math.max(3, Math.round(len / 3.5));
    for (let i = 0; i < n; i++) { const u = (i + 0.5) / n; this.muenzen.push({ x: this.x + len * u, y: this.y - sag * Math.sin(Math.PI * u) + 1.3, got: false }); }
    this.von = this.x; this.x += len; this.bis = this.x;
    return this;
  }
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
  { id: 'schnee', name: 'Winterberg' },
  { id: 'stadt', name: 'Nachtstadt' },
  { id: 'vulkan', name: 'Vulkan' }
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
  } },
  // ---- Welt 4: Nachtstadt (neu: Loopings, Seilbruecken, Schwebeplattformen)
  { id: '4-1', welt: 3, name: 'Neonallee', flips: 2, bau(b) {
    b.flach(14); b.huegel(20, 2.0); b.reihe(5); b.flach(6);
    b.bruecke(16, 0.7); b.flach(10); b.checkpoint();
    b.rampe(8, 3.0); b.bogen(6, 12, 3, 2.6); b.luecke(12, -2.0); b.landung(20, 3.0); b.flach(6);
    b.looping(4.2); b.flach(6); b.checkpoint();
    b.wellen(3, 14, 2.4); b.reihe(8); b.flach(6);
    b.rampe(8.5, 3.4); b.bogen(7, 14, 3.6, 3); b.luecke(13, -2.6); b.landung(22, 3.4);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  { id: '4-2', welt: 3, name: 'Hochbahn', flips: 2, bau(b) {
    b.flach(14); b.glatt(20, 3.0); b.flach(10);
    b.schwebe(10, 5, 0, 0); b.schwebe(10, 5, 2, 0, 4); b.landung(18, 2.4); b.flach(8); b.checkpoint();
    b.huegel(22, 2.6); b.reihe(6); b.flach(6);
    b.rampe(8.5, 3.4); b.bogen(7, 14, 3.6, 3); b.luecke(14, -2.8); b.landung(24, 3.6); b.flach(6);
    b.looping(4.4); b.flach(4); b.checkpoint();
    b.glatt(20, 2.5); b.flach(10); b.schwebe(10, 6, 0, 1.0, 3.4, 1.8); b.schwebe(10, 6, 2.5, 0, 4.2); b.landung(18, 2.4);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  { id: '4-3', welt: 3, name: 'Brückenviertel', flips: 3, bau(b) {
    b.flach(14); b.bruecke(18, 0.9); b.flach(6); b.huegel(18, 2.0); b.reihe(5); b.flach(4);
    b.bruecke(24, 1.3); b.flach(8); b.checkpoint();
    b.rampe(9, 4.0); b.bogen(8, 15, 4, 3.4); b.luecke(15, -3.0); b.landung(24, 3.8); b.flach(6);
    b.bruecke(14, 0.5); b.flach(4); b.bruecke(14, 0.5); b.flach(8); b.checkpoint();
    b.looping(4.6); b.flach(6);
    b.rampe(9, 4.0); b.bogen(8, 16, 4.4, 3.4); b.luecke(16, -3.4); b.landung(26, 4.2);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  { id: '4-4', welt: 3, name: 'Mitternacht', flips: 3, bau(b) {
    b.flach(14); b.glatt(22, 3.5); b.flach(8);
    b.schwebe(10, 5, 0, 0.8, 3.0, 1.6); b.schwebe(10, 5, 0, 0.8, 3.6, 1.6); b.landung(18, 2.6); b.flach(8); b.checkpoint();
    b.looping(4.2); b.flach(4); b.looping(4.6); b.flach(6); b.checkpoint();
    b.rampe(9, 4.0); b.bogen(8, 16, 4.4, 3.4); b.luecke(16, -3.2); b.landung(26, 4.2); b.flach(6);
    b.bruecke(20, 1.0); b.flach(8); b.checkpoint();
    b.wellen(3, 14, 2.6); b.reihe(8); b.flach(6);
    b.rampe(9.5, 4.4); b.bogen(8, 17, 4.8, 3.6); b.luecke(17, -3.6); b.landung(28, 4.6);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  // ---- Welt 5: Vulkan
  { id: '5-1', welt: 4, name: 'Ascheweg', flips: 3, bau(b) {
    b.flach(14); b.glatt(26, 4.0); b.huegel(18, 2.2); b.reihe(5); b.glatt(22, -4.0); b.flach(6);
    b.rampe(9, 4.0); b.bogen(8, 15, 4, 3.4); b.luecke(15, -3.0); b.landung(24, 3.8); b.flach(6); b.checkpoint();
    b.bruecke(20, 1.1); b.flach(6); b.looping(4.4); b.flach(6); b.checkpoint();
    b.wellen(4, 14, 2.8); b.reihe(10); b.flach(6);
    b.rampe(9.5, 4.4); b.bogen(8, 17, 4.8, 3.6); b.luecke(17, -3.4); b.landung(28, 4.6);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  { id: '5-2', welt: 4, name: 'Lavastrom', flips: 3, bau(b) {
    b.flach(14); b.glatt(20, 3.0); b.flach(10);
    b.schwebe(10, 5, 2, 0, 3.6); b.schwebe(10, 5, 0, 1.0, 3.2, 1.8); b.landung(18, 2.6); b.flach(8); b.checkpoint();
    b.rampe(9, 4.0); b.bogen(8, 16, 4.4, 3.4); b.luecke(16, -3.0); b.landung(26, 4.0); b.flach(6);
    b.glatt(22, 3.0); b.flach(10); b.checkpoint();
    b.schwebe(10, 5, 2, 0, 4.0); b.schwebe(10, 5, 2, 0, 3.4); b.schwebe(10, 5, 0, 1.0, 3.0, 1.8); b.landung(20, 2.8);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  { id: '5-3', welt: 4, name: 'Magma-Looping', flips: 4, bau(b) {
    b.flach(14); b.looping(4.4); b.flach(4); b.glatt(20, 3.0); b.flach(6);
    b.rampe(9.5, 4.4); b.bogen(8, 17, 4.8, 3.6); b.luecke(17, -3.4); b.landung(28, 4.6); b.flach(6); b.checkpoint();
    b.looping(4.8); b.flach(4); b.bruecke(18, 1.0); b.flach(8); b.checkpoint();
    b.rampe(10, 4.8); b.bogen(9, 19, 5.2, 3.8); b.luecke(18, -3.8); b.landung(32, 5.0); b.flach(6);
    b.looping(4.2); b.flach(4); b.looping(4.8);
    b.flach(10); b.zielHier(); b.flach(26); b.schluss();
  } },
  { id: '5-4', welt: 4, name: 'Feuerkrone', flips: 4, bau(b) {
    b.flach(12); b.glatt(30, 5.0); b.flach(10);
    b.schwebe(10, 5, 2, 0, 3.8); b.schwebe(10, 5, 0, 1.0, 3.0, 1.8); b.landung(20, 2.8); b.flach(6); b.checkpoint();
    b.rampe(10, 4.8); b.bogen(9, 19, 5.2, 3.8); b.luecke(18, -4.0); b.landung(32, 5.0); b.flach(16);
    b.looping(4.6); b.flach(4); b.bruecke(22, 1.2); b.flach(8); b.checkpoint();
    b.glatt(26, 4.0); b.flach(10);
    b.schwebe(9, 6, 2.5, 0, 3.6); b.schwebe(9, 6, 0, 1.0, 3.2, 1.8); b.landung(20, 2.8); b.flach(6); b.checkpoint();
    b.rampe(10, 4.8); b.bogen(9, 21, 5.6, 4); b.luecke(18, -4.2); b.landung(36, 5.4); b.flach(16);
    b.looping(5.0);
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
const K = { d: 0, nx: 0, ny: 1, vx: 0, vy: 0 };
const KOMBO_ZEIT = 2.2;

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
    this.kombo = null; this.wheelie = 0; this.stoppie = 0;
    for (const e of this.ter.extras) { if (e.art === 'schleife') e.phase = 0; if (e.art === 'bruecke') e.last = 0; }
  }

  neustart() {
    this.platziere(3);
    this.status = 'bereit';           // bereit | fahrt | abgestuerzt | ziel
    this.zeit = 0; this.flips = 0; this.muenzenZahl = 0; this.versuche = 1; this.t = 0;
    this.punkte = 0; this.bestKombo = 0; this.loopings = 0;
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
    this.flips = s.flips; this.muenzenZahl = s.muenzen; this.punkte = s.punkte; // Zeit laeuft weiter
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
    const name = (n === 2 ? 'Doppel-' : n === 3 ? 'Dreifach-' : n > 3 ? n + 'x ' : '') + (art > 0 ? 'Backflip' : 'Frontflip');
    this.trick(name, Math.round(n * (art > 0 ? 100 : 120) * (n > 1 ? 1 + (n - 1) * 0.25 : 1)));
  }

  // Trick-Kombo: jeder Trick erhoeht den Multiplikator. Die Kombo wird gebucht, wenn man KOMBO_ZEIT Sekunden
  // am Boden ohne neuen Trick faehrt (oder im Ziel). Bei einem Sturz ist sie weg.
  trick(name, p) {
    if (!this.kombo) this.kombo = { punkte: 0, mult: 0, timer: 0 };
    const k = this.kombo;
    k.punkte += p; k.mult++; k.timer = KOMBO_ZEIT;
    this.ereignisse.push({ t: 'trick', name, p, mult: k.mult, summe: k.punkte });
  }
  komboBuchen() {
    const k = this.kombo; if (!k) return;
    const gesamt = k.punkte * k.mult, bonus = k.mult >= 2 ? (k.mult - 1) * 3 : 0;
    this.punkte += gesamt; this.muenzenZahl += bonus; this.bestKombo = Math.max(this.bestKombo, gesamt);
    this.ereignisse.push({ t: 'kombo', gesamt, mult: k.mult, bonus });
    this.kombo = null;
  }

  // Ein 60-Hz-Bild. inp = { gas: 0..1, bremse: 0..1, rot: -1..1 } (rot > 0: Nase hoch)
  schritt(inp) {
    if (this.status === 'bereit' && (inp.gas > 0 || inp.bremse > 0)) this.status = 'fahrt';
    for (let i = 0; i < SUB; i++) { this.ter.zeit(this.t); this.t += DT; this._teil(inp, DT); }
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
      const pvx = b.vx - b.w * ry - K.vx, pvy = b.vy + b.w * rx - K.vy;
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

    // nach einem Looping (oder Flip) den Winkel wieder in -pi..pi holen
    if (!luft && Math.abs(b.th) > Math.PI) b.th -= ZWEI_PI * Math.round(b.th / ZWEI_PI);

    // Flips: Drehung in der Luft aufsummieren
    if (luft) this.landeW = this.landeWinkel();
    if (luft) {
      this.luftZeit += dt; this.luftWinkel += b.w * dt;
    } else {
      if (this.luftZeit > 1.0 && this.status === 'fahrt') {
        const n = Math.floor((this.luftZeit - 0.8) * 5); this.muenzenZahl += n; this.ereignisse.push({ t: 'luft', s: this.luftZeit, n });
        if (this.luftZeit > 1.2) this.trick('Luftzeit ' + this.luftZeit.toFixed(1) + ' s', Math.round(this.luftZeit * 40));
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

    // Wheelie (nur Hinterrad) und Stoppie (nur Vorderrad) als Tricks
    const amBoden = this.kontakt[0] || this.kontakt[1];
    if (this.status === 'fahrt' && this.kontakt[0] && !this.kontakt[1] && vt > 3) this.wheelie += dt;
    else { if (this.wheelie > 1.0) this.trick('Wheelie', Math.round(this.wheelie * 60)); this.wheelie = 0; }
    if (this.status === 'fahrt' && this.kontakt[1] && !this.kontakt[0] && vt > 3) this.stoppie += dt;
    else { if (this.stoppie > 0.6) this.trick('Stoppie', Math.round(this.stoppie * 90)); this.stoppie = 0; }
    if (this.kombo && amBoden && this.wheelie < 0.3 && this.stoppie < 0.3 && this.offeneFlips === 0) {
      this.kombo.timer -= dt;
      if (this.kombo.timer <= 0) this.komboBuchen();
    }

    // Loopings und Seilbruecken
    for (const e of this.ter.extras) {
      if (e.art === 'schleife') {
        const dx = b.x - e.cx, dy = b.y - e.cy;
        if (e.phase === 0 && dx * dx + dy * dy < e.R * e.R && Math.atan2(dy, dx) > 1.9) e.phase = 1;
        else if (e.phase === 1 && (b.x > e.cx + e.R + 0.5 || b.x < e.cx - e.R - 3)) {
          if (b.x > e.cx && this.status === 'fahrt') { this.loopings++; this.trick('Looping', 150); }
          e.phase = 0;
        }
      } else if (e.art === 'bruecke') {
        const drauf = b.x > e.x0 && b.x < e.x1 && b.y < e.y + 2.5 && b.y > e.y - e.sag - 2.5;
        e.last += ((drauf ? 1 : 0) - e.last) * 0.12;
        if (drauf) e.lx = b.x;
      }
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
      if (this.cpWartet >= 0 && this.kontakt[0] && this.kontakt[1] && Math.abs(b.th) < 0.5 && this.luftZeit === 0 && this.offeneFlips === 0 && Number.isFinite(this.ter.hoehe(b.x))) {
        this.cpIndex = this.cpWartet; this.cpWartet = -1;
        this.snapshot = { x: b.x, flips: this.flips, muenzen: this.muenzenZahl, punkte: this.punkte, got: this.muenzen.map(mu => mu.got), index: this.cpIndex };
        this.ereignisse.push({ t: 'checkpoint' });
      }
    }

    // Ziel
    if (!this.endlos && b.x >= this.zielX && this.status === 'fahrt') {
      this.status = 'ziel';
      if (this.offeneFlips > 0) { this.neueFlips(this.offeneFlips, this.offeneFlipArt); this.offeneFlips = 0; }
      this.komboBuchen();
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
    if (this.kombo) { this.ereignisse.push({ t: 'komboWeg', summe: this.kombo.punkte * this.kombo.mult }); this.kombo = null; }
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
  // im Looping nicht gegenlenken, einfach Gas
  for (const e of ter.extras) if (e.art === 'schleife' && (e.phase === 1 || (Math.abs(b.x - e.cx) < e.R + 0.5 && b.y > e.cy - e.R + 1.6))) return { gas: 1, bremse: 0, rot: 0 };
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

// Fahrbarkeitstest: schafft mindestens eine Autopilot-Variante (mit Checkpoints) das Ziel?
const VARIANTEN = [{ kp: 2.6, kd: 1.0 }, { kp: 2.0, kd: 1.2 }, { kp: 3.5, kd: 1.0 }, { kp: 2.6, kd: 1.0, versatz: 0.12 }, { kp: 2.6, kd: 1.0, versatz: -0.12 }, { kp: 3.0, kd: 1.5 }];
function fahrbar(def, moto, schwer, varianten) {
  for (const v of varianten || VARIANTEN) {
    const r = simuliere(def, moto || MOTOS[0], Object.assign({ mitCheckpoint: true, schwer: schwer || 0, maxSek: 240 }, v));
    if (r.status === 'ziel') return { ok: true, zeit: r.zeit };
  }
  return { ok: false };
}

// ---------------------------------------------------------------- Level-Editor: Bausteine und Teilen per Code
// Jedes Teil hat bis zu zwei Werte; gespeichert wird je Wert eine Stufe (eine Base-36-Ziffer).
const TEILE = [
  { k: 'F', name: 'Gerade', werte: [['Länge', 6, 40, 9]], bau(b, l) { b.flach(l); b.reihe(Math.max(2, Math.round(l / 6))); } },
  { k: 'H', name: 'Hügel', werte: [['Länge', 12, 32, 6], ['Höhe', 1, 4, 7]], bau(b, l, h) { b.huegel(l, h); b.reihe(5); b.flach(3); } },
  { k: 'W', name: 'Wellen', werte: [['Anzahl', 2, 6, 5], ['Höhe', 0.8, 3, 6]], bau(b, n, h) { b.wellen(n, 9 + h * 2.5, h); b.reihe(2 * n); b.flach(3); } },
  { k: 'G', name: 'Hang', werte: [['Länge', 14, 38, 7], ['Höhe', -6, 6, 13]], bau(b, l, h) { b.glatt(l, h); b.reihe(4); b.flach(4); } },
  { k: 'S', name: 'Schanze', werte: [['Höhe', 1.6, 4.8, 9], ['Weite', 4, 18, 8]], bau(b, h, w) {
    b.flach(5); b.rampe(6 + h * 0.8, h); b.bogen(6, 6 + w, 1.2 + h * 0.8, 2.2 + h * 0.3); b.luecke(w, -Math.min(h * 0.6, 3)); b.landung(14 + h * 3.2 + w * 0.6, h * 0.8 + 0.8); b.flach(8);
  } },
  { k: 'A', name: 'Stufe', werte: [['Tiefe', 1, 5, 9]], bau(b, t) { b.flach(5); b.abfall(t); b.flach(8); b.reihe(2); } },
  { k: 'O', name: 'Looping', werte: [['Radius', 3.6, 5.2, 5]], bau(b, r) { b.flach(8); b.looping(r); b.flach(6); } },
  { k: 'P', name: 'Plattformen', werte: [['Anzahl', 1, 3, 3], ['Bewegung', 0, 2, 3]], bau(b, n, art) {
    b.flach(10); for (let i = 0; i < n; i++) b.schwebe(10, 5, art === 2 ? 2 : 0, art === 1 ? 1 : 0, 3 + i * 0.4, art === 1 ? 1.8 : 1.0); b.landung(18, 2.4); b.flach(8);
  } },
  { k: 'B', name: 'Seilbrücke', werte: [['Länge', 10, 26, 9], ['Durchhang', 0.3, 1.5, 5]], bau(b, l, s) { b.flach(4); b.bruecke(l, s); b.flach(6); } },
  { k: 'C', name: 'Checkpoint', werte: [], bau(b) { b.flach(4); b.checkpoint(); b.flach(4); } }
];
const TEIL = {}; for (const t of TEILE) TEIL[t.k] = t;
const MAX_TEILE = 40;
function teilWert(t, i, stufe) { const w = t.werte[i]; return w[1] + (w[2] - w[1]) * stufe / (w[3] - 1); }

// Strecke als Objekt { welt, name, teile: [{ k, s: [stufen] }] } <-> Code "SL1<welt><teile>[~name]"
function streckeZuCode(st) {
  let c = 'SL1' + klemme(st.welt | 0, 0, WELTEN.length - 1);
  for (const t of st.teile) c += t.k + t.s.map(v => v.toString(36)).join('');
  if (st.name) c += '~' + zuB64(utf8(st.name.slice(0, 24)));
  return c;
}
function codeZuStrecke(code) {
  code = String(code || '').replace(/\s+/g, '');
  const m = /^SL1([0-9])([A-Za-z0-9]*)(?:~([A-Za-z0-9_-]*))?$/.exec(code);
  if (!m || +m[1] >= WELTEN.length) return null;
  const teile = [], z = m[2];
  for (let i = 0; i < z.length;) {
    const t = TEIL[z[i++]]; if (!t) return null;
    const s = [];
    for (let j = 0; j < t.werte.length; j++) {
      const v = parseInt(z[i++] || 'x', 36);
      if (!(v >= 0 && v < t.werte[j][3])) return null;
      s.push(v);
    }
    teile.push({ k: t.k, s });
  }
  if (!teile.length || teile.length > MAX_TEILE) return null;
  let name = '';
  if (m[3]) { try { name = ausUtf8(ausB64(m[3])).slice(0, 24); } catch (e) { name = ''; } }
  return { welt: +m[1], teile, name };
}
function baueStrecke(b, teile) {
  b.flach(16); b.teilGrenzen = [];
  for (const t of teile) { b.teilGrenzen.push(b.x); const d = TEIL[t.k]; d.bau(b, ...t.s.map((v, i) => teilWert(d, i, v))); }
  b.teilGrenzen.push(b.x);
  b.flach(10); b.zielHier(); b.flach(26); b.schluss();
}
function eigenesLevel(st) {
  const code = streckeZuCode(st);
  return { id: 'eigen', key: 'c:' + code, code, welt: st.welt, name: st.name || 'Eigene Strecke', eigen: true, flips: 0, strecke: st, bau(b) { baueStrecke(b, st.teile); } };
}

// ---------------------------------------------------------------- Tagesstrecke: fuer alle gleich, jeden Tag neu
// Aus dem Datum (JJJJMMTT) wird eine zufaellige Folge von Bausteinen; genommen wird die erste, die der Autopilot schafft.
const TAGES_GEWICHT = { F: 1, H: 3, W: 3, G: 2, S: 5, A: 1, O: 2, P: 2, B: 2 };
function tagesTeile(z) {
  const topf = []; for (const k in TAGES_GEWICHT) for (let i = 0; i < TAGES_GEWICHT[k]; i++) topf.push(k);
  const teile = []; let hoehe = 0;
  for (let i = 0; i < 14; i++) {
    if (i && i % 4 === 0) teile.push({ k: 'C', s: [] });
    const k = topf[Math.floor(z() * topf.length)], t = TEIL[k], s = t.werte.map(w => Math.floor(z() * w[3]));
    // Haenge und Stufen so waehlen, dass die Strecke nicht immer weiter steigt oder faellt
    if (k === 'G') { if (hoehe > 4) s[1] = Math.floor(z() * 5); else if (hoehe < -4) s[1] = 8 + Math.floor(z() * 5); hoehe += teilWert(t, 1, s[1]); }
    if (k === 'A') hoehe -= teilWert(t, 0, s[0]);
    teile.push({ k, s });
  }
  return teile;
}
function tagesStrecke(datum) {
  const welt = datum % WELTEN.length, tag = String(datum);
  const name = 'Tagesstrecke ' + (+tag.slice(6)) + '.' + (+tag.slice(4, 6)) + '.';
  let def = null;
  for (let k = 0; k < 40; k++) {
    const st = { welt, name, teile: tagesTeile(rng(datum * 97 + k * 7919)) };
    def = eigenesLevel(st);
    if (fahrbar(def, MOTOS[0], 1, VARIANTEN.slice(0, 3)).ok) break;
  }
  return Object.assign(def, { id: 'tag', key: 't:' + datum, eigen: false, tages: true, datum, flips: 2 });
}

// ---------------------------------------------------------------- Ghosts: Fahrten aufzeichnen und als Code teilen
// Proben mit 5 Hz: [x, y, th]. Kodiert werden x/y als zweite Differenz (5 cm), der Winkel als erste Differenz (1/40 rad).
const GHOST_HZ = 5;
function utf8(s) { return Array.from(new TextEncoder().encode(s)); }
function ausUtf8(b) { return new TextDecoder().decode(new Uint8Array(b)); }
const B64Z = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function zuB64(b) {
  let s = '';
  for (let i = 0; i < b.length; i += 3) {
    const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
    s += B64Z[(n >> 18) & 63] + B64Z[(n >> 12) & 63] + (i + 1 < b.length ? B64Z[(n >> 6) & 63] : '') + (i + 2 < b.length ? B64Z[n & 63] : '');
  }
  return s;
}
function ausB64(s) {
  const b = []; let n = 0, bits = 0;
  for (const ch of s) {
    const v = B64Z.indexOf(ch); if (v < 0) throw new Error('Code kaputt');
    n = (n << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; b.push((n >> bits) & 255); }
  }
  return b;
}
function schreibeZahl(b, v) { v = v < 0 ? -2 * v - 1 : 2 * v; while (v >= 128) { b.push((v & 127) | 128); v = Math.floor(v / 128); } b.push(v); }
function leseZahl(b, p) {
  let v = 0, f = 1, x;
  do { if (p.i >= b.length) throw new Error('Code zu kurz'); x = b[p.i++]; v += (x & 127) * f; f *= 128; } while (x & 128);
  return v % 2 ? -(v + 1) / 2 : v / 2;
}
function ghostBytes(g) {
  const b = [1], txt = s => { const u = utf8(s); schreibeZahl(b, u.length); b.push(...u); };
  txt(g.key); b.push(klemme(g.moto | 0, 0, 255)); schreibeZahl(b, Math.round(g.zeit * 100)); txt((g.name || '').slice(0, 16));
  schreibeZahl(b, g.proben.length);
  let px = 0, py = 0, dx = 0, dy = 0, pt = 0;
  for (const p of g.proben) {
    const qx = Math.round(p[0] * 20), qy = Math.round(p[1] * 20), qt = Math.round(p[2] * 40);
    schreibeZahl(b, (qx - px) - dx); schreibeZahl(b, (qy - py) - dy); schreibeZahl(b, qt - pt);
    dx = qx - px; dy = qy - py; px = qx; py = qy; pt = qt;
  }
  return b;
}
function ghostAusBytes(b) {
  const p = { i: 0 };
  if (b[p.i++] !== 1) throw new Error('Unbekannte Ghost-Version');
  const txt = () => { const n = leseZahl(b, p); const s = ausUtf8(b.slice(p.i, p.i + n)); p.i += n; return s; };
  const key = txt(), moto = b[p.i++], zeit = leseZahl(b, p) / 100, name = txt(), n = leseZahl(b, p);
  if (n > 60 * 60 * GHOST_HZ) throw new Error('Ghost zu lang');
  const proben = [];
  let px = 0, py = 0, dx = 0, dy = 0, pt = 0;
  for (let i = 0; i < n; i++) {
    dx += leseZahl(b, p); dy += leseZahl(b, p); px += dx; py += dy; pt += leseZahl(b, p);
    proben.push([px / 20, py / 20, pt / 40]);
  }
  return { key, moto, zeit, name, proben };
}
// Lage des Ghosts zur Fahrzeit t (lineare Interpolation)
function ghostLage(g, t) {
  const f = t * GHOST_HZ, i = Math.floor(f), a = g.proben[Math.min(i, g.proben.length - 1)], b = g.proben[Math.min(i + 1, g.proben.length - 1)];
  if (!a) return null;
  const u = Math.min(1, f - i);
  return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, th: a[2] + (b[2] - a[2]) * u, fertig: i >= g.proben.length - 1 };
}
// Level zu einem Schluessel ('l:1-3', 't:20261008', 'c:<Code>')
function levelZuKey(key) {
  if (key.startsWith('l:')) return LEVELS.find(l => l.id === key.slice(2)) || null;
  if (key.startsWith('t:') && /^t:\d{8}$/.test(key)) return tagesStrecke(+key.slice(2));
  if (key.startsWith('c:')) { const st = codeZuStrecke(key.slice(2)); return st ? eigenesLevel(st) : null; }
  return null;
}
for (const l of LEVELS) l.key = 'l:' + l.id;

return { Lauf, Gelaende, Bauer, LEVELS, WELTEN, MOTOS, ENDLOS, KOPF, BRUST, RAD_X, ACHSE, rng, autopilot, simuliere, G, DT, SUB, klemme,
  VARIANTEN, fahrbar, TEILE, TEIL, MAX_TEILE, teilWert, streckeZuCode, codeZuStrecke, eigenesLevel, tagesStrecke,
  GHOST_HZ, ghostBytes, ghostAusBytes, ghostLage, zuB64, ausB64, levelZuKey };
});
