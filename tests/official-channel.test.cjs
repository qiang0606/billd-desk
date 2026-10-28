const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync('src/utils/network/webRTC.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
for (const official of [true, false]) {
  test(`${official ? 'official' : 'legacy'} data channel handshake`, () => {
    const sent = [];
    const channel = { send: data => sent.push(JSON.parse(data)) };
    const store = { wsMap: new Map([['room', { official: official ? { peers: new Map([['controller', { iceServers: [] }]]) } : undefined }]]), rtcMap: new Map() };
    let channelOptions;
    class Peer {
      addEventListener() {}
      createDataChannel(name, options) { channelOptions = options; return channel; }
    }
    const exports = {};
    vm.runInNewContext(source, { exports, console: { warn() {}, log() {} }, window: { RTCPeerConnection: Peer }, RTCPeerConnection: Peer, crypto: { randomUUID: () => 'test-id' }, require: name => name === '@/store/app' ? { useAppStore: () => ({}) } : name === '@/store/network' ? { useNetworkStore: () => store } : name.includes('localStorage') ? { getCoturnUrl: () => '' } : {} });
    // Avoid DOM media/event setup while exercising the real channel creation and publication.
    const rtc = new exports.WebRTCClass({ roomId: 'room', sender: 'host', receiver: 'controller', isSRS: true, videoEl: {} });
    assert.equal(rtc.cbDataChannel, official ? channel : null);
    assert.equal(store.rtcMap.get('controller').cbDataChannel, official ? channel : null);
    assert.equal(channelOptions.ordered, official);
    channel.onopen();
    assert.equal(sent.length, official ? 1 : 0);
    if (official) assert.equal(sent[0].msgType, 'dataChannelOk');
  });
}
