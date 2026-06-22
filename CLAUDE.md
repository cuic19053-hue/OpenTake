# OpenTake — 工作交接 / 状态文档（给压缩上下文后的自己）

> 本文件是 OpenTake 开发的**权威状态 + 操作手册**。每次上下文压缩后先读它,再读 `docs/PORT-1TO1-GAP.md`(1:1 差距与实现计划,批次蓝图)。
> 用户用中文沟通,回复用中文。用户要我**全自主**:自己开子 Agent / workflow,**绝不让用户开 agent / 不向用户提问要他操作**;**自己用真机 computer-use 测试**,做到能用再回报。

## 0. 项目身份
- OpenTake = [palmier-io/palmier-pro](https://github.com/palmier-io/palmier-pro)(Swift 原生 macOS 视频编辑器,GPL-3.0)的**跨平台社区分支**。**忠实 1:1 复刻其编辑逻辑与 UI**(用户反复强调:别自己发明,照上游源码复刻;除登录/账号外都对齐),再加更强 Agent 能力。
- 栈:Tauri 2 + Rust workspace + React/TS;媒体 = FFmpeg(sidecar)+ wgpu(合成)+ cpal + whisper-rs + candle/ort。
- GitHub `appergb/OpenTake`(Public,main 受保护)。许可 GPL-3.0。

## 1. 目录
- 仓库根 `OpenTake/`(在此跑 git/cargo/pnpm)。上游只读参考:`../palmier-pro-upstream/Sources/PalmierPro/`(**1:1 复刻唯一权威来源**)。
- 计划/设计:`docs/PORT-1TO1-GAP.md`(必读)、`docs/`(ARCHITECTURE/ROADMAP/specs/*)。

## 2. ✅ 已完成并入 main(CI 全绿)——MVP 编辑闭环已能用
- 14 模块(domain/ops/project/render/media/agent/gen/core/前端#12/进阶A#13/motion#14)+ PR #41–#46。
- **真机实测通过**:启动**无黑边**(透明统一标题栏)→ 新建项目**弹保存对话框选位置落盘**(`~/Documents/OpenTake`)→ **导入素材(20+)有真实缩略图** → **点素材右侧预览(视频/图/音,App 控制条驱动)** → **双击/拖拽加入时间线生成片段**(已见 id-10 片段)。**关窗不退后台常驻 + Dock 重开**。多语言(语言包,中/英,自绘下拉)。BYOK 密钥存系统钥匙串(#43)。应用图标已换成用户提供的。
- 关键实现:预览/缩略图走 **Tauri asset 协议 + `convertFileSrc`** 让 WebView 解码本地原文件(`web/src/lib/asset.ts`);拖到空时间线**按需建轨**(`EditCommand::InsertTrack`);窗口 `titleBarStyle:Overlay`+`dragDropEnabled:false`。

## 3. ⚠️ 工程纪律(踩过坑,务必遵守)
- **合并前 `gh run watch <id> --exit-status` 确认两作业(Rust+Web)都绿**;`gh pr merge <n> --merge --admin --delete-branch`。
- 写代码必跑 `cargo fmt --all`(CI 第一步 fmt --check);CI 已装 ffmpeg+GTK。macOS 无 `timeout`。
- **`RunEvent::Reopen` 仅 macOS**(已 `#[cfg(target_os="macos")]` 门控);本地 macOS clippy 过不代表 Linux 过,平台相关代码要 cfg。
- **真机测试循环**:`./web/node_modules/.bin/tauri build` → `cp -R target/release/bundle/macos/OpenTake.app /Applications/` → `open -a OpenTake` → computer-use(已授权 `com.opentake.app`,tier full)。dev 裸二进制识别不到,必须装到 /Applications。
- 同一工作树勿并行两个写同批文件的 workflow;workflow 可能撞 Cloudflare 522 让"写/审"步骤失败、审核被跳过 → 本人接手验证+自审+盯 CI。

## 4. 🟥 下一步(我认领的"第一个大开发":时间线)
**先做 #47 + #48(时间线合成预览/播放 + 片段编辑收尾)——这是用户点名的"时间线的工作还没做"。**
- **#47 时间线合成预览 + 播放**:src-tauri 新增 `composite_frame(frame)->RGBA/PNG`(RenderPlan.frame + opentake-media 实现 FrameProvider + 已就绪的 Compositor.render_to_rgba)→ 前端 Preview 在 Timeline 标签暂停/seek 时贴 `<canvas>`(替换 1920×1080 占位,现在时间线预览是黑的不播放);再做播放引擎(连续解码+cpal 音频+A/V 同步)。
- **#48 片段编辑收尾**:验证/修原生里时间线**片段点击选中**(`TimelineContainer` onPointerDown→hitTestClip→selectClips 已接,但实测 Delete 无效,疑选中没生效)→ Delete 删除、Cmd+K/剃刀分割可用;**片段右键菜单**(Copy/Swap Media/Save as Media/AI Edit);Inspector 三段式;Toolbar `[`/`]`/`T` 接线。
- **#38 自动保存**(背景已完成,剩防抖 save_project(None) + 退出前 flush)。

## 5. 🟦 可认领/未完成(供同事,注意文件区避免冲突)
- **#36 [CRITICAL] MCP server 真正落地**(rmcp StreamableHttp 127.0.0.1:19789 + 工具派发 + context_signal + src-tauri spawn + 应用内 chat)。参考 `palmier-pro-upstream/.../Agent/MCP/*`。**仍连不上**。
- **#49 项目内文件夹导入 + 嵌套文件夹浏览(剪映式)**:文件夹图标/双击进入/面包屑/拖出;DTO 加 folderId+folders;import_folder 镜像目录树。用户很想要。
- **#37 全局可复用素材库 + 收藏**(跨项目/分类/音效库/全库可见)。
- **#39 提取音频星标 · #40 设置多分页+主页 1:1 · #34 motion dispatch · #27–30 进阶 B/C/D/E · #22–25 #12 follow-up · #35 bundle id 改名**。
- 冲突注意:我(#47/#48)动 opentake-render/opentake-media(decode/FrameProvider)/src-tauri(composite_frame、autosave)/web Preview+timeline;#36 动 agent+src-tauri(server 段);#37/#49 动 opentake-media(library/folders)+web media。**src-tauri/lib.rs、opentake-media 是多方交汇点,合并按 issue 顺序、各自小段、勤 rebase。**

## 6. MCP 配置(#36 落地后)
Streamable-HTTP `http://127.0.0.1:19789/mcp`(loopback+Origin 校验)。`claude mcp add --transport http opentake http://127.0.0.1:19789/mcp`;Cursor/Codex/Claude Desktop 同址。40 工具,返回附 context_signal。

## 7. 压缩后立即执行
1. 读本文件 + `docs/PORT-1TO1-GAP.md`。2. `git -C OpenTake pull`(main)。3. 开 **#47** 分支开始时间线合成预览(composite_frame)→ 写/自审/真机测/CI 绿/合并 → 再 #48 → #38。4. 全程真机 computer-use 自测,做到能编辑再回报。
