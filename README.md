# 📊 DSH 的 Codex 用量看板

给 DeepSeek Harness 的设置页装一页「用量」：头像、名字、五个累计数字、一张跨整年的 Token 热力图、常用工具和技能，最后是近 30 天的按模型 / 按会话账本。

数据全部从**本机会话日志**里折叠出来——不联网、不埋点、不上传。🙅

![用量看板](docs/preview.png)

## 🫡 为什么会有这个东西

Codex 用久了，肌肉记忆里就长出了那么一页：打开设置，看见自己一共啃掉多少 token、哪几天在猛干、最爱用的是哪个工具。DSH 该有的都有，唯独没有这一页。

所以干脆自己做了一个——**把 DSH 挤成 Codex 的形状**。

仓库名 `dsh-codex-usage-board` 也是这个意思：它不是给 Codex 用的，是给「用惯了 Codex 的我」用的。装上去之后，DSH 就开始长得有点像原来那个东西了。😌

## 🧩 装一个

**插件页（推荐）**

1. 侧边栏 **插件** → **添加插件**
2. 填：`https://github.com/skystart233-code/dsh-codex-usage-board`
3. 打开 **设置 → 用量**，开始盯数字

**命令行**

```bash
dsh plugin --profile <你的 profile 名> add https://github.com/skystart233-code/dsh-codex-usage-board
```

**插件市场**

在 **插件 → 发现** 的索引源里加这行，然后搜「用量看板」：

```
https://raw.githubusercontent.com/skystart233-code/dsh-codex-usage-board/main/index.json
```

## 🎛 上面都有些什么

```
              [ 头像 / 首字圆标 ]
                    名字
                    @账号
┌──────────┬──────────┬──────────┬──────────┬──────────┐
│ 累计 Token │ 使用峰值  │ 最长任务  │ 最长连续  │ 当前连续  │
└──────────┴──────────┴──────────┴──────────┴──────────┘
Token 活动                                  [每天][每周][累计总量]
  10月  11月  12月  1月  2月 …             ← 53 周日历热力图，5 档强度
常用工具
  [BA] [RE] [ED] …   ← 按调用次数排序的 chip
洞察
  最常用的推理强度        极高 · 41%
  已探索技能数                    35
  使用的技能总数                 276
  工具调用总数                  1,234
近 30 天
  按模型 / 用量最高的会话 两列
```

点格子能看当天（或当周 / 累计到当天）的用量；窗口窄了热力图不缩水，保持格子尺寸横向滚动，并默认停在这一周。

## 🎨 改成你自己的样子

看板不认人。不用翻设置、不用找按钮，直接上手点：

![首次打开的提示](docs/preview-tip.png)

- **头像**：鼠标移上去，右下角浮出相机图标，点它选图（PNG / JPEG / WebP / GIF / SVG，≤ 256 KB）。
- **名字 / 账号**：移上去会浮现一块灰色输入框，光标变成文本编辑竖线；点一下就地改，回车或点别处保存，Esc 反悔。
- **清空**：名字空了显示「我的用量」，头像空了退回首字圆标。
- **存在哪**：`~/.dsh/usage-board/profile.json`（或 `$DSH_HOME/usage-board/profile.json`），删掉就恢复默认。
- **那行提示**：只在第一次打开时弹一次，点「知道了」或 Esc 关掉，之后它就安静了。

## 🧮 每个数字是算出来的

| 展示 | 来源 |
|---|---|
| 累计 Token 数 | 所有 `assistant/message` 的 `usage`，`input + output` |
| Token 使用峰值 | 单日 `input + output` 的最大值 |
| 最长任务用时 | `turn/start` → `turn/end` 的最长墙钟时间 |
| 最长 / 当前连续天数 | 有 usage 的日历日连续段 |
| 推理强度 | `request/header` 的 `config.reasoningEffort` 分布 |
| 技能数 / 技能调用 | `tool/call` 中 `skill` 调用的 `arguments.name` 去重与计数 |
| 工具调用总数 / 常用工具 | 所有 `tool/call` 的 `name` 计数 |
| 按模型 / Top 会话 | 近 30 天窗口内的模型与会话汇总 |

- 日期按**浏览器本地日历日**切，所以「今天」跟你手机上的一致。
- fork / seeded 会话继承的前缀会被跳过，不重复记账。
- 每个会话的汇总按日志 revision 缓存，日志没动就不重读。
- 一次最多扫最新 500 个会话，页面底部会老实交代有没有截断。

## 🔒 隐私这回事

- 只读本机会话日志，只在本机聚合，**没有任何出网请求**。
- 名字、账号、头像只写进 `$DSH_HOME/usage-board/profile.json`，不进会话日志，也不离开这台机器。
- Host 侧只有一条只读工具 `usage_board_report` 和两条资料读写路由，没有别的。

## 🚧 它不做什么

- **不算钱**。单价和缓存折扣一直在变，报 token 比报金额不容易翻车。
- **不排名、不打卡、不劝你早睡**。只是个镜子，照完自己决定。
- **不向你展示别人的用量**。它连你的都不上传，别人的更不可能。
- 只统计写进会话日志的 provider 用量；没有 usage 上报的请求（比如失败的那次）不算 token。
- 热力图固定 53 周；更早的日子不画，但累计数字仍然包含它们。
- 老会话要是没有 `session/title` 事件，标题就退化成第一条用户消息的首行。

## 🧪 想改代码

```bash
node test/fold.test.mjs                        # 聚合逻辑，无依赖
node test/profile.test.mjs                     # 资料校验与落盘，无依赖
node test/routes.test.mjs                      # 两条路由与错误分支，无依赖
npm install --no-save react@18 react-dom@18    # 仅渲染测试需要
node test/render.test.mjs                      # 加载中 / 有数据 / 空数据
```

`index.js` 是 Host 半（`GET /api/codex-usage.dashboard` 出报表、`POST /api/codex-usage.profile` 存资料、一条只读工具），`client.js` 是浏览器半（注册 `settings.section` 的 `codex-usage` 页和同行的刷新按钮，样式只用 `--dsw-alias-*` token）。

README 里那两张图是 `tools/preview.mjs` 拿真实组件 + 样例数据渲染成静态页，再用 headless Chrome 拍的。

## English

A usage board for the DeepSeek Harness Settings page: five lifetime figures, a 53-week token heatmap, top tools, skills and reasoning effort, plus a 30-day per-model / per-session breakdown, all folded from the local session logs.

It exists because Codex had that page and DSH didn't — so this is DSH reshaped into Codex's silhouette. The header is editable in place (hover the portrait, click the name or handle), the values live in `$DSH_HOME/usage-board/profile.json`, and nothing leaves the machine.

Install from the Plugins page with `https://github.com/skystart233-code/dsh-codex-usage-board`, or `dsh plugin --profile <name> add <that URL>`.

## License

MIT
