set -e
cd /home/claude/apoyos-bt
mkdir -p dist
body() {
  cat ui.html
  echo '<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>'
  echo '<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"></script>'
  echo '<script>'
  echo 'const E = (() => {'
  sed '/^if (typeof module/d' engine.js
  echo 'return { utmFromLatLon, latLonFromUtm, calcular, presupuesto, nodesFromManual, buildGeometry, buildProfile, evaluatePole, hypotheses, cableProps };'
  echo '})();'
  cat anexo_tpl.js
  cat app.js
  cat sub.js
  cat detail.js
  cat capas.js
  cat redbase.js
  if [ "$1" = web ]; then cat web.js; echo 'webStart();'; else echo 'start();'; fi
  echo '</script>'
}
body > dist/calculo-apoyos-bt.html
# Versión local: documento completo + bases incluidas
{ echo '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>[hidden]{display:none!important}body{margin:0}</style></head><body>'
  printf '<script>window.LOCAL_SEED = %s;</script>\n' "$(cat seed_ops.json)"
  body | python3 inline_libs.py
  echo '</body></html>'
} > dist/CalculoApoyosBT_local.html
# Versión web (Firebase Hosting): web/public/index.html
VER=$(grep -oP "const VERSION = '\\K[^']+" app.js)
{ cat <<HEAD
<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1d5b86"><link rel="manifest" href="manifest.webmanifest"><link rel="icon" href="icon-192.png"><link rel="apple-touch-icon" href="icon-192.png">
<meta name="app-version" content="$VER">
<style>[hidden]{display:none!important}body{margin:0}</style>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
<script src="/__/firebase/init.js"></script>
</head><body>
HEAD
  printf '<script>window.WEB_APP = true; window.WEB_SEED = %s;</script>\n' "$(cat seed_ops.json)"
  body web | python3 inline_libs.py
  echo '</body></html>'
} > web/public/index.html
sed "s/__VERSION__/$VER/" web/sw.tpl.js > web/public/sw.js
echo "$VER" > VERSION

node -e "
for (const f of ['dist/calculo-apoyos-bt.html','dist/CalculoApoyosBT_local.html','web/public/index.html']) {
const h=require('fs').readFileSync(f,'utf8');
const scripts=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
scripts.forEach(js=>new Function(js)); console.log('syntax ok', f, h.length);}"
