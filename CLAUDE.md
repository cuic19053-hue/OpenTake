# OpenTake — 工作交接 / 状态文档（给压缩上下文后的自己）

> 本文件是 OpenTake 开发的**权威状态 + 操作手册**。每次上下文压缩后先读它。
> 用户用中文沟通,回复用中文。用户要我**全自主**:自己开子 Agent / workflow(agent teams 模式),**绝不让用户去开 agent / 不向用户提问要他操作**(他上下文里看不到我的提问)。

## 0. 项目身份
- OpenTake = [palmier-io/palmier-pro](https://github.com/palmier-io/palmier-pro)(Swift 原生 macOS 视频编辑器,GPL-3.0)的**跨平台社区分支**。忠实 1:1 复刻其编辑逻辑与 UI,做成跨平台 + 内置更强 Agent 能力。
- 栈:**Tauri 2 + Rust workspace + React/TS**;媒体 = **FFmpeg(sidecar 编解码)+ wgpu(合成)+ cpal + whisper-rs + candle/ort**。
- 许可 GPL-3.0,品牌 OpenTake(不用 "Palmier" 商标)。
- GitHub:`appergb/OpenTake`(Public,默认分支 main 受保护)。账号 appergb。

## 1. 目录
- 工作区根:`/Users/lvbaiqing/TRUE 开发/PRIMARY-CN`
- `OpenTake/` = git 仓库根(在这里跑 git/cargo/pnpm)
- `palmier-pro-upstream/` = 上游只读参考(`Sources/PalmierPro/`)——1:1 复刻的唯一权威来源,在 OpenTake 仓库之外
- 设计文档:`OpenTake/docs/`(ARCHITECTURE / ROADMAP / MODULE-PORT-MAP / ADVANCED-FEATURES / AGENT-CONTEXT-SIGNAL / WORKFLOW-PLUGIN-SYSTEM / MOTION-GRAPHICS-PLUGIN / CAPCUT-GAP / specs/*)

## 2. ✅ 已完成(全部合并到 main 且 main CI 全绿)
12 顶层模块:`#3 脚手架 · #4 domain · #5 ops · #6 project · #7 render · #8 media · #9 agent · #10 gen · #11 core · #12 前端 · #13 进阶A · #14 motion`。约 960+ 测试通过。
- Rust workspace 8 crate:opentake-{domain,ops,project,render,media,agent,gen,core} + src-tauri + web。
- **本地可运行**:`OpenTake.app` 已打包(`target/release/bundle/macos/OpenTake.app`,9.6M arm64),`pnpm -C web exec tauri dev` 可起;编译/启动/前端服务/零运行期错误已验证。
- 已建 follow-up issues:#22–25(前端 1:1 深化)、#27–30(进阶 B/C/D/E)、#34(motion dispatch)、#35(bundle id 改名)。

## 3. ⚠️ CI 纪律(踩过坑,务必遵守)
- **合并前必须 `gh run watch <id> --exit-status` 确认 CI 绿**,别用 `--admin` 盲合绕过检查(之前 main 一直红没发现)。
- CI(`.github/workflows/ci.yml`)Rust job 顺序 fmt→clippy→test。**每个写代码的子 Agent 必须跑 `cargo fmt --all`**,否则 CI 第一步就挂。
- CI 已装系统依赖:**ffmpeg**(media 是 ffmpeg sidecar)+ **Tauri/GTK**(libwebkit2gtk-4.1-dev/libgtk-3-dev/libglib2.0-dev/libsoup-3.0-dev 等,因 `--workspace` 编 src-tauri)。
- crates.io 偶发下载抖动(curl failed)→ `gh run rerun <id> --failed` 重跑。
- macOS **没有 `timeout` 命令**(用 `gh run watch`)。
- 合并方式:`gh pr merge <n> --merge --admin --delete-branch`(CI 绿后;--admin 仅绕过"需 1 审批",CI 必须真绿)。

## 4. 工作方法(用户明确要求)
- **agent teams 全自主**:用 `Workflow` 工具开多 Agent 流水线(写→审→修),或 `Agent` 工具开单个子 Agent。审核也自己开子 Agent,**不要让用户开 agent、不要向用户提问**(他看不到)。
- **可复用自审 workflow**:`.claude/workflows/opentake-review.js`,`Workflow({name:"opentake-review", args:{module,repo,targets,upstreamRefs,specRefs,verifyCmds,rounds}})`。
- 每个改动:**新功能分支 → 写/审/修 → 推送 → 盯 CI 绿 → admin 合并 → 关 issue / 建 follow-up**。
- 子 Agent 必须亲自跑 `cargo fmt --all && cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace`(改前端再加 `pnpm -C web build`)。
- 同一工作树不要并行两个会写同一批文件的 workflow(会竞态);跨不同 crate/文件才并行,否则串行。

## 5. 🔄 进行中
- **Workflow `wdg2tl6wn`**(分支 `feat/import-i18n-home-settings`):实现 ①剪映式文件夹导入(import_folder/import_media/get_media + dialog directory:true)②全中文 i18n(默认 zh)③主页 ④设置页 + 路由。**完成后:验证 CI 绿 → 合并 → 关相关项**。
  - 注意:该 workflow 的主页 Agent **没看过上游主页截图**,需后续按截图校准(见 §7 主页)。

## 6. 🟥 剩余工作队列(按优先级;若对应 issue 未建则先建)
1. **[CRITICAL] MCP server 真正实现**:现在 agent crate 只有工具定义,**没有 rmcp server**,src-tauri 不启动它 → 19789 无人监听 → **MCP 连不上**(用户最关心)。要做:opentake-agent 新增 `mcp::server`(rmcp StreamableHttpService 绑 127.0.0.1:19789 + loopback/Origin 校验)→ ToolName→EditCommand 经 opentake-core 派发 + 工具返回附 context_signal;src-tauri 启动时 spawn;应用内 chat 客户端(reqwest→Anthropic/BYOK)。参考 `palmier-pro-upstream/Sources/PalmierPro/Agent/MCP/*`、`Agent/Tools/*`。
2. **后台运行**:关窗不退出(Tauri 默认最后窗口关闭即退;需阻止退出/隐藏窗口 + 托盘/Dock 重开),对齐上游 NSApp .regular。改 src-tauri 窗口事件 + tray。
3. **自动保存**:opentake-core/session 变更防抖自动保存到 `.opentake`(上游 NSDocument autosavesInPlace + project.autosave,AppState.swift:60、VideoProject.swift:29/130);新建未命名工程的落盘策略;src-tauri 定时/变更触发 save_project。
4. **提取音频/音乐保存本地**(用户要的"星标"能力):opentake-media 经 ffmpeg 从视频提取音轨(-vn)保存为本地文件;前端媒体项/clip **右上角星标**按钮 → 选保存位置 → 导出音频(可选加回媒体库)。参考 upstream Transcription `extractAudioTrack`、`EditorViewModel+SaveAsMedia.swift`。
5. **素材管理页面**(独立媒体库页:文件夹树/网格/重命名/删除/移动/搜索/排序),后端 create_folder/move_to_folder/rename/delete 已在 ops/agent,需前端页 + Tauri 命令补齐。
6. **设置多分页 + MCP Instructions 面板**:对齐上游 SettingsView 7 panes(Account/Models/Notifications/Privacy/Shortcuts/Storage/**MCPInstructions**)。MCPInstructions 面板展示 §8 的 MCP 配置 + 一键复制。
7. **主页 1:1 校准**(按用户提供的上游截图):左栏 `Sign in with Google`、`+ New Project`、`Open Project`,底部 `⚙ Settings`;右侧标题 `Welcome to OpenTake` + `Update vX` 徽标;`Sample Project` 区(Sample 卡片);`My Projects` 网格(缩略图 + 名称 + 相对时间"20小时前/1天前" + `File missing` 缺失态)。文件:upstream `Project/HomeView.swift`、`ProjectCard.swift`、`SampleProjectsStrip.swift`、`WelcomeOverlay.swift`。
8. **既有 follow-up**:#22–25(前端 1:1:轨道头 mute/hide/sync 需 ops SetTrackProps、前端 EditRequest 补 4 变体、缩略图/真波形接 media、Inspector 关键帧泳道/Text·AI tab、MediaPanel Captions/Music)、#27–30(进阶 B AI 推理 / C 音频工程 / D 纯逻辑曲线变速·多机位·复合片段·SRT / E AIGC)、#34(motion dispatch + 真实 CDP)、#35(bundle id com.opentake.app→com.opentake.desktop)。

## 7. 上游页面清单(对照"还差哪些页面")
- **Home**(`Project/HomeView.swift` 等)——见 §6.7,在做。
- **Editor**(5 面板)——✅ 已有。
- **Settings**(`Settings/SettingsView.swift`)7 panes:Account / Models / Notifications / Privacy / Shortcuts / Storage / **MCPInstructions** —— 我们仅基础设置,缺多数分页(§6.6)。
- **Help**(`HelpView.swift`)、**Account/登录/积分**(AccountPane/CreditSummary/Identity)、**Feedback**(FeedbackView)、**Changelog/Update**(UpdateBadge/Updater)——均未做(优先级较低)。

## 8. MCP 具体配置(用户要的"写出来";**注意:server 实现前连不上**,见 §6.1)
MCP server 目标:Streamable-HTTP,`http://127.0.0.1:19789/mcp`(沿用上游端口),仅绑 loopback + Origin 校验。客户端配置:
- **Claude Code**:`claude mcp add --transport http opentake http://127.0.0.1:19789/mcp`
- **Codex**:`codex mcp add opentake --url http://127.0.0.1:19789/mcp`
- **Cursor**(`~/.cursor/mcp.json`):`{ "mcpServers": { "opentake": { "type": "http", "url": "http://127.0.0.1:19789/mcp" } } }`
- **Claude Desktop**:打包一个 stdio→HTTP shim(mcpb,`npx mcp-remote http://127.0.0.1:19789/mcp`),Help→MCP Instructions 一键安装。
工具集:31 个上游工具 + 4 个进阶(set_color_grade/chroma_key/set_mask/apply_effect)+ 2 个 motion(add/edit_motion_graphic)= 当前声明 40 个。每次返回附 `context_signal`(video_type/track_roles/stage_guidance)。

## 9. 下一步(压缩后立即执行的顺序)
1. 查 `wdg2tl6wn` 是否完成:`gh run`/工作树状态;完成则 fmt+clippy+test+pnpm build 验证 → 推送 → 盯 CI 绿 → 合并 `feat/import-i18n-home-settings`。
2. 确认 §6 的 issue 都已建(没建就 `gh issue create`,标签 batch-2 + area:*,认领 appergb)。
3. 按 §6 优先级开 workflow 逐项实现:**先 MCP server(§6.1,最关键)**,再后台运行 + 自动保存,再音频提取星标,再素材管理页 + 设置分页,再主页 1:1 校准。每项独立分支 + 写/审/修 + CI 绿 + 合并。
4. 全部落地后重打 `OpenTake.app`,请用户批准一次屏幕授权后做可视 + 交互实测(computer-use 需 app 为已注册 .app;dev 裸二进制识别不到)。
