/* =====================================================================
   RED SUBTERRÁNEA DE BAJA TENSIÓN — ITC-BT-07 (REBT, RD 842/2002)
   Líneas subterráneas (nuevas y existentes) y zanjas con sus tubos.
   ===================================================================== */

/* ---------- Tablas del ITC-BT-07 ---------- */
// Tabla 4: intensidad máxima admisible (A), Al, terna de unipolares XLPE, enterrada (25 °C, 1 K·m/W, 0,70 m)
const SUB_T4 = { 16: 97, 25: 125, 35: 150, 50: 180, 70: 220, 95: 260, 120: 295, 150: 330, 185: 375, 240: 430, 300: 485, 400: 550, 500: 615, 630: 690 };
// Apartado 1: sección mínima del neutro con cuatro conductores (Al)
const SUB_NEUTRO = [[16, 16], [25, 16], [35, 16], [50, 25], [70, 35], [95, 50], [120, 70], [150, 70], [185, 95], [240, 120], [300, 150], [400, 185]];
// Tabla 6: temperatura del terreno (XLPE, 90 °C)
const SUB_FT = [[10, 1.11], [15, 1.07], [20, 1.04], [25, 1], [30, 0.96], [35, 0.92], [40, 0.88], [45, 0.83], [50, 0.78]];
// Tabla 7: resistividad térmica del terreno (unipolares)
const SUB_FR = [[0.8, 1.09], [0.85, 1.06], [0.9, 1.04], [1, 1], [1.1, 0.96], [1.2, 0.93], [1.4, 0.87], [1.65, 0.81], [2, 0.75], [2.5, 0.68], [2.8, 0.66]];
// Tabla 8: agrupación de ternas enterradas (columnas = nº de circuitos en la zanja)
const SUB_FA_N = [2, 3, 4, 5, 6, 8, 10, 12];
const SUB_FA = { '0': [0.80, 0.70, 0.64, 0.60, 0.56, 0.53, 0.50, 0.47], '0.07': [0.85, 0.75, 0.68, 0.64, 0.60, 0.56, 0.53, 0.50], '0.1': [0.85, 0.76, 0.69, 0.65, 0.62, 0.58, 0.55, 0.53],
  '0.15': [0.87, 0.77, 0.72, 0.68, 0.66, 0.62, 0.59, 0.57], '0.2': [0.88, 0.79, 0.74, 0.70, 0.68, 0.64, 0.62, 0.60], '0.25': [0.89, 0.80, 0.76, 0.72, 0.70, 0.66, 0.64, 0.62] };
// Tabla 9: profundidad de instalación
const SUB_FP = [[0.4, 1.03], [0.5, 1.02], [0.6, 1.01], [0.7, 1], [0.8, 0.99], [0.9, 0.98], [1, 0.97], [1.2, 0.95]];
// Tabla 16: densidad de corriente de cortocircuito, Al XLPE (A/mm²)
const SUB_DCC = [[0.1, 294], [0.2, 203], [0.3, 170], [0.5, 132], [1, 93], [1.5, 76], [2, 66], [2.5, 59], [3, 54]];
const SUB_F_TUBO = 0.8;          // 3.1.3: terna en el mismo tubo
const ZANJA_TIPOS = {
  acera: { n: 'Acera', min: 0.60 }, calzada: { n: 'Calzada', min: 0.80, horm: true }, cruce: { n: 'Cruce de calle o carretera', min: 0.80, horm: true }, tierra: { n: 'Tierra o campo', min: 0.60 }
};
const SUB_SEP = [['auto', 'Según Ø del tubo'], ['0', 'En contacto'], ['0.07', '0,07 m'], ['0.1', '0,10 m'], ['0.15', '0,15 m'], ['0.2', '0,20 m'], ['0.25', '0,25 m']];
const SUB_PAR = { U: 400, dUmax: 5, tTerreno: 25, rho: 1, icc: 0, tcc: 0.5, reservaMin: 1 };

/* Valores por defecto de las bases (se usan si la base está vacía y se cargan la primera vez) */
const SUB_DEF_CABLES = [
  { id: 'XZ1-AL-3x50+1x50', designacion: 'XZ1 (S) 0,6/1 kV Al 3x50+1x50', secFase: 50, secNeutro: 50, diamExt: 13.0, fases: 3, Imax: 180, R20: 0.641, X: 0.08, coste: 0, venta: 0, activo: true, orden: 10 },
  { id: 'XZ1-AL-3x95+1x50', designacion: 'XZ1 (S) 0,6/1 kV Al 3x95+1x50', secFase: 95, secNeutro: 50, diamExt: 16.2, fases: 3, Imax: 260, R20: 0.320, X: 0.08, coste: 0, venta: 0, activo: true, orden: 20 },
  { id: 'XZ1-AL-3x150+1x95', designacion: 'XZ1 (S) 0,6/1 kV Al 3x150+1x95', secFase: 150, secNeutro: 95, diamExt: 19.8, fases: 3, Imax: 330, R20: 0.206, X: 0.08, coste: 0, venta: 0, activo: true, orden: 30 },
  { id: 'XZ1-AL-3x240+1x150', designacion: 'XZ1 (S) 0,6/1 kV Al 3x240+1x150', secFase: 240, secNeutro: 150, diamExt: 24.6, fases: 3, Imax: 430, R20: 0.125, X: 0.08, coste: 0, venta: 0, activo: true, orden: 40 },
  // Acometidas monofásicas: dos conductores unipolares (fase + neutro de igual sección). I máx. = tabla 4 × 1,225 (nota 2)
  { id: 'XZ1-AL-2x1x16', designacion: 'XZ1 (S) 0,6/1 kV Al 2x1x16', secFase: 16, secNeutro: 16, diamExt: 9.2, fases: 1, Imax: 119, R20: 1.91, X: 0.08, coste: 0, venta: 0, activo: true, orden: 110 },
  { id: 'XZ1-AL-2x1x25', designacion: 'XZ1 (S) 0,6/1 kV Al 2x1x25', secFase: 25, secNeutro: 25, diamExt: 10.5, fases: 1, Imax: 153, R20: 1.20, X: 0.08, coste: 0, venta: 0, activo: true, orden: 120 },
  { id: 'XZ1-AL-2x1x35', designacion: 'XZ1 (S) 0,6/1 kV Al 2x1x35', secFase: 35, secNeutro: 35, diamExt: 11.5, fases: 1, Imax: 184, R20: 0.868, X: 0.08, coste: 0, venta: 0, activo: true, orden: 130 },
  { id: 'XZ1-AL-2x1x50', designacion: 'XZ1 (S) 0,6/1 kV Al 2x1x50', secFase: 50, secNeutro: 50, diamExt: 13.0, fases: 1, Imax: 220, R20: 0.641, X: 0.08, coste: 0, venta: 0, activo: true, orden: 140 }
];
const SUB_DEF_TUBOS = [
  { id: 'TPE-90', designacion: 'Tubo PE corrugado doble pared 90 mm 450 N', dExt: 90, dInt: 76, coste: 0, venta: 0, activo: true, orden: 10 },
  { id: 'TPE-110', designacion: 'Tubo PE corrugado doble pared 110 mm 450 N', dExt: 110, dInt: 94, coste: 0, venta: 0, activo: true, orden: 20 },
  { id: 'TPE-125', designacion: 'Tubo PE corrugado doble pared 125 mm 450 N', dExt: 125, dInt: 107, coste: 0, venta: 0, activo: true, orden: 30 },
  { id: 'TPE-160', designacion: 'Tubo PE corrugado doble pared 160 mm 450 N', dExt: 160, dInt: 136, coste: 0, venta: 0, activo: true, orden: 40 },
  { id: 'TPE-200', designacion: 'Tubo PE corrugado doble pared 200 mm 450 N', dExt: 200, dInt: 172, coste: 0, venta: 0, activo: true, orden: 50 }
];
const SUB_PRECIOS = [
  ['zanjaAceraCoste', 'Zanja en acera · coste (€/m)'], ['zanjaAceraVenta', 'Zanja en acera · venta (€/m)'],
  ['zanjaCalzadaCoste', 'Zanja en calzada · coste (€/m)'], ['zanjaCalzadaVenta', 'Zanja en calzada · venta (€/m)'],
  ['zanjaCruceCoste', 'Cruce de calle o carretera · coste (€/m)'], ['zanjaCruceVenta', 'Cruce de calle o carretera · venta (€/m)'],
  ['zanjaTierraCoste', 'Zanja en tierra · coste (€/m)'], ['zanjaTierraVenta', 'Zanja en tierra · venta (€/m)'],
  ['arquetaCoste', 'Arqueta registrable · coste (€/ud)'], ['arquetaVenta', 'Arqueta registrable · venta (€/ud)'],
  ['pasoASCoste', 'Paso aéreo-subterráneo (tubo de protección y accesorios) · coste (€/ud)'], ['pasoASVenta', 'Paso aéreo-subterráneo · venta (€/ud)']
];
const SUB_PRECIO_TIPO = { acera: 'Acera', calzada: 'Calzada', cruce: 'Cruce', tierra: 'Tierra' };

/* ---------- Estado ---------- */
S.cablesSub = []; S.tubos = []; S.subLoaded = { c: false, t: false };
function SUB() {
  const s = S.proj.sub || (S.proj.sub = { lineas: [], zanjas: [], par: {} });
  s.par = { ...SUB_PAR, ...(s.par || {}) }; s.lineas = s.lineas || []; s.zanjas = s.zanjas || [];
  s.lineas.forEach(l => { if (!l.id) l.id = uid('s'); }); s.zanjas.forEach(z => { if (!z.id) z.id = uid('z'); });
  return s;
}
function subHasData() { const s = S.proj.sub; return !!(s && (s.lineas?.length || s.zanjas?.length)); }
function cablesSub() { return (S.cablesSub.length ? S.cablesSub : SUB_DEF_CABLES).filter(c => c.activo !== false); }
function tubosSub() { return (S.tubos.length ? S.tubos : SUB_DEF_TUBOS).filter(t => t.activo !== false); }
const subCable = id => cablesSub().find(c => c.id === id) || (S.cablesSub.length ? S.cablesSub : SUB_DEF_CABLES).find(c => c.id === id) || null;
const subTubo = id => tubosSub().find(t => t.id === id) || (S.tubos.length ? S.tubos : SUB_DEF_TUBOS).find(t => t.id === id) || null;
function newSubLinea(estado, pts) {
  const s = SUB(), n = s.lineas.filter(l => l.estado === estado).length + 1;
  const def = cablesSub().find(c => c.secFase === 150) || cablesSub()[0];
  return { id: uid('s'), nombre: (estado === 'nuevo' ? 'LSBT-' : 'LSBT-E') + n, estado, pts: pts || [], cableId: estado === 'nuevo' ? 'auto' : (def?.id || ''), instal: 'zanja', potencia: '', cosphi: '', dUprev: '', zanjaId: '' };
}
function newZanja(estado, pts) {
  const s = SUB(), n = s.zanjas.filter(z => z.estado === estado).length + 1;
  return { id: uid('z'), nombre: (estado === 'nuevo' ? 'Z' : 'ZE') + n, estado, pts: pts || [], tipo: 'acera', prof: 0.7, ancho: 0.4, entubada: true, hormigon: false, nTubos: 2, tuboId: 'TPE-160', tubos: [{ tuboId: 'TPE-160', n: 2 }], sep: 'auto' };
}

/* ---------- Geometría ---------- */
const interp = (tab, x) => { if (x <= tab[0][0]) return tab[0][1]; for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [x0, y0] = tab[i - 1], [x1, y1] = tab[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); } return tab[tab.length - 1][1]; };
const lenUsada = (o, Lc) => Number(o.lManual) > 0 ? Number(o.lManual) : Lc;
const polyLen = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); return L; };
function distToPoly(P, pts) { let d = Infinity; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(P, pts[i], pts[i + 1]).d); return d; }
/* Fracción de la línea que discurre dentro de la zanja (a menos de tol metros de su eje) */
function overlapFrac(lpts, zpts, tol) {
  if (lpts.length < 2 || zpts.length < 2) return 0;
  let tot = 0, inn = 0;
  for (let i = 0; i < lpts.length - 1; i++) {
    const A = lpts[i], B = lpts[i + 1], L = Math.hypot(B.x - A.x, B.y - A.y), n = Math.max(1, Math.ceil(L));
    for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, P = { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t }; tot += L / n; if (distToPoly(P, zpts) <= tol) inn += L / n; }
  }
  return tot ? inn / tot : 0;
}
/* Arquetas: en los cambios de dirección y, en tramos rectos, como máximo cada 40 m (ITC-BT-07 2.1.2) */
function arquetasZanja(z, k = 1, Lman = 0) {
  const p = z.pts, out = []; if (p.length < 2) { const n = Math.max(0, Math.ceil(Lman / 40) - 1); for (let i = 0; i < n; i++) out.push({ motivo: 'tramo recto' }); return out; }
  const az = (a, b) => Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI;
  const corner = i => { const d = Math.abs(((az(p[i - 1], p[i]) - az(p[i], p[i + 1]) + 540) % 360) - 180); return d > 10; };
  let runStart = 0;
  const addRun = (i0, i1) => { // tramo recto de p[i0] a p[i1] (puede tener vértices sin giro)
    const sub = p.slice(i0, i1 + 1), L = polyLen(sub), n = Math.ceil(L * k / 40) - 1;
    for (let k = 1; k <= n; k++) { let d = L * k / (n + 1); for (let j = 0; j < sub.length - 1; j++) { const s = Math.hypot(sub[j + 1].x - sub[j].x, sub[j + 1].y - sub[j].y); if (d <= s) { const t = d / s; out.push({ x: sub[j].x + (sub[j + 1].x - sub[j].x) * t, y: sub[j].y + (sub[j + 1].y - sub[j].y) * t, motivo: 'tramo recto' }); break; } d -= s; } }
  };
  for (let i = 1; i < p.length - 1; i++) if (corner(i)) { addRun(runStart, i); out.push({ x: p[i].x, y: p[i].y, motivo: 'cambio de dirección' }); runStart = i; }
  addRun(runStart, p.length - 1);
  return out;
}

/* ---------- Cálculo ---------- */
function faAgrup(n, sep) { if (n <= 1) return 1; const k = SUB_FA_N.findIndex(c => c >= n); return SUB_FA[sep][k < 0 ? SUB_FA_N.length - 1 : k]; }
/* Tubos de la zanja: grupos de distinta medida [{ tuboId, n }] (los proyectos antiguos tenían un solo tubo) */
function tubosZ(z) {
  if (!Array.isArray(z.tubos)) z.tubos = [{ tuboId: z.tuboId || 'TPE-160', n: Number(z.nTubos) || 0 }];
  z.nTubos = z.tubos.reduce((t, g) => t + (Number(g.n) || 0), 0);
  const big = [...z.tubos].filter(g => Number(g.n) > 0).sort((a, b) => (subTubo(b.tuboId)?.dExt || 0) - (subTubo(a.tuboId)?.dExt || 0))[0]; z.tuboId = big?.tuboId || z.tubos[0]?.tuboId || '';
  return z.tubos;
}
function tubosTxt(z, sep = '+') { return tubosZ(z).filter(g => Number(g.n) > 0).map(g => `${g.n}T${subTubo(g.tuboId)?.dExt || '?'}`).join(sep) || '0T'; }
function tubosLista(z) { const out = []; tubosZ(z).forEach(g => { const t = subTubo(g.tuboId); for (let k = 0; k < (Number(g.n) || 0); k++) out.push(t); }); return out.filter(Boolean).sort((a, b) => b.dInt - a.dInt); }
function sepZanja(z) { if (z.sep && z.sep !== 'auto') return z.sep; tubosZ(z); const t = subTubo(z.tuboId); const d = z.entubada && t ? t.dExt / 1000 : 0; return ['0.25', '0.2', '0.15', '0.1', '0.07'].find(v => d >= Number(v)) || '0'; }
const SUB_INSTAL = [['zanja', 'Según zanja'], ['tubo', 'Bajo tubo'], ['enterrado', 'Directamente enterrado']];
/* Instalación efectiva del cable: bajo tubo o directamente enterrado */
function effTubo(l, z) { if (l.instal === 'tubo') return true; if (l.instal === 'enterrado') return false; return z ? !!z.entubada : true; }
const instalTxt = t => t ? 'bajo tubo' : 'directamente enterrado';
function cabOf(l) { return S.subCab?.get(l.id) || subCable(l.cableId); }
function neutroMin(s) { const r = SUB_NEUTRO.find(([f]) => f >= s); return r ? r[1] : 185; }
/* Comprobación de una línea subterránea con un cable dado */
function evalLinea(l, c, z, nC, sep) {
  const par = SUB().par, sp = sumPar(), ch = [], add = (ok, txt) => ch.push({ ok, txt });
  const Lc = polyLen(l.pts), L = lenUsada(l, Lc), prof = z ? Number(z.prof) || 0.7 : 0.7, entub = effTubo(l, z);
  const f = { t: interp(SUB_FT, Number(par.tTerreno)), r: interp(SUB_FR, Number(par.rho)), p: interp(SUB_FP, prof), a: faAgrup(nC, sep), tubo: entub ? SUB_F_TUBO : 1 };
  const mono = Number(c?.fases) === 1;
  const Itab = c ? (Number(c.Imax) || (SUB_T4[c.secFase] || 0) * (mono ? 1.225 : 1)) : 0;
  const Iadm = Itab * f.t * f.r * f.p * f.a * f.tubo;
  const P = Number(l.potencia) > 0 ? Number(l.potencia) : (l.estado === 'nuevo' ? Number(sp.pSol) || 0 : 0);
  const cos = Math.min(1, Math.max(0.5, Number(l.cosphi) || Number(sp.cos) || 0.9)), U = 400, U0 = 230, Uref = mono ? U0 : U;
  const dUprev = Number(l.dUprev) > 0 ? Number(l.dUprev) : Number(sp.dUcon) || 0, dUmax = Number(sp.dUmax) || 5;
  const I = P > 0 ? (mono ? P * 1000 / (U0 * cos) : P * 1000 / (Math.sqrt(3) * U * cos)) : 0;
  const R90 = c ? (Number(c.R20) || 0) * (1 + 0.00403 * 70) : 0, Xk = c ? Number(c.X) || 0 : 0, sin = Math.sqrt(1 - cos * cos);
  const dU = (mono ? 2 : Math.sqrt(3)) * I * (L / 1000) * (R90 * cos + Xk * sin), dUp = dU / Uref * 100, dUtot = dUp + dUprev;
  let okElec = !!c;
  add('ok', `Instalación: ${instalTxt(entub)}${l.instal === 'zanja' || !l.instal ? ' (según la zanja)' : ''}${entub ? ', factor 0,8 (ITC-BT-07 3.1.3)' : ''}.`);
  if (z && l.instal === 'tubo' && !z.entubada) add('bad', `La zanja ${z.nombre} no tiene tubos: márcala como entubada o cambia la instalación.`);
  if (z && !entub && ZANJA_TIPOS[z.tipo]?.horm) add('bad', `En ${ZANJA_TIPOS[z.tipo].n.toLowerCase()} el cable debe ir bajo tubo hormigonado (ITC-BT-07 2.2.1).`);
  if (!c) add('bad', 'Falta elegir el cable.');
  else {
    if (c.secFase < 16) { add('bad', 'Sección mínima de fase en aluminio: 16 mm² (ITC-BT-07 1).'); okElec = false; }
    const nm = mono ? c.secFase : neutroMin(c.secFase); if (mono) add('ok', `Suministro monofásico: 2 conductores unipolares (fase y neutro) a 230 V.`);
    if ((c.secNeutro || 0) < nm) okElec = false;
    add((c.secNeutro || 0) >= nm ? 'ok' : 'bad', `Neutro ${fmt(c.secNeutro)} mm² ${(c.secNeutro || 0) >= nm ? '≥' : '<'} ${nm} mm² mínimo para fase de ${c.secFase} mm² (ITC-BT-07 1${mono ? ': con dos conductores, igual a la fase' : ', tabla 1'}).`);
    if (l.estado === 'nuevo') {
      if (P > 0) {
        if (I > Iadm + 1e-9 || dUtot > dUmax + 1e-9) okElec = false;
        add(I <= Iadm + 1e-9 ? 'ok' : 'bad', `Intensidad ${fmt(I, 1)} A (${fmt(P, 2)} kW, cos φ ${fmt(cos, 2)}) ${I <= Iadm ? '≤' : '>'} admisible ${fmt(Iadm, 1)} A (${fmt(Itab)} A × ${fmt(f.t, 2)} temp. × ${fmt(f.r, 2)} resist. × ${fmt(f.p, 2)} prof. × ${fmt(f.a, 2)} agrup. × ${fmt(f.tubo, 2)} tubo; ITC-BT-07 3.1${mono ? '; dos unipolares: tabla 4 × 1,225' : ''}).`);
        add(dUtot <= dUmax + 1e-9 ? 'ok' : 'bad', `Caída de tensión ${fmt(dUp, 2)} %${dUprev ? ` + ${fmt(dUprev, 2)} % en el punto de conexión = ${fmt(dUtot, 2)} %` : ''} ${dUtot <= dUmax ? '≤' : '>'} ${fmt(dUmax, 1)} % (criterio del proyecto).`);
      } else add('warn', 'Indica la potencia solicitada (en «Datos de la línea» o en la línea) para comprobar intensidad y caída de tensión.');
      if (Number(par.icc) > 0) { const dens = interp(SUB_DCC, Number(par.tcc) || 0.5), Smin = Number(par.icc) * 1000 / dens; if (c.secFase < Smin) okElec = false; add(c.secFase >= Smin ? 'ok' : 'bad', `Cortocircuito ${fmt(par.icc, 1)} kA durante ${fmt(par.tcc, 2)} s: sección mínima ${fmt(Smin, 1)} mm² (${fmt(dens)} A/mm², ITC-BT-07 tabla 16).`); }
    }
  }
  if (!z) add(l.estado === 'nuevo' ? 'warn' : 'ok', `Sin zanja asignada: se ha supuesto ${instalTxt(entub)} a 0,70 m y sin agrupación.`);
  const est = ch.some(x => x.ok === 'bad') ? 'bad' : ch.some(x => x.ok === 'warn') ? 'warn' : 'ok';
  return { l, L, Lc, manual: L !== Lc, c, z, entub, Itab, f, Iadm, I, P, dU, dUp, dUtot, checks: ch, est, okElec };
}
function calcSub() {
  const s = SUB(), par = s.par, out = { lineas: [], zanjas: [], pasos: [] };
  const zan = s.zanjas.filter(z => z.pts.length > 1 || Number(z.lManual) > 0);
  // Asignación línea → zanja (manual o por solape geométrico)
  const asig = new Map();
  s.lineas.forEach(l => {
    if (l.pts.length < 2 && !(Number(l.lManual) > 0)) return;
    let z = l.zanjaId ? zan.find(x => x.id === l.zanjaId) : null, frac = z ? overlapFrac(l.pts, z.pts, Math.max(1, (z.ancho || 0.4) + 0.6)) : 0, auto = false;
    if (!z) { let best = null; zan.forEach(x => { const f = overlapFrac(l.pts, x.pts, Math.max(1, (x.ancho || 0.4) + 0.6)); if (f > 0.3 && (!best || f > best.f)) best = { z: x, f }; }); if (best) { z = best.z; frac = best.f; auto = true; } }
    asig.set(l.id, { z, frac, auto });
  });
  const circ = z => s.lineas.filter(l => asig.get(l.id)?.z === z);
  // Elección automática del conductor (REBT): el de menor sección que cumple
  const lineasCalc = s.lineas.filter(l => l.pts.length > 1 || Number(l.lManual) > 0);
  S.subCab = new Map(); const autoRes = new Map();
  lineasCalc.filter(l => l.cableId === 'auto' && l.estado === 'nuevo').forEach(l => {
    const z = asig.get(l.id)?.z, nC = z ? circ(z).length : 1, sep = z ? sepZanja(z) : '0';
    const fam = cablesSub().filter(c => (Number(c.fases) || 3) === (sumPar().tipo === 'mono' ? 1 : 3)).sort((a, b) => a.secFase - b.secFase);
    let pick = null;
    for (const c of fam) { const r = evalLinea(l, c, z, nC, sep); if (r.okElec) { pick = { c, ok: true }; break; } }
    if (!pick && fam.length) pick = { c: fam[fam.length - 1], ok: false };
    if (pick) { S.subCab.set(l.id, pick.c); autoRes.set(l.id, pick); }
  });
  // Zanjas
  zan.forEach(z => {
    const Lc = polyLen(z.pts), L = lenUsada(z, Lc), lin = circ(z), linT = lin.filter(l => effTubo(l, z)), linD = lin.filter(l => !effTubo(l, z)), tl = z.entubada ? tubosLista(z) : [], t = tl[0] || null, T = ZANJA_TIPOS[z.tipo] || ZANJA_TIPOS.acera, ch = [];
    const add = (ok, txt) => ch.push({ ok, txt });
    if (Number(z.prof) + 1e-9 < T.min) add('bad', `Profundidad ${fmt(z.prof, 2)} m < ${fmt(T.min, 2)} m mínima en ${T.n.toLowerCase()} (ITC-BT-07 2.1.1${T.horm ? ' y 2.2.1' : ''}).`);
    else add('ok', `Profundidad ${fmt(z.prof, 2)} m ≥ ${fmt(T.min, 2)} m (${T.n.toLowerCase()}).`);
    if (T.horm && (!z.entubada || linD.length)) add('bad', `En cruces y calzadas los cables van entubados (ITC-BT-07 2.2.1)${linD.length ? ': ' + linD.map(l => l.nombre).join(', ') + ' va(n) directamente enterrado(s)' : ''}.`);
    if (!z.entubada && linT.length) add('bad', `${linT.map(l => l.nombre).join(', ')} va(n) bajo tubo pero la zanja no tiene tubos: márcala como entubada.`);
    if (T.horm && !z.hormigon) add('bad', 'En cruces y calzadas los tubos van hormigonados (ITC-BT-07 2.2.1).');
    let ratio = null, haz = null, arq = [];
    if (z.entubada) {
      if (!tl.length) add('bad', 'Falta indicar los tubos de la zanja.');
      if (linT.length > tl.length) add('bad', `${linT.length} circuitos bajo tubo y ${tl.length} tubos (${tubosTxt(z, ' + ')}): no se instalará más de un circuito por tubo (ITC-BT-07 2.1.2).`);
      else { const libres = tl.length - linT.length; add(libres >= par.reservaMin ? 'ok' : 'warn', `${linT.length} circuito(s) bajo tubo en ${tl.length} tubo(s) (${tubosTxt(z, ' + ')}): ${libres} libre(s)${libres < par.reservaMin ? ` (criterio de reserva: ${par.reservaMin})` : ''}.`); }
      // Cada circuito va a un tubo: los de mayor haz, a los tubos mayores
      const hz = l => { const cc = cabOf(l); return cc ? (Number(cc.fases) === 1 ? 2 : 2.414) * (cc.diamExt || 0) : 0; };
      linT.map(l => ({ l, h: hz(l) })).sort((a, b) => b.h - a.h).forEach((a, k) => {
        const tk = tl[k]; if (!tk || !a.h) return; const rr = tk.dInt / a.h; if (ratio == null || rr < ratio) { ratio = rr; haz = a.h; }
        add(rr >= 2 ? 'ok' : rr >= 1.5 ? 'warn' : 'bad', `${a.l.nombre} en tubo Ø${fmt(tk.dExt)}: Ø interior ${fmt(tk.dInt)} mm / Ø aparente del circuito ${fmt(a.h, 1)} mm = ${fmt(rr, 2)} ${rr >= 2 ? '> 2' : rr >= 1.5 ? '(admisible solo excepcionalmente, ≥ 1,5)' : '< 1,5: tubo insuficiente'} (ITC-BT-07 3.1.3).`);
      });
      arq = arquetasZanja(z, Lc > 0 ? L / Lc : 1, L);
      if (z.estado === 'nuevo') add('ok', `${arq.length} arqueta(s) intermedia(s) necesaria(s): cambios de dirección y como máximo cada 40 m en recta (ITC-BT-07 2.1.2).`);
    }
    if (linD.length || (!z.entubada && !lin.length)) add('ok', `${linD.length ? linD.map(l => l.nombre).join(', ') + ' directamente enterrado(s)' : 'Cables directamente enterrados'}: lecho de arena de 0,05 m, capa de 0,10 m, protección mecánica y cinta de señalización (ITC-BT-07 2.1.1).`);
    const est = ch.some(c => c.ok === 'bad') ? 'bad' : ch.some(c => c.ok === 'warn') ? 'warn' : 'ok';
    out.zanjas.push({ z, L, Lc, manual: L !== Lc, lin, linT, linD, t, ratio, haz, arq, checks: ch, est, sep: sepZanja(z) });
  });
  // Líneas
  lineasCalc.forEach(l => {
    const a = asig.get(l.id) || {}, z = a.z, zr = z ? out.zanjas.find(q => q.z === z) : null;
    const r = evalLinea(l, cabOf(l), z, zr ? zr.lin.length : 1, zr ? zr.sep : '0');
    if (l.cableId === 'auto' && l.estado === 'nuevo') r.checks.unshift(r.c ? { ok: autoRes.get(l.id)?.ok ? 'ok' : 'bad', txt: autoRes.get(l.id)?.ok ? `Conductor elegido automáticamente: ${r.c.designacion}, el de menor sección que cumple intensidad admisible y caída de tensión${Number(par.icc) > 0 ? ' y cortocircuito' : ''} (REBT, ITC-BT-07).` : `Ningún cable ${sumPar().tipo === 'mono' ? 'monofásico' : 'trifásico'} de la base cumple; se muestra el mayor (${r.c.designacion}). Divide la carga, acorta el tramo o añade cables mayores a la base.` } : { ok: 'bad', txt: 'No hay cables en la base para elegir.' });
    r.est = r.checks.some(c => c.ok === 'bad') ? 'bad' : r.checks.some(c => c.ok === 'warn') ? 'warn' : 'ok';
    Object.assign(r, { auto: a.auto, frac: a.frac, cableAuto: l.cableId === 'auto' });
    out.lineas.push(r);
  });
  // Pasos aéreo-subterráneos: extremo de una línea subterránea sobre un apoyo
  const nodes = S.calc?.nodes || (S.proj.rows.length > 1 ? currentNodes() : []), ex = exNodes();
  s.lineas.forEach(l => { if (l.pts.length < 2) return; [l.pts[0], l.pts[l.pts.length - 1]].forEach(P => {
    const i = nodes.findIndex(n => Math.hypot(n.x - P.x, n.y - P.y) < 0.6); if (i >= 0) { out.pasos.push({ l, apoyo: apName(i), nuevo: true, x: nodes[i].x, y: nodes[i].y }); return; }
    const k = ex.findIndex(n => Math.hypot(n.x - P.x, n.y - P.y) < 0.6); if (k >= 0) out.pasos.push({ l, apoyo: exLabel(k), nuevo: false, x: ex[k].x, y: ex[k].y });
  }); });
  out.bud = budSub(out);
  return out;
}
function budSub(R) {
  const pr = S.precios || {}, L = [], hol = 1 + (Number(pr.holguraCable) || 0) / 100;
  const push = (concepto, ud, cant, pc, pv) => { if (!(cant > 0)) return; L.push({ concepto, ud, cant, coste: cant * (pc || 0), venta: cant * (pv || 0), sinPrecio: !(pc > 0) && !(pv > 0) }); };
  const byCable = {};
  R.lineas.filter(r => r.l.estado === 'nuevo' && r.c).forEach(r => { (byCable[r.c.id] = byCable[r.c.id] || { c: r.c, m: 0 }).m += r.L * hol; });
  Object.values(byCable).forEach(({ c, m }) => push('Cable ' + c.designacion, 'm', m, c.coste, c.venta));
  const byTipo = {}, byTubo = {}; let arq = 0;
  R.zanjas.filter(r => r.z.estado === 'nuevo').forEach(r => {
    byTipo[r.z.tipo] = (byTipo[r.z.tipo] || 0) + r.L;
    if (r.z.entubada) { tubosZ(r.z).forEach(g => { const t = subTubo(g.tuboId); if (t && Number(g.n) > 0) (byTubo[t.id] = byTubo[t.id] || { t, m: 0 }).m += r.L * Number(g.n); }); arq += r.arq.length; }
  });
  Object.entries(byTipo).forEach(([k, m]) => { const n = SUB_PRECIO_TIPO[k] || 'Acera'; push('Zanja · ' + (ZANJA_TIPOS[k]?.n || k).toLowerCase(), 'm', m, pr['zanja' + n + 'Coste'], pr['zanja' + n + 'Venta']); });
  Object.values(byTubo).forEach(({ t, m }) => push(t.designacion, 'm', m, t.coste, t.venta));
  push('Arqueta registrable', 'ud', arq, pr.arquetaCoste, pr.arquetaVenta);
  push('Paso aéreo-subterráneo', 'ud', R.pasos.filter(p => p.l.estado === 'nuevo').length, pr.pasoASCoste, pr.pasoASVenta);
  const tot = L.reduce((a, l) => ({ coste: a.coste + l.coste, venta: a.venta + l.venta }), { coste: 0, venta: 0 });
  return { lineas: L, tot };
}
function subCalc() { try { S.subCalc = subHasData() ? calcSub() : null; } catch (e) { console.error(e); S.subCalc = null; } return S.subCalc; }

/* ---------- Capas y edición en el plano ---------- */
const SUB_LAYERS = { subNueva: ['lineas', 'nuevo'], subEx: ['lineas', 'existente'], zanjaNueva: ['zanjas', 'nuevo'], zanjaEx: ['zanjas', 'existente'] };
Object.assign(LAYERS, { subNueva: 'Líneas subterráneas nuevas', subEx: 'Líneas subterráneas existentes', zanjaNueva: 'Zanjas nuevas', zanjaEx: 'Zanjas existentes' });
function subObjs(layer) { const d = SUB_LAYERS[layer]; if (!d) return null; if (!S.proj.sub) return []; return SUB()[d[0]].filter(o => o.estado === d[1]); }
function isSubLayer(layer) { return !!SUB_LAYERS[layer]; }
/* Inserción: pulsar sobre un tramo intercala un vértice; en vacío, dibuja una polilínea nueva punto a punto */
function subInsert(layer, mx, my) {
  if (!S.proj.zone && !S.proj.rows.length) return toast('Importa primero algún elemento con coordenadas para fijar el huso UTM.');
  const objs = subObjs(layer); let w = worldAt(mx, my); const sn = findSnap({ layer: '__nuevo__' }, mx, my); if (sn) w = { x: sn.x, y: sn.y };
  const d = S.subDraw;
  if (d && d.layer === layer && SUB()[SUB_LAYERS[layer][0]].includes(d.obj)) {
    const last = d.obj.pts[d.obj.pts.length - 1]; const [lx, ly] = S.mapT.P(last);
    if (Math.hypot(lx - mx, ly - my) < 8) return subEndDraw();
    snapshot(); const np = { x: w.x, y: w.y }; setLL(np); d.obj.pts.push(np); refreshAll(); return;
  }
  let hit = null, oi = -1; objs.forEach((o, k) => { const h = hitSegment(o.pts, mx, my); if (h && (!hit || h.d < hit.d)) { hit = h; oi = k; } });
  snapshot();
  if (hit) { const np = { x: w.x, y: w.y }; setLL(np); objs[oi].pts.splice(hit.i + 1, 0, np); refreshAll(); return; }
  const [kind, estado] = SUB_LAYERS[layer]; const np = { x: w.x, y: w.y }; setLL(np);
  const o = kind === 'lineas' ? newSubLinea(estado, [np]) : newZanja(estado, [np]); SUB()[kind].push(o);
  S.subDraw = { layer, obj: o }; toast(`Dibujando ${o.nombre}: pulsa los siguientes puntos. Para terminar pulsa otra vez el último punto, Intro o «Terminar».`);
  refreshAll();
}
function subEndDraw() {
  const d = S.subDraw; S.subDraw = null; if (!d) return;
  const arr = SUB()[SUB_LAYERS[d.layer][0]];
  if (d.obj.pts.length < 2) { const i = arr.indexOf(d.obj); if (i >= 0) arr.splice(i, 1); toast('Tramo descartado: necesita al menos dos puntos.'); }
  else toast(`${d.obj.nombre} terminado (${fmt(polyLen(d.obj.pts), 1)} m). Completa sus datos en «Red subterránea».`);
  refreshAll();
}
function subDelete(layer, h) {
  const objs = subObjs(layer), o = objs[h.li]; if (!o) return; snapshot();
  if (o.pts.length <= 2) { const arr = SUB()[SUB_LAYERS[layer][0]]; arr.splice(arr.indexOf(o), 1); toast(`${o.nombre} borrado.`); }
  else o.pts.splice(h.i, 1);
  if (S.subDraw?.obj === o) S.subDraw = null;
}

/* ---------- Dibujo ---------- */
function subAllPts() { const c = S.proj.sum?.cgp?.x != null ? [S.proj.sum.cgp] : []; if (!S.proj.sub) return c; const s = SUB(); return [...s.lineas, ...s.zanjas].flatMap(o => o.pts).concat(c); }
function subSnapTargets(dp) {
  const cg = S.proj.sum?.cgp; const cgT = cg?.x != null && vis('cgp') ? [{ x: cg.x, y: cg.y, label: 'CGP del cliente' }] : [];
  if (!S.proj.sub) return cgT; const out = [...cgT], s = SUB();
  const own = (layer, li, i) => dp.layer === layer && dp.li === li && dp.i === i;
  Object.keys(SUB_LAYERS).forEach(layer => { if (!vis(layer)) return; subObjs(layer).forEach((o, li) => o.pts.forEach((p, i) => {
    const end = i === 0 || i === o.pts.length - 1; if (own(layer, li, i)) return; if (SUB_LAYERS[layer][0] === 'lineas' && !end) return;
    if (S.subDraw?.obj === o && i === o.pts.length - 1) return;
    out.push({ x: p.x, y: p.y, label: end ? `${i ? 'Fin' : 'Inicio'} de ${o.nombre}` : `Vértice de ${o.nombre}` }); })); });
  return out;
}
function drawSub(D) {
  if (!S.proj.sub) { drawCgp(D); return; }
  const { g, P, screen, col, halo, alongText, longestSeg, vtx, sc, L, tool } = D, s = SUB(), R = S.subCalc;
  const path = pts => { g.beginPath(); pts.forEach((n, i) => { const [x, y] = P(n); i ? g.lineTo(x, y) : g.moveTo(x, y); }); };
  // Zanjas: banda con el ancho real (mínimo visible) y rótulo
  s.zanjas.forEach((z, zi) => {
    const lay = z.estado === 'nuevo' ? 'zanjaNueva' : 'zanjaEx'; if (!vis(lay) || !z.pts.length) return;
    const zr = R?.zanjas.find(q => q.z === z);
    if (z.pts.length > 1) {
      path(z.pts); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = col(z.estado === 'nuevo' ? '--zanja' : '--exist'); g.globalAlpha = z.estado === 'nuevo' ? 0.35 : 0.22;
      g.lineWidth = Math.max(7, (Number(z.ancho) || 0.4) * sc); g.stroke(); g.globalAlpha = 1;
      path(z.pts); g.strokeStyle = col(zr?.est === 'bad' ? '--bad' : z.estado === 'nuevo' ? '--zanja' : '--exist'); g.lineWidth = 1; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]); g.lineCap = 'butt';
      if (vis('zanjaTxt')) { const ls = longestSeg(z.pts); const t = subTubo(z.tuboId);
        const txt = z.txt || `${z.nombre} · ${z.entubada ? tubosTxt(z) : 'sin tubo'} · ${(ZANJA_TIPOS[z.tipo]?.n || '').toLowerCase()} ${fmt(z.prof, 2)} m${zr ? ` · ${fmt(zr.L, 1)} m` : ''}`;
        if (ls.i >= 0) alongText(txt, z.pts[ls.i], z.pts[ls.i + 1], 1, '600 10px ' + col('--f-body'), col(z.estado === 'nuevo' ? '--zanja' : '--exist')); }
      if (vis('arquetas') && zr && z.estado === 'nuevo') zr.arq.filter(a => a.x != null).forEach(a => { const [x, y] = P(a); g.fillStyle = col('--panel'); g.strokeStyle = col('--zanja'); g.lineWidth = 1.5; g.fillRect(x - 4, y - 4, 8, 8); g.strokeRect(x - 4, y - 4, 8, 8); });
    }
    if (screen && tool !== 'pan' && L === lay) z.pts.forEach((n, i) => { const [x, y] = P(n); vtx(x, y, S.selPt?.layer === lay && S.selPt.li === subObjs(lay).indexOf(z) && S.selPt.i === i); });
  });
  // Líneas subterráneas: trazo y punto, rótulo con el cable
  s.lineas.forEach(l => {
    const lay = l.estado === 'nuevo' ? 'subNueva' : 'subEx'; if (!vis(lay) || !l.pts.length) return;
    const lr = R?.lineas.find(q => q.l === l);
    if (l.pts.length > 1) {
      path(l.pts); g.strokeStyle = col(lr?.est === 'bad' ? '--bad' : l.estado === 'nuevo' ? '--sub' : '--exist'); g.lineWidth = l.estado === 'nuevo' ? 2.5 : 2; g.setLineDash([12, 4, 2, 4]); g.stroke(); g.setLineDash([]);
      if (vis('subTxt')) { const ls = longestSeg(l.pts); const c = cabOf(l);
        const txt = l.txt || l.nombre + (c ? ' · ' + c.designacion.replace(/^XZ1 \(S\) 0,6\/1 kV /, '') : '') + (lr ? ' · ' + instalTxt(lr.entub) + ` · ${fmt(lr.L, 1)} m` : '');
        if (ls.i >= 0) alongText(txt, l.pts[ls.i], l.pts[ls.i + 1], -1, 'italic 600 11px ' + col('--f-body'), col(l.estado === 'nuevo' ? '--sub' : '--exist')); }
    } else { const [x, y] = P(l.pts[0]); g.fillStyle = col('--sub'); g.beginPath(); g.arc(x, y, 3, 0, 2 * Math.PI); g.fill(); }
    if (screen && tool !== 'pan' && L === lay) l.pts.forEach((n, i) => { const [x, y] = P(n); vtx(x, y, S.selPt?.layer === lay && S.selPt.li === subObjs(lay).indexOf(l) && S.selPt.i === i); });
  });
  // Pasos aéreo-subterráneos
  drawCgp(D);
  if (R) R.pasos.forEach(p => { if (!vis(p.l.estado === 'nuevo' ? 'subNueva' : 'subEx')) return; const [x, y] = P(p); g.strokeStyle = col('--sub'); g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - 12); g.lineTo(x + 9, y + 4); g.lineTo(x - 9, y + 4); g.closePath(); g.stroke(); });
  if (screen && S.subDraw) { const o = S.subDraw.obj, last = o.pts[o.pts.length - 1]; if (last) { const [x, y] = P(last); g.strokeStyle = col('--sub'); g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 7, 0, 2 * Math.PI); g.stroke(); } }
}

/* ---------- Tarjeta «Red subterránea» ---------- */
const chip = e => `<span class="chip ${e}">${e === 'ok' ? 'cumple' : e === 'warn' ? 'revisar' : 'no cumple'}</span>`;
function renderSub() {
  const box = $('#subBody'); if (!box) return;
  if (box.contains(document.activeElement) && document.activeElement.matches('input[type=text],input[type=number]')) { renderSubResults(); return; }
  const R = subCalc(); const s = S.proj.sub ? SUB() : { lineas: [], zanjas: [], par: { ...SUB_PAR } }, par = s.par;
  const opt = (arr, v, lab = x => x.designacion) => arr.map(x => `<option value="${esc(x.id)}" ${x.id === v ? 'selected' : ''}>${esc(lab(x))}</option>`).join('');
  const zrows = s.zanjas.map((z, k) => { const r = R?.zanjas.find(q => q.z === z);
    return `<tr data-zk="${k}"><td><input type="text" data-z="nombre" value="${esc(z.nombre)}" style="width:7ch"></td>
      <td><select data-z="estado"><option value="nuevo" ${z.estado === 'nuevo' ? 'selected' : ''}>Nueva</option><option value="existente" ${z.estado === 'existente' ? 'selected' : ''}>Existente</option></select></td>
      <td><select data-z="tipo">${Object.entries(ZANJA_TIPOS).map(([k2, t]) => `<option value="${k2}" ${z.tipo === k2 ? 'selected' : ''}>${t.n}</option>`).join('')}</select></td>
      <td colspan="2"><div class="tgrp">${tubosZ(z).map((g, gi) => `<span class="row nowrap"><input class="num" type="number" step="1" min="0" data-zt="${gi}:n" value="${g.n}" style="width:5.5em;min-width:5.5em" ${z.entubada ? '' : 'disabled'} aria-label="Número de tubos"> × <select data-zt="${gi}:tuboId" ${z.entubada ? '' : 'disabled'}>${opt(tubosSub(), g.tuboId, t => 'Ø' + t.dExt + ' mm')}</select>${z.tubos.length > 1 ? `<button class="btn small ghost" data-ztdel="${gi}" aria-label="Quitar esta medida">−</button>` : ''}</span>`).join('')}
        ${z.entubada ? '<button class="btn small ghost" data-ztadd="1" title="Añadir tubos de otra medida">+ medida</button>' : ''}</div></td>
      <td class="n"><input class="num" type="number" step="0.05" min="0" data-z="prof" value="${z.prof}" style="width:7ch"></td>
      <td class="n"><input class="num" type="number" step="0.05" min="0" data-z="ancho" value="${z.ancho}" style="width:7ch"></td>
      <td><input type="checkbox" data-z="entubada" ${z.entubada ? 'checked' : ''} aria-label="Entubada"></td>
      <td><input type="checkbox" data-z="hormigon" ${z.hormigon ? 'checked' : ''} aria-label="Hormigonada"></td>
      <td><select data-z="sep">${SUB_SEP.map(([v, t]) => `<option value="${v}" ${String(z.sep) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
      <td class="n">${r ? fmt(r.Lc, 1) : '—'}</td><td class="n"><input class="num" type="number" step="0.1" min="0" data-z="lManual" value="${z.lManual ?? ''}" placeholder="auto" style="width:8ch" title="Vacío: la longitud calculada"></td><td class="n">${r ? (r.linD.length ? r.linT.length + '/' + r.linD.length : r.lin.length) : 0}</td><td class="n">${r && z.entubada ? r.arq.length : '—'}</td>
      <td>${r ? chip(r.est) : '<span class="note">sin trazar</span>'}</td><td><button class="btn small ghost" data-zdel="${k}" aria-label="Borrar zanja">✕</button></td></tr>`; }).join('');
  const lrows = s.lineas.map((l, k) => { const r = R?.lineas.find(q => q.l === l);
    return `<tr data-lk="${k}"><td><input type="text" data-l="nombre" value="${esc(l.nombre)}" style="width:9ch"></td>
      <td><select data-l="estado"><option value="nuevo" ${l.estado === 'nuevo' ? 'selected' : ''}>Nueva</option><option value="existente" ${l.estado === 'existente' ? 'selected' : ''}>Existente</option></select></td>
      <td><select data-l="cableId"><option value="">—</option>${l.estado === 'nuevo' ? `<option value="auto" ${l.cableId === 'auto' ? 'selected' : ''}>Automático (REBT)${r?.cableAuto && r.c ? ': ' + esc(r.c.designacion.replace(/^XZ1 \(S\) 0,6\/1 kV /, '')) : ''}</option>` : ''}${opt(cablesSub(), l.cableId)}</select></td>
      <td><select data-l="instal">${SUB_INSTAL.map(([v, t]) => `<option value="${v}" ${(l.instal || 'zanja') === v ? 'selected' : ''}>${v === 'zanja' ? `Según zanja${r ? ' (' + instalTxt(r.entub) + ')' : ''}` : t}</option>`).join('')}</select></td>
      <td class="n"><input class="num" type="number" step="any" min="0" data-l="potencia" value="${l.potencia}" placeholder="${l.estado === 'nuevo' && sumPar().pSol ? sumPar().pSol : ''}" style="width:7ch" ${l.estado === 'nuevo' ? '' : 'disabled'}></td>
      <td class="n"><input class="num" type="number" step="0.01" min="0.5" max="1" data-l="cosphi" value="${l.cosphi}" placeholder="${sumPar().cos}" style="width:8ch" ${l.estado === 'nuevo' ? '' : 'disabled'}></td>
      <td class="n"><input class="num" type="number" step="0.1" min="0" data-l="dUprev" value="${l.dUprev}" placeholder="${sumPar().dUcon}" style="width:6ch" ${l.estado === 'nuevo' ? '' : 'disabled'}></td>
      <td><select data-l="zanjaId"><option value="">Automática${r?.z && r.auto ? ' (' + esc(r.z.nombre) + ')' : ''}</option>${s.zanjas.map(z => `<option value="${esc(z.id)}" ${l.zanjaId === z.id ? 'selected' : ''}>${esc(z.nombre)}</option>`).join('')}</select></td>
      <td class="n">${r ? fmt(r.Lc, 1) : '—'}</td><td class="n"><input class="num" type="number" step="0.1" min="0" data-l="lManual" value="${l.lManual ?? ''}" placeholder="auto" style="width:8ch" title="Vacío: la longitud calculada"></td><td class="n">${r && r.I ? fmt(r.I, 1) : '—'}</td><td class="n">${r && r.Iadm ? fmt(r.Iadm, 1) : '—'}</td><td class="n">${r && r.I ? fmt(r.dUtot, 2) : '—'}</td>
      <td>${r ? chip(r.est) : '<span class="note">sin trazar</span>'}</td><td><button class="btn small ghost" data-ldel="${k}" aria-label="Borrar línea">✕</button></td></tr>`; }).join('');
  box.innerHTML = `
    <div class="row" style="margin-bottom:8px">
      <label class="btn small" for="subExLinFile">Importar líneas subt. existentes</label><input id="subExLinFile" type="file" accept=".kmz,.kml" hidden>
      <label class="btn small" for="subExZanFile">Importar zanjas existentes</label><input id="subExZanFile" type="file" accept=".kmz,.kml" hidden>
      <label class="btn small" for="subNuLinFile">Importar líneas subt. nuevas</label><input id="subNuLinFile" type="file" accept=".kmz,.kml" hidden>
      <label class="btn small" for="subNuZanFile">Importar zanjas nuevas</label><input id="subNuZanFile" type="file" accept=".kmz,.kml" hidden>
    </div>
    <p class="note">También puedes dibujarlas en el plano: herramienta «Insertar» y capa «Líneas subterráneas nuevas» o «Zanjas nuevas». Pulsa los vértices uno a uno y termina pulsando otra vez el último punto o con Intro. Los extremos se enganchan a apoyos, tramos y otras zanjas.</p>
    <details style="margin:8px 0"><summary class="note">Parámetros de cálculo (ITC-BT-07)</summary><div class="fields hfields" style="margin-top:8px">
      <label class="f">Temperatura del terreno (°C)<input class="num" type="number" step="1" data-p="tTerreno" value="${par.tTerreno}"></label>
      <label class="f">Resistividad térmica (K·m/W)<input class="num" type="number" step="0.05" data-p="rho" value="${par.rho}"></label>
      <label class="f">Icc en el origen (kA, 0 = no comprobar)<input class="num" type="number" step="0.1" data-p="icc" value="${par.icc}"></label>
      <label class="f">Duración del cortocircuito (s)<input class="num" type="number" step="0.1" data-p="tcc" value="${par.tcc}"></label>
      <label class="f">Tubos de reserva por zanja (criterio)<input class="num" type="number" step="1" min="0" data-p="reservaMin" value="${par.reservaMin}"></label>
    </div><p class="note">Condiciones de referencia del ITC-BT-07: 25 °C, 1 K·m/W y 0,70 m. Cables bajo tubo: factor 0,8. La tensión, la potencia, el cos φ, la caída de tensión en el punto de conexión y la máxima se toman de «Datos de la línea» si la línea no tiene los suyos.</p></details>
    <h3 class="sub">Zanjas <button class="btn small" id="subAddZ">Añadir zanja sin trazado</button></h3>
    <div class="tablewrap"><table class="subt"><thead><tr><th>Zanja</th><th>Estado</th><th>Tipo</th><th colspan="2">Tubos (nº × medida)</th><th class="n">Prof. (m)</th><th class="n">Ancho (m)</th><th>Entub.</th><th>Hormig.</th><th>Separación</th><th class="n">Long. calc. (m)</th><th class="n">Long. manual (m)</th><th class="n">Circ. (tubo/ent.)</th><th class="n">Arquetas</th><th>Estado</th><th></th></tr></thead>
    <tbody>${zrows || '<tr><td colspan="16" class="empty">Sin zanjas. Impórtalas o dibújalas en el plano.</td></tr>'}</tbody></table></div>
    <h3 class="sub">Líneas subterráneas <button class="btn small" id="subAddL">Añadir línea sin trazado</button></h3>
    <div class="tablewrap"><table class="subt"><thead><tr><th>Línea</th><th>Estado</th><th>Cable</th><th>Instalación</th><th class="n">P (kW)</th><th class="n">cos φ</th><th class="n">ΔU previa (%)</th><th>Zanja</th><th class="n">Long. calc. (m)</th><th class="n">Long. manual (m)</th><th class="n">I (A)</th><th class="n">I adm. (A)</th><th class="n">ΔU (%)</th><th>Estado</th><th></th></tr></thead>
    <tbody>${lrows || '<tr><td colspan="15" class="empty">Sin líneas subterráneas. Impórtalas o dibújalas en el plano.</td></tr>'}</tbody></table></div>
    <div id="subResults"></div>`;
  renderSubResults();
}
function renderSubResults() {
  const box = $('#subResults'); if (!box) return; const R = S.subCalc;
  if (!R || (!R.lineas.length && !R.zanjas.length)) { box.innerHTML = ''; return; }
  const det = (titulo, r) => `<details ${r.est !== 'ok' ? 'open' : ''}><summary>${esc(titulo)} ${chip(r.est)}</summary><ul class="checks">${r.checks.map(c => `<li class="${c.ok}">${esc(c.txt)}</li>`).join('')}</ul></details>`;
  const b = R.bud;
  box.innerHTML = `<h3 class="sub">Comprobaciones</h3>${R.zanjas.map(r => det('Zanja ' + r.z.nombre, r)).join('')}${R.lineas.map(r => det('Línea ' + r.l.nombre, r)).join('')}
    ${R.pasos.length ? `<div class="banner info" style="margin-top:8px">Paso aéreo-subterráneo en ${R.pasos.map(p => esc(p.apoyo) + ' (' + esc(p.l.nombre) + ')').join(', ')}: el cable sube por el apoyo protegido con tubo hasta 2,5 m sobre el suelo y se conecta a la red trenzada con terminales y caja de protección según las normas de la distribuidora.</div>` : ''}
    <h3 class="sub">Presupuesto de la red subterránea</h3>
    ${b.lineas.length ? `<div class="tablewrap"><table><thead><tr><th>Concepto</th><th>Ud</th><th class="n">Cantidad</th><th class="n">Coste</th><th class="n">Venta</th></tr></thead><tbody>
    ${b.lineas.map(l => `<tr><td>${esc(l.concepto)} ${l.sinPrecio ? '<span class="chip warn">sin precio</span>' : ''}</td><td>${l.ud}</td><td class="n">${fmt(l.cant, l.ud === 'ud' ? 0 : 1)}</td><td class="n">${eur(l.coste)}</td><td class="n">${eur(l.venta)}</td></tr>`).join('')}
    <tr><td colspan="3"><b>Total red subterránea</b></td><td class="n"><b>${eur(b.tot.coste)}</b></td><td class="n"><b>${eur(b.tot.venta)}</b></td></tr></tbody></table></div>` : '<p class="note">Sin partidas: solo se presupuestan las líneas y zanjas nuevas.</p>'}`;
}
function bindSub() {
  const box = $('#subBody'); if (!box) return;
  const zOf = el => SUB().zanjas[Number(el.closest('tr')?.dataset.zk)], lOf = el => SUB().lineas[Number(el.closest('tr')?.dataset.lk)];
  box.addEventListener('change', ev => {
    const t = ev.target;
    if (t.id === 'subExLinFile' || t.id === 'subExZanFile' || t.id === 'subNuLinFile' || t.id === 'subNuZanFile') {
      const f = t.files[0]; t.value = ''; if (!f) return;
      const map = { subExLinFile: ['lineas', 'existente'], subExZanFile: ['zanjas', 'existente'], subNuLinFile: ['lineas', 'nuevo'], subNuZanFile: ['zanjas', 'nuevo'] };
      return importSub(f, ...map[t.id]);
    }
    const v = t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' ? '' : Number(t.value)) : t.value;
    if (t.dataset.p) { SUB().par[t.dataset.p] = Number(t.value) || 0; }
    else if (t.dataset.zt) { const z = zOf(t); if (!z) return; snapshot(); const [gi, f] = t.dataset.zt.split(':'); const g = tubosZ(z)[Number(gi)]; if (!g) return; g[f] = f === 'n' ? Math.max(0, Math.round(Number(t.value) || 0)) : t.value; tubosZ(z); }
    else if (t.dataset.z) { const z = zOf(t); if (!z) return; snapshot(); z[t.dataset.z] = v; if (t.dataset.z === 'tipo' && ZANJA_TIPOS[v]?.horm) { z.entubada = true; z.hormigon = true; z.prof = Math.max(Number(z.prof) || 0, 0.8); } }
    else if (t.dataset.l) { const l = lOf(t); if (!l) return; snapshot(); l[t.dataset.l] = v; }
    else return;
    refreshAll(); renderSub();
  });
  box.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'subAddL') { snapshot(); SUB().lineas.push(newSubLinea('nuevo', [])); renderSub(); toast('Línea añadida: escribe su longitud en «Long. manual» o trázala en el plano.'); return; }
    if (b.id === 'subAddZ') { snapshot(); SUB().zanjas.push(newZanja('nuevo', [])); renderSub(); toast('Zanja añadida: escribe su longitud en «Long. manual» o trázala en el plano.'); return; }
    if (b.dataset.ztadd) { const z = zOf(b); if (!z) return; snapshot(); const used = new Set(tubosZ(z).map(g => g.tuboId)); const nt = tubosSub().find(t => !used.has(t.id)) || tubosSub()[0]; z.tubos.push({ tuboId: nt?.id || '', n: 1 }); tubosZ(z); refreshAll(); renderSub(); return; }
    if (b.dataset.ztdel != null) { const z = zOf(b); if (!z) return; snapshot(); tubosZ(z).splice(Number(b.dataset.ztdel), 1); tubosZ(z); refreshAll(); renderSub(); return; }
    if (b.dataset.zdel != null) { snapshot(); const z = SUB().zanjas.splice(Number(b.dataset.zdel), 1)[0]; SUB().lineas.forEach(l => { if (l.zanjaId === z?.id) l.zanjaId = ''; }); refreshAll(); renderSub(); }
    if (b.dataset.ldel != null) { snapshot(); SUB().lineas.splice(Number(b.dataset.ldel), 1); refreshAll(); renderSub(); }
  });
  box.addEventListener('focusout', () => setTimeout(() => { if (!box.contains(document.activeElement)) renderSub(); }, 60));
  document.addEventListener('keydown', ev => { if (!S.subDraw) return; if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); subEndDraw(); } });
}
async function importSub(file, kind, estado) {
  try {
    const { lines } = await parseGeoFile(file);
    if (!lines.length) return toast('El archivo no contiene líneas (LineString).');
    const zone = setZoneFrom(lines[0].pts[0]); snapshot();
    const s = SUB(); s[kind] = s[kind].filter(o => !(o.fuente === file.name && o.estado === estado));
    lines.forEach(l => {
      const pts = l.pts.map(p => ({ lat: p.lat, lon: p.lon, ...E.utmFromLatLon(p.lat, p.lon, zone) }));
      const o = kind === 'lineas' ? newSubLinea(estado, pts) : newZanja(estado, pts);
      o.fuente = file.name; o.attrs = l.attrs || {}; if (l.nombre) o.nombre = l.nombre;
      if (kind === 'lineas') { const cond = attrFind(o.attrs, k => /conductor|cable|seccion/.test(k)); const c = cond && cablesSub().find(c => new RegExp('\\b' + c.secFase + '\\b').test(cond)); if (c) o.cableId = c.id; }
      else { const nt = parseInt(attrFind(o.attrs, k => /tubos|n.? ?tub/.test(k)), 10); if (nt > 0) { o.nTubos = nt; o.tubos = [{ tuboId: o.tuboId, n: nt }]; } const pf = parseFloat(String(attrFind(o.attrs, k => /profund/.test(k))).replace(',', '.')); if (pf > 0) o.prof = pf > 5 ? pf / 100 : pf; }
      s[kind].push(o);
    });
    V.fitted = false; refreshAll(); renderSub();
    toast(`${lines.length} ${kind === 'lineas' ? 'línea(s) subterránea(s)' : 'zanja(s)'} ${estado === 'nuevo' ? 'nueva(s)' : 'existente(s)'} importada(s) de ${file.name}.`);
  } catch (e) { toast('No se pudo leer el archivo: ' + e.message); }
}

/* ---------- Bases (cables subterráneos y tubos) y precios ---------- */
const SUBCAB_COLS = [['designacion', 'Designación', 'text'], ['secFase', 'Secc. fase'], ['secNeutro', 'Secc. neutro'], ['diamExt', 'Ø exterior (mm)'], ['fases', 'Fases (1 o 3)'], ['Imax', 'I máx. enterrada (A)'], ['R20', 'R 20 °C (Ω/km)'], ['X', 'X (Ω/km)'], ['coste', 'Coste (€/m)'], ['venta', 'Venta (€/m)'], ['orden', 'Orden']];
const TUBO_COLS = [['designacion', 'Designación', 'text'], ['dExt', 'Ø exterior (mm)'], ['dInt', 'Ø interior (mm)'], ['coste', 'Coste (€/m)'], ['venta', 'Venta (€/m)'], ['orden', 'Orden']];
function renderSubBases() {
  if (!document.activeElement?.closest?.('#subCableTable')) dbTable('#subCableTable', S.cablesSub, SUBCAB_COLS, 'cablesSub');
  if (!document.activeElement?.closest?.('#tuboTable')) dbTable('#tuboTable', S.tubos, TUBO_COLS, 'tubos');
}
function bindSubBases() {
  for (const sel of ['#subCableTable', '#tuboTable']) {
    const el = $(sel); if (!el) continue;
    el.addEventListener('change', ev => { const t = ev.target; if (!t.dataset.f) return; updateDoc(t.dataset.coll, t.dataset.id, t.dataset.f, t.type === 'checkbox' ? t.checked : numOrStr(t.value, t.type)); });
    el.addEventListener('focusout', () => setTimeout(renderSubBases, 50));
    el.addEventListener('click', async ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.askrow) { S.delConfirm = b.dataset.coll + b.dataset.askrow; renderSubBases(); }
      if (b.dataset.delrow) { try { await S.db.doc(`${b.dataset.coll}/${b.dataset.delrow}`).delete(); S.delConfirm = null; } catch (e) { toast('No se pudo borrar: ' + (e.message || e.code)); } }
    });
  }
  const add = (coll, v, msg) => async () => { if (!S.db) return toast('Sin conexión a la base de datos.'); try { await S.db.collection(coll).add(v); toast(msg); } catch (e) { toast('No se pudo añadir: ' + (e.message || e.code)); } };
  const ac = $('#addSubCable'); if (ac) ac.onclick = add('cablesSub', { designacion: 'Nuevo cable subterráneo', secFase: 0, secNeutro: 0, diamExt: 0, fases: 3, Imax: 0, R20: 0, X: 0.08, coste: 0, venta: 0, activo: true, orden: 999 }, 'Cable añadido al final de la tabla.');
  const at = $('#addTubo'); if (at) at.onclick = add('tubos', { designacion: 'Nuevo tubo', dExt: 160, dInt: 136, coste: 0, venta: 0, activo: true, orden: 999 }, 'Tubo añadido al final de la tabla.');
}
/* Suscripción a las bases nuevas; si están vacías la primera vez, se cargan los valores por defecto */
function initSubDb(db) {
  // Carga una sola vez cada elemento de las bases por defecto que falte (registro en config/subSeed: lo que borres no vuelve)
  let cfg = null; const got = { c: false, t: false, a: false }; let aer = [];
  const trySeed = async () => {
    if (cfg === null || !got.c || !got.t || !got.a || S.subSeeding) return; S.subSeeding = true;
    const hechos = new Set(cfg.ids || []), nuevos = [];
    for (const c of aer) { const d = AER_ELEC_DEF[c.id]; if (d && !(Number(c.Imax) > 0) && !hechos.has('fill/' + c.id)) { nuevos.push('fill/' + c.id); try { await db.doc('cables/' + c.id).update({ ...d, fiador: 'almelec' }); } catch (e) { } } }
    for (const [coll, arr, have] of [['cablesSub', SUB_DEF_CABLES, S.cablesSub], ['tubos', SUB_DEF_TUBOS, S.tubos], ['cables', AER_NEW, aer]])
      for (const o of arr) { const key = coll + '/' + o.id; if (hechos.has(key)) continue; nuevos.push(key); if (!have.some(x => x.id === o.id)) { const { id, ...v } = o; try { await db.doc(key).set(v); } catch (e) { } } }
    if (nuevos.length) try { await db.doc('config/subSeed').set({ ids: [...hechos, ...nuevos] }); } catch (e) { }
  };
  db.collection('cables').onSnapshot(qs => { aer = qs.docs.map(d => ({ id: d.id, ...d.data() })); got.a = true; trySeed(); }, () => { });
  db.doc('config/subSeed').onSnapshot(d => { cfg = d.data() || {}; trySeed(); }, () => { cfg = cfg || {}; });
  db.collection('cablesSub').onSnapshot(qs => { S.cablesSub = qs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.orden || 0) - (b.orden || 0)); got.c = true; S.subLoaded.c = true; trySeed(); renderSubBases(); renderSub(); drawMap(); }, () => { });
  db.collection('tubos').onSnapshot(qs => { S.tubos = qs.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.orden || 0) - (b.orden || 0)); got.t = true; S.subLoaded.t = true; trySeed(); renderSubBases(); renderSub(); drawMap(); }, () => { });
}
PRECIO_FIELDS.push(...SUB_PRECIOS);
CAPAS.push(['grupo', 'Suministro'], ['cgp', 'CGP del cliente'], ['grupo', 'Red subterránea'], ['subNueva', 'Líneas subterráneas nuevas'], ['subEx', 'Líneas subterráneas existentes'], ['subTxt', 'Textos de líneas subterráneas'], ['zanjaNueva', 'Zanjas nuevas'], ['zanjaEx', 'Zanjas existentes'], ['zanjaTxt', 'Textos de zanjas'], ['arquetas', 'Arquetas']);

/* ---------- Exportación ---------- */
function subDxfLayers() { return [['BT_CGP', 1], ['BT_SUB_NUEVA', 6], ['BT_SUB_EXISTENTE', 8], ['BT_ZANJA_NUEVA', 40], ['BT_ZANJA_EXISTENTE', 9], ['BT_ARQUETAS', 40], ['BT_TEXTO_SUB', 6], ['BT_TEXTO_ZANJAS', 40]]; }
function subDxf(p, f3) {
  { const c = S.proj.sum?.cgp; if (c?.x != null) { p(0, 'LWPOLYLINE', 8, 'BT_CGP', 90, 4, 70, 1, 10, f3(c.x - 0.4), 20, f3(c.y - 0.25), 10, f3(c.x + 0.4), 20, f3(c.y - 0.25), 10, f3(c.x + 0.4), 20, f3(c.y + 0.25), 10, f3(c.x - 0.4), 20, f3(c.y + 0.25)); p(0, 'TEXT', 8, 'BT_CGP', 10, f3(c.x + 0.6), 20, f3(c.y + 0.3), 30, 0, 40, 0.9, 1, ascii(c.txt || 'CGP ' + cgpTipoTxt(c.tipo) + (c.desc ? ' - ' + c.desc : ''))); } }
  if (!S.proj.sub) return; const s = SUB(), R = S.subCalc || calcSub();
  const poly = (layer, pts) => { for (let i = 0; i < pts.length - 1; i++) p(0, 'LINE', 8, layer, 10, f3(pts[i].x), 20, f3(pts[i].y), 30, 0, 11, f3(pts[i + 1].x), 21, f3(pts[i + 1].y), 31, 0); };
  const label = (layer, pts, txt, off) => { if (pts.length < 2 || !txt) return; let bi = 0, bl = 0; for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); if (d > bl) { bl = d; bi = i; } }
    const A = pts[bi], B = pts[bi + 1]; let an = Math.atan2(B.y - A.y, B.x - A.x) * 180 / Math.PI; if (an > 90) an -= 180; if (an < -90) an += 180; const mx = (A.x + B.x) / 2, my = (A.y + B.y) / 2 + off;
    p(0, 'TEXT', 8, layer, 10, f3(mx), 20, f3(my), 30, 0, 40, 0.8, 1, ascii(txt), 50, an.toFixed(2), 72, 1, 11, f3(mx), 21, f3(my), 31, 0); };
  s.zanjas.filter(z => z.pts.length > 1).forEach(z => { const lay = z.estado === 'nuevo' ? 'BT_ZANJA_NUEVA' : 'BT_ZANJA_EXISTENTE'; poly(lay, z.pts); const t = subTubo(z.tuboId);
    label('BT_TEXTO_ZANJAS', z.pts, z.txt || `${z.nombre} ${z.entubada ? tubosTxt(z) : 'sin tubo'} ${(ZANJA_TIPOS[z.tipo]?.n || '')} ${String(z.prof).replace('.', ',')} m`, -1.2); });
  (R?.zanjas || []).filter(r => r.z.estado === 'nuevo').forEach(r => r.arq.filter(a => a.x != null).forEach(a => { const h = 0.3; p(0, 'LWPOLYLINE', 8, 'BT_ARQUETAS', 90, 4, 70, 1, 10, f3(a.x - h), 20, f3(a.y - h), 10, f3(a.x + h), 20, f3(a.y - h), 10, f3(a.x + h), 20, f3(a.y + h), 10, f3(a.x - h), 20, f3(a.y + h)); }));
  s.lineas.filter(l => l.pts.length > 1).forEach(l => { poly(l.estado === 'nuevo' ? 'BT_SUB_NUEVA' : 'BT_SUB_EXISTENTE', l.pts); const c = cabOf(l); const lr = R?.lineas.find(q => q.l === l); label('BT_TEXTO_SUB', l.pts, l.txt || l.nombre + (c ? ' ' + c.designacion : '') + (lr ? ' ' + instalTxt(lr.entub).toUpperCase() : ''), 0.6); });
}
/* DXF solo con la red subterránea (proyectos sin línea aérea) */
function dxfSubOnly() {
  const L = [], p = (...a) => { for (let k = 0; k < a.length; k += 2) L.push(String(a[k]), String(a[k + 1])); }, f3 = v => v.toFixed(3), layers = subDxfLayers();
  p(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC');
  p(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB');
  p(0, 'TABLE', 2, 'LAYER', 70, layers.length); layers.forEach(([n, c]) => p(0, 'LAYER', 2, n, 70, 0, 62, c, 6, 'CONTINUOUS')); p(0, 'ENDTAB', 0, 'ENDSEC');
  p(0, 'SECTION', 2, 'ENTITIES'); subDxf(p, f3); p(0, 'ENDSEC', 0, 'EOF'); return L.join('\r\n') + '\r\n';
}
function subKml() {
  const cg = S.proj.sum?.cgp, cgK = cg?.lat != null ? `<Placemark><name>CGP del cliente</name><description><![CDATA[${esc(cgpTipoTxt(cg.tipo))}${cg.desc ? ' · ' + esc(cg.desc) : ''}]]></description><Point><coordinates>${cg.lon.toFixed(8)},${cg.lat.toFixed(8)},0</coordinates></Point></Placemark>` : '';
  if (!subHasData() || !S.proj.zone) return cgK; const s = SUB();
  const ll = p => { const q = p.lat != null ? p : { ...p, ...E.latLonFromUtm(p.x, p.y, S.proj.zone) }; return `${q.lon.toFixed(8)},${q.lat.toFixed(8)},0`; };
  const pm = (o, st, desc) => o.pts.length > 1 ? `<Placemark><name>${esc(o.nombre)}</name><styleUrl>#${st}</styleUrl><description><![CDATA[${desc}]]></description><LineString><tessellate>1</tessellate><coordinates>${o.pts.map(ll).join(' ')}</coordinates></LineString></Placemark>` : '';
  return `<Style id="subNueva"><LineStyle><color>ff0c41c2</color><width>3</width></LineStyle></Style><Style id="subEx"><LineStyle><color>ff737373</color><width>2</width></LineStyle></Style>
<Style id="zanjaNueva"><LineStyle><color>9926659a</color><width>8</width></LineStyle></Style><Style id="zanjaEx"><LineStyle><color>66737373</color><width>8</width></LineStyle></Style>
${cgK}<Folder><name>Red subterránea</name>${s.zanjas.map(z => pm(z, z.estado === 'nuevo' ? 'zanjaNueva' : 'zanjaEx', `Zanja ${z.estado} · ${ZANJA_TIPOS[z.tipo]?.n || ''} · ${z.prof} m${z.entubada ? ` · tubos ${tubosTxt(z, ' + ')}` : ''}`)).join('')}
${s.lineas.map(l => pm(l, l.estado === 'nuevo' ? 'subNueva' : 'subEx', `Línea subterránea ${l.estado} · ${cabOf(l)?.designacion || ''} · ${instalTxt(effTubo(l, (S.subCalc?.lineas.find(q => q.l === l) || {}).z))}`)).join('')}</Folder>`;
}
function subGeoFeats() {
  const cg = S.proj.sum?.cgp, cgF = cg?.lat != null ? [{ type: 'Feature', properties: { capa: 'cgp', tipo: cgpTipoTxt(cg.tipo), descripcion: cg.desc || null }, geometry: { type: 'Point', coordinates: [+cg.lon.toFixed(8), +cg.lat.toFixed(8)] } }] : [];
  if (!subHasData() || !S.proj.zone) return cgF; const s = SUB();
  const co = o => o.pts.map(p => { const q = p.lat != null ? p : E.latLonFromUtm(p.x, p.y, S.proj.zone); return [+q.lon.toFixed(8), +q.lat.toFixed(8)]; });
  return [...cgF, ...s.zanjas.filter(z => z.pts.length > 1).map(z => ({ type: 'Feature', properties: { capa: z.estado === 'nuevo' ? 'zanja_nueva' : 'zanja_existente', nombre: z.nombre, tipo: z.tipo, profundidad_m: z.prof, entubada: !!z.entubada, hormigonada: !!z.hormigon, tubos: z.entubada ? tubosTxt(z, ' + ') : null }, geometry: { type: 'LineString', coordinates: co(z) } })),
    ...s.lineas.filter(l => l.pts.length > 1).map(l => ({ type: 'Feature', properties: { capa: l.estado === 'nuevo' ? 'linea_subterranea_nueva' : 'linea_subterranea_existente', nombre: l.nombre, cable: cabOf(l)?.designacion || null, instalacion: instalTxt(effTubo(l, (S.subCalc?.lineas.find(q => q.l === l) || {}).z)), potencia_kW: l.potencia || null }, geometry: { type: 'LineString', coordinates: co(l) } }))];
}
function subCsv() {
  const R = S.subCalc || calcSub(), sep = ';', n = v => String(v ?? '').replace('.', ',');
  const a = ['Tipo;Nombre;Estado;Datos;Longitud (m);I (A);I admisible (A);Caida de tension (%);Resultado'];
  R.zanjas.forEach(r => a.push(['Zanja', r.z.nombre, r.z.estado, `${ZANJA_TIPOS[r.z.tipo]?.n || ''} ${n(r.z.prof)} m ${r.z.entubada ? 'tubos ' + tubosTxt(r.z, ' + ') : 'sin tubo'}, ${r.lin.length} circuitos, ${r.arq.length} arquetas`, n(r.L.toFixed(1)) + (r.manual ? ' (manual)' : ''), '', '', '', r.est].join(sep)));
  R.lineas.forEach(r => a.push(['Linea subterranea', r.l.nombre, r.l.estado, (r.c?.designacion || '') + ', ' + instalTxt(r.entub), n(r.L.toFixed(1)) + (r.manual ? ' (manual)' : ''), r.I ? n(r.I.toFixed(1)) : '', n(r.Iadm.toFixed(1)), r.I ? n(r.dUtot.toFixed(2)) : '', r.est].join(sep)));
  return '﻿' + a.join('\r\n');
}
function informeSub() {
  if (!subHasData()) return ''; const R = S.subCalc || calcSub(), par = SUB().par, td = v => `<td>${v}</td>`;
  const z = R.zanjas.map(r => `<tr>${td(esc(r.z.nombre))}${td(r.z.estado)}${td(ZANJA_TIPOS[r.z.tipo]?.n || '')}${td(fmt(r.z.prof, 2))}${td(r.z.entubada ? `${tubosZ(r.z).filter(g => Number(g.n) > 0).map(g => `${g.n} × Ø${subTubo(g.tuboId)?.dExt || '—'} mm`).join(' + ')}${r.z.hormigon ? ', hormigonados' : ''}` : 'directamente enterrado')}${td(r.lin.length)}${td(fmt(r.L, 1) + (r.manual ? ` (manual; medida ${fmt(r.Lc, 1)})` : ''))}${td(r.z.entubada ? r.arq.length : '—')}${td(r.est === 'ok' ? 'Cumple' : r.est === 'warn' ? 'Revisar' : 'No cumple')}</tr>`).join('');
  const l = R.lineas.map(r => `<tr>${td(esc(r.l.nombre))}${td(r.l.estado)}${td(esc(r.c?.designacion || '—'))}${td(instalTxt(r.entub))}${td(r.z ? esc(r.z.nombre) : '—')}${td(fmt(r.L, 1) + (r.manual ? ` (manual; medida ${fmt(r.Lc, 1)})` : ''))}${td(r.I ? fmt(r.I, 1) : '—')}${td(fmt(r.Iadm, 1))}${td(`${fmt(r.f.t, 2)} · ${fmt(r.f.r, 2)} · ${fmt(r.f.p, 2)} · ${fmt(r.f.a, 2)} · ${fmt(r.f.tubo, 2)}`)}${td(r.I ? fmt(r.dUtot, 2) : '—')}${td(r.est === 'ok' ? 'Cumple' : r.est === 'warn' ? 'Revisar' : 'No cumple')}</tr>`).join('');
  const obs = [...R.zanjas.map(r => ['Zanja ' + r.z.nombre, r]), ...R.lineas.map(r => ['Línea ' + r.l.nombre, r])].map(([t, r]) => `<li><b>${esc(t)}:</b> ${r.checks.map(c => esc(c.txt)).join(' ')}</li>`).join('');
  return `<h2>7. Red subterránea (ITC-BT-07)</h2>
<p class="s">Cables de aluminio con aislamiento XLPE, tensión asignada 0,6/1 kV (UNE-HD 603). Intensidades de la tabla 4 del ITC-BT-07 (terna de unipolares enterrada a 0,70 m, 25 °C, 1 K·m/W) corregidas por temperatura del terreno (${fmt(par.tTerreno)} °C, tabla 6), resistividad térmica (${fmt(par.rho, 2)} K·m/W, tabla 7), profundidad (tabla 9), agrupación de circuitos en la zanja (tabla 8) y 0,8 cuando el cable va bajo tubo (3.1.3); sin ese factor si va directamente enterrado. Caída de tensión a 400 V (trifásico) o 230 V (monofásico, ida y vuelta) con R a 90 °C; límite del proyecto ${fmt(sumPar().dUmax, 1)} %. Profundidad mínima 0,60 m en acera y 0,80 m en calzada; cruces de calles y carreteras entubados y hormigonados a 0,80 m; un circuito por tubo; arquetas en los cambios de dirección y como máximo cada 40 m; Ø interior del tubo ≥ 2 veces el Ø aparente del circuito (1,5 excepcionalmente). Cinta de señalización a 0,10 m del suelo como mínimo y a 0,25 m por encima del cable.</p>
<table><thead><tr><th>Zanja</th><th>Estado</th><th>Tipo</th><th>Prof. (m)</th><th>Canalización</th><th>Circuitos</th><th>Long. (m)</th><th>Arquetas</th><th>Resultado</th></tr></thead><tbody>${z}</tbody></table>
<table><thead><tr><th>Línea</th><th>Estado</th><th>Cable</th><th>Instalación</th><th>Zanja</th><th>Long. (m)</th><th>I (A)</th><th>I adm. (A)</th><th>Factores T·ρ·prof·agrup·tubo</th><th>ΔU (%)</th><th>Resultado</th></tr></thead><tbody>${l}</tbody></table>
<ul class="s">${obs}</ul>
${R.bud.lineas.length ? `<h3>Presupuesto de la red subterránea</h3><table><thead><tr><th>Concepto</th><th>Ud</th><th>Cantidad</th><th>Coste</th><th>Venta</th></tr></thead><tbody>${R.bud.lineas.map(b => `<tr>${td(esc(b.concepto))}${td(b.ud)}${td(fmt(b.cant, b.ud === 'ud' ? 0 : 1))}${td(eur(b.coste))}${td(eur(b.venta))}</tr>`).join('')}<tr><th colspan="3">Total red subterránea</th>${td('<b>' + eur(R.bud.tot.coste) + '</b>')}${td('<b>' + eur(R.bud.tot.venta) + '</b>')}</tr></tbody></table>` : ''}`;
}
/* Paquete ZIP de un proyecto solo subterráneo (sin línea aérea calculada) */
async function exportZipSub() {
  const zone = S.proj.zone, zip = new JSZip(), base = fileBase(zone ? { zone } : null);
  subCalc();
  zip.file(base + '.dxf', dxfSubOnly());
  if (zone) {
    zip.file(base + '.kml', `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(S.proj.nombre)}</name>\n${subKml()}\n</Document></kml>`);
    zip.file(base + '.geojson', JSON.stringify({ type: 'FeatureCollection', name: S.proj.nombre, features: subGeoFeats() }, null, 1));
  }
  zip.file(base + '_red_subterranea.csv', subCsv());
  zip.file(base + '_anexo_calculo.html', `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Anexo de cálculo · ${esc(S.proj.nombre)}</title><style>body{font:12px/1.4 Arial,sans-serif;margin:24px;color:#1b2328}h1{font-size:18px}h2{font-size:14px;margin-top:18px}table{border-collapse:collapse;margin:8px 0;width:100%}td,th{border:1px solid #b9c2c7;padding:3px 6px;text-align:left}.s{color:#4c5960}</style></head><body><h1>Anexo de cálculo · ${esc(S.proj.nombre || 'Red subterránea')}</h1><p class="s">Cálculo de Apoyos BT v${VERSION} · ${new Date().toLocaleString('es-ES')}</p>${informeSub()}</body></html>`);
  zip.file('LEEME.txt', [`PAQUETE DE EXPORTACION - ${ascii(S.proj.nombre)} (red subterranea)`, '',
    zone ? `Sistema de coordenadas: ETRS89 / UTM huso ${zone}N (EPSG:258${zone}).` : 'Sin georreferencia.', '',
    `- ${base}.dxf: capas BT_SUB_NUEVA, BT_SUB_EXISTENTE, BT_ZANJA_NUEVA, BT_ZANJA_EXISTENTE, BT_ARQUETAS, BT_TEXTO_SUB, BT_TEXTO_ZANJAS.`,
    zone ? `- ${base}.kml y ${base}.geojson: lineas subterraneas y zanjas (WGS84).` : null,
    `- ${base}_red_subterranea.csv: zanjas y lineas con sus resultados.`, `- ${base}_anexo_calculo.html: anexo de calculo segun ITC-BT-07.`].filter(Boolean).join('\r\n') + '\r\n');
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  if (await saveFile(base + '.zip', blob)) toast('Paquete guardado.');
}

/* =====================================================================
   SUMINISTRO SOLICITADO Y ELECCIÓN DEL CONDUCTOR (REBT)
   ===================================================================== */
/* Cables aéreos: datos eléctricos (ITC-BT-06 tablas 3 y 4) y cables sin neutro fiador */
const AER_ELEC_DEF = {"RZ-1x25Al-54_6Alm": {"fases": 1, "Imax": 110, "R20": 1.2, "Rn20": 0.63, "X": 0.1}, "RZ-1x50Al-54_6Alm": {"fases": 1, "Imax": 165, "R20": 0.641, "Rn20": 0.63, "X": 0.1}, "RZ-2x25Al-54_6Alm": {"fases": 2, "Imax": 100, "R20": 1.2, "Rn20": 0.63, "X": 0.1}, "RZ-3x25Al-54_6Alm": {"fases": 3, "Imax": 100, "R20": 1.2, "Rn20": 0.63, "X": 0.1}, "RZ-3x50Al-54_6Alm": {"fases": 3, "Imax": 150, "R20": 0.641, "Rn20": 0.63, "X": 0.1}, "RZ-3x95Al-54_6Alm": {"fases": 3, "Imax": 230, "R20": 0.32, "Rn20": 0.63, "X": 0.1}, "RZ-3x150Al-80Alm": {"fases": 3, "Imax": 305, "R20": 0.206, "Rn20": 0.43, "X": 0.1}};
const AER_NEW = [{"id": "RZ-2x16Al-acero", "designacion": "RZ 0,6/1 kV 2x16Al (sin neutro fiador, con fiador de acero)", "secFase": 16, "diamHaz": 15.0, "pesoKgKm": 150, "diamFase": 7.5, "secFiador": 22, "roturaFiador": 800, "moduloE": 17000, "alpha": 11.5, "fases": 1, "Imax": 81, "R20": 1.91, "Rn20": 1.91, "X": 0.1, "fiador": "acero", "coste": 0, "venta": 0, "activo": true, "orden": 10}, {"id": "RZ-2x25Al-acero", "designacion": "RZ 0,6/1 kV 2x25Al (sin neutro fiador, con fiador de acero)", "secFase": 25, "diamHaz": 17.5, "pesoKgKm": 210, "diamFase": 8.7, "secFiador": 22, "roturaFiador": 800, "moduloE": 17000, "alpha": 11.5, "fases": 1, "Imax": 109, "R20": 1.2, "Rn20": 1.2, "X": 0.1, "fiador": "acero", "coste": 0, "venta": 0, "activo": true, "orden": 11}, {"id": "RZ-4x16Al-acero", "designacion": "RZ 0,6/1 kV 4x16Al (sin neutro fiador, con fiador de acero)", "secFase": 16, "diamHaz": 20.5, "pesoKgKm": 290, "diamFase": 7.5, "secFiador": 22, "roturaFiador": 800, "moduloE": 17000, "alpha": 11.5, "fases": 3, "Imax": 72, "R20": 1.91, "Rn20": 1.91, "X": 0.1, "fiador": "acero", "coste": 0, "venta": 0, "activo": true, "orden": 12}, {"id": "RZ-4x25Al-acero", "designacion": "RZ 0,6/1 kV 4x25Al (sin neutro fiador, con fiador de acero)", "secFase": 25, "diamHaz": 24.0, "pesoKgKm": 420, "diamFase": 8.7, "secFiador": 22, "roturaFiador": 800, "moduloE": 17000, "alpha": 11.5, "fases": 3, "Imax": 97, "R20": 1.2, "Rn20": 1.2, "X": 0.1, "fiador": "acero", "coste": 0, "venta": 0, "activo": true, "orden": 13}, {"id": "RZ-4x50Al-acero", "designacion": "RZ 0,6/1 kV 4x50Al (sin neutro fiador, con fiador de acero)", "secFase": 50, "diamHaz": 30.5, "pesoKgKm": 760, "diamFase": 11.2, "secFiador": 22, "roturaFiador": 800, "moduloE": 17000, "alpha": 11.5, "fases": 3, "Imax": 144, "R20": 0.641, "Rn20": 0.641, "X": 0.1, "fiador": "acero", "coste": 0, "venta": 0, "activo": true, "orden": 14}, {"id": "RZ-3x95-50Al-acero", "designacion": "RZ 0,6/1 kV 3x95/50Al (sin neutro fiador, con fiador de acero)", "secFase": 95, "diamHaz": 38.0, "pesoKgKm": 1250, "diamFase": 14.6, "secFiador": 22, "roturaFiador": 800, "moduloE": 17000, "alpha": 11.5, "fases": 3, "Imax": 223, "R20": 0.32, "Rn20": 0.641, "X": 0.1, "fiador": "acero", "coste": 0, "venta": 0, "activo": true, "orden": 15}, {"id": "RZ-3x150-95Al-acero", "designacion": "RZ 0,6/1 kV 3x150/95Al (sin neutro fiador, con fiador de acero)", "secFase": 150, "diamHaz": 46.0, "pesoKgKm": 1900, "diamFase": 17.8, "secFiador": 22, "roturaFiador": 800, "moduloE": 17000, "alpha": 11.5, "fases": 3, "Imax": 301, "R20": 0.206, "Rn20": 0.32, "X": 0.1, "fiador": "acero", "coste": 0, "venta": 0, "activo": true, "orden": 16}];
const USOS = [['vivienda', 'Vivienda'], ['local', 'Local comercial u oficina'], ['industrial', 'Industrial'], ['agricola', 'Agrícola o ganadero'], ['alumbrado', 'Alumbrado público'], ['recarga', 'Recarga de vehículo eléctrico'], ['obras', 'Suministro de obra o provisional'], ['servicios', 'Servicios comunes de edificio'], ['otros', 'Otros usos']];
const TENSIONES = [['230', '230 V · monofásica'], ['400', '400 V · trifásica (3x400/230 V)']];
const SUM_DEF = { pSol: '', tension: '400', uso: 'vivienda', cos: 0.9, pDisp: '', dUcon: 0, dUmax: 5, auto: true };
function sumPar() { const s = S.proj.sum = { ...SUM_DEF, ...(S.proj.sum || {}) }; s.tipo = String(s.tension) === '230' ? 'mono' : 'tri'; return s; }
const usoTxt = k => (USOS.find(u => u[0] === k) || [, k])[1];
/* Datos eléctricos de los cables trenzados (ITC-BT-06 tabla 3, 40 °C; R del aluminio a 20 °C) */
const AER_IMAX = { '1x25': 110, '1x50': 165, '3x25': 100, '3x50': 150, '3x95': 230, '3x150': 305, '2x25': 100 };
const AL_R20 = { 16: 1.91, 25: 1.20, 35: 0.868, 50: 0.641, 70: 0.443, 95: 0.320, 120: 0.253, 150: 0.206, 185: 0.164, 240: 0.125 };
const ALM_R20 = { 54.6: 0.630, 80: 0.430 };
function aerElec(c) {
  if (!c) return null;
  const m = String(c.designacion || '').match(/(\d)\s*x\s*(\d+)\s*(?:\/\s*\d+\s*)?Al\s*\/?\s*([\d,.]+)?/i), n = m ? Number(m[1]) : 3, sec = Number(c.secFase) || (m ? Number(m[2]) : 0), neu = Number(c.secFiador) || (m && m[3] ? Number(m[3].replace(',', '.')) : 54.6), dd = AER_ELEC_DEF[c.id] || {};
  return { fases: Number(c.fases) || dd.fases || (n === 4 ? 3 : n === 2 ? 1 : n), sec, Imax: Number(c.Imax) || dd.Imax || AER_IMAX[n + 'x' + sec] || 0, R20: Number(c.R20) || dd.R20 || AL_R20[sec] || 0, Rn20: Number(c.Rn20) || dd.Rn20 || ALM_R20[neu] || 0.630, X: Number(c.X) || dd.X || 0.1 };
}
/* Línea aérea nueva: datos propios (vacíos = los del suministro solicitado) */
const AER_INSTAL = [['tensado', 'Tensado sobre apoyos'], ['posado', 'Posado sobre fachada']];
const AER_POSADA = { 'RZ-2x16Al-acero': 73, 'RZ-2x25Al-acero': 101, 'RZ-4x16Al-acero': 67, 'RZ-4x25Al-acero': 90, 'RZ-4x50Al-acero': 133, 'RZ-3x95-50Al-acero': 207, 'RZ-3x150-95Al-acero': 277 };
function aerLinea() { return S.proj.aerLinea = { nombre: 'LBT-1', instal: 'tensado', potencia: '', cosphi: '', dUprev: '', ...(S.proj.aerLinea || {}) }; }
function evalAereo(c, L) {
  const sp = sumPar(), A = aerLinea(), e = aerElec(c), ch = [], add = (ok, txt) => ch.push({ ok, txt });
  const P = Number(A.potencia) > 0 ? Number(A.potencia) : Number(sp.pSol) || 0, cos = Math.min(1, Math.max(0.5, Number(A.cosphi) || Number(sp.cos) || 0.9)), sin = Math.sqrt(1 - cos * cos), mono = sp.tipo === 'mono';
  const posado = A.instal === 'posado', Imax = e ? (posado && c && AER_POSADA[c.id] ? AER_POSADA[c.id] : e.Imax) : 0;
  const I = P > 0 ? (mono ? P * 1000 / (230 * cos) : P * 1000 / (Math.sqrt(3) * 400 * cos)) : 0, k90 = 1 + 0.00403 * 70;
  const dU = !e ? 0 : mono ? I * (L / 1000) * ((e.R20 + e.Rn20) * k90 * cos + 2 * e.X * sin) : Math.sqrt(3) * I * (L / 1000) * (e.R20 * k90 * cos + e.X * sin);
  const dUprev = Number(A.dUprev) > 0 ? Number(A.dUprev) : Number(sp.dUcon) || 0;
  const dUp = dU / (mono ? 230 : 400) * 100, dUtot = dUp + dUprev, dUmax = Number(sp.dUmax) || 5;
  let ok = !!e && P > 0;
  if (e) {
    add('ok', `Instalación: ${posado ? 'posado sobre fachada' : 'tensado sobre apoyos'} (ITC-BT-06 ${posado ? '3.1.1' : '3.1.2'}); conductores aislados 0,6/1 kV de aluminio${c.fiador === 'acero' ? ', con fiador de acero' : ', con neutro fiador de Almelec'}.`);
    if (e.sec < 16) { ok = false; add('bad', 'Sección mínima de los conductores de aluminio: 16 mm² (ITC-BT-06 1.1.1).'); }
    if (!mono && e.fases < 3) { ok = false; add('bad', `${c.designacion} no tiene tres fases: no sirve para un suministro trifásico.`); }
    if (P > 0) {
      if (!(I <= Imax + 1e-9)) ok = false;
      add(I <= Imax + 1e-9 ? 'ok' : 'bad', `Intensidad ${fmt(I, 1)} A (${fmt(P, 2)} kW a ${mono ? '230 V' : '400 V'}, cos φ ${fmt(cos, 2)}) ${I <= Imax ? '≤' : '>'} ${fmt(Imax)} A admisible de ${c.designacion} ${posado ? 'posado' : 'tensado'} (ITC-BT-06 tabla ${c.fiador === 'acero' ? 4 : 3}, 40 °C).`);
      if (dUtot > dUmax + 1e-9) ok = false;
      add(dUtot <= dUmax + 1e-9 ? 'ok' : 'bad', `Caída de tensión ${fmt(dUp, 2)} % en ${fmt(L, 1)} m${dUprev ? ` + ${fmt(dUprev, 2)} % en el punto de conexión = ${fmt(dUtot, 2)} %` : ''} ${dUtot <= dUmax ? '≤' : '>'} ${fmt(dUmax, 1)} % (carga al final de la línea, R a 90 °C).`);
    } else add('warn', 'Indica la potencia solicitada (en «Datos de la línea» o en la línea) para comprobar intensidad y caída de tensión.');
  }
  return { c, e, P, I, Imax, L, dUp, dUtot, ok, checks: ch };
}
/* Elige el cable trenzado de menor sección que cumple (se ejecuta antes del cálculo mecánico) */
function autoCableAereo() {
  S.elecAer = null; const sp = sumPar();
  if (!sp.auto || !(Number(aerLinea().potencia) > 0 || Number(sp.pSol) > 0) || S.proj.rows.length < 2 || !S.cables.length) return;
  const nodes = currentNodes(), spans = E.buildGeometry(nodes), L = spans.reduce((t, s) => t + s.a, 0);
  const act = S.cables.filter(c => c.activo !== false && aerElec(c).Imax > 0);
  const fam = sp.tipo === 'mono' ? [...act.filter(c => aerElec(c).fases === 1), ...act.filter(c => aerElec(c).fases >= 3)] : act.filter(c => aerElec(c).fases >= 3);
  const ord = (a, b) => aerElec(a).sec - aerElec(b).sec || (a.fiador === 'acero') - (b.fiador === 'acero') || aerElec(a).Imax - aerElec(b).Imax;
  const cand = sp.tipo === 'mono' ? [...fam.filter(c => aerElec(c).fases === 1).sort(ord), ...fam.filter(c => aerElec(c).fases >= 3).sort(ord)] : fam.sort(ord);
  let pick = cand.find(c => evalAereo(c, L).ok), ok = !!pick; if (!pick) pick = cand[cand.length - 1];
  if (!pick) return;
  S.elecAer = { auto: true, ok, id: pick.id };
  if (S.proj.cableId !== pick.id) { S.proj.cableId = pick.id; const sel = $('#p_cable'); if (sel) sel.value = pick.id; }
}
function elecAereoRes() {
  if (!S.calc || S.proj.rows.length < 2) return null;
  const L = S.calc.spans.reduce((t, s) => t + s.a, 0), r = evalAereo(S.calc.cable, L);
  if (S.elecAer?.auto) r.checks.unshift(S.elecAer.ok ? { ok: 'ok', txt: `Cable trenzado elegido automáticamente: ${S.calc.cable.designacion}, el de menor sección que cumple intensidad y caída de tensión (REBT, ITC-BT-06).` } : { ok: 'bad', txt: `Ningún cable trenzado de la base cumple; se ha tomado el mayor (${S.calc.cable.designacion}). Revisa la potencia, la longitud o la base de cables.` });
  return r;
}
function sumBanners() {
  const sp = sumPar(), out = [], ct = S.proj.ct || {};
  if (Number(ct.potencia) > 0 && Number(sp.pSol) > 0) { const kva = Number(sp.pSol) / (Number(sp.cos) || 0.9); out.push(kva <= Number(ct.potencia) ? { ok: 'ok', txt: `Potencia aparente solicitada ${fmt(kva, 1)} kVA ≤ ${fmt(ct.potencia)} kVA del CT ${ct.matricula || ''}`.trim() + '.' } : { ok: 'bad', txt: `La potencia aparente solicitada (${fmt(kva, 1)} kVA) supera la potencia del CT ${ct.matricula || ''} (${fmt(ct.potencia)} kVA).` }); }
  if (Number(sp.pDisp) > 0 && Number(sp.pSol) > Number(sp.pDisp)) out.push({ ok: 'bad', txt: `La potencia solicitada (${fmt(sp.pSol, 2)} kW) supera la potencia disponible en el punto de conexión (${fmt(sp.pDisp, 2)} kW).` });
  else if (Number(sp.pDisp) > 0 && Number(sp.pSol) > 0) out.push({ ok: 'ok', txt: `Potencia solicitada ${fmt(sp.pSol, 2)} kW ≤ disponible en el punto de conexión ${fmt(sp.pDisp, 2)} kW.` });
  return out;
}
function renderSum() {
  const box = $('#sumBox'); if (!box) return; if (box.contains(document.activeElement) && document.activeElement.matches('input')) return renderSumRes();
  const sp = sumPar();
  const ct = S.proj.ct || (S.proj.ct = { matricula: '', potencia: '', tensionAT: '', tension: 400 });
  box.innerHTML = `<h3 class="sub">Centro de transformación de origen</h3><div class="fields hfields">
    <label class="f">Matrícula del CT<input type="text" data-ct="matricula" value="${esc(ct.matricula || '')}" placeholder="p. ej. CT-12345"></label>
    <label class="f">Potencia (kVA)<input class="num" type="number" step="1" min="0" data-ct="potencia" value="${ct.potencia ?? ''}"></label>
    <label class="f">Tensión primaria (kV)<input class="num" type="number" step="0.1" min="0" data-ct="tensionAT" value="${ct.tensionAT ?? ''}"></label>
    <label class="f">Tensión secundaria (V)<input class="num" type="number" step="1" min="0" data-ct="tension" value="${ct.tension ?? ''}"></label>
  </div>
  <h3 class="sub">Suministro solicitado</h3><div class="fields hfields">
    <label class="f">Potencia solicitada (kW)<input class="num" type="number" step="0.01" min="0" data-s="pSol" value="${sp.pSol}"></label>
    <label class="f">Tensión solicitada<select data-s="tension">${TENSIONES.map(([v, t]) => `<option value="${v}" ${String(sp.tension) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f w2">Uso solicitado<select data-s="uso">${USOS.map(([v, t]) => `<option value="${v}" ${sp.uso === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f">cos φ<input class="num" type="number" step="0.01" min="0.5" max="1" data-s="cos" value="${sp.cos}"></label>
    <label class="f">Potencia disponible en el punto de conexión (kW)<input class="num" type="number" step="0.01" min="0" data-s="pDisp" value="${sp.pDisp}"></label>
    <label class="f">ΔU en el punto de conexión (%)<input class="num" type="number" step="0.1" min="0" data-s="dUcon" value="${sp.dUcon}"></label>
    <label class="f">ΔU máxima admisible (%)<input class="num" type="number" step="0.1" min="0" data-s="dUmax" value="${sp.dUmax}"></label>
    <label class="chk w2"><input type="checkbox" data-s="auto" ${sp.auto ? 'checked' : ''}> Elegir el conductor automáticamente (REBT)</label>
  </div>
  <h3 class="sub">CGP del cliente</h3><div class="fields hfields">
    <label class="f w2">Ubicación de la CGP<select data-cg="tipo">${CGP_TIPOS.map(([v, t]) => `<option value="${v}" ${(sp.cgp?.tipo || 'fachada') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
    <label class="f w2">Descripción (dirección, fachada…)<input type="text" data-cg="desc" value="${esc(sp.cgp?.desc || '')}" placeholder="p. ej. Rúa Nova 12, fachada principal"></label>
    <label class="f w2">Coordenadas (lat, lon o X Y UTM)<input type="text" data-cg="coord" value="${sp.cgp?.lat != null ? sp.cgp.lat.toFixed(7) + ', ' + sp.cgp.lon.toFixed(7) : ''}" placeholder="42.8590, -8.6510"></label>
    <div class="f w2" style="justify-content:flex-end"><span class="row"><button class="btn small" id="cgpPick">${S.pickCgp ? 'Pulsa en el plano…' : 'Situar en el plano'}</button>${sp.cgp?.x != null ? '<button class="btn small ghost" id="cgpDel">Quitar</button>' : ''}</span></div>
  </div><div id="sumRes"></div>`;
  renderSumRes();
}
function renderSumRes() {
  const box = $('#sumRes'); if (!box) return; const sp = sumPar(), r = elecAereoRes(), R = S.subCalc;
  const li = c => `<li class="${c.ok}">${esc(c.txt)}</li>`;
  const sub = (R?.lineas || []).filter(x => x.l.estado === 'nuevo');
  if (!(Number(sp.pSol) > 0)) { box.innerHTML = (cgpChecks().length ? `<ul class="checks">${cgpChecks().map(li).join('')}</ul>` : '') + '<p class="note">Escribe la potencia solicitada para que la aplicación compruebe y elija los conductores de la línea aérea y de las líneas subterráneas nuevas.</p>'; return; }
  box.innerHTML = `<ul class="checks">${sumBanners().map(li).join('')}${cgpChecks().map(li).join('')}
    ${r ? r.checks.map(li).join('') : '<li class="warn">Línea aérea: dibuja o importa el trazado para comprobar el cable trenzado.</li>'}
    ${sub.map(x => `<li class="${x.est}">${esc(x.l.nombre)}: ${esc(x.c?.designacion || 'sin cable')}${x.I ? ` · ${fmt(x.I, 1)} A de ${fmt(x.Iadm, 1)} A · ΔU ${fmt(x.dUtot, 2)} %` : ''}${x.cableAuto ? ' (automático)' : ''}</li>`).join('')}</ul>`;
}
function bindSum() {
  const box = $('#sumBox'); if (!box) return;
  box.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'cgpPick') { S.pickCgp = !S.pickCgp; renderSum(); if (S.pickCgp) { $('#map')?.scrollIntoView({ block: 'center' }); toast('Pulsa en el plano donde está la CGP del cliente (se engancha a apoyos y extremos de línea).'); } }
    if (b.id === 'cgpDel') { snapshot(); delete sumPar().cgp; refreshAll(); renderSum(); }
  });
  box.addEventListener('change', ev => {
    const t = ev.target;
    if (t.dataset.ct) { const ct = S.proj.ct || (S.proj.ct = {}); ct[t.dataset.ct] = t.type === 'number' ? (t.value === '' ? '' : Number(t.value)) : t.value; renderSumRes(); recalc(); return; }
    if (t.dataset.cg) { const sp = sumPar(); sp.cgp = sp.cgp || { tipo: 'fachada', desc: '' };
      if (t.dataset.cg === 'coord') { const ll = parseCoordText(t.value); if (!ll) { toast('Escribe las coordenadas como «latitud, longitud» o «X Y» en UTM.'); return; } const zone = setZoneFrom(ll); const u = E.utmFromLatLon(ll.lat, ll.lon, zone); setCgp(u.x, u.y); return; }
      sp.cgp[t.dataset.cg] = t.value; if (sp.cgp.x == null) { renderSumRes(); return; } refreshAll(); renderSum(); return; }
    if (!t.dataset.s) return; const sp = sumPar();
    sp[t.dataset.s] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? (t.value === '' ? '' : Number(t.value)) : t.value;
    sumPar(); recalc(); renderSub(); renderSum(); drawMap();
  });
  box.addEventListener('focusout', () => setTimeout(() => { if (!box.contains(document.activeElement)) renderSum(); }, 60));
  const sel = $('#p_cable'); if (sel) sel.addEventListener('change', () => { const sp = sumPar(); if (sp.auto && Number(sp.pSol) > 0) { sp.auto = false; renderSum(); toast('Has elegido el cable trenzado a mano: la elección automática queda desactivada (puedes volver a activarla en «Suministro solicitado»).'); } }, true);
}
/* ---------- CGP del cliente (ITC-BT-13) ---------- */
const CGP_TIPOS = [['fachada', 'En fachada (acometida aérea)'], ['nicho', 'En nicho en fachada o muro (acometida subterránea)'], ['valla', 'En valla o cierre de parcela'], ['apoyo', 'En apoyo de la red'], ['otro', 'Otra ubicación']];
const cgpTipoTxt = k => (CGP_TIPOS.find(t => t[0] === k) || [, k || ''])[1];
function setCgp(x, y) { const sp = sumPar(); snapshot(); sp.cgp = { ...(sp.cgp || { tipo: 'fachada', desc: '' }), x, y }; if (S.proj.zone) Object.assign(sp.cgp, E.latLonFromUtm(x, y, S.proj.zone)); S.pickCgp = false; refreshAll(); renderSum(); toast('CGP del cliente situada. Termina la línea en ella: el enganche te lleva a su posición.'); }
function placeCgp(mx, my) { const sn = findSnap({ layer: '__cgp__' }, mx, my), w = sn ? { x: sn.x, y: sn.y } : worldAt(mx, my); setCgp(w.x, w.y); }
function drawCgp(D) {
  const c = S.proj.sum?.cgp; if (c?.x == null || !vis('cgp')) return; const { g, P, col, halo } = D, [x, y] = P(c);
  g.fillStyle = col('--bad'); g.strokeStyle = col('--panel'); g.lineWidth = 2; g.fillRect(x - 9, y - 6, 18, 12); g.strokeRect(x - 9, y - 6, 18, 12);
  g.fillStyle = col('--panel'); g.font = '700 8px ' + col('--f-body'); g.textAlign = 'center'; g.fillText('CGP', x, y + 3);
  g.fillStyle = col('--bad'); g.font = '600 11px ' + col('--f-body'); g.textAlign = 'left'; halo(c.txt || 'CGP cliente' + (c.desc ? ' · ' + c.desc : ''), x + 13, y - 8);
}
function cgpDist() {
  const c = S.proj.sum?.cgp; if (c?.x == null) return [];
  const out = [], nodes = S.calc?.nodes || (S.proj.rows.length > 1 ? currentNodes() : []);
  if (nodes.length > 1) { const n = nodes[nodes.length - 1]; out.push({ que: `último apoyo de la línea aérea (${apName(nodes.length - 1)})`, d: Math.hypot(n.x - c.x, n.y - c.y) }); }
  (S.proj.sub?.lineas || []).filter(l => l.estado === 'nuevo' && l.pts.length > 1).forEach(l => { const d = Math.min(...[l.pts[0], l.pts[l.pts.length - 1]].map(p => Math.hypot(p.x - c.x, p.y - c.y))); out.push({ que: `extremo de ${l.nombre}`, d }); });
  return out;
}
function cgpChecks() {
  const c = S.proj.sum?.cgp, out = [];
  if (c?.x == null) { if (Number(sumPar().pSol) > 0) out.push({ ok: 'warn', txt: 'Sitúa la CGP del cliente en el plano o escribe sus coordenadas.' }); return out; }
  const ds = cgpDist(); const best = ds.sort((a, b) => a.d - b.d)[0];
  if (best) out.push(best.d < 0.6 ? { ok: 'ok', txt: `La línea llega a la CGP del cliente (${best.que}).` } : { ok: 'warn', txt: `La línea nueva termina a ${fmt(best.d, 1)} m de la CGP (${best.que}): prolonga el trazado o la acometida hasta ella.` });
  out.push({ ok: 'ok', txt: `CGP ${cgpTipoTxt(c.tipo).toLowerCase()}${c.desc ? ' · ' + c.desc : ''}: en lugar de libre y permanente acceso, lo más próxima posible a la red y fuera de zonas de paso que dificulten su maniobra (ITC-BT-13 1.1)${c.tipo === 'nicho' ? '; en nicho con puerta metálica y la parte inferior a 0,30 m del suelo como mínimo' : ''}.` });
  return out;
}
function informeElec() {
  const sp = sumPar(); if (!(Number(sp.pSol) > 0) && !sp.cgp) return '';
  const r = elecAereoRes(), li = c => `<li>${esc(c.txt)}</li>`;
  return `<h2>2 bis. Suministro solicitado y comprobación eléctrica (REBT)</h2><table><tbody>
${S.proj.ct?.matricula || S.proj.ct?.potencia ? `<tr><td>Centro de transformación de origen</td><td>${esc(S.proj.ct.matricula || '—')}${S.proj.ct.potencia ? ' · ' + fmt(S.proj.ct.potencia) + ' kVA' : ''}${S.proj.ct.tensionAT ? ' · ' + fmt(S.proj.ct.tensionAT, 1) + ' kV' : ''}${S.proj.ct.tension ? ' / ' + fmt(S.proj.ct.tension) + ' V' : ''}</td></tr>` : ''}<tr><td>Potencia solicitada</td><td>${fmt(sp.pSol, 2)} kW</td></tr><tr><td>Tensión solicitada</td><td>${esc((TENSIONES.find(t => t[0] === String(sp.tension)) || [, sp.tension])[1])}</td></tr>
<tr><td>Uso solicitado</td><td>${esc(usoTxt(sp.uso))}</td></tr><tr><td>cos φ</td><td>${fmt(sp.cos, 2)}</td></tr>
${Number(sp.pDisp) > 0 ? `<tr><td>Potencia disponible en el punto de conexión</td><td>${fmt(sp.pDisp, 2)} kW</td></tr>` : ''}
${sp.cgp ? `<tr><td>CGP del cliente</td><td>${esc(cgpTipoTxt(sp.cgp.tipo))}${sp.cgp.desc ? ' · ' + esc(sp.cgp.desc) : ''}${sp.cgp.lat != null ? ` · ${sp.cgp.lat.toFixed(6)}, ${sp.cgp.lon.toFixed(6)}` : ''}</td></tr>` : ''}<tr><td>Caída de tensión en el punto de conexión / máxima</td><td>${fmt(sp.dUcon, 2)} % / ${fmt(sp.dUmax, 1)} %</td></tr></tbody></table>
<ul class="s">${sumBanners().map(li).join('')}${cgpChecks().map(li).join('')}${r ? r.checks.map(li).join('') : ''}</ul>`;
}

/* ---------- Tabla «Conductores de las líneas aéreas» (como «Líneas subterráneas») ---------- */
function renderAerLineas() {
  const box = $('#aerLineas'); if (!box) return;
  if (box.contains(document.activeElement) && document.activeElement.matches('input[type=text],input[type=number]')) return renderAerChecks();
  const A = aerLinea(), sp = sumPar(), c = S.calc, r = elecAereoRes(), cab = c?.cable || S.cables.find(x => x.id === S.proj.cableId);
  const chip = e => `<span class="chip ${e}">${e === 'ok' ? 'cumple' : e === 'warn' ? 'revisar' : 'no cumple'}</span>`;
  const malos = c ? c.results.filter(q => !(q.elegido || q.existenteCheck?.ok)).length : 0;
  const est = !r ? null : (r.checks.some(x => x.ok === 'bad') || malos) ? 'bad' : r.checks.some(x => x.ok === 'warn') ? 'warn' : 'ok';
  const opts = S.cables.filter(x => x.activo !== false).map(x => `<option value="${esc(x.id)}" ${!sp.auto && S.proj.cableId === x.id ? 'selected' : ''}>${esc(x.designacion)}</option>`).join('');
  const nueva = S.proj.rows.length > 1 ? `<tr data-al="n">
    <td><input type="text" data-a="nombre" value="${esc(A.nombre)}" style="width:8ch"></td><td>Nueva</td>
    <td><select data-a="cable" style="min-width:18ch"><option value="auto" ${sp.auto ? 'selected' : ''}>Automático (REBT)${sp.auto && cab ? ': ' + esc(shortCable(cab.designacion)) : ''}</option>${opts}</select></td>
    <td><select data-a="instal">${AER_INSTAL.map(([v, t]) => `<option value="${v}" ${A.instal === v ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
    <td class="n"><input class="num" type="number" step="any" min="0" data-a="potencia" value="${A.potencia}" placeholder="${sp.pSol || ''}" style="width:7ch"></td>
    <td class="n"><input class="num" type="number" step="0.01" min="0.5" max="1" data-a="cosphi" value="${A.cosphi}" placeholder="${sp.cos}" style="width:8ch"></td>
    <td class="n"><input class="num" type="number" step="0.1" min="0" data-a="dUprev" value="${A.dUprev}" placeholder="${sp.dUcon}" style="width:6ch"></td>
    <td class="n">${c ? c.nodes.length : '—'}</td><td class="n">${r ? fmt(r.L, 1) : '—'}</td><td class="n">${r?.I ? fmt(r.I, 1) : '—'}</td><td class="n">${r?.Imax ? fmt(r.Imax) : '—'}</td><td class="n">${r?.I ? fmt(r.dUtot, 2) : '—'}</td>
    <td>${est ? chip(est) : '<span class="note">sin calcular</span>'}</td></tr>` : '';
  const exs = exLineas().map(l => { const d = lineData(l.id), cx = S.cables.find(x => x.id === d.v.cableId);
    return `<tr><td>${esc(lineLabel(l) || '—')}</td><td>Existente</td><td>${cx ? esc(cx.designacion) : `<span class="note">${esc(conductorTramo?.(l) || 'sin verificar')}</span>`}</td><td>Tensado sobre apoyos</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td class="n">${fmt(polyLen(l.pts), 1)}</td><td class="n">—</td><td class="n">${cx ? fmt(aerElec(cx).Imax) : '—'}</td><td class="n">—</td><td>${d.v.ok ? '<span class="chip ok">verificada</span>' : '<span class="chip warn">sin verificar</span>'}</td></tr>`; }).join('');
  box.innerHTML = `<h3 class="sub">Conductores de las líneas aéreas</h3>
    <div class="tablewrap"><table class="subt"><thead><tr><th>Línea</th><th>Estado</th><th>Cable</th><th>Instalación</th><th class="n">P (kW)</th><th class="n">cos φ</th><th class="n">ΔU previa (%)</th><th class="n">Apoyos</th><th class="n">Long. (m)</th><th class="n">I (A)</th><th class="n">I máx. (A)</th><th class="n">ΔU (%)</th><th>Estado</th></tr></thead>
    <tbody>${nueva + exs || '<tr><td colspan="13" class="empty">Sin líneas aéreas. Dibuja o importa el trazado.</td></tr>'}</tbody></table></div><div id="aerChecks"></div>`;
  renderAerChecks();
}
function renderAerChecks() {
  const box = $('#aerChecks'); if (!box) return; const r = elecAereoRes(), c = S.calc; if (!r) { box.innerHTML = ''; return; }
  const malos = c.results.map((q, i) => !(q.elegido || q.existenteCheck?.ok) ? apName(i) : null).filter(Boolean);
  const mec = malos.length ? { ok: 'bad', txt: `Apoyos sin modelo válido: ${malos.join(', ')}. Cambia la altura, el vano o la función, o amplía la base de apoyos.` } : { ok: 'ok', txt: `Los ${c.results.length} apoyos cumplen los esfuerzos de las hipótesis del ITC-BT-06 (zona ${S.proj.ctx.zona}) con coeficiente de seguridad 2,5.` };
  const all = [...sumBanners(), ...r.checks, mec], est = all.some(x => x.ok === 'bad') ? 'bad' : all.some(x => x.ok === 'warn') ? 'warn' : 'ok';
  box.innerHTML = `<h3 class="sub">Comprobaciones</h3><details ${est !== 'ok' ? 'open' : ''}><summary>Línea ${esc(aerLinea().nombre)} <span class="chip ${est}">${est === 'ok' ? 'cumple' : est === 'warn' ? 'revisar' : 'no cumple'}</span></summary><ul class="checks">${all.map(x => `<li class="${x.ok}">${esc(x.txt)}</li>`).join('')}</ul></details>`;
}
function bindAerLineas() {
  const box = $('#aerLineas'); if (!box) return;
  box.addEventListener('change', ev => {
    const t = ev.target, k = t.dataset.a; if (!k) return; const A = aerLinea(); snapshot();
    if (k === 'cable') { const sp = sumPar(); if (t.value === 'auto') sp.auto = true; else { sp.auto = false; S.proj.cableId = t.value; const s = $('#p_cable'); if (s) s.value = t.value; } }
    else A[k] = t.type === 'number' ? (t.value === '' ? '' : Number(t.value)) : t.value;
    recalc(); renderSum(); renderAerLineas(); drawMap();
  });
  box.addEventListener('focusout', () => setTimeout(() => { if (!box.contains(document.activeElement)) renderAerLineas(); }, 60));
}
