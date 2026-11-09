import sys
h=sys.stdin.read()
js=open('/opt/node-tools/node_modules/jszip/dist/jszip.min.js').read()
tag='<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>'
assert tag in h
h=h.replace(tag,'<script>'+js+'</script>')
tag2='<script src="https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js"></script>'
assert tag2 in h
pl=open('/opt/npm-tools/node_modules/pdf-lib/dist/pdf-lib.min.js').read().replace('</script','<\\/script')
sys.stdout.write(h.replace(tag2,'<script>'+pl+'</script>'))
