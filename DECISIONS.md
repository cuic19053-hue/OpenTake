# OpenTake — 技术决策记录 (ADR)

> OpenTake 是 [palmier-io/palmier-pro](https://github.com/palmier-io/palmier-pro) 的跨平台社区分支。
> 上游是 Swift 原生 macOS 视频编辑器(GPL-3.0)。目标:在保留并复刻其编辑逻辑的前提下,
> 做成跨平台、开源、内置更强提示词与能力的版本,并让 macOS 用户也能继续使用。

## 目录布局
```
PRIMARY-CN/
├── palmier-pro-upstream/   # 原始克隆,只读参考(复刻逻辑的来源)
└── OpenTake/               # 新项目
```

## 许可与品牌
- 许可证:**GPL-3.0**(沿用上游;衍生作品整体继续 GPL-3.0 开源)。
- 品牌:**OpenTake**,自有 logo,不使用 "Palmier" 名称/商标;README 以
  "基于 Palmier Pro 的 GPL-3.0 社区分支" 方式指明来源(nominative fair use)。
- 不上 iOS / Mac App Store(GPL-3.0 与 App Store 条款冲突);桌面走直接下载分发。

## 技术栈(已确认)
| 维度 | 选型 | 理由 |
|---|---|---|
| 整体架构 | **Tauri 2**(Rust core + Web 前端) | 与 Rust 核心天然契合;二进制小;一套代码覆盖三桌面平台 |
| 核心语言 | **Rust** | 领域模型 / 编辑操作 / 工程格式 / 媒体管线 / MCP server |
| 前端 | **React + TypeScript** | 生态最全,AI/人协作最顺,契合既有 web 规则 |
| 媒体引擎 | **FFmpeg 绑定**(`ffmpeg-next` 等) | 替代 AVFoundation:解码/合成/导出/缩略图/波形;LGPL/GPL 与本项目 GPL-3.0 兼容 |
| 目标平台 | **桌面优先**:macOS / Windows / Linux | 先把跨平台桌面做扎实(已实现"让 mac 用户也能用 + 扩到 Win/Linux") |
| 生成式 AI | **自建后端 / BYOK** | 上游 genAI 闭源(Convex+Clerk),代码不在仓库,必须新建:轻量代理对接 fal.ai/Replicate/各厂商 API |

## 待定(分析完成后定)
- 预览/时间线画布渲染层:wgpu(Rust)还是 Web Canvas/WebGPU(前端侧)。
- Rust ↔ 前端 的状态同步与命令边界(Tauri command / event / IPC 形态)。
- Rust MCP 实现:官方 Rust SDK / rmcp。

## 工作方式
- 上游每个模块由独立子 Agent 拆解,产出结构化规格 + 核心算法逻辑,供 Rust 侧忠实复刻。
- 全部子 Agent 以最高思考(max effort)运行。

## bundle identifier 改名(com.opentake.app → com.opentake.desktop)

- **背景**:`tauri build` 警告 `com.opentake.app` 以 `.app` 结尾,与 macOS 应用包扩展名冲突(issue #35)。
- **决策**:bundle identifier 改为 `com.opentake.desktop`。候选 `io.opentake.app` 被否决,因仍以 `.app` 结尾无法消除警告,且与 `opentake-gen` 钥匙串 SERVICE(`io.opentake.app`)重名会混淆独立概念。
- **钥匙串 SERVICE 不动**:`crates/opentake-gen/src/keys.rs` 的 `SERVICE = "io.opentake.app"` 是独立于 bundle id 的概念,保持不变以避免已存 API Key 丢失。
- **破坏性影响(macOS)**:bundle id 是 App 身份唯一标识,改后 macOS 视为全新应用:
  - 已授予的 computer-use / 辅助功能权限需重新授予。
  - 旧偏好(`~/Library/Preferences/com.opentake.app.plist`)不自动迁移。
  - 钥匙串 API Key 不受影响(SERVICE 未变)。
- **非阻塞**:issue 本身标注 non-blocking,bundle 一直能成功生成;本次仅消除警告并固化身份。
