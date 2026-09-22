# 交接文档 · 交给接手的 Agent

> 目标：读完之后**第一时间找到文件、改对地方、把验证跑绿、顺利推上 GitHub**。
> 细节不再堆在这一个文件里 —— 按主题拆到了 `docs/`（见文末索引），这里只留「必须知道的」。

---

## 0. 一句话指令（可直接复制给其他 agent）

```
项目「运筹学计算器」在本机路径：C:\Users\Lenovo\.hermes\workspace\or-solver
（Git Bash / MSYS 写法：/c/Users/Lenovo/.hermes/workspace/or-solver）

目录：index.html 在**仓库根**（GitHub Pages 入口，不能挪，且是构建产物、不要手改）；
     算法层 src/core/（纯 Node，零 DOM）；表现层 src/web/（只碰 DOM）；
     构建 src/build.js；命令行 src/cli.js；库出口 src/index.js；
     开发工具 lib/（无头浏览器 / 安静模式）；验证 test/{unit,algorithm,ui}/；工具 tools/。

先读 HANDOFF.md（本文件）→ 按需读 docs/。分支 main，
远程 https://github.com/XXIN1011/or-simplex.git，线上 https://xxin1011.github.io/or-simplex/

硬性要求：
1) 只改 src/ 下的源文件，改完必须 `npm run build` 重新生成根目录的 index.html。
2) 改完必须跑 `npm run verify`（构建 + 静态检查 + 单元 + 8 套算法回归 + UI 133 条断言）。
   涉及算法层再加跑 scipy 对拍与 deep-snapshot（见 docs/验证手册.md）。
3) 推送前先探代理：`git ls-remote origin main`，不通先试直连重试，再让用户开 Clash。
4) git 身份是「仓库级」的（XiaoXin / 2624962001@qq.com），全局是空的，换机器克隆后要重设。
5) CI（.github/workflows/verify.yml）会在 push/PR 时跑同一套门禁 —— 本地绿了不代表 CI 绿，
   但它能抓住「忘了 npm run build」这类问题。
```

---

## 1. 现状（自动生成，勿手改）

<!-- STATUS:BEGIN（本区块由 node tools/status.js --write 生成，不要手改） -->
| 项 | 值 |
|---|---|
| 分支 / HEAD | `main` · `b61b5b8` （工作区干净） |
| 构建产物 | `index.html` 386.4 KB，已是最新（重建无差异） |
| 算法层 | `src/core/` 10 个模块 / 4251 行 |
| 表现层 | `src/web/` 11 个模块 / 2752 行 |
| 模块（读自模板） | `#/` · `#/simplex` · `#/sens` · `#/ip` · `#/assign` · `#/settings` |
| 单元测试 | 7 个文件 / 76 条，当前 76 通过 |
| 算法回归 | 8 套 + 单元测试，见 `npm test` |
| 静态检查 | 注册一致性 ✓ · 无历史模块残留 ✓ |
<!-- STATUS:END -->

---

## 2. 项目速览

| 项 | 值 |
|---|---|
| 是什么 | 面向**教学**的运筹学求解器：把算法的每一步中间过程完整摊开，而不是只给答案 |
| 仓库 / 线上 | https://github.com/XXIN1011/or-simplex.git · https://xxin1011.github.io/or-simplex/ |
| 形态 | **单文件、零依赖、可离线**的 `index.html`（源码构建时打包进去），同时是标准 Node 工程 |
| 手机端 | 浏览器打开 → 「添加至桌面」当 App 用（用户是华为纯血鸿蒙，**装不了 APK**，只能走网页 / 后续 HAP） |
| 模块 | `#/simplex` 单纯形法（大 M 法逐步迭代 + 对偶解 + 图解）· `#/sens` 灵敏度分析（场景式 + 参数 LP）· `#/ip` 整数规划（四方法）· `#/assign` 指派问题（匈牙利法）· `#/settings` 设置 · `#/` 首页 |

**用户明确要求过、别改回去的东西**：

1. **全玻璃**视觉（含表格），极光底不漂到文字底下；
2. 底部标签栏切换要有**滑动指示器**（不能「旧的消失 + 新的出现」）；
3. 底栏**只留「首页 + 设置」**，四个算法模块从首页卡片进；进模块页时指示器整个隐去（有意为之）；
4. 显示模式**三档**（跟随系统 / 浅色 / 深色），走 `html[data-theme]` 属性驱动；
5. 工具页**空白默认状态**：不预填任何例题，0 变量 / 0 约束也是合法输入。

## 3. 目录地图（哪些能改、哪些别碰）

```
index.html          ← 构建产物，GitHub Pages 入口。**不要手改、不要挪走**
package.json        ← 库入口(main)、CLI(bin)、npm 脚本（含 verify 一条龙）
README.md           面向使用者的说明（功能 / 用法 / 教材对照）
HANDOFF.md          本文件：给 agent 的动手须知
docs/               主题文档（见文末索引）
src/
  index.js cli.js build.js template.html
  core/             ── 领域层：零 DOM、零 IO，Node 里直接可测
    errors.js util.js model.js parse.js simplex.js sensitivity.js
    scenario.js integer.js assignment.js format.js
  web/              ── 表现层：只碰 DOM，算数一律调 core/
    boot.js（唯一入口，按顺序 require 各界面）  router.js（hash 路由，模块清单读自模板）
    dom.js（共用 esc/$/subs）  input-panel.js（输入表 + 外壳生成）  table-render.js
    graph.js（图解法 SVG）  settings-ui.js
    ui.js sens-ui.js ip-ui.js assign-ui.js（四个模块的界面）
lib/                开发工具（不进单文件产物）
  chrome.js         无头 Chrome / CDP 启动器（**所有 UI 脚本共用这一份**）
  quiet.js          --quiet：只打一行结论，明细落 preview/logs/
test/
  run-all.js        一键全量回归汇总（npm test）
  unit/*.test.js    单元测试（node:test）
  lib/rng.js        可复现随机数（固定种子，--seed=N 覆盖）
  algorithm/        算法回归 + scipy 对拍（题库 JSON 是生成物，已 gitignore）
  ui/               无头浏览器回归与无障碍审查
tools/
  status.js         现状卡（--card / --write / --remote）
  check-registry.js 注册一致性静态检查（id / 路由 / 接线）
  check-no-dp.js    历史模块残留核查
  dom-snapshot.js   DOM 结构快照与对比（改界面结构前后用）
  screenshots/ visual/ setup/ + verify-visual.sh
```

**依赖方向单向**：`web → core`；`core` 内部 `simplex/parse/scenario/integer/assignment → format/util/model → errors`，
`model.js` 谁都不依赖。**不允许环，也不允许靠全局变量互相调用**。

## 4. 改完必须跑的验证（定义「做完」）

```bash
npm run verify      # 一条命令：构建 + 静态检查 + 单元 + 8 套算法回归 + UI 回归（约 10 秒）
npm test            # 只跑单元 + 算法回归（末尾给汇总表）
npm run check       # 只跑静态检查（注册一致性 + 残留核查，几十毫秒）
node tools/status.js   # 现状自查：产物是否最新、模块清单、单测条数
```

期望值（详细版与逐套件命令见 `docs/验证手册.md`）：

| 套件 | 期望 |
|---|---|
| 单元测试 | 76/76 通过 |
| 算法回归 | 8 套全 PASS（含 ip-test 约 3 秒） |
| UI 回归 | `合计: 133 通过 / 0 失败` |
| 静态检查 | 注册一致性 ✓ / DP 残留 0 处 |

**按改动范围加跑**：

- 动了 `src/core/` 下的算法逻辑 → 跑 scipy 对拍 + `deep-snapshot.js` 前后 diff（`docs/验证手册.md` 第 2、3 节）；
- 动了颜色 / 透明度 / 背景 → 必跑 `bash tools/verify-visual.sh`（第 4 节）；
- 动了界面结构 → 可用 `tools/dom-snapshot.js` 前后 diff（第 4.1 节）；
- 任何 UI 改动 → 手机视口截图**并用视觉能力真的看一眼**（第 5 节）。

## 5. 推送与上线（要点）

```bash
git ls-remote origin main      # 探针：不通先试纯直连重试，再让用户开 Clash（别硬重试）
npm run verify                 # 推之前必须全绿
git add -A && git commit -m "中文说明：改了什么 + 为什么"
git push origin main
git ls-remote origin main      # 核实远程 SHA == 本地 HEAD，不要只看 push 返回码
sleep 60                       # Pages 有 50~65 秒 CDN 延迟，然后对线上地址再跑一遍 UI 回归
```

细节（代理 / 凭据 / git 身份 / Pages 延迟 / CI 两个 job 的判读）见 `docs/推送与部署.md`。
**不要往 Netlify 推**（已解绑；免费额度会拖垮整个团队的所有站）。

## 6. 硬性约定

1. **`core/` 与 `web/` 统一 ES5**（`var`、不用箭头函数 / `let` / `const` / 模板串）：这些文件原样进单文件页面，ES5 才不怕老 WebView。`test/` `tools/` `lib/` 可以用现代语法。
2. **零依赖**：不引 CDN、不装 npm 包。算法全部自己实现（教学工具的意义，也为将来翻成 ArkTS 留路）。
3. **算法只有一份实现**：迭代内核只有 `core/simplex.js`；加算法先找现成部件，别再造一份枢轴。
4. **分层不许越界**：`core/` 不碰 DOM 与文件；`web/` 不内联算法公式。
5. **模块间只走公开接口**：`require` 导出的函数，不要再挂 `window.xxx`。
6. **界面元素 id 是模板与 JS 的契约**：改完跑 `node tools/check-registry.js`；输入区外壳由 `input-panel.js` 的 `buildChrome()` 生成，模板里只留挂载点。
7. **中文注释，解释「为什么」**；提交信息中文，写清「改了什么 + 为什么」，修缺陷写根因。
8. **手机优先**：触摸目标 ≥ 44×44、正文对比度 ≥ 4.5:1、宽表格要有左右滑动提示。
9. **不要把「没跑完」说成「最优」**：分枝定界有结点上限、隐枚举有规模上限，触顶必须写明「目前最好，不保证全局最优」。这是本项目的底线。
10. **不要为了「让验证通过」而放宽验证标准**：验证脚本是质量的唯一保障，历史上的真缺陷全是它抓出来的。失败时先怀疑代码、再怀疑测试；确认测试写错才改测试，并在注释里写原因。

## 7. 绝对不要做的事

1. 🚫 手改 `index.html`（构建产物），或把它挪出仓库根。
2. 🚫 把 `token.txt` / `device.json` / 任何 token 提交进仓库（都在 `.gitignore` 里）。
3. 🚫 往 Netlify 推（已解绑删除）。
4. 🚫 引入任何外部依赖（CDN、npm 包、字体文件）——项目要能离线单文件运行。
5. 🚫 把显示模式写回 `@media (prefers-color-scheme: dark)`（三档设置表达不了，且深色配色会被迫写两份）。
6. 🚫 给 `body` 加实色背景（极光伪元素在 `body` 背景**之下**，一加实色就被整块盖住）。
7. 🚫 让文字直接压在极光上（极光是漂移动画，承载面厚度要按最坏情况留余量）。
8. 🚫 在 `core/` 里碰 DOM，或在 `web/` 里写算法。
9. 🚫 声称「已完成 / 已推送 / 已生效」而不核实（推送用 `git ls-remote` 对 SHA，线上效果用 HTTP 或截图核实）。
10. 🚫 重新引入历史上按用户要求清零的模块（`tools/check-no-dp.js` 就是守护这件事的）。

## 8. 已知待办 / 可做的方向

1. 整数规划：用户可能反馈某道真题的输出形式与教材不一致（分枝定界的树画法、割平面的表格排法），按反馈调整。
2. 可选算法扩展：对偶单纯形独立入口、两阶段法（内核的 4 个扩展点已经为它们准备好）。
3. 长期：打包成鸿蒙 HAP 上架华为应用市场（需软著 + 审查 + APP 备案，用户已决定暂缓）。
4. `core/scenario.js` 里那份「对偶单纯形一步 + 读解」是唯一一处未与内核合并的重复实现，
   将来若要动场景分析，可以先把 `sensTableau / sensReadOut` 往 `core/simplex.js` 下沉
   （目前由 `scenario-test` 的建表一致性自检兜底，deep-snapshot 覆盖不到它）。

---

## 9. 文档索引

| 想知道什么 | 看哪 |
|---|---|
| 结构、分层、构建机制、加模块/加算法要动几处、代码约定、视觉主题注意 | `docs/架构与约定.md` |
| 完整验证清单、逐套件命令与期望值、scipy 对拍、deep-snapshot、偶发失败怎么查 | `docs/验证手册.md` |
| 环境表、已知坑（按频率排序）、调试通用姿势 | `docs/踩坑与排错.md` |
| 推送流程、代理、凭据、Pages 延迟、CI 两个 job 怎么判读 | `docs/推送与部署.md` |
| 产品功能、用法、与教材的对照表 | `README.md` |
