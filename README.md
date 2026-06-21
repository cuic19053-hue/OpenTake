# OpenTake

**The open, cross-platform video editor built for AI.**

OpenTake 是 [Palmier Pro](https://github.com/palmier-io/palmier-pro) 的跨平台社区分支 —— 在 **Rust 核心(Tauri 2 + React)** 上重建,媒体引擎采用 **FFmpeg(编解码)+ wgpu(合成)**,忠实复刻其编辑逻辑,并内置更强的 Agent 提示词与能力。目标平台:**macOS / Windows / Linux**。

> ⚠️ **状态:早期 / 设计阶段。** 本仓库当前包含从上游逐模块拆解得出的架构、路线图与移植地图;代码即将落地。

## 为什么

Palmier Pro 是一个优秀的 AI 原生视频编辑器,但仅支持 macOS(Apple Silicon)。OpenTake 把它的编辑逻辑搬到跨平台的 Rust 核心上,让 macOS / Windows / Linux 用户都能使用,并在 Agent 能力上做得更强、更精简。

## 架构一览

- **Rust 核心**:领域模型 / 编辑操作 / 工程格式 / 渲染计划 / MCP server(忠实复刻上游纯函数式编辑算法)
- **媒体引擎**:FFmpeg(解码/编码/缩略图)+ wgpu(关键帧合成)+ cpal(音频)
- **前端**:React + TypeScript(Tauri 2 桌面外壳)
- **生成式 AI**:自建 / BYOK(用户自带模型厂商 key,本地直连,零运营成本)

详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)、[docs/ROADMAP.md](docs/ROADMAP.md)、[docs/MODULE-PORT-MAP.md](docs/MODULE-PORT-MAP.md)。

## 与 Palmier Pro 的关系与许可

OpenTake 是**独立的社区分支**,与 Palmier, Inc. 无隶属关系,亦未获其赞助或背书。"Palmier" / "Palmier Pro" 是其各自所有者的名称/商标,此处仅用于说明 OpenTake 的来源(指明性合理使用),并非 OpenTake 自身品牌。

OpenTake 依据 **GPL-3.0** 开源(与上游一致)。见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。上游的生成式 AI 云服务为闭源、不属于本分支,相关能力由 OpenTake 自建。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 目标架构、分层、crate 布局、命令层、渲染管线 |
| [docs/ROADMAP.md](docs/ROADMAP.md) | 9 阶段实施路线图(交付物 + 验证标准 + 风险登记) |
| [docs/MODULE-PORT-MAP.md](docs/MODULE-PORT-MAP.md) | 20 个上游模块逐项移植规格与核心算法 |
| [DECISIONS.md](DECISIONS.md) | 技术栈 / 许可 / 品牌决策记录 |
