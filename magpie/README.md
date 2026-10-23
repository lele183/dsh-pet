# Magpie 桌宠直连版

让 dsh-pet 独立运行，通过本机 Magpie 网关聊天、展示网关活动和读取额度。
不需要启动 DeepSeek Harness，也不依赖 Codex。

## 使用

需要 Windows、Git 和 Node.js 22.12.0 或更新版本。先克隆完整仓库并构建一次：

```powershell
git clone https://github.com/lele183/dsh-pet.git
cd dsh-pet
powershell -NoProfile -ExecutionPolicy Bypass -File .\magpie\SETUP-MAGPIE-PET.ps1
```

之后使用 `magpie` 目录里的启动和停止脚本：

1. 保持 Magpie 运行。
2. 双击 `START-MAGPIE-PET.cmd`，宠物出现在主屏幕右下角。
3. 右键宠物：
   - **对话**：直接通过 Magpie 与宠物聊天。
   - **更多 → Magpie → 查看 Magpie 额度**：展示 Magpie 缓存的额度百分比及读取时间。
   - **更多 → Magpie → 查看 Magpie 连接**：展示网关地址和当前聊天模型。
4. 双击 `STOP-MAGPIE-PET.cmd` 停止桌宠及适配器。

首次启动会下载 Electron，之后复用 `data/electron`。
没有设置开机自启。自动碎碎念默认关闭，只有主动聊天或手动点碎碎念才调用模型。

当前默认聊天路由为 `group/cheap-first`。这个分组的成员和费用由 Magpie 决定，
“cheap-first”这个名字不保证免费。

## 结构

```text
桌面宠物 ──聊天──> Magpie /v1/chat/completions ──> 用户已有模型 / 路由分组
    ↑
本地适配器 ──只读──> Magpie /v1/magpie/concurrency
    └────只读──> Magpie /v1/magpie/quotas?kept=1
```

聊天直接沿用 dsh-pet 的独立模式 AI 客户端。适配器每秒读取网关并发情况，
每分钟读取一次已缓存额度；这两个查询不会调用模型。

工作气泡表示 Magpie 当前正在处理的模型请求，包含排队和等待工具结果。
网关空闲后恢复宠物自己的动画。请求结束不代表编程任务完成，
适配器不会据此播放“整个任务成功”的庆祝动画。轮询可能漏掉不足一秒的请求。

显示的额度是 Magpie 上次获取的缓存，而不是每次点击向服务商查询的新额度。
气泡会注明缓存的读取时间；需要更新源数据时，在 Magpie 的用量页刷新。
账号邮箱和真实服务商密钥不会显示在气泡里。

## 配置与文件

- `config.json`：Magpie 地址、首次使用的聊天模型、端口和轮询间隔。
- `data/dsh-pet/main-config.jsonc`：字体、字号、宠物名字、大小、位置和人设。
- `data/dsh-pet/standalone-ai.json`：AI 设置，由 dsh-pet 保存和限制权限。
- `data/dsh-pet/memory.json`：与宠物的对话记忆。
- `logs/`：启动日志、适配器日志和 Electron 日志。
- `../dsh-pet/`：仓库自带的桌宠源码；启动器也兼容旧安装的 `upstream/dsh-pet/` 路径。

默认字体改为微软雅黑（macOS 回退到苹方），字号设为 28，并关闭随宠物尺寸缩放。
上游会把聊天、工作状态和额度提示的正文缩放到基础字号的约 75%，因此实际正文约为
21px；340px 宠物原先约为 12px。悬浮提示约为 16px，对话输入窗沿用上游自己的字号。

需要再次更换字体或字号时，停止桌宠，在 `data/dsh-pet/main-config.jsonc` 顶层调整
以下完整字段，再重新启动：

```json
"font": {
  "family": "yahei",
  "size": 28,
  "followPet": false
}
```

`family` 可选 `yahei`（微软雅黑）、`youyuan`（幼圆）、`kaiti`（楷体）、
`simsun`（宋体）、`candy`（原软糖体）、`comic`、`system`。
`size` 的有效范围为 4–200，`followPet: false` 保持字号不随宠物大小变化。
首次运行写入默认值；后续启动会保留用户已保存的外观设置。
长回复和额度气泡保留换行，并限制在桌宠窗口内；内容较多时把鼠标移到气泡上滚动阅读。

本机已保存的 AI 设置优先保留，重启不会覆盖在 AI 设置页里改过的模型。
需要更换聊天模型时，右键宠物选择 **打开网站**，即可进入本机 AI 设置页，
保留 `http://127.0.0.1:3425/v1`，填写 Magpie 已开放的模型 ID。
也可以停止桌宠，在 `standalone-ai.json` 中只调整 `model` 后重新启动。

本机网关使用公开的调用方标记 `magpie-dsh-pet`，用于让 Magpie 把聊天用量归到桌宠。
这里不复制 Magpie 的服务商凭据。桌宠的 HTTP 写操作使用独立的本机能力令牌，
该令牌只保存在 `data` 的私有运行文件中。

常用命令，在本目录执行：

```powershell
npm run models
npm run status
npm run quota
npm test
```

`npm run quota` 会同时在终端和宠物气泡显示额度。
`npm run status` 不输出能力令牌或密钥。

## 版本和验证

本机联调：2026-10-23（America/New_York）。

- dsh-pet 0.3.8，基于用户 fork 的提交 `242fac13053ca6d7a5d316124df499013c2494a1`。
- Magpie 0.1.1339。
- Node.js 22.19.0。
- 12 项适配器测试通过，包含真实本机 HTTP 测试夹具、断线恢复、
  并发聚合、额度缓存、桌宠锁和菜单事件响应格式。
- 2 项 Chromium 界面回归测试通过，覆盖大字体、多行气泡高度、滚动到底、
  短气泡收缩，以及隐藏后释放输入区域。
- 已通过真实桌宠聊天接口从 `group/cheap-first` 收到非空回复。
- 已在原生 Windows 透明窗口看到宠物、Magpie 工作气泡，
  并实际点击“查看 Magpie 额度”看到缓存额度气泡。
- 已验证停止、重新启动与 AI 设置保留。

上游 `npm run build` 的运行时代码和共享桌面核心构建成功，但最后的
`.d.ts` 生成会因为没有安装 DSH 宿主专用 peer 类型包而报错。
本原型只运行独立模式：`SETUP-MAGPIE-PET.ps1` 明确构建 `bundle` 和
`build:desktop-core`，不宣称完成 DSH 插件发布检查。

## 重新安装运行时

在 `magpie` 目录中执行：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\SETUP-MAGPIE-PET.ps1
```

构建依赖仅安装到仓库的 `dsh-pet/node_modules`（旧安装为 `upstream/dsh-pet/node_modules`）。
适配器自身只使用 Node.js 内置模块。

在仓库的 `dsh-pet` 源码目录中可运行气泡界面测试：

```powershell
npx playwright install chromium
node --test scripts/tests/desktop-bubble.test.mjs
```

`data/`、`logs/`、依赖、构建产物和本机验证截图均不提交到 Git。
运行时能力令牌、AI 设置和聊天记忆只保存在本机。

## 来源

- dsh-pet：<https://github.com/PC2005-cloud/dsh-pet>
- Magpie：<https://github.com/yetone/magpie>
- Magpie 的网关集成、并发状态和缓存额度契约：
  <https://github.com/yetone/magpie/blob/main/docs/integrating.md>、
  <https://github.com/yetone/magpie/blob/main/docs/reference.md>

保留上游源码与仓库根目录的 MIT 许可。Magpie 直连启动器位于本 fork 的 `magpie/`，
尚未发布独立安装包。
