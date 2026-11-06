/* ---------- Nodos (coordenadas) ---------- */
/* Apoyos de la línea existente (con coordenadas UTM) */
function exNodes() { return S.proj.lineaEx ? S.proj.lineaEx.pts : []; }
/* Conductores de la línea existente que concurren en el apoyo de entronque */
function entronqueConductores() {
  const en = S.proj.entronque, ex = exNodes(); if (!en || !ex[en.k]) return [];
  const p = ex[en.k], cab = S.cables.find(c => c.id === en.cableId);
  return [en.k - 1, en.k + 1].filter(j => j >= 0 && j < ex.length).map(j => ({
    cableId: en.cableId || '', az: Math.round(E.buildGeometry([p, ex[j]])[0].az * 10) / 10,
    vano: Math.round(Math.hypot(ex[j].x - p.x, ex[j].y - p.y) * 10) / 10, tense: Number(en.tense) || 0,
    diam: cab ? cab.diamHaz : 0, depth: Number(en.depth) || S.proj.ctx.depthAmarre, deLinea: true, hacia: 'E' + (j + 1)
  }));
}
function currentNodes() {
  const rows = S.proj.rows;
  let nodes;
  if (S.proj.modo === 'kml' && S.proj.geo) nodes = S.proj.geo.pts.map(p => ({ x: p.x, y: p.y }));
  else {
    nodes = E.nodesFromManual(rows, Number(S.proj.ctx.rumbo0) || 0);
    const en = S.proj.entronque, ex = exNodes();
    if (en && ex[en.k]) nodes.forEach(n => { n.x += ex[en.k].x; n.y += ex[en.k].y; }); // trazado manual anclado al apoyo de entronque
  }
  nodes.forEach((n, i) => {
    const r = rows[i]; let existente = r.existente;
    if (i === 0 && S.proj.entronque && exNodes()[S.proj.entronque.k]) existente = { ...r.existente, activo: true, conductores: [...entronqueConductores(), ...(r.existente.conductores || [])] };
    Object.assign(n, { funcion: r.funcion, alturaFija: r.alturaFija, modeloFijo: r.modeloFijo, cruce: r.cruce, existente });
  });
  return nodes;
}
/* Trazado georreferenciado: importado de KML, o manual anclado a la línea existente */
function getGeo(nodes) {
  const zone = S.proj.zone; if (!zone) return null;
  if (S.proj.modo === 'kml' && S.proj.geo) return { zone, pts: S.proj.geo.pts };
  if (S.proj.entronque && exNodes()[S.proj.entronque.k]) {
    const ns = nodes || currentNodes();
    return { zone, pts: ns.map(n => ({ x: n.x, y: n.y, ...E.latLonFromUtm(n.x, n.y, zone) })) };
  }
  return null;
}

/* ---------- Plano: vista con desplazamiento y zoom ---------- */
const V = { sc: null, cx: 0, cy: 0, fitted: false };
function allPts() { const n = S.calc?.nodes || (S.proj.rows.length > 1 ? currentNodes() : []); return [...n, ...exNodes()]; }
function fitView() {
  const pts = allPts(), cv = $('#map'); if (!pts.length || !cv.clientWidth) return;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  V.cx = (minx + maxx) / 2; V.cy = (miny + maxy) / 2;
  V.sc = Math.min((cv.clientWidth - 92) / Math.max(maxx - minx, 1), (cv.clientHeight - 92) / Math.max(maxy - miny, 1));
  V.fitted = true;
}
function ensureImg(tipo) {
  const f = S.proj.fondos?.[tipo]; if (!f || (!f.assetId && !f.blobUrl)) return null;
  S.img = S.img || {};
  const src = f.blobUrl || ('/_blob/' + f.assetId);
  if (!S.img[tipo] || S.img[tipo].srcKey !== src) {
    const im = new Image(); im.srcKey = src; im.onload = () => drawMap(); im.onerror = () => { im.failed = true; drawMap(); }; im.src = src; S.img[tipo] = im;
  }
  return S.img[tipo];
}
function drawMap() {
  const cv = $('#map'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, Hh = cv.clientHeight;
  if (!W) return;
  cv.width = W * dpr; cv.height = Hh * dpr; const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cs = getComputedStyle(document.documentElement), col = n => cs.getPropertyValue(n).trim();
  g.fillStyle = col('--map'); g.fillRect(0, 0, W, Hh);
  const nodes = S.calc?.nodes || (S.proj.rows.length > 1 ? currentNodes() : []);
  const ex = exNodes();
  if (nodes.length < 2 && ex.length < 2) { S.mapT = null; return; }
  if (!V.fitted || !V.sc) fitView();
  const sc = V.sc, P = n => [W / 2 + (n.x - V.cx) * sc, Hh / 2 - (n.y - V.cy) * sc];
  // Fondos (ortofoto debajo, catastro encima)
  for (const tipo of ['orto', 'catastro']) {
    const f = S.proj.fondos?.[tipo]; if (!f || !f.visible) continue;
    const im = ensureImg(tipo); if (!im || !im.complete || im.failed || !im.naturalWidth) continue;
    const [x0, y0] = P({ x: f.bbox[0], y: f.bbox[3] }), [x1, y1] = P({ x: f.bbox[2], y: f.bbox[1] });
    g.globalAlpha = (f.op ?? 100) / 100; g.drawImage(im, x0, y0, x1 - x0, y1 - y0); g.globalAlpha = 1;
  }
  const hasFondo = ['orto', 'catastro'].some(t => S.proj.fondos?.[t]?.visible && S.img?.[t]?.naturalWidth);
  // Cuadrícula
  if (!hasFondo) {
    const step = niceStep(80 / sc); g.strokeStyle = col('--grid'); g.lineWidth = 1;
    const x0 = V.cx - W / 2 / sc, y0 = V.cy - Hh / 2 / sc;
    for (let x = Math.floor(x0 / step) * step; (x - V.cx) * sc + W / 2 < W; x += step) { const px = W / 2 + (x - V.cx) * sc; g.beginPath(); g.moveTo(px, 0); g.lineTo(px, Hh); g.stroke(); }
    for (let y = Math.floor(y0 / step) * step; Hh / 2 - (y - V.cy) * sc > 0; y += step) { const py = Hh / 2 - (y - V.cy) * sc; g.beginPath(); g.moveTo(0, py); g.lineTo(W, py); g.stroke(); }
  }
  const halo = (txt, x, y) => { g.lineWidth = 3; g.strokeStyle = col('--map'); g.strokeText(txt, x, y); g.fillText(txt, x, y); };
  // Línea existente
  if (ex.length > 1) {
    g.strokeStyle = col('--exist'); g.lineWidth = 3; g.setLineDash([8, 5]); g.beginPath(); ex.forEach((n, i) => { const [x, y] = P(n); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); g.setLineDash([]);
    ex.forEach((n, i) => {
      const [x, y] = P(n); const isEn = S.proj.entronque?.k === i;
      g.fillStyle = isEn ? col('--accent') : col('--exist'); g.strokeStyle = col('--panel'); g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, isEn ? 7 : 5, 0, Math.PI * 2); g.fill(); g.stroke();
      g.fillStyle = col('--exist'); g.font = '600 11px ' + col('--f-body'); g.textAlign = 'right'; halo('E' + (i + 1), x - 8, y - 7);
    });
  }
  if (nodes.length > 1) {
    g.strokeStyle = col('--accent'); g.lineWidth = 2.5; g.beginPath(); nodes.forEach((n, i) => { const [x, y] = P(n); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    g.font = '11px ' + col('--f-mono'); g.fillStyle = col('--muted'); g.textAlign = 'center';
    for (let i = 0; i < nodes.length - 1; i++) { const [x1, y1] = P(nodes[i]), [x2, y2] = P(nodes[i + 1]); const a = Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].y - nodes[i].y); g.fillStyle = col('--ink'); halo(fmt(a, 1) + ' m', (x1 + x2) / 2, (y1 + y2) / 2 - 6); }
    nodes.forEach(n => {
      const e = n.existente; if (!e?.activo) return; const [x, y] = P(n);
      g.strokeStyle = col('--exist'); g.setLineDash([4, 4]); g.lineWidth = 1.5;
      (e.conductores || []).filter(c => !c.deLinea).forEach(c => { const u = { x: Math.sin(c.az * Math.PI / 180), y: Math.cos(c.az * Math.PI / 180) }; g.beginPath(); g.moveTo(x, y); g.lineTo(x + u.x * 40, y - u.y * 40); g.stroke(); });
      g.setLineDash([]);
    });
    nodes.forEach((n, i) => {
      const [x, y] = P(n); const r = S.calc?.results[i]; const st = r ? statusOf(r, i) : { col: 'muted' };
      g.fillStyle = col('--' + st.col); g.strokeStyle = col('--panel'); g.lineWidth = 2;
      g.beginPath(); g.rect(x - 6, y - 6, 12, 12); g.fill(); g.stroke();
      if (S.sel === i) { g.strokeStyle = col('--ink'); g.lineWidth = 2; g.strokeRect(x - 10, y - 10, 20, 20); }
      g.fillStyle = col('--ink'); g.font = '600 12px ' + col('--f-body'); g.textAlign = 'left'; halo('A' + (i + 1), x + 9, y - 8);
      const p = r && (r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole);
      if (p) { g.fillStyle = col('--muted'); g.font = '10px ' + col('--f-mono'); halo(poleLabel(p), x + 9, y + 15); }
    });
  }
  // Escala y norte
  const sl = niceStep(120 / sc); g.fillStyle = col('--panel'); g.fillRect(8, Hh - 38, sl * sc + 16, 30);
  g.strokeStyle = col('--ink'); g.lineWidth = 2; g.beginPath(); g.moveTo(14, Hh - 14); g.lineTo(14 + sl * sc, Hh - 14); g.stroke();
  g.fillStyle = col('--ink'); g.font = '11px ' + col('--f-mono'); g.textAlign = 'left'; g.fillText(fmt(sl) + ' m', 14, Hh - 22);
  g.textAlign = 'center'; g.font = '600 12px ' + col('--f-body'); halo('N', W - 20, 20); g.beginPath(); g.moveTo(W - 20, 26); g.lineTo(W - 25, 40); g.lineTo(W - 15, 40); g.closePath(); g.fill();
  const geo = getGeo(nodes.length > 1 ? nodes : null);
  $('#mapInfo').textContent = S.proj.zone ? `ETRS89 · UTM huso ${S.proj.zone}` : 'Coordenadas locales (entrada manual)';
  if (!geo && !S.proj.lineaEx) $('#mapInfo').textContent = 'Coordenadas locales (entrada manual)';
  S.mapT = { P, nodes, ex };
}
function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
function zoomAt(f, mx, my) {
  const cv = $('#map'), W = cv.clientWidth, Hh = cv.clientHeight; if (!V.sc) return;
  const wx = V.cx + (mx - W / 2) / V.sc, wy = V.cy - (my - Hh / 2) / V.sc;
  V.sc *= f; V.cx = wx - (mx - W / 2) / V.sc; V.cy = wy + (my - Hh / 2) / V.sc; drawMap();
}
function bindMap() {
  const cv = $('#map'); let drag = null;
  cv.addEventListener('pointerdown', ev => { drag = { x: ev.clientX, y: ev.clientY, cx: V.cx, cy: V.cy, moved: false }; cv.setPointerCapture(ev.pointerId); });
  cv.addEventListener('pointermove', ev => {
    if (!drag || !V.sc) return; const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    if (drag.moved) { V.cx = drag.cx - dx / V.sc; V.cy = drag.cy + dy / V.sc; drawMap(); }
  });
  cv.addEventListener('pointerup', ev => {
    const d = drag; drag = null; if (!d || d.moved || !S.mapT) return;
    const rc = cv.getBoundingClientRect(), mx = ev.clientX - rc.left, my = ev.clientY - rc.top;
    const near = list => { let best = -1, bd = 16; list.forEach((n, i) => { const [x, y] = S.mapT.P(n); const dd = Math.hypot(x - mx, y - my); if (dd < bd) { bd = dd; best = i; } }); return best; };
    if (S.pickEntronque) { const k = near(S.mapT.ex); if (k >= 0) { S.pickEntronque = false; $('#en_k').value = k; setEntronque(k); } return; }
    const i = near(S.mapT.nodes); if (i >= 0) { S.sel = S.sel === i ? null : i; renderRows(); renderResults(); }
  });
  cv.addEventListener('wheel', ev => { ev.preventDefault(); const rc = cv.getBoundingClientRect(); zoomAt(ev.deltaY < 0 ? 1.25 : 0.8, ev.clientX - rc.left, ev.clientY - rc.top); }, { passive: false });
  $('#zIn').onclick = () => zoomAt(1.5, cv.clientWidth / 2, cv.clientHeight / 2);
  $('#zOut').onclick = () => zoomAt(1 / 1.5, cv.clientWidth / 2, cv.clientHeight / 2);
  $('#zFit').onclick = () => { fitView(); drawMap(); };
  $('#resTable').addEventListener('click', ev => { const tr = ev.target.closest('tr[data-i]'); if (!tr) return; const i = Number(tr.dataset.i); S.sel = S.sel === i ? null : i; renderRows(); renderResults(); });
  window.addEventListener('resize', () => drawMap());
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', drawMap);
  bindFondos();
}

/* ---------- Fondos: Catastro y ortofoto ---------- */
const FONDOS = {
  catastro: { nombre: 'Catastro', fmt: 'image/png', ext: 'png', wf: 'pgw',
    url: (bb, z, w, h) => `https://ovc.catastro.meh.es/cartografia/INSPIRE/spadgcwms.aspx?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=CP.CadastralParcel,BU.Building&STYLES=&CRS=EPSG:258${z}&BBOX=${bb.join(',')}&WIDTH=${w}&HEIGHT=${h}&FORMAT=image/png&TRANSPARENT=TRUE` },
  orto: { nombre: 'Ortofoto PNOA', fmt: 'image/jpeg', ext: 'jpg', wf: 'jgw',
    url: (bb, z, w, h) => `https://www.ign.es/wms-inspire/pnoa-ma?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&LAYERS=OI.OrthoimageCoverage&STYLES=&CRS=EPSG:258${z}&BBOX=${bb.join(',')}&WIDTH=${w}&HEIGHT=${h}&FORMAT=image/jpeg` }
};
function fondoBbox() {
  const pts = allPts(); if (!pts.length || !S.proj.zone) return null;
  const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
  let minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
  const m = Math.max(40, 0.15 * Math.max(maxx - minx, maxy - miny));
  minx -= m; maxx += m; miny -= m; maxy += m;
  const res = Math.max(0.1, Math.max(maxx - minx, maxy - miny) / 2048);
  const w = Math.round((maxx - minx) / res), h = Math.round((maxy - miny) / res);
  return { bbox: [minx, miny, minx + w * res, miny + h * res].map(v => Math.round(v * 100) / 100), w, h, res };
}
function renderFondos() {
  const box = $('#fondos'); S.proj.fondos = S.proj.fondos || {};
  if (!S.proj.zone) { box.innerHTML = '<p class="note">Los fondos de Catastro y ortofoto necesitan coordenadas reales: importa el trazado o la línea existente desde KML/KMZ.</p>'; return; }
  const fb = fondoBbox();
  box.innerHTML = Object.entries(FONDOS).map(([k, F]) => {
    const f = S.proj.fondos[k] || {}; const has = f.assetId || f.blobUrl;
    const link = fb ? F.url(fb.bbox, S.proj.zone, fb.w, fb.h) : '#';
    const stale = has && fb && f.bbox && (fb.bbox[0] < f.bbox[0] || fb.bbox[1] < f.bbox[1] || fb.bbox[2] > f.bbox[2] || fb.bbox[3] > f.bbox[3]);
    return `<div class="fondo"><div class="row" style="justify-content:space-between"><label class="chk"><input type="checkbox" data-fv="${k}" ${f.visible && has ? 'checked' : ''} ${has ? '' : 'disabled'}> <b>${F.nombre}</b></label>
      <label class="chk note">Opacidad <input type="range" min="10" max="100" step="5" data-fo="${k}" value="${f.op ?? (k === 'catastro' ? 80 : 100)}" ${has ? '' : 'disabled'} aria-label="Opacidad ${F.nombre}"></label></div>
      <div class="row" style="margin-top:6px"><a class="btn small" href="${esc(link)}" target="_blank" rel="noopener" data-fl="${k}">1 · Abrir imagen de la zona</a>
      <label class="btn small" for="ff_${k}">2 · Cargar imagen guardada</label><input id="ff_${k}" type="file" accept="image/png,image/jpeg" data-ff="${k}" hidden>
      ${has ? `<button class="btn small ghost" data-fd="${k}">Quitar</button>` : ''}</div>
      ${stale ? '<p class="note" style="color:var(--warn)">El trazado se sale de la imagen cargada. Pide una imagen nueva.</p>' : ''}</div>`;
  }).join('') + `<p class="note">Pulsa «Abrir imagen», guarda la imagen que aparece (clic derecho › Guardar imagen como) y cárgala aquí. La app la coloca en su sitio porque conoce sus coordenadas. Si cambias el trazado, pide la imagen de nuevo.</p>`;
}
function bindFondos() {
  const box = $('#fondos');
  box.addEventListener('click', ev => {
    const a = ev.target.closest('[data-fl]'); if (a) { const fb = fondoBbox(); S.proj.fondos[a.dataset.fl] = { ...(S.proj.fondos[a.dataset.fl] || {}), pend: fb }; }
    const d = ev.target.closest('[data-fd]'); if (d) { const k = d.dataset.fd; const f = S.proj.fondos[k]; if (f?.assetId) delAsset(f.assetId); S.proj.fondos[k] = {}; renderFondos(); drawMap(); }
  });
  box.addEventListener('change', async ev => {
    const t = ev.target;
    if (t.dataset.fv) { S.proj.fondos[t.dataset.fv].visible = t.checked; drawMap(); }
    if (t.dataset.ff) {
      const k = t.dataset.ff, file = t.files[0]; t.value = ''; if (!file) return;
      const prev = S.proj.fondos[k] || {}; const fb = prev.pend || fondoBbox();
      const blobUrl = URL.createObjectURL(file);
      const im = new Image(); im.src = blobUrl; await im.decode().catch(() => null);
      if (!im.naturalWidth) { toast('No se ha podido leer la imagen.'); return; }
      if (Math.abs(im.naturalWidth / im.naturalHeight - fb.w / fb.h) > 0.02) toast('Las proporciones de la imagen no coinciden con la zona pedida. Comprueba que es la imagen correcta.');
      const f = { bbox: fb.bbox, w: im.naturalWidth, h: im.naturalHeight, op: prev.op ?? (k === 'catastro' ? 80 : 100), visible: true, blobUrl, nombre: file.name };
      S.proj.fondos[k] = f; S.img = S.img || {}; delete S.img[k]; renderFondos(); drawMap();
      const assets = await window.claude?.use?.('assets').catch(() => null);
      if (assets) {
        try { const r = await assets.upload(file); if (prev.assetId) delAsset(prev.assetId); f.assetId = r.id; toast(`${FONDOS[k].nombre} cargado. Se guardará con el proyecto.`); }
        catch (e) { toast('Fondo cargado solo en esta sesión: no se pudo guardar la imagen (' + (e.code || e.message) + ').'); }
      } else toast('Fondo cargado solo en esta sesión.');
    }
  });
  box.addEventListener('input', ev => { const t = ev.target; if (t.dataset.fo) { S.proj.fondos[t.dataset.fo].op = Number(t.value); drawMap(); } });
}
async function delAsset(id) { try { const a = await window.claude?.use?.('assets'); await a?.delete(id); } catch (e) { } }

/* ---------- Importación KML / KMZ ---------- */
async function readKmlOptions(file) {
  let text;
  if (/\.kmz$/i.test(file.name)) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const kmlf = Object.values(zip.files).find(f => /\.kml$/i.test(f.name));
    if (!kmlf) throw new Error('El KMZ no contiene ningún archivo .kml');
    text = await kmlf.async('string');
  } else text = await file.text();
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('El archivo no es un KML válido');
  const tag = (el, n) => [...el.getElementsByTagNameNS('*', n)];
  const parseCoords = s => s.trim().split(/\s+/).map(t => t.split(',').map(Number)).filter(a => a.length >= 2 && !isNaN(a[0]) && !isNaN(a[1])).map(([lon, lat, alt]) => ({ lat, lon, alt: isNaN(alt) ? null : alt }));
  const lines = tag(doc, 'LineString').map(ls => {
    const pm = ls.closest('Placemark'); const nm = (pm && tag(pm, 'name')[0]?.textContent) || 'Línea';
    return { label: `${nm} · ${0} vértices`, nombre: nm, pts: parseCoords(tag(ls, 'coordinates')[0]?.textContent || '') };
  }).filter(l => l.pts.length >= 2).map(l => ({ ...l, label: `${l.nombre} · ${l.pts.length} vértices` }));
  const points = tag(doc, 'Placemark').filter(pm => tag(pm, 'Point').length).map(pm => {
    const c = parseCoords(tag(pm, 'coordinates')[0]?.textContent || '')[0];
    return c ? { ...c, nombre: tag(pm, 'name')[0]?.textContent || '' } : null;
  }).filter(Boolean);
  const opts = [...lines];
  if (points.length >= 2) opts.push({ label: `Puntos del archivo como apoyos (${points.length}, en orden)`, pts: points, sinDividir: true });
  if (!opts.length) throw new Error('No se ha encontrado ninguna línea (LineString) ni puntos en el archivo');
  return opts;
}
async function importFile(file, destino) {
  try {
    const opts = await readKmlOptions(file);
    const apply = o => destino === 'existente' ? applyExisting(o, file.name) : applyTrace(o, file.name);
    if (opts.length === 1) apply(opts[0]);
    else {
      const box = destino === 'existente' ? $('#exPick') : $('#kmlPick'); box.hidden = false;
      box.innerHTML = `<div class="banner info">El archivo tiene varios elementos. Elige cuál ${destino === 'existente' ? 'es la línea existente' : 'define el trazado nuevo'}:</div><div class="row" style="margin-top:6px">${opts.map((o, k) => `<button class="btn small" data-k="${k}">${esc(o.label)}</button>`).join('')}</div>`;
      box.onclick = ev => { const b = ev.target.closest('button[data-k]'); if (!b) return; box.hidden = true; apply(opts[Number(b.dataset.k)]); };
    }
  } catch (e) { toast('No se pudo importar: ' + e.message); }
}
function setZoneFrom(p) {
  if (!S.proj.zone) S.proj.zone = E.utmFromLatLon(p.lat, p.lon).zone;
  return S.proj.zone;
}
function applyTrace(opt, fname) {
  const ctx = S.proj.ctx; const zone = setZoneFrom(opt.pts[0]);
  let pts = opt.pts.map(p => ({ ...p, ...E.utmFromLatLon(p.lat, p.lon, zone), vertice: true }));
  if (ctx.dividir && !opt.sinDividir && ctx.vanoMax > 0) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = Math.hypot(b.x - a.x, b.y - a.y), k = Math.ceil(d / ctx.vanoMax - 1e-9);
      for (let j = 1; j < k; j++) {
        const x = a.x + (b.x - a.x) * j / k, y = a.y + (b.y - a.y) * j / k, ll = E.latLonFromUtm(x, y, zone);
        out.push({ x, y, lat: ll.lat, lon: ll.lon, alt: a.alt != null && b.alt != null ? a.alt + (b.alt - a.alt) * j / k : null, vertice: false });
      }
      out.push(b);
    }
    pts = out;
  }
  const alts = pts.map(p => p.alt).filter(v => v != null && v !== 0);
  const altMax = alts.length ? Math.max(...alts) : null;
  S.proj.geo = { zone, pts, fuente: fname, altMax };
  S.proj.modo = 'kml';
  S.proj.rows = pts.map(() => newRow());
  if (!S.proj.nombre || /^Ejemplo/.test(S.proj.nombre)) { S.proj.nombre = fname.replace(/\.(kml|kmz)$/i, ''); $('#p_nombre').value = S.proj.nombre; }
  if (altMax != null) { const z = altMax > 1000 ? 'C' : altMax > 500 ? 'B' : 'A'; if (z !== ctx.zona) { ctx.zona = z; $('#p_zona').value = z; toast(`Zona ${z} asignada por la cota máxima del KML (${fmt(altMax)} m). Revísala.`); } }
  if (S.proj.entronque) snapToEntronque(true);
  S.sel = null; S.openEx = null; V.fitted = false; refreshAll();
}
function geoInfoHtml() {
  const g = S.proj.geo; if (S.proj.modo !== 'kml' || !g) return '';
  const vert = g.pts.filter(p => p.vertice !== false).length;
  return `Trazado nuevo de <b>${esc(g.fuente)}</b>: ${g.pts.length} apoyos${g.pts.length > vert ? ` (${g.pts.length - vert} intercalados, vano máx. ${fmt(S.proj.ctx.vanoMax)} m)` : ''}. ETRS89 UTM huso ${g.zone}. <button class="btn small" id="toManual">Pasar a entrada manual</button>`;
}
function toManual() {
  const nodes = currentNodes(); const spans = E.buildGeometry(nodes);
  S.proj.rows.forEach((r, i) => { r.vano = i ? Math.round(spans[i - 1].a * 10) / 10 : 0; r.angulo = Math.round((nodes[i].desvio || 0) * 10) / 10; });
  S.proj.ctx.rumbo0 = Math.round(spans[0].az * 10) / 10; $('#p_rumbo0').value = S.proj.ctx.rumbo0;
  if (!S.proj.entronque) toast('Entrada manual sin georreferencia: conecta el trazado a la línea existente para mantener las coordenadas reales.');
  S.proj.modo = 'manual'; S.proj.geo = null; refreshAll();
}

/* ---------- Línea existente y entronque ---------- */
function applyExisting(opt, fname) {
  const zone = setZoneFrom(opt.pts[0]);
  S.proj.lineaEx = { fuente: fname, nombre: opt.nombre || fname, pts: opt.pts.map(p => ({ lat: p.lat, lon: p.lon, ...E.utmFromLatLon(p.lat, p.lon, zone) })) };
  if (!S.proj.entronque) S.proj.entronque = { k: null, cableId: (S.cables.find(c => /3x95/.test(c.designacion)) || S.cables[0] || {}).id || '', tense: 500, depth: S.proj.ctx.depthAmarre };
  else S.proj.entronque.k = null;
  V.fitted = false; refreshAll();
  toast(`Línea existente importada: ${S.proj.lineaEx.pts.length} apoyos (E1–E${S.proj.lineaEx.pts.length}). Elige el apoyo de entronque.`);
}
function setEntronque(k) {
  const en = S.proj.entronque; if (!en) return;
  en.k = Number.isInteger(k) && k >= 0 ? k : null;
  if (en.k != null) {
    const r0 = S.proj.rows[0]; r0.existente.activo = true;
    if (S.proj.modo === 'kml') snapToEntronque(false);
    else if (S.proj.rows.length < 2) { S.proj.rows.push(newRow()); }
  }
  refreshAll();
}
/* En un trazado importado, el apoyo A1 pasa a ser el apoyo existente de entronque */
function snapToEntronque(silent) {
  const g = S.proj.geo, en = S.proj.entronque, ex = exNodes(); if (!g || !en || en.k == null || !ex[en.k]) return;
  const E0 = ex[en.k], d = p => Math.hypot(p.x - E0.x, p.y - E0.y);
  const first = g.pts[0], last = g.pts[g.pts.length - 1];
  if (d(last) < d(first) && d(last) < 5) { g.pts.reverse(); S.proj.rows.reverse(); }
  const p0 = { x: E0.x, y: E0.y, lat: E0.lat, lon: E0.lon, alt: null, vertice: true };
  if (d(g.pts[0]) < 5) { g.pts[0] = p0; if (!silent) toast(`A1 ajustado al apoyo existente E${en.k + 1}.`); }
  else { g.pts.unshift(p0); const r = newRow(); S.proj.rows.unshift(r); if (!silent) toast(`Añadido el apoyo existente E${en.k + 1} como A1 (estaba a ${fmt(d(first), 1)} m del inicio del trazado).`); }
  S.proj.rows[0].existente.activo = true;
}
function renderEntronque() {
  const box = $('#exBody'), L = S.proj.lineaEx, en = S.proj.entronque;
  if (!L) { box.innerHTML = '<p class="note">Importa en KML/KMZ la línea BT de la que deriva el proyecto. Sus apoyos aparecen en el plano como E1, E2… y eliges el de entronque: la app añade al cálculo de A1 los conductores existentes con su acimut y vano reales.</p>'; return; }
  const r0 = S.proj.rows[0];
  const cabOpts = S.cables.map(c => `<option value="${esc(c.id)}" ${en.cableId === c.id ? 'selected' : ''}>${esc(c.designacion)}</option>`).join('');
  const conds = entronqueConductores();
  box.innerHTML = `<div class="banner info"><b>${esc(L.nombre)}</b> · ${L.pts.length} apoyos (E1–E${L.pts.length}) · de ${esc(L.fuente)}</div>
    <div class="fields" style="margin-top:10px">
      <label class="f">Apoyo de entronque<select id="en_k"><option value="">Sin elegir</option>${L.pts.map((p, i) => `<option value="${i}" ${en.k === i ? 'selected' : ''}>E${i + 1}</option>`).join('')}</select></label>
      <div class="f" style="justify-content:flex-end"><button class="btn small" id="en_pick">${S.pickEntronque ? 'Pulsa un apoyo E en el plano…' : 'Elegir en el plano'}</button></div>
      <label class="f">Modelo del poste existente<select id="en_modelo"><option value="">Sin datos</option>${S.poles.map(p => `<option value="${esc(p.id)}" ${r0.existente.modeloId === p.id ? 'selected' : ''}>${poleLabel(p)}</option>`).join('')}</select></label>
      <label class="f">Acimut del eje principal (°)<input id="en_az" class="num" type="number" value="${esc(r0.existente.azPrincipal)}" placeholder="Desconocido"></label>
      <label class="f">Cable de la línea existente<select id="en_cable">${cabOpts}</select></label>
      <label class="f">Tense de la línea existente (daN)<input id="en_tense" class="num" type="number" step="10" value="${en.tense}"></label>
      <label class="f">Amarre existente bajo cogolla (m)<input id="en_depth" class="num" type="number" step="0.05" value="${en.depth}"></label>
    </div>
    ${en.k != null ? `<p class="note" style="margin-top:8px">A1 = E${en.k + 1}. Conductores existentes en el cálculo: ${conds.map(c => `hacia ${c.hacia}, acimut ${fmt(c.az, 1)}°, vano ${fmt(c.vano, 1)} m`).join(' · ') || 'ninguno'}.${S.proj.modo === 'manual' ? ' El trazado manual parte de E' + (en.k + 1) + ' con el rumbo inicial indicado.' : ''}</p>` : ''}
    <div class="row" style="margin-top:8px"><button class="btn small ghost" id="en_del">Quitar línea existente</button></div>`;
}
function bindEntronque() {
  $('#exFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f, 'existente'); e.target.value = ''; });
  const box = $('#exBody');
  box.addEventListener('change', ev => {
    const t = ev.target, en = S.proj.entronque, r0 = S.proj.rows[0]; if (!en) return;
    if (t.id === 'en_k') return setEntronque(t.value === '' ? null : Number(t.value));
    if (t.id === 'en_modelo') r0.existente.modeloId = t.value;
    if (t.id === 'en_az') r0.existente.azPrincipal = t.value;
    if (t.id === 'en_cable') en.cableId = t.value;
    if (t.id === 'en_tense') en.tense = Number(t.value);
    if (t.id === 'en_depth') en.depth = Number(t.value);
    refreshAll();
  });
  box.addEventListener('click', ev => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'en_pick') { S.pickEntronque = !S.pickEntronque; renderEntronque(); if (S.pickEntronque) toast('Pulsa en el plano el apoyo existente (círculos E) del que parte la línea nueva.'); }
    if (b.id === 'en_del') { S.proj.lineaEx = null; S.proj.entronque = null; if (!S.proj.geo) S.proj.zone = null; S.pickEntronque = false; V.fitted = false; refreshAll(); }
  });
}
function refreshAll() {
  $('#geoInfo').hidden = !(S.proj.modo === 'kml' && S.proj.geo); $('#geoInfo').innerHTML = geoInfoHtml();
  const tm = $('#toManual'); if (tm) tm.onclick = toManual;
  renderRows(); renderEntronque(); recalc(); renderFondos();
}

/* ---------- Exportación ---------- */
const ascii = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '');
function dxf(c, geo) {
  const L = [];
  const p = (...a) => { for (let k = 0; k < a.length; k += 2) L.push(String(a[k]), String(a[k + 1])); };
  const layers = [['BT_TRAZADO', 5], ['BT_APOYOS', 1], ['BT_TEXTO_APOYOS', 7], ['BT_TEXTO_VANOS', 8], ['BT_EXISTENTE', 30], ['BT_LINEA_EXISTENTE', 30], ['BT_TEXTO_EXISTENTE', 30]];
  p(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1009', 9, '$INSUNITS', 70, 6, 0, 'ENDSEC');
  p(0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LTYPE', 70, 1, 0, 'LTYPE', 2, 'CONTINUOUS', 70, 0, 3, 'Solid line', 72, 65, 73, 0, 40, 0, 0, 'ENDTAB');
  p(0, 'TABLE', 2, 'LAYER', 70, layers.length); layers.forEach(([n, colr]) => p(0, 'LAYER', 2, n, 70, 0, 62, colr, 6, 'CONTINUOUS')); p(0, 'ENDTAB', 0, 'ENDSEC');
  p(0, 'SECTION', 2, 'ENTITIES');
  const N = c.nodes, f3 = v => v.toFixed(3);
  const ex = geo ? exNodes() : [];
  for (let i = 0; i < ex.length; i++) {
    if (i < ex.length - 1) p(0, 'LINE', 8, 'BT_LINEA_EXISTENTE', 10, f3(ex[i].x), 20, f3(ex[i].y), 30, 0, 11, f3(ex[i + 1].x), 21, f3(ex[i + 1].y), 31, 0);
    p(0, 'CIRCLE', 8, 'BT_LINEA_EXISTENTE', 10, f3(ex[i].x), 20, f3(ex[i].y), 30, 0, 40, 0.4);
    p(0, 'TEXT', 8, 'BT_TEXTO_EXISTENTE', 10, f3(ex[i].x - 3), 20, f3(ex[i].y + 1), 30, 0, 40, 1, 1, 'E' + (i + 1));
  }
  for (let i = 0; i < N.length - 1; i++) {
    p(0, 'LINE', 8, 'BT_TRAZADO', 10, f3(N[i].x), 20, f3(N[i].y), 30, 0, 11, f3(N[i + 1].x), 21, f3(N[i + 1].y), 31, 0);
    const mx = (N[i].x + N[i + 1].x) / 2, my = (N[i].y + N[i + 1].y) / 2; let ang = Math.atan2(N[i + 1].y - N[i].y, N[i + 1].x - N[i].x) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
    p(0, 'TEXT', 8, 'BT_TEXTO_VANOS', 10, f3(mx), 20, f3(my + 0.6), 30, 0, 40, 0.8, 1, ascii(`${c.spans[i].a.toFixed(1)} m`), 50, ang.toFixed(2), 72, 1, 11, f3(mx), 21, f3(my + 0.6), 31, 0);
  }
  N.forEach((n, i) => {
    const r = c.results[i]; const pole = r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole;
    p(0, 'CIRCLE', 8, 'BT_APOYOS', 10, f3(n.x), 20, f3(n.y), 30, 0, 40, 0.5);
    p(0, 'TEXT', 8, 'BT_TEXTO_APOYOS', 10, f3(n.x + 1), 20, f3(n.y + 1), 30, 0, 40, 1.2, 1, ascii(`A${i + 1}`));
    p(0, 'TEXT', 8, 'BT_TEXTO_APOYOS', 10, f3(n.x + 1), 20, f3(n.y - 0.6), 30, 0, 40, 0.8, 1, ascii(pole ? poleLabel(pole) + (n.existente?.activo ? (r.existenteCheck?.ok ? ' (existente)' : ' (sustituye)') : '') : 'SIN APOYO VALIDO'));
    const e = n.existente; if (e?.activo) (e.conductores || []).filter(cd => !cd.deLinea || !ex.length).forEach(cd => { const u = { x: Math.sin(cd.az * Math.PI / 180), y: Math.cos(cd.az * Math.PI / 180) }; p(0, 'LINE', 8, 'BT_EXISTENTE', 10, f3(n.x), 20, f3(n.y), 30, 0, 11, f3(n.x + u.x * 10), 21, f3(n.y + u.y * 10), 31, 0); });
  });
  if (!geo) p(0, 'TEXT', 8, 'BT_TEXTO_APOYOS', 10, f3(N[0].x), 20, f3(N[0].y - 4), 30, 0, 40, 1, 1, 'COORDENADAS LOCALES - SIN GEORREFERENCIAR');
  p(0, 'ENDSEC', 0, 'EOF');
  return L.join('\r\n') + '\r\n';
}
function kml(c, g) {
  const pts = g.pts, ex = exNodes();
  const pm = pts.map((pt, i) => {
    const r = c.results[i], pole = r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole, st = statusOf(r, i);
    return `<Placemark><name>A${i + 1}</name><styleUrl>#${st.cls}</styleUrl><description><![CDATA[${FUNCS[r.func]}<br>${pole ? poleLabel(pole) : 'Sin apoyo válido'}<br>${st.txt}${pole ? `<br>Utilización ${fmt((r.existenteCheck?.ok ? r.existenteCheck.r : r.elegido.r).u * 100, 1)} %` : ''}<br>UTM ${g.zone}: ${pt.x.toFixed(2)} ; ${pt.y.toFixed(2)}]]></description><Point><coordinates>${pt.lon.toFixed(8)},${pt.lat.toFixed(8)},0</coordinates></Point></Placemark>`;
  }).join('\n');
  const st = (id, color) => `<Style id="${id}"><IconStyle><color>${color}</color><scale>0.9</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_square.png</href></Icon></IconStyle></Style>`;
  const exK = ex.length > 1 ? `<Folder><name>Línea existente</name><Placemark><name>${esc(S.proj.lineaEx.nombre)}</name><styleUrl>#existente</styleUrl><LineString><tessellate>1</tessellate><coordinates>${ex.map(p => `${p.lon.toFixed(8)},${p.lat.toFixed(8)},0`).join(' ')}</coordinates></LineString></Placemark>
${ex.map((p, i) => `<Placemark><name>E${i + 1}</name><styleUrl>#exApoyo</styleUrl><Point><coordinates>${p.lon.toFixed(8)},${p.lat.toFixed(8)},0</coordinates></Point></Placemark>`).join('\n')}</Folder>` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${esc(S.proj.nombre)}</name>
${st('ok', 'ff4f7d2f')}${st('warn', 'ff006aa6')}${st('bad', 'ff2c36b3')}
<Style id="linea"><LineStyle><color>ff865b1d</color><width>3</width></LineStyle></Style>
<Style id="existente"><LineStyle><color>ff737373</color><width>3</width></LineStyle></Style>
<Style id="exApoyo"><IconStyle><color>ff737373</color><scale>0.7</scale><Icon><href>http://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle></Style>
${exK}
<Placemark><name>Línea BT nueva · ${esc(c.cable.designacion)}</name><styleUrl>#linea</styleUrl><LineString><tessellate>1</tessellate><coordinates>${pts.map(p => `${p.lon.toFixed(8)},${p.lat.toFixed(8)},0`).join(' ')}</coordinates></LineString></Placemark>
<Folder><name>Apoyos nuevos</name>
${pm}
</Folder></Document></kml>`;
}
function geojson(c, g) {
  const feats = [{ type: 'Feature', properties: { capa: 'linea_nueva', cable: c.cable.designacion }, geometry: { type: 'LineString', coordinates: g.pts.map(p => [+p.lon.toFixed(8), +p.lat.toFixed(8)]) } }];
  g.pts.forEach((p, i) => { const r = c.results[i], pole = r.existenteCheck?.ok ? r.existenteCheck.pole : r.elegido?.pole; feats.push({ type: 'Feature', properties: { capa: 'apoyo_nuevo', apoyo: 'A' + (i + 1), funcion: FUNCS[r.func], modelo: pole ? poleLabel(pole) : null, estado: statusOf(r, i).txt, utm_huso: g.zone, utm_x: +p.x.toFixed(2), utm_y: +p.y.toFixed(2) }, geometry: { type: 'Point', coordinates: [+p.lon.toFixed(8), +p.lat.toFixed(8)] } }); });
  const ex = exNodes();
  if (ex.length > 1) {
    feats.push({ type: 'Feature', properties: { capa: 'linea_existente', nombre: S.proj.lineaEx.nombre }, geometry: { type: 'LineString', coordinates: ex.map(p => [+p.lon.toFixed(8), +p.lat.toFixed(8)]) } });
    ex.forEach((p, i) => feats.push({ type: 'Feature', properties: { capa: 'apoyo_existente', apoyo: 'E' + (i + 1), entronque: S.proj.entronque?.k === i }, geometry: { type: 'Point', coordinates: [+p.lon.toFixed(8), +p.lat.toFixed(8)] } }));
  }
  return JSON.stringify({ type: 'FeatureCollection', name: S.proj.nombre, features: feats }, null, 1);
}
function csv(c, g) {
  const sep = ';', n = v => String(v ?? '').replace('.', ',');
  const head = ['Apoyo', 'Funcion', 'Desvio (grados)', 'Vano anterior (m)', 'Modelo', 'Tipo', 'Esfuerzo nominal (daN)', 'Esfuerzo secundario (daN)', 'Altura (m)', 'F principal (daN)', 'F secundario (daN)', 'Utilizacion (%)', 'Eje principal (acimut)', 'Estado', 'Coste (EUR)', 'Venta (EUR)'];
  if (g) head.push(`UTM X (huso ${g.zone})`, 'UTM Y', 'Latitud', 'Longitud');
  const rows = c.results.map((r, i) => {
    const sel = r.existenteCheck?.ok ? r.existenteCheck : r.elegido; const p = sel?.pole, rr = sel?.r; const st = statusOf(r, i);
    const a = [`A${i + 1}`, FUNCS[r.func], n(r.desvio?.toFixed(1)), i ? n(c.spans[i - 1].a.toFixed(2)) : '', p ? poleLabel(p) : '', p?.tipo, p?.En, p?.Es, p?.altura, n(rr?.Fp.toFixed(0)), n(rr?.Fs.toFixed(0)), n(rr ? (rr.u * 100).toFixed(1) : ''), n(rr?.phi.toFixed(0)), st.txt, n(st.txt === 'Existente válido' ? 0 : p?.coste), n(st.txt === 'Existente válido' ? 0 : p?.venta)];
    if (g) { const pt = g.pts[i]; a.push(n(pt.x.toFixed(2)), n(pt.y.toFixed(2)), n(pt.lat.toFixed(8)), n(pt.lon.toFixed(8))); }
    return a.join(sep);
  });
  return '﻿' + [head.join(sep), ...rows].join('\r\n');
}
function worldFile(f) { const rx = (f.bbox[2] - f.bbox[0]) / f.w, ry = (f.bbox[3] - f.bbox[1]) / f.h; return [rx, 0, 0, -ry, f.bbox[0] + rx / 2, f.bbox[3] - ry / 2].map(v => v.toFixed(6)).join('\r\n') + '\r\n'; }
function leeme(c, g, fondosIncl) {
  const base = fileBase(g); const z = g ? g.zone : 29;
  const L = [`PAQUETE DE EXPORTACION - ${ascii(S.proj.nombre)}`, `Generado con Calculo de Apoyos BT v${VERSION} el ${ascii(new Date().toLocaleString('es-ES'))}`, '',
    g ? `Sistema de coordenadas: ETRS89 / UTM huso ${z}N (EPSG:258${z}), el mismo que usa la cartografia catastral en la peninsula.`
      : 'ATENCION: trazado introducido a mano y sin conectar a una linea existente. El DXF esta en coordenadas locales (origen en A1) y no se puede superponer al Catastro. Importa un KML/KMZ o conecta el trazado a la linea existente.', '',
    'ARCHIVOS',
    `- ${base}.dxf: trazado, apoyos y textos por capas (BT_TRAZADO, BT_APOYOS, BT_TEXTO_APOYOS, BT_TEXTO_VANOS, BT_EXISTENTE${exNodes().length && g ? ', BT_LINEA_EXISTENTE, BT_TEXTO_EXISTENTE' : ''}). Unidades: metros.`,
    g ? `- ${base}.kml: linea nueva, apoyos${exNodes().length ? ' y linea existente' : ''} para Google Earth (WGS84).` : null,
    g ? `- ${base}.geojson: las mismas capas para QGIS (WGS84).` : null,
    ...fondosIncl.map(f => `- ${f.file} + ${f.wf}: fondo de ${f.nombre} georreferenciado (archivo de mundo en EPSG:258${z}).`),
    `- ${base}_apoyos.csv: tabla de apoyos (separador punto y coma) para Excel.`,
    `- ${base}_anexo_calculo.html: anexo de calculo. Abrelo en el navegador e imprimelo a PDF.`, '',
    'SUPERPONER SOBRE CATASTRO', '',
    'AutoCAD:',
    '  1. Descarga la cartografia catastral vectorial del municipio en la Sede Electronica del Catastro (www.sedecatastro.gob.es, Descarga de cartografia).',
    '  2. Trabaja en el mismo sistema ETRS89 UTM del paquete.',
    `  3. Inserta ${base}.dxf con INSERTAR en el punto 0,0,0, escala 1 y rotacion 0, o copialo y pegalo en coordenadas originales.`,
    fondosIncl.length ? '  4. Las imagenes de fondo con archivo de mundo se colocan solas en AutoCAD Map 3D o Civil 3D (MAPIINSERT). En AutoCAD basico, insertalas con IMAGEN usando las coordenadas del archivo de mundo.' : null, '',
    'QGIS:',
    '  1. Capa > Anadir capa > Anadir capa WMS. Catastro (INSPIRE): https://ovc.catastro.meh.es/cartografia/INSPIRE/spadgcwms.aspx  Ortofoto PNOA: https://www.ign.es/wms-inspire/pnoa-ma',
    `  2. Arrastra ${base}.geojson al mapa (o el DXF, indicando EPSG:258${z}).`,
    fondosIncl.length ? '  3. Tambien puedes arrastrar las imagenes de fondo incluidas: QGIS lee su archivo de mundo (indica EPSG:258' + z + ').' : null, '',
    'Google Earth Pro:',
    `  1. Abre ${base}.kml.`, '',
    'Comprueba siempre la superposicion con puntos de control conocidos antes de usarla en un proyecto.'];
  return L.filter(l => l !== null).join('\r\n') + '\r\n';
}
function fileBase(g) { return ascii(S.proj.nombre || 'linea_bt').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/_+/g, '_').slice(0, 60) + (g ? `_ETRS89_UTM${g.zone}` : '_local'); }
async function fondoBlob(f) {
  if (f.blobUrl) { try { return await (await fetch(f.blobUrl)).blob(); } catch (e) { } }
  if (f.assetId) { try { const r = await fetch('/_blob/' + f.assetId); if (r.ok) return await r.blob(); } catch (e) { } }
  return null;
}
async function exportZip() {
  const c = S.calc; if (!c) { toast('No hay resultados que exportar.'); return; }
  const dl = await window.claude?.use?.('downloads').catch(() => null);
  if (!dl) { toast('La descarga de archivos no está disponible en esta vista.'); return; }
  const g = getGeo(c.nodes), zip = new JSZip(), base = fileBase(g);
  zip.file(base + '.dxf', dxf(c, g));
  if (g) { zip.file(base + '.kml', kml(c, g)); zip.file(base + '.geojson', geojson(c, g)); }
  const incl = [];
  if (g) for (const [k, F] of Object.entries(FONDOS)) {
    const f = S.proj.fondos?.[k]; if (!f || !(f.assetId || f.blobUrl)) continue;
    const b = await fondoBlob(f); if (!b) continue;
    const ext = /png/.test(b.type) ? 'png' : 'jpg', wfExt = ext === 'png' ? 'pgw' : 'jgw';
    const file = `fondo_${k}_EPSG258${g.zone}.${ext}`, wf = `fondo_${k}_EPSG258${g.zone}.${wfExt}`;
    zip.file(file, b); zip.file(wf, worldFile(f)); incl.push({ file, wf, nombre: F.nombre });
  }
  zip.file(base + '_apoyos.csv', csv(c, g)); zip.file(base + '_anexo_calculo.html', informe(c)); zip.file('LEEME.txt', leeme(c, g, incl));
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  try { await dl.save({ filename: base + '.zip', data: blob }); toast('Paquete guardado.'); }
  catch (e) { if (e.code !== 'declined') toast('No se pudo guardar el archivo: ' + (e.message || e.code)); }
}
