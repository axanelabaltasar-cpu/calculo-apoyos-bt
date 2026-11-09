/* ===== Motor de cálculo mecánico ITC-BT-06 (REBT, RD 842/2002) ===== */
const KG2DAN = 0.980665;

/* ---------- Geometría ---------- */
function utmFromLatLon(lat, lon, zoneOverride) {
  const a = 6378137, f = 1 / 298.257222101; // GRS80 (ETRS89)
  const k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const zone = zoneOverride || Math.floor((lon + 180) / 6) + 1;
  const lon0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180;
  const phi = lat * Math.PI / 180, lam = lon * Math.PI / 180;
  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2);
  const T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lam - lon0);
  const e4 = e2 * e2, e6 = e4 * e2;
  const M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi) - (35 * e6 / 3072) * Math.sin(6 * phi));
  const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  const y = k0 * (M + N * Math.tan(phi) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  return { x, y, zone };
}
function latLonFromUtm(x, y, zone) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const M = y / k0, mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const N1 = a / Math.sqrt(1 - e2 * Math.sin(p1) ** 2), T1 = Math.tan(p1) ** 2, C1 = ep2 * Math.cos(p1) ** 2;
  const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(p1) ** 2, 1.5), D = (x - 500000) / (N1 * k0);
  const lat = p1 - (N1 * Math.tan(p1) / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lon = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / Math.cos(p1);
  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
}
/* Acimut (grados desde el norte, sentido horario) de p hacia q */
function azimuth(p, q) { let az = Math.atan2(q.x - p.x, q.y - p.y) * 180 / Math.PI; return (az + 360) % 360; }
function dist(p, q) { return Math.hypot(q.x - p.x, q.y - p.y); }
function unit(az) { const r = az * Math.PI / 180; return { x: Math.sin(r), y: Math.cos(r) }; }

/* ---------- Conductor ---------- */
function cableProps(c) {
  return {
    w: c.pesoKgKm / 1000 * KG2DAN,          // daN/m
    D: c.diamHaz,                            // mm, diámetro aparente del haz (viento)
    dIce: 2.5 * c.diamFase,                  // mm, ITC-BT-06 2.1: 2,5 × diámetro conductor de fase
    S: c.secFiador, E: c.moduloE, alpha: c.alpha * 1e-6, rotura: c.roturaFiador
  };
}
function hypotheses(zona, cp, thetaMax) {
  const pv = 50 * cp.D / 1000;               // daN/m (50 daN/m² sobre conductores)
  const H1 = { id: 'V15', nombre: 'Viento a 15 °C', th: 15, wind: 1, ice: 0 };
  const H2 = zona === 'A'
    ? { id: 'V0', nombre: '0 °C con 1/3 de viento', th: 0, wind: 1 / 3, ice: 0 }
    : { id: 'H0', nombre: `Hielo zona ${zona} a 0 °C`, th: 0, wind: 0, ice: (zona === 'B' ? 60 : 120) * Math.sqrt(cp.dIce) / 1000 * KG2DAN };
  const H3 = { id: 'TM', nombre: `Temperatura máxima ${thetaMax} °C`, th: thetaMax, wind: 0, ice: 0 };
  const EDS = { id: 'EDS', nombre: '15 °C sin sobrecarga', th: 15, wind: 0, ice: 0 };
  for (const h of [H1, H2, H3, EDS]) h.p = Math.hypot(cp.w + h.ice, pv * h.wind);
  return { pv, list: [H1, H2], all: [H1, H2, H3, EDS], H1, H2, H3, EDS };
}
/* Ecuación de cambio de condiciones (parábola): T2²·(T2 + A) = B */
function changeState(T1, th1, p1, th2, p2, a, cp) {
  const ES = cp.E * cp.S;
  const A = cp.alpha * ES * (th2 - th1) + a * a * p1 * p1 * ES / (24 * T1 * T1) - T1;
  const B = a * a * p2 * p2 * ES / 24;
  let T = Math.max(0, -A) + Math.cbrt(B) + 1;
  for (let i = 0; i < 200; i++) {
    const fT = T * T * (T + A) - B, d = 3 * T * T + 2 * A * T;
    const nT = T - fT / d; if (Math.abs(nT - T) < 1e-7) { T = nT; break; } T = nT;
  }
  return T;
}
/* Tensiones de un cantón con vano de regulación ar y tracción máxima Tmax */
function cantonTensions(ar, cp, hyp, Tmax) {
  let base = null;
  for (const hg of hyp.list) {
    const ok = hyp.list.every(h => h === hg || changeState(Tmax, hg.th, hg.p, h.th, h.p, ar, cp) <= Tmax * 1.0001);
    if (ok) { base = hg; break; }
  }
  if (!base) base = hyp.list[0];
  const T = {};
  for (const h of hyp.all) T[h.id] = h === base ? Tmax : changeState(Tmax, base.th, base.p, h.th, h.p, ar, cp);
  return { T, gobierna: base.id };
}
function sag(a, p, T) { return a * a * p / (8 * T); }

/* ---------- Construcción del trazado ---------- */
/* nodes: [{x,y,...}] en metros (UTM o local). Devuelve vanos con longitud y acimut, y ángulo de desvío en cada vértice */
function buildGeometry(nodes) {
  const spans = [];
  for (let i = 0; i < nodes.length - 1; i++) spans.push({ i, a: dist(nodes[i], nodes[i + 1]), az: azimuth(nodes[i], nodes[i + 1]) });
  nodes.forEach((n, i) => {
    if (i === 0 || i === nodes.length - 1) { n.desvio = 0; return; }
    let d = spans[i].az - spans[i - 1].az; d = ((d + 540) % 360) - 180; n.desvio = d; // + giro a la derecha
  });
  return spans;
}
/* Coordenadas locales a partir de vanos y ángulos (entrada manual) */
function nodesFromManual(rows, rumbo0) {
  const nodes = [{ x: 0, y: 0 }]; let az = rumbo0 || 0;
  for (let i = 1; i < rows.length; i++) {
    if (i > 1) az += Number(rows[i - 1].angulo || 0);
    const u = unit(az), a = Number(rows[i].vano || 0), p = nodes[i - 1];
    nodes.push({ x: p.x + u.x * a, y: p.y + u.y * a });
  }
  return nodes;
}

/* ---------- Apoyos: capacidad y esfuerzos ---------- */
function poleGeom(pole, terreno) {
  const emp = pole[{ flojo: 'empFlojo', normal: 'empNormal', fuerte: 'empFuerte' }[terreno || 'normal']] || (0.1 * pole.altura + 0.6);
  return { emp, Hl: pole.altura - emp };
}
/* Momento del viento sobre el fuste (daN·m) por unidad de presión, cara de anchura en cogolla a0 (mm) y conicidad c (mm/m) */
function poleWindMomentPerQ(a0, c, Hl) { return (a0 * Hl * Hl / 2 + c * Hl ** 3 / 6) / 1000; }

/*
 apoyo: { func, conds:[{az, T:{V15,V0|H0}, a, pv, depth, lineaNueva}], deseq, existente }
 Devuelve utilización máxima y desglose para un poste y orientación dados.
*/
function evaluatePole(pole, ap, ctx, phiFixed) {
  /* Orientaciones prácticas: esfuerzo principal según la dirección de referencia del apoyo
     (línea, bisectriz o resultante) o perpendicular a ella. */
  const { Hl } = poleGeom(pole, ctx.terreno);
  const hRef = Hl - 0.25;                     // punto de aplicación del esfuerzo nominal (0,25 m bajo cogolla)
  if (hRef <= 0) return null;
  const q = 100;                               // daN/m², superficies planas (HV/HVH, ITC-BT-06 2.1)
  const mNarrow = ctx.vientoPoste ? q * poleWindMomentPerQ(pole.cogA, pole.conA, Hl) : 0; // viento según eje principal
  const mWide = ctx.vientoPoste ? q * poleWindMomentPerQ(pole.cogB, pole.conB, Hl) : 0;   // viento según eje secundario
  const phis = phiFixed != null ? [phiFixed] : (pole.En === pole.Es ? [ap.ref || 0] : [ap.ref || 0, ((ap.ref || 0) + 90) % 360]);
  let best = null;
  for (const phi of phis) {
    const ep = unit(phi), es = unit(phi + 90);
    let worst = { u: -1 };
    for (const h of ctx.hyp.list) {
      const fac = (ap.func === 'estrellamiento' || ap.func === 'derivacion') && h.id === 'V15' ? 2 / 3 : 1;
      // Resultante de tracciones (momento equivalente en el punto de aplicación)
      let Fx = 0, Fy = 0;
      for (const c of ap.conds) {
        const k = (Hl - c.depth) / hRef, u = unit(c.az), T = c.T[h.id] || 0;
        Fx += fac * T * u.x * k; Fy += fac * T * u.y * k;
      }
      if (ap.func === 'alineacion' && h.id !== 'V15' && ap.conds.length) {   // desequilibrio de tracciones
        const c = ap.conds[ap.conds.length - 1], k = (Hl - c.depth) / hRef, u = unit(c.az);
        const T = Math.max(...ap.conds.map(cc => cc.T[h.id] || 0));
        Fx += ctx.deseq * T * u.x * k; Fy += ctx.deseq * T * u.y * k;
      }
      const dirs = h.wind > 0 ? windDirs(ap, phi) : [null];
      for (const tw of dirs) {
        let wx = 0, wy = 0, wp = 0, ws = 0;
        if (tw != null) {
          const uw = unit(tw);
          for (const c of ap.conds) {
            const k = (Hl - c.depth) / hRef;
            const f = c.pv * h.wind * (c.a / 2) * Math.abs(Math.sin((tw - c.az) * Math.PI / 180)) * k;
            wx += f * uw.x; wy += f * uw.y;
          }
          const cp = Math.cos((tw - phi) * Math.PI / 180), sp = Math.sin((tw - phi) * Math.PI / 180);
          wp = h.wind * mNarrow * cp / hRef; ws = h.wind * mWide * sp / hRef;
        }
        const tx = Fx + wx, ty = Fy + wy;
        const Fp = Math.abs(tx * ep.x + ty * ep.y + wp), Fs = Math.abs(tx * es.x + ty * es.y + ws);
        const u = Math.max(Fp / pole.En, Fs / pole.Es);
        if (u > worst.u) worst = { u, Fp, Fs, hyp: h.id, viento: tw };
      }
    }
    if (!best || worst.u < best.u) best = { ...worst, phi, Hl };
  }
  return best;
}

/* Direcciones de viento a comprobar: perpendicular a cada conductor (ambos sentidos),
   según la dirección de referencia (bisectriz/resultante) y según los ejes del poste. */
function windDirs(ap, phi) {
  const set = new Set();
  const add = d => set.add(Math.round(((d % 360) + 360) % 360));
  ap.conds.forEach(c => { add(c.az + 90); add(c.az - 90); });
  [0, 90, 180, 270].forEach(k => { add((ap.ref || 0) + k); add(phi + k); });
  return [...set];
}

/* Perfil longitudinal: polilínea {x,y,z} con distancia acumulada */
function buildProfile(pts) {
  if (!pts || pts.length < 2 || pts.some(p => p.z == null || isNaN(p.z))) return null;
  let ch = 0; const out = pts.map((p, i) => { if (i) ch += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); return { x: p.x, y: p.y, z: Number(p.z), ch }; });
  return { pts: out, L: ch };
}
function projectOnProfile(prof, q) {
  let best = { d: Infinity, ch: 0, z: prof.pts[0].z };
  for (let i = 0; i < prof.pts.length - 1; i++) {
    const A = prof.pts[i], B = prof.pts[i + 1], dx = B.x - A.x, dy = B.y - A.y, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((q.x - A.x) * dx + (q.y - A.y) * dy) / L2)) : 0;
    const d = Math.hypot(A.x + dx * t - q.x, A.y + dy * t - q.y);
    if (d < best.d) best = { d, ch: A.ch + t * Math.sqrt(L2), z: A.z + (B.z - A.z) * t };
  }
  return best;
}

/* Cálculo completo */
function calcular(input) {
  const { nodes, cable, ctx: c0, poles } = input;
  const cp = cableProps(cable);
  const csBase = c0.sobreEdificios ? 2.5 * 1.25 : 2.5;
  const TmaxReg = cp.rotura / csBase;
  const Tsel = c0.tenseModo === 'normal' ? c0.tenseNormal : c0.tenseModo === 'reducido' ? (c0.tenseReducido ?? c0.tenseValor) : null;
  const Tmax = Tsel != null && Number(Tsel) > 0 ? Math.min(Number(Tsel), TmaxReg) : TmaxReg;
  const hyp = hypotheses(c0.zona, cp, c0.thetaMax);
  const ctx = { ...c0, hyp, deseq: (c0.desequilibrio || 0) / 100 };
  const spans = buildGeometry(nodes);
  const n = nodes.length;
  // Función de cada apoyo
  nodes.forEach((nd, i) => {
    let f = nd.funcion && nd.funcion !== 'auto' ? nd.funcion : null;
    if (!f) {
      if (nd.existente && nd.existente.activo) f = 'derivacion';
      else if (i === 0 || i === n - 1) f = 'fin';
      else if (Math.abs(nd.desvio) > c0.umbralAngulo) f = 'angulo';
      else f = 'alineacion';
    }
    nd.func = f;
  });
  // Cantones: se cortan en todo apoyo que no sea de alineación
  const cantones = []; let cur = null;
  spans.forEach((s, i) => {
    if (!cur) { cur = { desde: i, spans: [] }; cantones.push(cur); }
    cur.spans.push(s); s.canton = cantones.length - 1;
    if (i + 1 < n - 1 && nodes[i + 1].func !== 'alineacion') cur = null;
  });
  cantones.forEach(cn => {
    const s3 = cn.spans.reduce((t, s) => t + s.a ** 3, 0), s1 = cn.spans.reduce((t, s) => t + s.a, 0);
    cn.ar = Math.sqrt(s3 / s1); cn.longitud = s1;
    Object.assign(cn, cantonTensions(cn.ar, cp, hyp, Tmax));
    cn.cs = cp.rotura / Math.max(...hyp.list.map(h => cn.T[h.id]));
    cn.edsPct = cn.T.EDS / cp.rotura * 100;
  });
  spans.forEach(s => {
    const cn = cantones[s.canton];
    s.flechas = {}; let fm = 0, hm = null;
    for (const h of [hyp.H1, hyp.H2, hyp.H3]) { const f = sag(s.a, h.p, cn.T[h.id]); s.flechas[h.id] = f; if (f > fm) { fm = f; hm = h.id; } }
    s.fmax = fm; s.hypFmax = hm;
    s.cruce = !!nodes[s.i + 1].cruce;          // el cruce se marca en el vano que llega al apoyo i+1
    s.dmin = s.cruce ? 6 : c0.distSuelo;        // ITC-BT-06 3.9.1.4: 6 m sobre carreteras y ferrocarriles
  });
  // Perfil del terreno: cota de cada apoyo y del terreno bajo cada vano
  const prof = buildProfile(input.perfil);
  if (prof) {
    nodes.forEach(nd => { const pr = projectOnProfile(prof, nd); nd.ch = pr.ch; nd.z = pr.z; nd.dPerfil = pr.d; });
    spans.forEach(s => {
      const A = nodes[s.i], B = nodes[s.i + 1], c0h = Math.min(A.ch, B.ch), c1h = Math.max(A.ch, B.ch), L = c1h - c0h;
      s.dz = B.z - A.z; s.aReal = Math.hypot(s.a, s.dz);
      s.terreno = [{ t: 0, z: A.z }, ...prof.pts.filter(p => p.ch > c0h + 0.01 && p.ch < c1h - 0.01).map(p => ({ t: L > 0 ? (A.ch <= B.ch ? (p.ch - c0h) / L : (c1h - p.ch) / L) : 0.5, z: p.z })), { t: 1, z: B.z }].sort((x, y) => x.t - y.t);
    });
  } else spans.forEach(s => { s.aReal = s.a; s.dz = 0; });
  // Apoyos: esfuerzos de cada candidato
  const pvNew = hyp.pv;
  const tipos = c0.tipos === 'HV' ? ['HV'] : c0.tipos === 'HVH' ? ['HVH'] : ['HV', 'HVH'];
  const price = p => (Number(p[c0.criterioPrecio]) || 0);
  const results = nodes.map((nd, i) => {
    const conds = [];
    const spansAdj = [];
    if (i > 0) { const s = spans[i - 1]; spansAdj.push(s); conds.push({ az: (s.az + 180) % 360, T: cantones[s.canton].T, a: s.a, pv: pvNew, depth: c0.depthAmarre, nueva: true, span: s.i }); }
    if (i < n - 1) { const s = spans[i]; spansAdj.push(s); conds.push({ az: s.az, T: cantones[s.canton].T, a: s.a, pv: pvNew, depth: c0.depthAmarre, nueva: true, span: s.i }); }
    const ex = nd.existente && nd.existente.activo ? nd.existente : null;
    if (ex) for (const ec of ex.conductores || []) {
      const T = Number(ec.tense) || 0;
      conds.push({ az: Number(ec.az) || 0, T: { V15: T, V0: T, H0: T }, a: Number(ec.vano) || 0, pv: 50 * (Number(ec.diam) || 0) / 1000, depth: Number(ec.depth) || c0.depthAmarre, existente: true });
    }
    // Dirección de referencia: resultante de tracciones (si existe) o eje de la línea
    let rx = 0, ry = 0; conds.forEach(c => { const u = unit(c.az); rx += c.T.V15 * u.x; ry += c.T.V15 * u.y; });
    const lineAz = i < n - 1 ? spans[i].az : spans[i - 1].az;
    const ref = Math.hypot(rx, ry) > 1 ? (Math.atan2(rx, ry) * 180 / Math.PI + 360) % 180 : lineAz % 180;
    const ap = { func: nd.func, conds, ref };
    const evalCand = (p, phi) => evaluatePole(p, ap, ctx, phi);
    let cands = poles.filter(p => p.activo !== false && tipos.includes(p.tipo));
    if (nd.alturaFija) cands = cands.filter(p => Number(p.altura) === Number(nd.alturaFija));
    if (ex && ex.modeloId) { const pe = poles.find(pp => pp.id === ex.modeloId); if (pe) cands = cands.filter(p => p.altura >= pe.altura); }
    if (nd.modeloFijo) cands = poles.filter(p => p.id === nd.modeloFijo);
    const evals = cands.map(p => ({ pole: p, r: evalCand(p, null), hAmarre: poleGeom(p, c0.terreno).Hl - c0.depthAmarre }))
      .sort((x, y) => (price(x.pole) - price(y.pole)) || (x.pole.altura - y.pole.altura) || (x.pole.En - y.pole.En));
    let existenteCheck = null;
    if (ex && ex.modeloId) {
      const p = poles.find(pp => pp.id === ex.modeloId);
      if (p) {
        const phi = ex.azPrincipal === '' || ex.azPrincipal == null ? null : Number(ex.azPrincipal);
        const r = evalCand(p, phi);
        existenteCheck = { pole: p, r, ok: r && r.u <= 1, orientacionSupuesta: phi == null, hAmarre: poleGeom(p, c0.terreno).Hl - (Number(ex.conductores?.[0]?.depth) || c0.depthAmarre) };
      }
    }
    const need = Math.max(0, ...spansAdj.map(s => s.fmax + s.dmin)); // altura mínima de amarre en terreno llano
    return { i, func: nd.func, desvio: nd.desvio, need, evals, existenteCheck, conds, z: nd.z ?? null };
  });
  // Elección de apoyos y comprobación de la distancia al suelo a lo largo de cada vano
  const pick = r => { const e = r.evals.find(e => e.r && e.r.u <= 1 && e.hAmarre >= r.need - 1e-6); return e || null; };
  const hUsed = r => {
    if (r.existenteCheck && r.existenteCheck.ok) return r.existenteCheck.hAmarre;
    return r.elegido ? r.elegido.hAmarre : null;
  };
  for (let it = 0; it < 10; it++) {
    results.forEach(r => { r.elegido = pick(r); });
    if (!prof) break;
    let changed = false;
    spans.forEach(s => {
      const rA = results[s.i], rB = results[s.i + 1], hA = hUsed(rA), hB = hUsed(rB);
      if (hA == null || hB == null) { s.libre = null; return; }
      const ZA = nodes[s.i].z + hA, ZB = nodes[s.i + 1].z + hB;
      let minC = Infinity, at = 0;
      for (const p of s.terreno) {
        const zc = ZA + (ZB - ZA) * p.t - 4 * s.fmax * p.t * (1 - p.t);
        const c = zc - p.z; if (c < minC) { minC = c; at = p.t; }
      }
      s.libre = minC; s.libreEn = at * s.a; s.ZA = ZA; s.ZB = ZB;
      const def = s.dmin - minC;
      if (def > 0.01) {
        // Se eleva la cadena del vano por igual en los dos extremos que se puedan cambiar
        for (const r of [rA, rB]) {
          if (r.existenteCheck && r.existenteCheck.ok) continue;
          const h = hUsed(r); if (h != null && r.need < h + def) { r.need = h + def; changed = true; }
        }
      }
    });
    if (!changed) break;
  }
  // Gravivano: componente vertical de los conductores nuevos en el apoyo (tiro hacia arriba si es negativa)
  results.forEach((r, i) => {
    const h = hUsed(r), Zi = prof && h != null ? nodes[i].z + h : null;
    let gv = 0, gvFrio = 0;
    r.conds.filter(c => c.nueva).forEach(c => {
      const s = spans[c.span], j = s.i === i ? s.i + 1 : s.i, hj = hUsed(results[j]);
      let slope = 0;
      if (prof && Zi != null && hj != null) slope = (Zi - (nodes[j].z + hj)) / s.a;
      const cn = cantones[s.canton];
      gv += s.a / 2 + (cn.T[hyp.H2.id] / (cp.w + hyp.H2.ice)) * slope;
      gvFrio += s.a / 2 + (cn.T.EDS / cp.w) * slope;
    });
    r.gravivano = gv; r.vert = Math.max(0, gv) * (cp.w + hyp.H2.ice);
    r.tiroArriba = Math.min(gv, gvFrio) < 0;
    r.zAmarre = Zi;
  });
  return { cp, Tmax, TmaxReg, csBase, hyp, spans, cantones, results };
}

/* ---------- Presupuesto ---------- */
function presupuesto(calc, nodes, cable, cfg, terreno) {
  const lineas = [];
  const add = (concepto, ud, cant, pc, pv) => lineas.push({ concepto, ud, cant, coste: cant * (pc || 0), venta: cant * (pv || 0), sinPrecio: !(pc || pv) });
  const grupos = {};
  let vol = 0, suspension = 0, amarres = 0;
  calc.results.forEach((r, i) => {
    const ex = nodes[i].existente && nodes[i].existente.activo;
    const sustituir = ex && !(r.existenteCheck && r.existenteCheck.ok);
    if (!ex || sustituir) {
      if (r.elegido) {
        const p = r.elegido.pole, k = p.id;
        grupos[k] = grupos[k] || { p, n: 0 }; grupos[k].n++;
        const g = poleGeom(p, terreno), A = Number(p.cimA) || 0.8;
        vol += A * A * (g.emp + (p.tipo === 'HVH' ? 0.2 : 0));
      }
    }
    if (r.func === 'alineacion') suspension++; else amarres += r.conds.filter(c => c.nueva).length;
  });
  for (const k in grupos) { const { p, n } = grupos[k]; add(`Apoyo ${p.tipo} ${p.En} R ${p.altura} m`, 'ud', n, p.coste, p.venta); }
  if (vol > 0) add('Cimentación monolítica de hormigón', 'm³', vol, cfg.hormigonCoste, cfg.hormigonVenta);
  const L = calc.spans.reduce((t, s) => t + (s.aReal || s.a), 0) * (1 + (cfg.holguraCable || 0) / 100);
  add(`Cable ${cable.designacion}`, 'm', L, cable.coste, cable.venta);
  if (suspension) add('Conjunto de suspensión', 'ud', suspension, cfg.suspCoste, cfg.suspVenta);
  if (amarres) add('Conjunto de amarre (por extremo)', 'ud', amarres, cfg.amarreCoste, cfg.amarreVenta);
  const tot = lineas.reduce((t, l) => ({ coste: t.coste + l.coste, venta: t.venta + l.venta }), { coste: 0, venta: 0 });
  return { lineas, tot, longitudCable: L };
}

if (typeof module !== 'undefined') module.exports = { buildProfile, projectOnProfile, utmFromLatLon, latLonFromUtm, changeState, cantonTensions, hypotheses, cableProps, calcular, presupuesto, nodesFromManual, buildGeometry, poleWindMomentPerQ, evaluatePole };
