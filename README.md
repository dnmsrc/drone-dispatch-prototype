# 星穹 SkyShow · 无人机派单系统（原型演示工程）

无人机编队灯光表演预约派单平台**演示工程**：用户扫码经微信打开 H5（uni-app，可编译微信小程序），选参数自动计价、模拟收银台支付；管理后台（若伊风格 Vue3）接单、执行、完成订单；支持阶梯退款与管理员审批。

> 演示版：**除不含真实后端与真实支付外，页面效果与交互流程与最终交付一致。** 两端通过本地 Mock Server 真实联动（H5 下单 → 管理端接单 → H5 状态同步）。
>
> 本仓是**已验收的原型**，冻结为可演示、可重新打包的状态，作为正式版三个端的共同设计基线。本文件所有命令都**在仓库根目录**下执行。

## 项目全貌与仓库分布

整个无人机派单系统在 GitHub 上由 [`dnmsrc`](https://github.com/dnmsrc) 发布为 **4 个互相独立、彼此平级的 Public 仓库**，各自有独立的提交历史、分支与发布节奏，**不是**嵌套的父子目录。本仓是其中的原型仓：

| # | GitHub 仓库（点击直达） | 角色 / 技术栈 |
|---|---|---|
| 1 | **[`dnmsrc/drone-dispatch-prototype`](https://github.com/dnmsrc/drone-dispatch-prototype)（本仓）** | 原型演示工程：管理端 + 用户端 H5 + 零依赖 Mock Server + 自动化测试 + Electron 桌面打包 |
| 2 | [`dnmsrc/drone-dispatch-web`](https://github.com/dnmsrc/drone-dispatch-web) | 正式版 Web 管理后台（Vue3 + TS + Vite + Element Plus + Sass） |
| 3 | [`dnmsrc/drone-dispatch-h5`](https://github.com/dnmsrc/drone-dispatch-h5) | 正式版用户端 H5 / 微信小程序（uni-app Vue3 + Vite） |
| 4 | [`dnmsrc/drone-dispatch-server`](https://github.com/dnmsrc/drone-dispatch-server) | 正式版服务端（Java 21 + Spring Boot + Maven + MySQL 8.4） |

各仓库地址（均为 **Public**，任何人无需登录即可访问、克隆）：

- 原型演示工程（本仓）：`https://github.com/dnmsrc/drone-dispatch-prototype`
- Web 管理后台：`https://github.com/dnmsrc/drone-dispatch-web`
- H5 / 小程序：`https://github.com/dnmsrc/drone-dispatch-h5`
- 服务端：`https://github.com/dnmsrc/drone-dispatch-server`

> **LICENSE 现状**：四个仓暂未附带许可证文件。代码虽公开可看，但默认仍保留全部版权，尚未明确授予他人使用 / 修改 / 再分发的权利。
>
> **各端进度**以各自仓库 README 为准；本原型仓可完整跑通「H5 下单 → 管理端接单执行 → 评价 / 退款 / 拒单」全链路。设计文档、走查 / 验收截图与 AI 协作约定不公开，仅保留在开发者本机，已由 `.gitignore` 忽略。

把四个仓克隆到同一本机工作区即可平级联调（各仓目录名与仓库名一致）：

```bash
mkdir 无人机派单系统 && cd 无人机派单系统
git clone https://github.com/dnmsrc/drone-dispatch-prototype.git
git clone https://github.com/dnmsrc/drone-dispatch-web.git
git clone https://github.com/dnmsrc/drone-dispatch-h5.git
git clone https://github.com/dnmsrc/drone-dispatch-server.git
```

## 目录结构（原型内部）

```
drone-dispatch-prototype/        ← 本仓根目录
├── admin/                       # 管理端（Vue3 + Element Plus，若伊风格）
├── h5/                          # 用户端（uni-app vue3 + vite，H5 可编译微信小程序）
├── mock-server/                 # 零依赖 Node Mock Server（8090 = API+用户端，8080 = API+管理端）
├── tools/e2e/                   # 自动化测试：lib 公共库 + cases 用例 + run-suite.mjs 执行器
├── tools/desktop/               # 桌面打包工程（Electron）：产物进本机 交付/ 目录（不入库）
├── start-all.bat                # 开发时一键启动三端（打开 3 个命令行窗口）
└── README.md                    # 本文件
```

> 说明：设计文档（`docs/`）与走查 / 验收截图（`shots/`、`tools/e2e/shots/`）仅保留在开发者本机，已通过 `.gitignore` 忽略，不随仓库分发；e2e 运行时仍会在本地重新生成 `shots/`。

## 快速开始（开发）

三个终端分别执行（或双击本仓根目录的 `start-all.bat`）：

```bash
# 1. Mock Server（先启动，零依赖；同时托管两端构建产物）
cd mock-server && npm start          # 用户端 http://localhost:8090 ，管理端 http://localhost:8080

# 2. 管理端（改 UI 时才需要 dev server）
cd admin && npm install && npm run dev

# 3. 用户端 H5（改 UI 时才需要 dev server）
cd h5 && npm install && npm run dev:h5
```

免 dev server 模式（推荐给验收/演示）：先 `cd h5 && npm run build:h5`、`cd admin && npm run build`，之后只启动 Mock Server —— 它把 H5 托管在 8090、管理端托管在 8080，同源访问 API 无需代理。

## 打包成验收程序

打包产物输出到**本仓之外**的本机 `交付/drone-dispatch-prototype/` 目录（该目录不入库）。在本仓 `tools/desktop/` 下执行：

```bash
cd tools/desktop
npm install
npm run dist          # 单文件版：electron-builder --win portable → ../../../交付/drone-dispatch-prototype/星穹SkyShow演示.exe
npm run dist:dir      # 免安装版：electron-builder --win dir → ../../../交付/drone-dispatch-prototype/win-unpacked（再打成 zip）
```

产物：

- `../../../交付/drone-dispatch-prototype/星穹SkyShow演示.exe` —— 单文件 portable，约 69MB；内置 Electron 运行时 + Mock Server + 两端构建产物，客户机无需任何环境。
- `../../../交付/drone-dispatch-prototype/星穹SkyShow演示-免安装版.zip` —— 约 104MB，由 `win-unpacked` 直接压缩（`7z a -tzip -mx=5`），解压后双击目录里的 `1-开始演示(双击我).bat`。
- `../../../交付/drone-dispatch-prototype/双击这里启动.bat` —— 单文件版的启动器，见下面「已知问题」。

- 打包前请先确保两端产物是最新的：`h5/dist/build/h5`、`admin/dist`。
- 打包会在 `../../../交付/drone-dispatch-prototype/` 下留中间产物（`win-unpacked/`、`builder-debug.yml`、`.icon-ico/`），发客户前清掉或收进 `_stage/` 打 zip 用。
- 首次打包需联网下载 Electron 与打包工具；国内网络可加镜像：
  `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`、
  `ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`。
- 打包配置里 `signAndEditExecutable: false`：本机没有创建符号链接的权限，下载 winCodeSign 会失败；代价是 exe 用 Electron 默认图标、不带版本签名，不影响运行。
- 自测 exe 时注意：若当前 shell 继承了 `ELECTRON_RUN_AS_NODE=1`（在 Electron 应用里跑命令会继承），启动会变成 node 模式直接退出——用 `env -u ELECTRON_RUN_AS_NODE ./星穹SkyShow演示.exe` 或在 PowerShell 里 `Remove-Item Env:ELECTRON_RUN_AS_NODE` 后再启动。

### 已知问题：在开发机项目目录内双击 exe 会报 “NSIS Error”

- **原因**：受开发机沙箱 ACL 影响，项目目录内的 portable exe 由资源管理器启动时，NSIS 自解压 stub 可能失败并弹 “NSIS Error”；同一份文件复制到工作目录之外则秒开。**与程序本身无关，普通客户机不受此影响。**
- **对策**：本机演示统一把程序复制到工作目录之外（如 `D:\SkyShow演示\`）运行；`交付/` 只作打包产物与发客户用，不要在交付目录里直接双击运行。

### 已知问题：客户机双击 exe 报 “NSIS Error / Error writing temporary file”

- **原因**：portable 版每次启动都要先把自身（约 300MB）解压到系统的 `%TEMP%` 再运行。客户机如果 TEMP 不可写——常见于 TEMP 被优化/清理软件改到不存在的路径、C 盘满、受限账户、安全软件拦截——NSIS 解压阶段就失败，弹出这个框，程序根本还没启动。**Electron 应用本身并不依赖 TEMP**（实测把 TEMP 指向不存在目录，直接运行 win-unpacked 里的 exe 仍能正常启动）。
- **对策 1（推荐）**：发 `星穹SkyShow演示-免安装版.zip`，解压后直接跑，全程不经 TEMP。
- **对策 2**：仍发单文件 exe，但配 `双击这里启动.bat`：它先 `set TEMP/TMP` 到 `%LOCALAPPDATA%\SkyShowDemo\temp`（建不出来就退到程序目录下的 `temp\`）再启动，NSIS 就会把包解到那个可写目录。
- **对策 3**：根治那台机器——检查 `echo %TEMP%` 指向的目录是否存在且可写，磁盘是否还有空间。
- 排障时看 `%APPDATA%\SkyShowDemo\desktop.log`（程序自己的启动日志，不依赖控制台）。

## 自动化测试

```bash
cd tools/e2e
node run-suite.mjs --list          # 列出全部用例（id/覆盖点/标签）
node run-suite.mjs --tag=smoke     # 跑冒烟集（双端核心链路）
node run-suite.mjs                 # 跑全量，产出 reports/junit.xml + report.json + report.md
node run-suite.mjs --impact admin/src/views/schedule/index.vue   # 按改动文件挑相关用例
node run.mjs                       # 原有全流程走查（17 步，逐页截图到本地 shots/，不入库）
```

前置：Mock Server 正在 8090/8080 运行；判据跑的是**构建产物**，改源码后必须重新 build。
测试框架约定（如何新增用例、数据隔离、稳定性技巧）的文档仅留存本机，不在开源仓库内；用例本身见 `tools/e2e/cases`，执行器用法以 `run-suite.mjs --help` 为准。

## 验收（给客户）

本机 `交付/drone-dispatch-prototype/` 里三个文件按机器情况三选一（详细说明见该目录的 `使用说明.txt`）：

1. **正常机器**：双击 `星穹SkyShow演示.exe`（未签名，首次可能弹 SmartScreen「未知发布者」→ 点「更多信息 → 仍要运行」）。
2. **双击 exe 弹 NSIS Error**：把 `双击这里启动.bat` 和 exe 放同一目录，改双击 bat。
3. **最保险**：解压 `星穹SkyShow演示-免安装版.zip`，双击解压目录里的 `1-开始演示(双击我).bat`（全程不经系统临时目录）。

打开后：

1. 顶部切换「用户端 / 管理后台」；两端共用同一份本地数据，下单后管理端立刻能看到。
2. 管理端登录：`admin / admin123`（管理员，验证码 1234）；`operator / operator123`（操作员，无退款审批权限）。
3. 演示数据存在 `%APPDATA%\SkyShowDemo\data\db.json`，删掉即恢复初始种子数据。

## 演示账号与建议演示路径

| 端 | 账号 | 说明 |
|---|---|---|
| 用户 H5 | 微信授权一键登录（模拟） | 无需账号 |
| 管理端 | `admin / admin123` | 管理员（全部权限，验证码 1234） |
| 管理端 | `operator / operator123` | 操作员（接单执行，无退款审批/配置权限） |

1. **完整下单**：H5 首页 → 立即预约 → 授权登录 → 选架次/时长/图案/附加服务 → 选日期时段（满档/休整置灰）→ 选场地 → 确认订单 → 收银台选微信/支付宝 → 模拟支付成功
2. **接单执行**：管理端（operator）→ 看板看到新订单 → 订单管理接单 → 开始执行 → 完成订单（自动生成演示照片）
3. **评价回传**：H5 订单详情 → 查看现场照片 → 评价
4. **退款**：H5 申请退款（阶梯试算）→ 管理端（admin）退款管理审批（可改金额/可拒绝）→ H5 查看结果
5. **拒单**：管理端对待接单订单拒单 → H5 显示已全额退款
6. **档期**：管理端设休整日/配置接单时段（时段制：一段 = 一个名额）→ H5 日历同步置灰
7. **权限**：operator 登录看不到退款审批/配置菜单；admin 全量

## 重置演示数据

管理端「系统配置 → 重置演示数据」，或：

```bash
curl -X POST http://localhost:8090/api/config/reset -H "Authorization: Bearer <admin-token>"
```

桌面验收程序里：直接删除 `%APPDATA%\SkyShowDemo\data\db.json` 后重启程序，即恢复初始种子数据。

## 编译微信小程序（用户端）

```bash
cd h5 && npm run build:mp-weixin
# 产物 dist/build/mp-weixin，用微信开发者工具导入（AppID 需自行配置）
```

## 与正式交付的差异（演示约束）

| 环节 | 演示版（本仓） | 正式版接入点 |
|---|---|---|
| 后端 | 本地零依赖 Mock Server（内存 + JSON 文件） | [`drone-dispatch-server`](https://github.com/dnmsrc/drone-dispatch-server) 真实后端 + MySQL，接口路径已按统一的 `/api` 接口约定对齐 |
| 支付 | 模拟收银台（成功/失败按钮） | 微信支付 JSAPI / 支付宝手机网站支付 + 异步回调 |
| 微信登录 | 模拟授权弹窗 | wx.login code → code2session |
| 地图 | 模拟高德选点与联想 | 高德 JS API（create 页 onMapTap/onSearch 预留接入位） |
| 上传 | 图片仅前端预览，传文件名 | OSS/COS 上传后存 URL |
| 退款 | 审批后直接改状态 | 微信/支付宝退款 API + 退款回调 |
