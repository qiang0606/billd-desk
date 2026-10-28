const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const ts = require('typescript');
const mod = new Module(__filename + '.compiled');
mod._compile(ts.transpileModule(fs.readFileSync('electron-main/official-input.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, __filename + '.compiled');
const { officialInput } = mod.exports;
const calls = [];
const record = name => async (...args) => calls.push([name, ...args]);
const nut = { Key: { A: 1, LeftControl: 2 }, Button: { LEFT: 0, RIGHT: 1, MIDDLE: 2 }, keyboard: { pressKey: record('press'), releaseKey: record('release') }, mouse: { setPosition: record('move'), getPosition: async () => ({ x: 90, y: 20 }), pressButton: record('buttonDown'), releaseButton: record('buttonUp'), scrollDown: record('scrollDown'), scrollUp: record('scrollUp'), scrollLeft: record('scrollLeft'), scrollRight: record('scrollRight') } };
const size = { width: 100, height: 50 };
test('normalized pointer coordinates and relative moves stay on the display', async () => {
  calls.length = 0;
  await officialInput(nut, { type: 'mouseMove', x: 1, y: 0.5 }, size);
  await officialInput(nut, { type: 'mouseMoveRel', dx: 100, dy: -100 }, size);
  assert.deepEqual(calls, [['move', { x: 99, y: 25 }], ['move', { x: 99, y: 0 }]]);
});
test('disconnect releases held keys and mouse buttons', async () => {
  calls.length = 0;
  await officialInput(nut, { type: 'keyboardPressKey', key: [1, 2] }, size);
  await officialInput(nut, { type: 'mouseRightButtonPress' }, size);
  await officialInput(nut, { type: 'releaseAll' }, size);
  assert.deepEqual(calls, [['press', 1, 2], ['buttonDown', 1], ['release', 1, 2], ['buttonUp', 1]]);
});
test('reject malformed coordinates, unknown keys and non-input operations', async () => {
  calls.length = 0;
  for (const input of [{ type: 'mouseMove', x: NaN, y: 0 }, { type: 'mouseMove', x: 2, y: 0 }, { type: 'keyboardPressKey', key: [999999] }, { type: 'keyboardPressKey', key: 'A' }, { type: 'runCommand', command: 'arbitrary' }]) {
    await assert.rejects(() => officialInput(nut, input, size));
  }
  assert.equal(calls.length, 0);
});
