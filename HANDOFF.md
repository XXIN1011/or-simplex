# 交接文档 · 交给其他 Agent

> 这份文件是给**接手本项目的 AI agent** 看的。目标是：读完之后**第一时间找到文件、改对地方、把验证跑绿、顺利推上 GitHub**。
> 项目背景与算法说明在 `README.md`，本文件只讲**怎么动手**。

---

## 0. 一句话指令（可直接复制给其他 agent）

```
项目「运筹学计算器」在本机路径：C:\Users\Lenovo\.hermes\workspace\or-solver
（Git Bash / MSYS 写法：/c/Users/Lenovo/.hermes/workspace/or-solver）

目录：index.html 在**仓库根**（GitHub Pages 入口，不能挪）；
     算法层 src/core/（纯 Node，可 require）；表现层 src/web/（只碰 DOM）；
     构建 src/build.js；命令行 src/cli.js；库出口 src/index.js；
     验证 test/{unit,algorithm,ui}/；工具 tools/。

请先完整读 HANDOFF.md 与 README.md，再动手改。
分支 main，远程 https://github.com/XXIN1011/or-simplex.git
线上 https://xxin1011.github.io/or-simplex/

硬性要求：
1) 只改 src/ 下的源文件，改完必须 `npm run build`（= node src/build.js）重新生成根目录的
   index.html —— 它是构建产物，不要手改。
2) 改完必须跑验证（见第 6 节），全绿才算做完。
3) 推送前先探代理：`git ls-remote origin main`，不通就是 Clash 没开，叫用户开一下。
4) git 身份是「仓库级」的（XiaoXin / 2624962001@qq.com），全局是空的，换机器克隆后要重设。
```

---

## 1. 项目速览

| 项 | 值 |
|---|---|
| 是什么 | 面向**教学**的运筹学求解器：把算法的每一步中间过程完整摊开，而不是只给答案 |
| 本地路径（Windows） | `C:\Users\Lenovo\.hermes\workspace\or-solver` |
| 本地路径（Git Bash） | `/c/Users/Lenovo/.hermes/workspace/or-solver` |
| 仓库 | https://github.com/XXIN1011/or-simplex.git |
| 分支 | `main` |
| 线上地址 | **https://xxin1011.github.io/or-simplex/**（GitHub Pages，push 即自动部署，免费无额度限制） |
| 形态 | **单文件、零依赖、可离线**的 `index.html`（源码构建时打包进去），同时是标准 Node 工程 |
| 手机端 | 浏览器打开 → 「添加至桌面」当 App 用（用户是华为纯血鸿蒙，**装不了 APK**，只能走网页 / 后续做 HAP） |

### 四个模块（hash 路由）+ 设置页

| 路由 | 模块 |
|---|---|
| `#/assign` | 指派问题（匈牙利法：行/列归约 → 试指派 → 覆盖线 → 矩阵调整，含最大化 / 虚拟行列 / 禁止指派） |
| `#/simplex` | 单纯形法（大 M 法逐步迭代 + 对偶解 + 图解） |
| `#/sens` | 灵敏度分析（场景式 + 参数线性规划） |
| `#/ip` | 整数规划（四个方法的适用性与过程） |
| `#/settings` | 设置（目前只有一项：显示模式 三档） |

`#/` 是首页。**底部标签栏只放「首页」和「设置」两个入口**，四个算法模块从首页的
模块卡进、模块页顶部有「← 返回首页」；进到算法模块时底栏没有任何标签是当前项，
滑动指示器整个隐去（`movePill()` 找不到 `a.on` 就摘掉 `.on`），这是有意为之。

算法模块一共四个：单纯形法 / 灵敏度分析 / 整数规划 / 指派问题。
历史上曾有过一个独立模块，已按用户要求**整体清零**，
`tools/check-no-dp.js` 就是守护这件事的（见 6.3），不要往仓库里重新引入。

---

## 2. 目录结构与文件地图（哪些能改、哪些别碰）

```
index.html          ← 构建产物，GitHub Pages 入口。**不要手改、不要挪走**
package.json        ← 库入口(main=src/index.js)、CLI(bin)、npm 脚本
README.md HANDOFF.md
src/
  index.js          库出口：require('or-simplex') 拿到 solve / format / 各层
  cli.js            命令行：node src/cli.js '<题目JSON>' [--json|--no-tables|--integer]
  build.js          构建：迷你 CommonJS 打包器 → ../index.html
  template.html     HTML 骨架 + CSS（视觉主题在这里，改颜色前先读它的注释）
  core/             ── 领域层：**零 DOM、零 IO**，Node 里直接可测
    errors.js         异常：结局码 + 中文文案（E_INVALID_INPUT / E_INFEASIBLE / E_UNBOUNDED …）
    util.js           EPS、pair(a+bM) 运算、matInverse/matVec、nearZero/clampSign
    model.js          数据结构工厂：LPProblem / StandardForm / StepSnapshot / SolveResult
    parse.js          校验 → 规范化 → 标准型（变量表 + 初始表 + σ 行）
    simplex.js        迭代内核（选入基/比值检验/枢轴/终止）+ 扩展点
    sensitivity.js    c 与 b 的允许变化区间
    scenario.js       场景分析（改 c/a/b、加约束、加变量）+ 参数线性规划
    integer.js        分枝定界 / 割平面 / 隐枚举 / 图解 + 适用性判定
    assignment.js     指派问题（匈牙利法）：最大化 / 虚拟行列 / 禁止指派 + 逐步迭代快照
    format.js         数字/分数/带 M 项/区间 → 文本；`report()` 是纯文本完整报告
  web/              ── 表现层：**只碰 DOM**，算法一律 require 自 core/
    boot.js           启动入口（按顺序 require 界面模块，最后交给 router）
    ui.js sens-ui.js ip-ui.js       三个模块的界面
    assign-ui.js      指派问题界面（系数矩阵输入 + 每一步的矩阵渲染）
    settings-ui.js    设置页 + 显示模式：解析系统偏好 → 写 <html data-theme>，选择记本机
    input-panel.js    共用：线性规划输入表（两个模块各挂一份实例）
    table-render.js   共用：迭代表 + 逐步讲解的 HTML 渲染
    graph.js          图解法 SVG
    router.js         hash 路由 + 底部导航滑动指示器
test/
  run-all.js        一键全量回归汇总（npm test）
  unit/*.test.js    单元测试（node:test）
  algorithm/        算法回归 + scipy 对拍（题库 JSON 是生成物，已 gitignore）
  ui/               无头浏览器回归与无障碍审查
tools/
  check-no-dp.js    残留核查脚本（见 6.3）
  screenshots/ visual/ setup/ + verify-visual.sh
```

**依赖方向是单向的**：`web → core`；`core` 内部 `simplex/parse/scenario/integer → format/util/model → errors`，
`model.js` 谁都不依赖。**不允许**出现环，也**不允许**再回到「靠全局变量互相调用」的老写法
（那个写法正是这次重构要消掉的东西）。

---

## 3. 构建机制（单文件产物是怎么来的）

`src/build.js` 是一个**约 100 行的迷你 CommonJS 打包器**（零依赖）：

1. 读 `src/template.html`，里面有**一个**占位符 `/*__BUNDLE__*/`；
2. 把 `src/core/*.js` 与 `src/web/*.js` 逐个包成
   `__define__('<路径>', function (module, exports, require) { …源码… });`
3. 拼上一个约 30 行的 `__require__` 注册表（支持 `./x.js`、`../y.js` 相对解析）；
4. 末尾 `__require__('web/boot.js')` 启动；
5. 写入**仓库根的** `../index.html`。

所以浏览器里跑的仍然是一份普通 `<script>`，**离线、file:// 直接打开都能用**；
不要改成 ES module（`import` 无法在单文件里 shim，会破坏离线与 `file://`）。

验证构建没坏的办法：`npm run build` 后 `node test/ui/verify-ui.js` 跑绿 + 截图目视。
**注意**：产物哈希变化**不代表**构建坏了（源码改了哈希当然会变），它只在「同一份源码构建两次」时用来验证可复现性。

### 新增一个模块要动四处（想上底栏再加一处）

1. `src/web/`：加界面模块（CommonJS，`module.exports` 导出公开函数/组件）
2. `src/web/boot.js`：按顺序 `require` 它
3. `src/web/router.js`：把 `'xxx'` 加进 `MODULES`
4. `src/template.html`：加 `<div class="mod" id="mod-xxx">` 容器 + 首页加一张
   `<a class="modcard" href="#/xxx">` 卡片
5. 只有想让入口常驻底栏时，才再往 `<nav class="tabbar">` 里加一条
   `<a href="#/xxx" data-m="xxx">`（现在的底栏只有首页 + 设置，算法模块都不在上面；
   加了以后记住 `verify-ui.js` 里那条「底栏只剩首页/设置」的断言要同步改）

（`src/build.js` 会自动扫描 `src/core/` 与 `src/web/` 下的所有 `.js`，所以**不用手工登记**；
但 `src/web/boot.js` 里要按正确顺序 `require` 它，漏了就会出现「模块没加载、页面无反应」。）

---

## 4. 加新算法（对偶单纯形 / 两阶段法）怎么做

`core/simplex.js` 已经把迭代内核拆成 4 个可替换的部件，**加算法不需要改它一行数值代码**：

```js
const { solveStandardForm, selectEnteringDantzig, ratioTest, pivot, readOut } = require('./core/simplex.js');
const { parseProblem } = require('./core/parse.js');

// 两阶段法 / 对偶单纯形：自己写「入基规则」和「主循环」，
// 枢轴与读解直接复用内核，保证数学实现只有一份。
const form = parseProblem(problem).form;
const res  = solveStandardForm(form, { selectEntering: myRule, maxIter: 500 });
```

可复用的部件（都在 `core/simplex.js`）：

| 函数 | 作用 |
|---|---|
| `selectEnteringDantzig(form)` | 默认入基规则：最大正检验数（并列取最小下标） |
| `ratioTest(form, e)` | 最小比值规则，返回 `{ratios, r, minRatio}`（`r = -1` 表示该列无正系数） |
| `pivot(form, r, e)` | 枢轴变换（就地改 `form.rows/obj/basis`），返回枢轴元素原值 |
| `readOut(form, steps, status)` | 从终止基读出解 / 结论 / 对偶解 / 灵敏度区间 |
| `solveStandardForm(form, opts)` | 主循环，支持 `opts.selectEntering` 与 `opts.maxIter` |

`core/scenario.js`（对偶单纯形 + 参数行走）与 `core/integer.js`（割平面要加割后调回可行）
就是这么复用内核的 —— 改算法时**先看看是不是已经有现成部件**，别再造第二份枢轴。

---

## 5. 推送流程（**这里有一个必踩的坑**）

### 5.1 先看代理 —— 这是最容易失败的地方

用户机器上跑着 **Clash**（有时开、有时关），git 的**全局代理**固定指向它：

```bash
git config --global --get http.proxy     # 期望：http://127.0.0.1:7897
```

- **Clash 开着** → `git push` 一次成功
- **Clash 关着** → 推送报 `Failed to connect to github.com:443 over proxy 127.0.0.1`
  （而**取消代理走直连同样不行**：`Connection was reset`，GitHub 被墙）

**判据：推送前先探一下**

```bash
git ls-remote origin main      # 通了才推；不通就是 Clash 没开
```

Clash 没开时**不要反复重试**，直接告诉用户「请开一下 Clash」。用户开了之后一次就能推上去。

> 顺带：`curl` 在这台机器上有 exit 23 的毛病，会把 `&&` 链断掉 —— 串命令用 `;` 而不是 `&&`。

### 5.2 推送

```bash
export GIT_TERMINAL_PROMPT=0                  # 防止卡在凭据提示
git add -A
git commit -m "……"                            # 提交信息用中文，说清「改了什么 + 为什么」
for i in 1 2 3; do git push origin main && break; sleep 5; done
```

### 5.3 推送后**必须核实远程真的收到了**

不要只看 `git push` 的返回码，用 `ls-remote` 对一下：

```bash
git ls-remote origin main        # 输出的 SHA 应当等于 git log --oneline -1 的短 SHA
```

### 5.4 凭据

- **`gh` CLI 未安装**，别用 `gh`。
- GitHub 的凭据（账号 `XXIN1011`，OAuth token `gho_`，scopes gist/repo/workflow）已存在 **Windows 凭据管理器**里，`git push` 会自动用，通常不需要手动提供。
- 万一需要取出 token：`printf 'protocol=https\nhost=github.com\n\n' | git credential fill` —— **不要把取出来的 token 写进任何文件**。

### 5.5 git 身份（换机器克隆时要注意）

- **仓库级**：`user.name=XiaoXin`，`user.email=2624962001@qq.com`（当前已设好）
- **全局**：**空的**！

换机器或新克隆之后要重设，否则作者信息是错的：

```bash
git config user.name  "XiaoXin"
git config user.email "2624962001@qq.com"       # 注意：不带 --global
```

### 5.6 部署与线上复验

- 推送 `main` → GitHub Pages 自动重建，**约有 50~65 秒延迟**（CDN 缓存）。等一会儿再验，别急着下结论。
- 线上地址：**https://xxin1011.github.io/or-simplex/**
- 不要往 Netlify 推：那边已解绑删除。Netlify 免费版 300 额度/月是硬上限（一次生产部署 15 额度），耗尽会把整个团队所有站暂停到下个周期。

---

## 6. 改完必须跑的验证（定义「做完」）

**顺序很重要**：`crosscheck-*.py` 读的随机题库 JSON 是被 gitignore 的，**克隆后不存在**。
必须先跑对应的 node 脚本生成题库，python 才能跑。

### 6.1 一键全量（推荐）

```bash
npm run verify        # 构建 + 单元测试 + 7 套算法回归 + UI 回归
npm test              # 单元测试 + 7 套算法回归（末尾给汇总表）
npm run test:unit     # 只跑单元测试（6 文件 / 60 条，约 0.3 秒）
```

期望结果：

| 套件 | 期望输出 |
|---|---|
| 单元测试 | `# tests 76 / # pass 76 / # fail 0` |
| test-simplex（题库生成） | `随机题库已生成: random-bank.json (2000 题)` |
| edge-test | `合计: 9 通过 / 0 失败` |
| dual-test | `对偶题库已生成: dual-bank.json (400 题)` |
| sens-test | `最终结论: 全部通过 ✓（区间不多不少）` |
| scenario-test | `建表一致性自检: 与 simplex-core 完全一致 ✓` |
| param-test | `结论: PASS` |
| ip-test | `结论: PASS`（约 30 秒） |
| assignment-test | `结论: PASS`（1200 题逐步过程自检 + 独立口径对拍，约 0.2 秒） |
| verify-ui | `合计: 133 通过 / 0 失败` |

### 6.2 单跑与交叉对拍（scipy 是第二实现，别跳过）

```bash
node test/algorithm/test-simplex.js            # 生成 random-bank.json
python test/algorithm/crosscheck.py            # 期望：不一致: 0 条（2000/2000）
node test/algorithm/dual-test.js               # 生成 dual-bank.json
python test/algorithm/crosscheck-dual.py       # 期望：强对偶 通过 400 / 失败 0
node test/algorithm/sens-test.js               # 生成 sens-bank.json
python test/algorithm/crosscheck-sens.py       # 期望：结论: PASS
node test/algorithm/scenario-test.js           # 生成 scenario-bank.json
python test/algorithm/crosscheck-scenario.py   # 期望：结论: PASS（700 个场景算例）
node test/algorithm/param-test.js              # 生成 param-bank.json
node test/algorithm/assignment-test.js       # 生成 assignment-bank.json（含逐步过程自检）
python test/algorithm/crosscheck-assign.py    # 期望：结论: PASS（1200 题，状态 + 目标值两层）
python test/algorithm/crosscheck-param.py      # 期望：结论: PASS
node test/ui/verify-ui.js                      # 无头浏览器 UI 回归（需 Chrome）
node test/ui/graph-bounds.js index.html        # 期望：6 通过 / 0 越界
node test/ui/audit.js "index.html"             # 期望：触摸目标 0 个、对比度 0 个
node test/ui/audit.js "index.html#/sens"       # 逐个模块都查一遍
node test/ui/audit.js "index.html#/ip"
node test/ui/audit.js "index.html#/assign"
```

> 题库都生成在 `test/algorithm/` 下（和生成它的脚本同目录），Python 侧按**脚本自身位置**找它，
> 所以命令从仓库根跑就行，不用先 cd 进目录。
> `scenario-test.js` 与 `param-test.js` 的算例是**真随机**（用 `Math.random`），
> 所以它们的题库文件每次运行都不一样，**不能拿题库做逐字节对拍**，要看它们自己的结论标记。

`ip-test.js` 是随机用例，跑一次通过不代表没问题——**改动涉及整数规划时请连跑 3~5 次**（曾经有过随机偶发失败）。

### 6.3 改动了算法层（core/*）——两个必跑的自证

```bash
# ① 行为等价自证：把 2000 题每次迭代的每个格子哈希，改前改后 diff 必须为空
node test/algorithm/deep-snapshot.js > /tmp/after.txt
diff /tmp/before.txt /tmp/after.txt          # 无输出 = 算法行为逐字节未变

# ② 残留核查（历史模块是否彻底清零；命中会列出 file:line 并退出码 1）
node tools/check-no-dp.js
```

`deep-snapshot.js` 是重构/整理算法代码时**最有用的那一件工具**：
它把每道题的**每一次迭代、每一个表格格子、每一段显示文本**都哈希成指纹，
所以「迭代方向写反、边界条件给错但最优值碰巧相同」这类改动也躲不过去。
改算法前先跑一次留底，改完再跑一次 diff。

### 6.4 只改了界面 / 样式

```bash
npm run build; node test/ui/verify-ui.js; node test/ui/audit.js "index.html"; node test/ui/audit.js "index.html#/ip"
node test/ui/audit.js "index.html#/settings"; node test/ui/audit.js "index.html#/settings" dark
node test/ui/graph-bounds.js index.html      # 改了 src/web/graph.js 或图解相关 CSS 才需要
bash tools/verify-visual.sh                  # ★ 动了颜色/半透明/玻璃相关一律要跑（见下）
```

> **改了任何与颜色、透明度、背景相关的东西，必须跑 `bash tools/verify-visual.sh`。**
> `audit.js` 的对比度是按「背景色逐层 alpha 合成」算的近似值 —— `getComputedStyle`
> 拿不到 `background-image`，页面的极光渐变不参与计算，对「压在玻璃上的文字」偏乐观。
> `verify-visual.sh` 直接读截图里文字实际压着的像素颜色，是权威校验。两者都要过。
>
> 两点使用注意：① 它会对每个模块量**两个滚动位置**（顶部 + 中段）—— 只量顶部会漏掉正文
> 深处的承载面；② 量测工具本身踩过三个坑（取框内众数会被中文粗体的墨色带偏、取「外圈」
> 对紧凑控件失效、**均匀的描边色会打败渐变的底色**），三个坑的处理都写在
> `tools/visual/measure-contrast.py` 的文件头注释里 —— 改那个脚本前先读。

### 6.5 手机视口目视（UI 改动必做）

```bash
node tools/screenshots/shot.js "index.html#/ip" "out.png" 390 0 "@fill-ip-classic.js"     # 手机视口截图
node tools/screenshots/shot.js "index.html#/ip" "out.png" 390 0 "@fill-ip-classic.js" dark # 深色模式
```

`shot.js` 用法：`node tools/screenshots/shot.js <页面[#hash]|url> <输出png> <宽> <是否点求解> [@填充脚本] [dark]`
**注意两点**：① 不带 hash 时会**默认跳到 `#/simplex`**，要看首页请显式写 `"index.html#/"`；
② `@填充脚本` 相对 `shot.js` 自己所在目录解析，所以写 `@fill-ip-classic.js`（不用带路径），
输出 png 落在**仓库根**。

截图后**要用视觉能力真的看一眼**（`vision_analyze`），不要只依赖脚本断言——历史上样式类问题（文字被裁、重叠、加粗标记 `**` 漏解析、下标没渲染）都是靠目视发现的。

---

### 6.6 ⚠️ 验证脚本本身也可能有 bug —— 遇到「偶发失败」的正确处理

**背景（真实教训）**：`param-test.js` 曾经**约一半的运行会失败**，报
`该基在该 λ 处不可行; 从头重解 = infeasible`，且失败项永远锁定在同一道含人工变量的题上。
排查后发现**是引擎的真缺陷**（不是测试写错）：参数线性规划里，基中残留的人工变量必须恰好为 0，
而这条限制当初只夹了「当前行走方向」；同一个基会被向上、向下两次行走各记录一遍，
另一个方向记下的那份区间过宽，合并时恰好取了它，于是把「无可行解」的 λ 区间当成最优区间输出。

**所以遇到偶发失败，按这个顺序处理**：

1. **先连跑 5~10 次**，把失败率摸清楚（偶发 ≠ 可以忽略）
2. **注意失败是否总落在同一个 id / 同一类问题上** —— 那通常意味着特定结构触发，不是纯粹随机
3. **不要先改测试**。写一个最小复现脚本，做法是：从题库里捞出那道题 → 扫一个能触发的参数 →
   把模块的「公式预测值」与「直接重算值」并排打出来。这类一次性脚本**用完即删**
4. 确认是引擎缺陷就修引擎；**只有确认测试写错了才改测试**，并在注释里写清为什么
5. 修完**连跑 10 次**确认稳定，再跑全量

同理：`test/algorithm/ip-test.js` 里分枝定界有结点上限，触顶时它只保证「目前最好」而不是「最优」，
测试必须用 `complete` 标志区分，否则会误报（这个坑也踩过）。

**另一类「偶发失败」：不是我们的引擎错，而是裁判（HiGHS）错。** 2026-09 抓到一例，务必记牢：
场景对拍的 `add-var` 算例里，JS 判 `unbounded` 而 `scipy.optimize.linprog(method='highs')` 判 `infeasible`。
手算复核后**JS 是对的** ——

```
min z = -3x₁ - 5x₂ - 3x₃
s.t.  -4x₁ - 3x₂ + 2x₃ ≥ -12
        4x₁ + 2x₂ -  x₃ ≥ -9,   x ≥ 0
```

原点可行（可行性 LP 返回 `status 0`），且射线 `x(t) = (t, 0, 3t)` 对任意 `t > 0` 都满足两条约束、
`z = -12t → -∞`，数学上确定是**无界**。而各类判定方式实测为：

| 判定方式 | 结果 |
|---|---|
| `method='highs'`（presolve 默认开） | `status 2 infeasible` ✗ |
| `method='highs'`, `options={'presolve': False}` | `status 3 unbounded` ✓ |
| `method='highs-ds'`, presolve 关 | `status 3 unbounded` ✓ |
| `method='highs-ipm'`（同样走 presolve） | `status 2 infeasible` ✗ |
| `method='interior-point'`（旧版） | `unbounded` ✓ |

即 **HiGHS 的 presolve 会把「无界」误判成「无可行解」**，而 `scipy.optimize.linprog` 默认就开着 presolve。
所以「scipy 说 infeasible、我们说是 unbounded」这类分歧**必须双向怀疑**。

处置（已落地，别回退）：`crosscheck-scenario.py` 与 `crosscheck.py` 在两边状态不一致时**关掉 presolve 再解一次**；
若此时与 JS 一致，就记入 `presolve_artifacts` 并在末尾单独打印（可复核），**不计失败也不隐藏分歧**。
其余三个对拍脚本文件头也加了同一份警示。判断这类分歧的通用顺序：
① 先手算一条可行射线/可行点；② 换 `presolve=False` 或换求解器复核；③ 两边都站得住再回头怀疑引擎。

### 6.7 一次性排查脚本（已清理）

原先根目录有一批 `diagnose-*.js`（单纯形法 / 灵敏度区间 / 整数规划 / 隐枚举 / 参数 LP 的排查脚本）。
它们对应的缺陷都已修完并补了回归测试，**已在整理目录结构时删除**。
再遇到同类问题不用去找它们，照 6.6 的五步走、现写一个最小复现脚本即可。

---

## 7. 代码约定（必须遵守，否则会破坏项目风格）

1. **中文注释，且解释「为什么」而不是「是什么」。** 尤其是分支为什么存在（退化情形、边界条件）。
2. **`core/` 与 `web/` 统一 ES5 风格**：`var`、`Array.prototype.forEach.call`，不用箭头函数 / `let` / `const`
   （原因：这些文件会被原样打包进单文件页面，ES5 在任何老年份浏览器/WebView 上都不会翻车；
   验证脚本 `test/**/*.js` 是 Node 跑的，可以用现代语法）。
   新代码请与所在文件保持一致。
3. **零依赖**：不引 CDN、不用 npm 包（`package.json` 里也刻意没有 dependencies）。
   所有算法自己实现（这是教学工具的意义，也便于以后翻译成 ArkTS 做鸿蒙原生）。
4. **单文件产物**：改完必须 `npm run build`。
5. **算法只有一份实现**：迭代内核只有 `core/simplex.js`，其余模块通过
   `ratioTest` / `pivot` / `solveStandardForm` / `readOut` 复用它。
   加新算法时**先找现成部件**，不要再抄一份枢轴变换。
6. **分层不许越界**：`core/` 里不许出现 `document` / `window`，也不许读写文件；
   `web/` 里不许内联算法公式（要算就调 `core/`）。
7. **模块之间只走公开接口**：需要别的东西就 `require` 它导出的函数，
   不要再挂 `window.xxx` 之类的全局。
8. **手机优先**：触摸目标 ≥ 44×44、正文对比度 ≥ 4.5:1、表格超宽要能横向滚动（`.scroll` 容器 + `addScrollHints`）。
9. **不要把「没跑完」说成「最优」**：分枝定界有结点上限、隐枚举有规模上限，触顶时必须在界面上写明「目前最好，不保证全局最优」。这是本项目的底线。
10. **提交信息用中文**，说清「改了什么 + 为什么」，涉及算法缺陷修复时写清根因。

---

## 8. 环境与已知坑

### 环境

| 项 | 值 |
|---|---|
| 系统 | Windows 11；`terminal` 走 **Git Bash（MSYS）**，不是 PowerShell |
| node | v22.22.0 |
| Python | 3.12.13（`python` 而非 `python3`）+ numpy 2.5.3 / scipy 1.18.1 |
| git | 2.55.0.windows.5 |
| Chrome | `C:/Program Files/Google/Chrome/Application/chrome.exe`（备用 Edge：`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`） |
| `gh` CLI | **未安装** |

路径注意：本机 **MSYS 路径转换被禁用** —— `cd /c/Users/...` 可以用（bash 内建），但**传给原生程序**（git / node / python）的路径要用 `C:/Users/...` 这种正斜杠原生形式，不能用 `/c/...`。

### 已知坑（按踩坑频率排序）

| 坑 | 现象 | 对策 |
|---|---|---|
| **Clash 没开** | push 报 `Failed to connect … over proxy 127.0.0.1`；取消代理又 `Connection reset` | 先 `git ls-remote origin main` 探；不通就让用户开 Clash，**别反复重试** |
| **题库 JSON 不存在** | 克隆后直接跑 `crosscheck-*.py` 报文件找不到 | 先跑生成它的 node 脚本（见 6.2 的顺序） |
| **Pages 缓存延迟** | 推完立刻验，线上还是旧版 | 等 50~65 秒；验证请求带 `Cache-Control: no-cache` |
| **`curl` exit 23** | 写在 `&&` 链里会静默中断后续命令 | 串命令用 `;`，或改用 Python 发请求 |
| **`node --test test/unit` 直接传目录会报 MODULE_NOT_FOUND** | Node 22 把目录当模块入口找了 | 传文件列表：`node --test test/unit/*.test.js`，或直接用 `npm run test:unit`（它自己列文件） |
| **`search_files` 偶发返回 0** | 明明存在的字符串搜不到 | 改用 `grep`（terminal） |
| **LF/CRLF 警告** | `git add` 时刷一屏 `LF will be replaced by CRLF` | 噪声，忽略即可（sha256 比对时统一把 CRLF 归一化） |
| **`shot.js` 默认跳 `#/simplex`** | 想截首页却截到了单纯形法 | 显式写 `"index.html#/"` |
| **无头 Chrome 默认报 `prefers-reduced-motion: reduce`** | 断言「过渡挂在 transform 上」永远失败（量到的 `transitionProperty` 是 `none`），看起来像「动画没做」 | 样式表末尾有一条 `*{transition:none!important}` 的兜底规则，headless 下会命中。断言动画前先 `Emulation.setEmulatedMedia` 显式声明 `no-preference`，断言完再恢复 |
| **主题改成属性驱动后，担心 CDP 模拟系统深色不生效** | 怀疑 `Emulation.setEmulatedMedia` 不会触发 `matchMedia` 的 change 事件，页面不跟着转深 | 实测**会触发**（2026-09 在无头 Chrome 上验过：`init:false → change:true`）。所以 `shot.js` / `probe-color.js` / `audit.js` / `verify-ui.js` 里用 `setEmulatedMedia` 模拟系统外观的做法**不用改** —— 保持「模拟系统偏好」验的才是用户真实走的路径，别图省事去直接改 `data-theme` |
| **远程审查的触摸目标假警** | 线上 `audit.js` 偶发报「N 个触摸目标 < 44px」，本地重跑为 0 | 是 CDN 慢、元素还没渲染完就量了尺寸；现已对远程 URL 放宽等待（本地 1200ms / 远程 2600ms） |
| **`document.querySelectorAll(...).forEach`** | 老写法 `Array.prototype.forEach.call` 更稳 | 与既有代码保持一致 |
| **注释里写 `z*/b` 这类片段** | 文件当场语法错误（`*/` 提前结束了块注释） | 注释里避免出现 `*/` 字面量，写成「最优值对右端项的偏导数」这类措辞 |

---

## 9. 当前状态（截至最近一次提交）

- 分支 `main`；当前 HEAD 用 `git log --oneline -1` 看（这里不写死 SHA，免得一提交就过期）
- 线上 https://xxin1011.github.io/or-simplex/ 应当与最新提交一致（推完等 50~65 秒再验）
- **架构**：`src/core/`（六层领域模块：errors / util / model / parse / simplex / format，
  另加 sensitivity / scenario / integer）与 `src/web/`（表现层）彻底分离；
  每个模块只导出少量公开函数，跨模块一律 `require`，没有全局变量；
  迭代内核拆成 4 个可替换部件（见第 4 节），加算法不必改内核。
- **验证现状**：单元测试 **60/60**；算法回归 **7 套全 PASS**（含 scipy 对拍 2000 + 400 + 700 + 1110）；
  UI 回归 **110/110**；无障碍审计与像素级对比度全达标；`tools/check-no-dp.js` 命中 **0**。
- **两个自证工具**：`test/algorithm/deep-snapshot.js`（行为逐字节等价）、`tools/check-no-dp.js`（残留清零）。
- **视觉主题是「极光底 + 全玻璃」**：所有承载面（品牌区 / 模块卡 / 正文卡 / 表格 / 按钮 /
  结论徽章 / 底部标签栏）都是玻璃，浅深两套各自调优 + 不支持 `backdrop-filter` 时退回实色。
  「求解」是玻璃描边按钮；底部导航用单个 `.tb-pill` 元素做滑动指示器。
  用户明确要求过三件事，别改回去：① **要全玻璃**（含表格）；② **标签栏切换要滑过去**，
  不能「旧的消失 + 新的出现」；③ **底栏只留「首页 + 设置」**，算法模块从首页卡片进。
- **显示模式三档（跟随系统 / 浅色 / 深色）由 `<html data-theme>` 驱动**，不再是 CSS 媒体查询：
  媒体查询表达不了「系统是深色、用户偏要浅色」，而且属性权重更高（`html[data-theme]` 0,1,1 > `:root` 0,1,0），
  深色配色因此只有一份。解析与持久化在 `src/web/settings-ui.js`（localStorage 键 `or-theme`，
  读不到时退回 system），属性在首次绘制前落下，不闪。**主题色 meta 只剩一条**，由 JS 按当前模式改写
  （留两条 media 版的话，「系统深色 + 用户选浅色」时状态栏染色会和页面反着来）。
- 落地过程中实测抓到并修掉的缺陷：极光被 `body` 的实色底整块盖住（量出来是 `#f4f4f8` 一片灰）、
  模块页标题区与页脚提示裸压在极光上（4.09 / 4.30:1）、深色下白玻璃被下层叠成中灰（1.89~3.46:1）、
  `<sub>` 被浏览器缩到 10.83px 跌破 12px 下限。
- 验证：UI 回归 110/110、无障碍审计 8 组全 0、像素级对比度全屏达标（最低 5.04）。
  `bash tools/verify-visual.sh` 会对每个页面量「顶部 + 中段」两屏 —— 只量顶部会漏掉正文
  深处的表格与卡片，而全玻璃正是把那些面调透明了，漏测等于没测。
- **`blob 哈希`不是「构建是否正常」的判据，而是「可复现性」判据**：同一份源码构建两次必须同哈希。
  源码（含 CSS）改了哈希当然会变；判断构建没坏要看产物能否正常运行（UI 回归 + 截图目视）。

### 已知的待办 / 可做的方向

1. 整数规划：用户可能会反馈某道真题的输出形式与教材不一致（分枝定界的树画法、割平面的表格排法），按反馈调整
2. 可选的算法扩展：对偶单纯形的独立入口、两阶段法（第 4 节的扩展点已经为它们准备好）
3. 长期：打包成鸿蒙 HAP 上架华为应用市场（需要软著 300 元 + 4~5 个月审查 + APP 备案，用户已决定暂缓）

---

## 10. 绝对不要做的事

1. 🚫 **不要手改 `index.html`** —— 它是构建产物，改源码后 `npm run build` 会覆盖它。
2. 🚫 **不要把 `index.html` 挪出仓库根**（比如放 `src/` 或 `dist/`）—— GitHub Pages 以仓库根为
   发布目录，入口只能是 `/index.html`；挪走线上地址就会变成 `.../子目录/`，用户加过桌面的
   链接全部失效。
3. 🚫 **不要引入任何外部依赖**（CDN、npm 包、字体文件）—— 这个项目要能离线单文件运行。
4. 🚫 **不要把 `token.txt` / `device.json` / 任何 token 提交进仓库**（已在 `.gitignore` 里，别去动它）。
5. 🚫 **不要往 Netlify 推** —— 已解绑删除；只用 GitHub Pages。
6. 🚫 **不要为了「让验证通过」而放宽验证标准** —— 验证脚本是这个项目质量的唯一保障，
   历史上每一个真缺陷（影子价格符号、灵敏度区间过宽、对偶比值漏 M 项、0-1 上界未加入、
   割平面新增列顶位右端项、隐枚举最小化比反了）都是它抓出来的。
   如果验证失败，**先怀疑代码，再怀疑测试**；确认是测试写错了再改测试，并在注释里写清原因。
7. 🚫 **不要给 `body` 加实色背景** —— 基质色放在 `html` 上，`body` 必须透明。`z-index:-1`
   的极光伪元素绘制在 `body` 自身背景**之下**，`body` 一带实色底，极光就被整块盖住、玻璃
   退化成普通白卡片（这个坑实测踩过：极光写得再艳，量出来仍是 `#f4f4f8` 一片灰）。
   `test/ui/verify-ui.js` 里「背景是否变浅/变深」的断言读的也是 `documentElement`，别改回 `body`。
8. 🚫 **不要让文字直接压在极光上** —— 极光是会**漂移的动画**，同一处文字背后的颜色会随时间
   变艳。文字必须有承载面（玻璃垫底或近不透明卡片），且厚度按**最坏情况**留余量，不能按某一帧
   量到的值来定。模块页标题区与页脚提示原本就裸压在极光上，实测只有 4.09 / 4.30:1，已补垫底。
9. 🚫 **不要在 `core/` 里碰 DOM，也不要在 `web/` 里写算法** —— 这个分层是本次重构的核心成果，
   破了它就又回到「一个文件里什么都混着」的状态，单测也没法再跑。
10. 🚫 **不要声称「已完成 / 已推送 / 已生效」而不核实** —— 推送用 `git ls-remote` 核实远程 SHA，
    线上效果用 HTTP 取回内容或截图核实，不要凭工具返回码下结论。
11. 🚫 **不要把显示模式写回 `@media (prefers-color-scheme: dark)`** —— 三档设置里
    「系统是深色、用户要浅色」媒体查询表达不了；而且同权重按源码顺序决胜，深色配色会被迫
    写两份（媒体查询一份 + 属性一份），早晚改漏一处。主题一律走 `html[data-theme]`，
    系统偏好由 `settings-ui.js` 解析（见第 9 节）。同理，`<meta name="theme-color">`
    只留一条、由 JS 改写，不要加回带 `media` 属性的两条。
