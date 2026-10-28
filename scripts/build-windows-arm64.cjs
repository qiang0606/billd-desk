// Build on a native Windows ARM64 machine with Visual Studio C++ and CMake.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

function assertArm64(file) {
  const data = fs.readFileSync(file);
  const offset = data.readUInt32LE(0x3c);
  if (data.toString('ascii', 0, 2) !== 'MZ' ||
      data.toString('ascii', offset, offset + 4) !== 'PE\0\0' ||
      data.readUInt16LE(offset + 4) !== 0xaa64) {
    throw new Error(`Not a Windows ARM64 binary: ${file}`);
  }
}

if (process.argv[2] === '--check-pe') {
  assertArm64(process.argv[3]);
  console.log('Verified Windows ARM64:', process.argv[3]);
  process.exit(0);
}
if (process.platform !== 'win32' || process.arch !== 'arm64') {
  throw new Error('Use native ARM64 Node.js on Windows ARM64 to run this build.');
}
const root = path.resolve(__dirname, '..');
process.chdir(root);
function run(command, args, cwd = root) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}
// Resolve the JS entry point instead of spawning a Windows .cmd shim.
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run with: npm run build:win:arm64');
const native = path.join(root, '.arm64-native');
if (fs.existsSync(native)) throw new Error('Remove .arm64-native before rebuilding.');
run('git', ['clone', 'https://github.com/ZachJW34/libnut-core.git', native]);
run('git', ['checkout', '--detach', 'dd54b1b700b5749b03604b6635c0ccd59b215b9d'], native);
run(process.execPath, [npm, 'install', '--ignore-scripts', '--package-lock=false',
  '--registry=https://registry.npmjs.org'], native);
const cmakeFile = path.join(native, 'CMakeLists.txt');
const cmake = fs.readFileSync(cmakeFile, 'utf8');
// Upstream copies bundled x64 CRT DLLs. Use the static ARM64 CRT instead.
const patched = cmake.replace(
  /if \(WIN32\)\s*# Copy runtime distributable[\s\S]*?endif\(\)/,
  '# ARM64 runtime is linked statically; do not copy upstream x64 DLLs.'
);
if (patched === cmake) throw new Error('Upstream CMake layout changed.');
fs.writeFileSync(cmakeFile, patched);
const cmakeHelp = execFileSync('cmake', ['--help'], { encoding: 'utf8' });
const generators = [...cmakeHelp.matchAll(/^\s*\*?\s*(Visual Studio (\d+) \d{4})/gm)]
  .sort((a, b) => Number(b[2]) - Number(a[2]));
if (!generators.length) throw new Error('No Visual Studio CMake generator is installed.');
run(process.execPath, [path.join(native, 'node_modules/cmake-js/bin/cmake-js'),
  'rebuild', '--arch=arm64', '--platform=ARM64', '--generator', generators[0][1],
  '--CDCMAKE_MSVC_RUNTIME_LIBRARY=MultiThreaded'], native);
const binary = path.join(native, 'build/Release/libnut.node');
assertArm64(binary);
const packageRoot = path.dirname(require.resolve('@nut-tree-fork/libnut-win32/package.json'));
const release = path.join(packageRoot, 'build/Release');
fs.rmSync(release, { recursive: true, force: true });
fs.mkdirSync(release, { recursive: true });
fs.copyFileSync(binary, path.join(release, 'libnut.node'));
// A native load test must pass before generating the installer.
require(path.join(release, 'libnut.node'));
run(process.execPath, [path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js'), 'build']);
run(process.execPath, [path.join(path.dirname(require.resolve('electron-builder/package.json')), 'cli.js'),
  '--win', '--arm64', '--config', 'electron-builder.arm64.json5', '--publish', 'never']);
assertArm64(path.join(root, 'electron-release/arm64/win-arm64-unpacked/BilldDesk OpenSource ARM64.exe'));
