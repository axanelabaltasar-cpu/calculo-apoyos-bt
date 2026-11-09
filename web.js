/* ===== Versión web (Firebase): acceso con usuario y base de datos en Firestore ===== */
const WEB_USER = 'tecnicos@elecanto.es';
const BASE_COLLS = ['apoyos', 'cables', 'cablesSub', 'tubos', 'config'];

/* Base de datos en Firestore con la misma interfaz que la del artefacto y la local */
async function webDb() {
  const fs = firebase.firestore();
  const api = {
    collection: c => fs.collection(c),
    doc: p => fs.doc(p),
    async exportAll() {
      const out = { app: 'Calculo de Apoyos BT', version: VERSION };
      for (const c of BASE_COLLS) { const qs = await fs.collection(c).get(); out[c] = Object.fromEntries(qs.docs.map(d => [d.id, d.data()])); }
      return JSON.stringify(out, null, 1);
    },
    async importAll(j) {
      const ops = [];
      for (const c of BASE_COLLS) if (j[c] && typeof j[c] === 'object') for (const [id, v] of Object.entries(j[c])) ops.push([c + '/' + id, v]);
      for (let k = 0; k < ops.length; k += 400) { const b = fs.batch(); ops.slice(k, k + 400).forEach(([p, v]) => b.set(fs.doc(p), v)); await b.commit(); }
    }
  };
  await webSeed(fs);
  return api;
}
/* Primera entrada: carga las bases iniciales (apoyos, cables, cables subterráneos, tubos y precios) si no están */
async function webSeed(fs) {
  const seed = window.WEB_SEED || []; if (!seed.length) return;
  let hecho = null; try { hecho = (await fs.doc('config/seedWeb').get()).data(); } catch (e) { return; }
  if (hecho) return;
  const have = {};
  for (const c of new Set(seed.map(o => o.collection))) { const qs = await fs.collection(c).get(); have[c] = new Set(qs.docs.map(d => d.id)); }
  const ops = seed.filter(o => !have[o.collection].has(o.doc_id));
  for (let k = 0; k < ops.length; k += 400) { const b = fs.batch(); ops.slice(k, k + 400).forEach(o => b.set(fs.doc(o.collection + '/' + o.doc_id), o.data)); await b.commit(); }
  await fs.doc('config/seedWeb').set({ fecha: new Date().toISOString(), version: VERSION, cargados: ops.length });
  if (ops.length) toast(`Primera entrada: cargadas las bases iniciales (${ops.length} elementos).`);
}

/* Pantalla de acceso */
function webLoginHtml() {
  return `<div class="wlogin" id="wlogin" role="dialog" aria-modal="true" aria-labelledby="wlTit">
  <form class="wlbox" id="wlForm" novalidate>
    <div class="wlmark" aria-hidden="true"><svg viewBox="0 0 40 56" width="28" height="40"><path d="M14 4h12l4 48H10z" fill="none" stroke="currentColor" stroke-width="2.5"/><path d="M4 12h32M8 20h24" stroke="currentColor" stroke-width="2.5"/></svg></div>
    <h2 id="wlTit"><small>Redes de BT · ITC-BT-06 / 07</small>Cálculo de Apoyos BT</h2>
    <label>Usuario<input id="wlEmail" type="email" autocomplete="username" value="${WEB_USER}" required></label>
    <label>Contraseña<input id="wlPass" type="password" autocomplete="current-password" required></label>
    <button class="btn primary" id="wlGo" type="submit">Entrar</button>
    <button class="btn small ghost" id="wlReset" type="button">He olvidado la contraseña</button>
    <p class="wlmsg" id="wlMsg" role="status"></p>
    <p class="note">Acceso solo para ${WEB_USER}. v${VERSION}</p>
  </form></div>`;
}
const WEB_CSS = `.wlogin{position:fixed;inset:0;z-index:1000;display:grid;place-items:center;background:var(--bg);padding:16px}
.wlbox{width:min(360px,100%);display:flex;flex-direction:column;gap:12px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:28px 24px;box-shadow:0 8px 30px rgba(0,0,0,.08)}
.wlbox h2{font-family:var(--f-display);font-size:1.6rem;margin:0 0 6px;line-height:1.1}
.wlbox h2 small{display:block;font-size:.72rem;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:600;margin-bottom:4px}
.wlbox label{display:flex;flex-direction:column;gap:4px;font-size:.85rem;color:var(--muted)}
.wlbox input{font:inherit;color:var(--ink);background:var(--soft);border:1px solid var(--line);border-radius:6px;padding:9px 10px}
.wlbox input:focus{outline:2px solid var(--accent);outline-offset:1px}
.wlmark{color:var(--accent)} .wlmsg{min-height:1.2em;margin:0;font-size:.85rem;color:var(--bad)} .wlmsg.ok{color:var(--ok)}
.wlbox .note{margin:0;font-size:.75rem;color:var(--muted)}
.wuser{display:flex;align-items:center;gap:6px;font-size:.78rem;color:var(--muted)}`;

function webAuthErr(e) {
  const c = e?.code || '';
  if (/wrong-password|invalid-credential|invalid-login|user-not-found/.test(c)) return 'Usuario o contraseña incorrectos.';
  if (/too-many-requests/.test(c)) return 'Demasiados intentos. Espera unos minutos o cambia la contraseña.';
  if (/network/.test(c)) return 'Sin conexión a internet.';
  if (/invalid-email/.test(c)) return 'El usuario no es un correo válido.';
  return 'No se pudo entrar: ' + (e?.message || c);
}
function webStart() {
  const st = document.createElement('style'); st.textContent = WEB_CSS; document.head.appendChild(st);
  document.title = 'Cálculo de Apoyos BT';
  if (!window.firebase?.auth) { document.body.insertAdjacentHTML('afterbegin', '<div class="banner bad" style="margin:16px">No se ha podido cargar Firebase. Comprueba la conexión a internet y recarga la página.</div>'); return; }
  try { firebase.firestore().settings({ ignoreUndefinedProperties: true, merge: true }); } catch (e) { }
  try { firebase.firestore().enablePersistence({ synchronizeTabs: true }).catch(() => { }); } catch (e) { }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
  const auth = firebase.auth(); let started = false;
  const showLogin = () => {
    if ($('#wlogin')) return;
    document.body.insertAdjacentHTML('beforeend', webLoginHtml());
    const msg = $('#wlMsg'), go = $('#wlGo');
    $('#wlForm').addEventListener('submit', async ev => {
      ev.preventDefault(); msg.className = 'wlmsg'; msg.textContent = '';
      const email = $('#wlEmail').value.trim().toLowerCase(), pass = $('#wlPass').value;
      if (email !== WEB_USER) { msg.textContent = `Solo puede entrar ${WEB_USER}.`; return; }
      if (!pass) { msg.textContent = 'Escribe la contraseña.'; $('#wlPass').focus(); return; }
      go.disabled = true; go.textContent = 'Entrando…';
      try { await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); await auth.signInWithEmailAndPassword(email, pass); }
      catch (e) { msg.textContent = webAuthErr(e); }
      finally { go.disabled = false; go.textContent = 'Entrar'; }
    });
    $('#wlReset').addEventListener('click', async () => {
      msg.className = 'wlmsg';
      try { await auth.sendPasswordResetEmail(WEB_USER); msg.className = 'wlmsg ok'; msg.textContent = `Te hemos enviado un correo a ${WEB_USER} para cambiar la contraseña.`; }
      catch (e) { msg.textContent = webAuthErr(e); }
    });
    setTimeout(() => $('#wlPass')?.focus(), 50);
  };
  auth.onAuthStateChanged(async u => {
    if (u && (u.email || '').toLowerCase() !== WEB_USER) { await auth.signOut(); showLogin(); const m = $('#wlMsg'); if (m) m.textContent = `Solo puede entrar ${WEB_USER}.`; return; }
    if (!u) { if (started) { location.reload(); return; } showLogin(); return; }
    $('#wlogin')?.remove();
    if (started) return; started = true;
    const ver = $('#ver');
    ver.insertAdjacentHTML('afterend', `<div class="wuser"><span>${esc(u.email)}</span><button class="btn small ghost" id="wLogout" type="button">Salir</button></div>`);
    $('#wLogout').onclick = () => auth.signOut();
    start();
  });
}
