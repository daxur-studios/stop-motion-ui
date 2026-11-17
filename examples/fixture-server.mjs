import { createServer } from 'node:http';
const port = Number(process.env.PORT || 4237);
createServer((req, res) => {
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><title>Demo fixture</title><style>
body{font:24px system-ui;margin:48px;background:#f5f6fa;color:#152033}
button{font:inherit;padding:12px 28px;background:#3556d8;color:white;border:0;border-radius:8px}
section{height:700px}
</style><h1>Save a project</h1><button id="save">Save changes</button>
<p id="status" role="status">Unsaved changes</p><section></section><h2>Project details</h2>
<button id="details">Show details</button><p id="result"></p>
<script>save.onclick=()=>{document.querySelector('#status').textContent='Saving…';setTimeout(()=>document.querySelector('#status').textContent='Changes saved',Math.min(30000, Math.max(250, Number(new URLSearchParams(location.search).get('saveDelayMs')) || 250)))};
details.onclick=()=>document.querySelector('#result').textContent='Project ready';</script>`);
}).listen(port, '127.0.0.1', () => console.log(`Fixture ready on http://127.0.0.1:${port}`));
