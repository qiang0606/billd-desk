// Exercise the actual packaged window, with Chromium's sandbox left enabled.
const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, execFileSync } = require('node:child_process');

async function main() {
  if (process.platform !== 'win32') throw new Error('Windows GUI test required');
  const root = path.resolve(__dirname, '..');
  const app = path.join(root, 'electron-release/arm64/win-arm64-unpacked/BilldDesk OpenSource ARM64.exe');
  const output = path.join(root, '.arm64-native/gui-smoke');
  fs.mkdirSync(output, { recursive: true });
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.__COMPAT_LAYER;
  const child = spawn(app, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${path.join(output, 'profile')}`,
    '--enable-logging=file', `--log-file=${path.join(output, 'chromium.log')}`,
  ], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  const log = fs.createWriteStream(path.join(output, 'process.log'));
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  let socket;
  try {
    let target;
    for (let i = 0; i < 80; i++) {
      if (child.exitCode !== null) throw new Error(`Application exited: ${child.exitCode}`);
      try {
        const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = targets.find(item => item.type === 'page' && item.url.startsWith('file:'));
        if (target) break;
      } catch {}
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!target) throw new Error('Packaged application did not create its page');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    let id = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      pending.get(message.id)?.(message);
    });
    async function call(method, params = {}) {
      const requestId = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`CDP timeout: ${method}`)); }, 10000);
        pending.set(requestId, message => {
          clearTimeout(timer);
          pending.delete(requestId);
          if (message.error) reject(new Error(JSON.stringify(message.error)));
          else resolve(message.result);
        });
        socket.send(JSON.stringify({ id: requestId, method, params }));
      });
    }
    let state;
    for (let i = 0; i < 40; i++) {
      const result = await call('Runtime.evaluate', {
        expression: 'JSON.stringify({text:document.body.innerText,preload:!!window.electronAPI?.ipcRenderer,inputs:document.querySelectorAll("input").length})',
        returnByValue: true,
      });
      state = JSON.parse(result.result.value);
      if (state.text.includes('远程控制设备') && state.preload && state.inputs > 0) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const screenshot = await call('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(output, 'window.png'), Buffer.from(screenshot.data, 'base64'));
    fs.writeFileSync(path.join(output, 'state.json'), JSON.stringify(state, null, 2));
    if (!state.text.includes('远程控制设备') || !state.preload || !state.inputs) {
      throw new Error('Packaged window or preload did not initialize');
    }
    console.log('Packaged ARM64 window and preload passed with sandbox enabled.');
  } finally {
    socket?.close();
    if (child.exitCode === null) {
      try { execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' }); } catch {}
    }
    log.end();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
