/* ---------- Perfil longitudinal: dibujo ---------- */
function drawPerfil() {
  const cv = $('#perfil'); if (!cv) return; const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, Hh = cv.clientHeight; if (!W) return;
  cv.width = W * dpr; cv.height = Hh * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cs = getComputedStyle(document.documentElement), col = n => cs.getPropertyValue(n).trim();
  g.fillStyle = col('--map'); g.fillRect(0, 0, W, Hh);
  const c = S.calc;
  if (!c || !c.conPerfil) { g.fillStyle = col('--muted'); g.font = '13px ' + col('--f-body'); g.textAlign = 'center'; g.fillText('Sin perfil de elevación: carga o busca el perfil del trazado para verlo aquí.', W / 2, Hh / 2); $('#perfilNote').textContent = ''; return; }
  const N = c.nodes, ch0 = Math.min(...N.map(n => n.ch)), ch1 = Math.max(...N.map(n => n.ch)), rev = N[0].ch > N[N.length - 1].ch;
  const X = ch => rev ? ch1 - ch : ch - ch0, L = Math.max(ch1 - ch0, 1);
  const perf = perfilPts() ? E.buildProfile(perfilPts()) : null;
  const terr = perf ? perf.pts.filter(p => p.ch >= ch0 - 1 && p.ch <= ch1 + 1).map(p => ({ d: X(p.ch), z: p.z })) : [];
  N.forEach(n => terr.push({ d: X(n.ch), z: n.z })); terr.sort((a, b) => a.d - b.d);
  const tops = c.results.map((r, i) => r.zAmarre ?? N[i].z);
  const zMin = Math.min(...terr.map(t => t.z)) - 2, zMax = Math.max(...terr.map(t => t.z), ...tops) + 3;
  const pl = 48, pr = 14, pt = 14, pb = 26, sx = (W - pl - pr) / L, sy = (Hh - pt - pb) / Math.max(zMax - zMin, 1);
  const P = (d, z) => [pl + d * sx, Hh - pb - (z - zMin) * sy];
  // ejes
  g.strokeStyle = col('--grid'); g.fillStyle = col('--muted'); g.font = '10px ' + col('--f-mono'); g.lineWidth = 1;
  const zs = niceStep((zMax - zMin) / 4); for (let z = Math.ceil(zMin / zs) * zs; z <= zMax; z += zs) { const [, y] = P(0, z); g.beginPath(); g.moveTo(pl, y); g.lineTo(W - pr, y); g.stroke(); g.textAlign = 'right'; g.fillText(fmt(z), pl - 4, y + 3); }
  const ds = niceStep(L / 6); g.textAlign = 'center'; for (let d = 0; d <= L; d += ds) { const [x] = P(d, zMin); g.fillText(fmt(d) + ' m', x, Hh - 8); }
  // terreno
  g.beginPath(); terr.forEach((t, k) => { const [x, y] = P(t.d, t.z); k ? g.lineTo(x, y) : g.moveTo(x, y); });
  const [xe] = P(terr[terr.length - 1].d, zMin), [xs] = P(terr[0].d, zMin);
  g.lineTo(xe, Hh - pb); g.lineTo(xs, Hh - pb); g.closePath(); g.fillStyle = col('--soft'); g.fill(); g.strokeStyle = col('--exist'); g.lineWidth = 1.5; g.stroke();
  // conductor a flecha máxima y apoyos
  c.spans.forEach(s => {
    if (s.ZA == null) return; const a = X(N[s.i].ch), b = X(N[s.i + 1].ch);
    g.beginPath(); for (let k = 0; k <= 30; k++) { const t = k / 30; const [x, y] = P(a + (b - a) * t, s.ZA + (s.ZB - s.ZA) * t - 4 * s.fmax * t * (1 - t)); k ? g.lineTo(x, y) : g.moveTo(x, y); }
    g.strokeStyle = s.libre != null && s.libre < s.dmin - 0.01 ? col('--bad') : col('--accent'); g.lineWidth = 2; g.stroke();
  });
  c.results.forEach((r, i) => {
    const d = X(N[i].ch), [x, y0] = P(d, N[i].z), [, y1] = P(d, tops[i]);
    const st = statusOf(r, i); g.strokeStyle = col('--' + st.col); g.lineWidth = 3; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
    g.fillStyle = col('--ink'); g.font = '600 11px ' + col('--f-body'); g.textAlign = 'center'; g.fillText('A' + (i + 1), x, y1 - 5);
  });
  const exag = sy / sx; $('#perfilNote').textContent = `Escala vertical ×${fmt(exag, exag < 10 ? 1 : 0)} · conductor a flecha máxima`;
}

/* ---------- Trazado por coordenadas de inicio y fin ---------- */
function parseCoordText(t) {
  const n = String(t).trim().replace(/;/g, ' ').split(/[\s,]+/).filter(Boolean).map(v => Number(v));
  if (n.length < 2 || n.some(isNaN)) return null;
  const [a, b] = n;
  if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lon: b };
  const zone = S.proj.zone || Number($('#c_huso').value) || 29; const ll = E.latLonFromUtm(a, b, zone); return { lat: ll.lat, lon: ll.lon }; // UTM X Y
}
function bindCoordForm() {
  $('#c_crear').onclick = () => {
    const A = parseCoordText($('#c_ini').value), B = parseCoordText($('#c_fin').value);
    if (!A || !B) { toast('Escribe las coordenadas como «latitud, longitud» (42.8590, -8.6510) o «X Y» en UTM.'); return; }
    if (!S.proj.zone && /^\s*\d{5,}/.test($('#c_ini').value)) S.proj.zone = Number($('#c_huso').value) || 29;
    const prev = S.proj.ctx.dividir; S.proj.ctx.dividir = true;
    applyTrace({ nombre: 'Coordenadas', pts: [A, B] }, 'coordenadas de inicio y fin');
    S.proj.ctx.dividir = prev;
  };
}

/* ---------- Perfil automático (Copernicus DEM vía Open-Meteo, con el navegador de la app de escritorio) ---------- */
function getApiKey() { try { return localStorage.getItem('openmeteoKey') || ''; } catch (e) { return ''; } }
function setApiKey(v) { try { localStorage.setItem('openmeteoKey', v); } catch (e) { } }
function samplePolyline(pts, step) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], d = Math.hypot(b.x - a.x, b.y - a.y), k = Math.max(1, Math.ceil(d / step));
    for (let j = 0; j < k; j++) out.push({ x: a.x + (b.x - a.x) * j / k, y: a.y + (b.y - a.y) * j / k });
  }
  out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
  return out;
}
async function autoPerfil() {
  const btn = $('#perfilAuto'), msg = $('#perfilAutoMsg');
  const g = getGeo(); if (!g) { msg.textContent = 'Primero importa el trazado, créalo con coordenadas de inicio y fin o conéctalo a la línea existente.'; return; }
  const mcp = await window.claude?.use?.('mcp').catch(() => null);
  if (!mcp) { msg.innerHTML = 'La búsqueda automática solo funciona al abrir esta app dentro de la aplicación de escritorio de Claude. Usa GPS Visualizer (pasos de arriba).'; return; }
  let L = 0; for (let i = 1; i < g.pts.length; i++) L += Math.hypot(g.pts[i].x - g.pts[i - 1].x, g.pts[i].y - g.pts[i - 1].y);
  const step = Math.max(5, L / 900);
  const sp = samplePolyline(g.pts, step).map(p => ({ ...p, ...E.latLonFromUtm(p.x, p.y, g.zone) }));
  const key = getApiKey().trim();
  const base = key ? 'https://customer-api.open-meteo.com/v1/elevation' : 'https://api.open-meteo.com/v1/elevation';
  btn.disabled = true; let tabId = null; const z = [];
  try {
    for (let k = 0; k < sp.length; k += 100) {
      const chunk = sp.slice(k, k + 100);
      msg.textContent = `Consultando cotas ${k + 1}–${k + chunk.length} de ${sp.length}…`;
      const url = `${base}?latitude=${chunk.map(p => p.lat.toFixed(6)).join(',')}&longitude=${chunk.map(p => p.lon.toFixed(6)).join(',')}${key ? '&apikey=' + encodeURIComponent(key) : ''}`;
      if (!tabId) {
        const r = await mcp.callTool('host:claude_browser', 'preview_start', { url });
        const t = resultText(r); tabId = (t.match(/tabId\s*[:=]?\s*["']?([\w-]+)/i) || [])[1] || null;
      } else await mcp.callTool('host:claude_browser', 'navigate', tabId ? { url, tabId } : { url });
      let vals = null;
      for (let tries = 0; tries < 4 && !vals; tries++) {
        if (tries) await new Promise(res => setTimeout(res, 800));
        const r = await mcp.callTool('host:claude_browser', 'get_page_text', tabId ? { tabId } : {});
        const m = resultText(r).match(/\{\s*"(elevation|error)"[\s\S]*?\}/);
        if (m) { const j = JSON.parse(m[0]); if (j.error) throw { code: 'api', message: j.reason || 'error del servicio' }; vals = j.elevation; }
      }
      if (!vals || vals.length !== chunk.length) throw { code: 'api', message: 'el servicio no devolvió las cotas' };
      z.push(...vals);
    }
    S.proj.perfil = { fuente: `Copernicus DEM GLO-90 vía Open-Meteo (${sp.length} puntos cada ${fmt(step, 1)} m)`, pts: sp.map((p, i) => ({ x: p.x, y: p.y, z: z[i] })) };
    const altMax = Math.max(...z), zn = altMax > 1000 ? 'C' : altMax > 500 ? 'B' : 'A';
    if (zn !== S.proj.ctx.zona) { S.proj.ctx.zona = zn; $('#p_zona').value = zn; }
    msg.textContent = `Perfil obtenido: cotas ${fmt(Math.min(...z))}–${fmt(altMax)} m. Zona ${zn}.`;
    refreshAll();
  } catch (e) {
    const code = e && e.code;
    msg.textContent = code === 'server_not_connected' ? 'No se encuentra el navegador de la app de escritorio de Claude. Abre esta app desde la aplicación de escritorio, o usa GPS Visualizer.'
      : code === 'not_in_manifest' || code === 'approval_required' || code === 'cancelled' ? 'No se ha dado permiso para usar el navegador. Puedes volver a intentarlo o usar GPS Visualizer.'
      : code === 'api' ? 'El servicio de elevación respondió con un error: ' + e.message + '.'
      : 'No se pudo obtener el perfil (' + (code || 'error') + '). Inténtalo de nuevo o usa GPS Visualizer.';
  } finally { btn.disabled = false; }
}
function resultText(r) {
  if (!r) return ''; if (typeof r.payload === 'string') return r.payload;
  const t = (r.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  return t || (r.payload ? JSON.stringify(r.payload) : '');
}
function bindPerfilAuto() {
  $('#perfilAuto').onclick = autoPerfil;
  const k = $('#omKey'); k.value = getApiKey(); k.addEventListener('change', () => setApiKey(k.value.trim()));
  $('#perfilAutoMsg').textContent = '';
}

/* ---------- Exportación del perfil ---------- */
function perfilCsv(c) {
  const N = c.nodes, sep = ';', n = v => v == null ? '' : String(v).replace('.', ',');
  const rows = ['Apoyo/vano;Distancia al origen (m);Cota terreno (m);Cota conductor flecha max (m);Distancia libre (m);Distancia minima (m)'];
  const ch0 = N[0].ch;
  c.spans.forEach(s => {
    rows.push([`A${s.i + 1}`, n(Math.abs(N[s.i].ch - ch0).toFixed(1)), n(N[s.i].z.toFixed(2)), n(s.ZA?.toFixed(2)), '', ''].join(sep));
    (s.terreno || []).filter(p => p.t > 0 && p.t < 1).forEach(p => {
      const zc = s.ZA != null ? s.ZA + (s.ZB - s.ZA) * p.t - 4 * s.fmax * p.t * (1 - p.t) : null;
      rows.push([`vano A${s.i + 1}-A${s.i + 2}`, n((Math.abs(N[s.i].ch - ch0) + p.t * s.a).toFixed(1)), n(p.z.toFixed(2)), n(zc?.toFixed(2)), n(zc != null ? (zc - p.z).toFixed(2) : ''), n(s.dmin)].join(sep));
    });
  });
  const l = N.length - 1; rows.push([`A${l + 1}`, n(Math.abs(N[l].ch - ch0).toFixed(1)), n(N[l].z.toFixed(2)), n(c.spans[l - 1]?.ZB?.toFixed(2)), '', ''].join(sep));
  return '﻿' + rows.join('\r\n');
}
