# BilldDesk 开源版 Windows ARM64 实验构建

基于 galaxy-s10/billd-desk 的 61be620eb35b0004dc66c296f0fdd8c62700b1b9。
这是开源版的移植准备，不是 BilldDesk Pro v0.621.0。

当前状态：已创建独立 fork 并开始 Windows ARM64 云端构建。
构建记录：https://github.com/qiang0606/billd-desk/actions
目标 Win10 ARM64 机器的被控功能尚未验证。

构建入口：GitHub Actions 的 Build open source Windows ARM64，手动运行。
工作流使用 windows-11-arm，依次安装 JS 依赖、从固定提交编译 libnut、
验证 ARM64 原生模块可以加载、打包 ARM64 Electron NSIS 安装器。
安装器放在 Actions 的 BilldDesk-OpenSource-Windows-ARM64-experimental 附件中。

本地也可在安装了 ARM64 Node.js 22、Git、CMake、Visual Studio C++ ARM64
工具链的 Windows ARM64 机器中执行：

    pnpm install --frozen-lockfile --ignore-scripts --registry=https://registry.npmjs.org
    npm run build:win:arm64

移植使用 libnut-core 提交 dd54b1b700b5749b03604b6635c0ccd59b215b9d。
它的版本是 2.7.5，替代项目依赖包中 2.7.3 的 x64 二进制，API 兼容性仍需验证。
构建移除上游捆绑 x64 CRT DLL 的复制步骤，改用静态 ARM64 CRT。
独立 appId 和产品名用于区分现有 Pro 安装。

即使云端编译成功，也不表示 Win10 ARM 被控功能已验证。必须在目标机检查：
启动、连接鉴权、屏幕采集、键盘鼠标、文件传输、多屏，以及管理员窗口和锁屏行为。
开源版与当前 Pro 服务端是否兼容也需要测试，不能承诺沿用 Pro 的所有功能。

独立 fork：https://github.com/qiang0606/billd-desk
构建需要 pnpm 9；重复构建前删除 .arm64-native 目录。

保留原仓库 LICENSE.txt；libnut-core 按 Apache-2.0 许可使用。
