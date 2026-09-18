# 交接文档 · 交给其他 Agent

> 这份文件是给**接手本项目的 AI agent** 看的。目标是：读完之后**第一时间找到文件、改对地方、把验证跑绿、顺利推上 GitHub**。
> 项目背景与算法说明在 `README.md`，本文件只讲**怎么动手**。

---

## 0. 一句话指令（可直接复制给其他 agent）

```
项目「运筹学计算器」在本机路径：C:\Users\Lenovo\.hermes\workspace\or-solver
（Git Bash / MSYS 写法：/c/Users/Lenovo/.hermes/workspace/or-solver）

目录：index.html 在**仓库根**（GitHub Pages 入口，不能挪）；源码在 src/{core,ui}/；
验证在 test/{algorithm,ui}/；截图工具在 tools/screenshots/。

请先完整读 HANDOFF.md 与 README.md，再动手改。
分支 main，远程 https://github.com/XXIN1011/or-simplex.git
线上 https://xxin1011.github.io/or-simplex/

硬性要求：
1) 只改 src/ 下的源文件，改完必须 `node src/build.js` 重新生成根目录的 index.html ——
   index.html 是构建产物，不要手改。
2) 改完必须跑验证（见 HANDOFF.md 第 6 节），全绿才算做完。
3) 推送前确认 Clash 代理已开（git 全局代理指向 127.0.0.1:7897）。
4) git 身份是「仓库级」的（XiaoXin / 2624962001@qq.com），全局是空的，换机器克隆后要重设。
```

---

## 1. 项目速览

| 项 | 值 |
|---|---|
| 是什么 | 面向**教学**的运筹学求解网页：把算法的每一步中间过程完整摊开，而不是只给答案 |
| 本地路径（Windows） | `C:\Users\Lenovo\.hermes\workspace\or-solver` |
| 本地路径（Git Bash） | `/c/Users/Lenovo/.hermes/workspace/or-solver` |
| 仓库 | https://github.com/XXIN1011/or-simplex.git |
| 分支 | `main` |
| 线上地址 | **https://xxin1011.github.io/or-simplex/**（GitHub Pages，push 即自动部署，免费无额度限制） |
| 形态 | **单文件、零依赖、可离线**的 `index.html`（多份源码在构建时内联进去） |
| 手机端 | 浏览器打开 → 「添加至桌面」当 App 用（用户是华为纯血鸿蒙，**装不了 APK**，只能走网页 / 后续做 HAP） |

### 四个模块（hash 路由）

| 路由 | 模块 | 状态 |
|---|---|---|
| `#/simplex` | 单纯形法 | 首页可见 |
| `#/sens` | 灵敏度分析 | 首页可见 |
| `#/ip` | 整数规划 | 首页可见 |
| `#/dp` | 动态规划 | **首页不露出口，但代码/路由/页面全保留**，直接访问 `/#/dp` 仍可用 |

> `#/dp` 被藏起来的原因：它还是「预置教材题型、选完填参数」那套形式，与另外三个模块
> 「读入任意题目 → 规范化输出」的风格不一致。想放回首页：在 `src/template.html` 里
> `<!-- 动态规划模块暂不从首页露出 … -->` 那段注释的位置把 `<a class="modcard" href="#/dp">` 加回去即可。

---

## 2. 目录结构与文件地图（哪些能改、哪些别碰）

```
or-solver/
├── index.html            ← 构建产物（GitHub Pages 入口，**必须留在根**）
├── README.md               项目说明
├── HANDOFF.md              本文件
├── src/                    ── 源码（构建时内联进 index.html）
│   ├── template.html       页面骨架 + 全部 CSS（含 11 个 <script> 占位符）
│   ├── build.js            构建脚本，SLOTS 表定义「占位符 → 源文件」
│   ├── core/               算法核心（不碰 DOM，可在 Node 里直接 require）
│   │   ├── simplex-core.js   大 M 法单纯形 + 对偶解 + 灵敏度区间
│   │   ├── sens-core.js      场景式灵敏度分析 + 参数线性规划
│   │   ├── dp-core.js        动态规划递推引擎 + 五种题型
│   │   └── ip-core.js        分枝定界 / 割平面 / 隐枚举 + 适用性判定
│   └── ui/                 界面层
│       ├── ui.js  sens-ui.js  dp-ui.js  ip-ui.js    各模块界面
│       ├── input-panel.js    可复用输入表组件（createInputPanel）+ addScrollHints
│       ├── graph.js          图解法 SVG（整数规划会传第三个参数叠加整数格点）
│       └── router.js         hash 路由，新增模块要往 MODULES 里加名字
├── test/                   ── 验证
│   ├── algorithm/          算法对拍：JS 生成题库 → Python 用 scipy/HiGHS 复核
│   │   ├── test-simplex.js  edge-test.js  dual-test.js  sens-test.js
│   │   │   scenario-test.js param-test.js  dp-test.js   ip-test.js
│   │   └── crosscheck.py  crosscheck-dual.py  crosscheck-sens.py
│   │       crosscheck-scenario.py  crosscheck-param.py
│   └── ui/                 界面与无障碍
│       ├── verify-ui.js      无头浏览器 UI 回归（当前 **104 项**）
│       ├── audit.js          触摸目标 / 文字对比度 / 表单标注
│       ├── graph-bounds.js   图解 SVG 是否越界
│       └── probe-layout.js   输入区高度、求解按钮是否需要滚动才点得到
└── tools/                  ── 开发辅助（不参与构建）
    ├── screenshots/
    │   ├── shot.js           整页长截图（可模拟深色、可指定模块 hash）
    │   └── fill-*.js         截图前的表单填充脚本
    ├── visual/               视觉量测：半透明背景下的权威对比度校验
    │   ├── shot-vp.js          只截「视口」的截图（整页图里 fixed 极光的位置不可靠）
    │   ├── probe-color.js      量出元素位置与颜色 → JSON
    │   ├── measure-contrast.py 读截图像素算 WCAG 对比度（取底色的两个坑见文件头）
    │   └── check-overlap.py    固定底栏是否遮住页面末尾内容
    ├── setup/
    │   └── deploy-github.py  一次性建仓/开启 Pages 脚本（已用过）
    └── verify-visual.sh      一键跑 4 模块 × 2 主题的像素级对比度实测
```

> **为什么 `index.html` 必须在根**：GitHub Pages 以**仓库根**为发布目录，入口只能是
> `/index.html`。把它挪进子目录，线上地址就会从 `https://xxin1011.github.io/or-simplex/`
> 变成 `.../子目录/`。所以 `src/build.js` 的读写路径是分开的：**读 `src/`，写 `../index.html`**。

### 🚫 构建产物（**绝对不要手改**）

| 文件 | 说明 |
|---|---|
| `index.html` | 由 `node src/build.js` 生成，是所有源码内联后的成品。手改 = 下次构建就没了 |

### 🔧 验证脚本（改完要跑，见第 6 节）

`test/ui/verify-ui.js`（UI 回归，当前 **104 项**）· `test/ui/audit.js`（触摸目标/对比度/表单标注）
`test/algorithm/*.js`（算法对拍）· `test/algorithm/crosscheck*.py`（与 scipy/HiGHS 对拍）
`test/ui/graph-bounds.js`（图解越界）· `test/ui/probe-layout.js`（布局可达性）
`tools/screenshots/shot.js`（截图）· `tools/screenshots/fill-*.js`（截图用填充脚本）

> 这些脚本的路径都是**按仓库根解析**的（内部用 `__dirname/../../`），
> 所以 `node test/ui/audit.js "index.html#/ip"` 这种写法从任何工作目录都能用。

### 🙈 被 gitignore 的（克隆后**不存在**，见第 5 节的坑）

`random-bank.json` `dual-bank.json` `sens-bank.json` `scenario-bank.json` `param-bank.json`
（随机题库，由 `test/algorithm/` 下的 node 脚本生成在**同目录**）· `*.png`（本地截图）
· `device.json` `token.txt` `poll-token.py`（授权相关，**绝不入库**）

---

## 3. 第一次上手（三条命令）

```bash
cd /c/Users/Lenovo/.hermes/workspace/or-solver   # 或 cd "C:/Users/Lenovo/.hermes/workspace/or-solver"
git status                                        # 应为空（干净）
node src/build.js                                 # 期望输出：构建完成 index.html : 232.0 KB
node test/ui/verify-ui.js                         # 期望输出：合计: 104 通过 / 0 失败
```

三条都通过 = 环境正常，可以开始改。

---

## 4. 构建流程（**每次改完源码都必须做**）

```bash
node src/build.js
```

它做的唯一一件事：把 `src/template.html` 里的 11 个占位符替换成对应源文件的全文，
产出**仓库根的 `index.html`**（读 `src/`、写 `../index.html`）。

```
/*__CORE__*/      ← src/core/simplex-core.js   /*__DP_CORE__*/  ← src/core/dp-core.js
/*__SENS_CORE__*/ ← src/core/sens-core.js      /*__DP_UI__*/    ← src/ui/dp-ui.js
/*__PANEL__*/     ← src/ui/input-panel.js      /*__IP_CORE__*/  ← src/core/ip-core.js
/*__GRAPH__*/     ← src/ui/graph.js            /*__IP_UI__*/    ← src/ui/ip-ui.js
/*__UI__*/        ← src/ui/ui.js               /*__ROUTER__*/   ← src/ui/router.js
/*__SENS_UI__*/   ← src/ui/sens-ui.js
```

**`SLOTS` 里写的是相对 `src/` 的路径**（如 `'core/simplex-core.js'`），顺序有意义：
后者可以调用前者定义的全局函数（例如 `sens-ui.js` 会用 `simplex-core.js` 的 `fmtNum`）。
插入新模块时，核心要排在界面之前、`router.js` 排最后。

### 新增一个模块要动四处

1. `src/template.html`：加 `<div class="mod" id="mod-xxx">…</div>` 容器，**并加两个 `<script>` 占位符**
2. `src/build.js`：往 `SLOTS` 里加两条映射（路径相对 `src/`，顺序要对）
3. `src/ui/router.js`：把 `'xxx'` 加进 `MODULES`
4. `src/template.html` 首页：加一张 `<a class="modcard" href="#/xxx">` 卡片

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

### 6.1 一键全量（推荐，按此顺序）

```bash
node src/build.js                              # 期望：构建完成 index.html : 232.0 KB
node test/ui/verify-ui.js                      # 期望：合计: 104 通过 / 0 失败
node test/algorithm/edge-test.js               # 期望：9 通过 / 0 失败
node test/algorithm/test-simplex.js            # 生成 random-bank.json
python test/algorithm/crosscheck.py            # 期望：不一致: 0 条
node test/algorithm/dual-test.js               # 生成 dual-bank.json
python test/algorithm/crosscheck-dual.py       # 期望：强对偶 通过 400 / 失败 0
node test/algorithm/sens-test.js               # 生成 sens-bank.json；期望：全部通过 ✓（区间不多不少）
python test/algorithm/crosscheck-sens.py       # 期望：结论: PASS
node test/algorithm/scenario-test.js           # 生成 scenario-bank.json
python test/algorithm/crosscheck-scenario.py   # 期望：结论: PASS
node test/algorithm/param-test.js              # 生成 param-bank.json
python test/algorithm/crosscheck-param.py      # 期望：结论: PASS
node test/algorithm/dp-test.js                 # 期望：结论: PASS
node test/algorithm/ip-test.js                 # 期望：结论: PASS（约 30 秒）
node test/ui/graph-bounds.js index.html        # 期望：6 通过 / 0 越界
node test/ui/audit.js "index.html"             # 期望：触摸目标 0 个、对比度 0 个
node test/ui/audit.js "index.html#/sens"       # 逐个模块都查一遍
node test/ui/audit.js "index.html#/dp"
node test/ui/audit.js "index.html#/ip"
```

> 题库都生成在 `test/algorithm/` 下（和生成它的脚本同目录），Python 侧按**脚本自身位置**找它，
> 所以命令从仓库根跑就行，不用先 cd 进目录。

`ip-test.js` 是随机用例，跑一次通过不代表没问题——**改动涉及整数规划时请连跑 3~5 次**（曾经有过随机偶发失败）。

### 6.2 只改了界面 / 样式

```bash
node src/build.js && node test/ui/verify-ui.js && node test/ui/audit.js "index.html" && node test/ui/audit.js "index.html#/ip"
node test/ui/graph-bounds.js index.html      # 改了 src/ui/graph.js 或图解相关 CSS 才需要
bash tools/verify-visual.sh                  # ★ 动了颜色/半透明/玻璃相关一律要跑（见下）
```

> **改了任何与颜色、透明度、背景相关的东西，必须跑 `bash tools/verify-visual.sh`。**
> `audit.js` 的对比度是按「背景色逐层 alpha 合成」算的近似值 —— `getComputedStyle`
> 拿不到 `background-image`，页面的极光渐变不参与计算，对「压在玻璃上的文字」偏乐观。
> `verify-visual.sh` 直接读截图里文字实际压着的像素颜色，是权威校验。两者都要过。

### 6.3 只改了某个算法核心（最省的做法）

改哪个模块就跑它自己的套件 + 那一个模块的审查，例如整数规划：

```bash
node test/algorithm/ip-test.js && node src/build.js && node test/ui/verify-ui.js && node test/ui/audit.js "index.html#/ip"
python test/algorithm/crosscheck-param.py    # 若动了 simplex-core.js，几乎所有对拍都要重跑
```

> **动了 `src/core/simplex-core.js` 要特别小心**：灵敏度分析、动态规划、整数规划都依赖它，
> 必须跑完整套（对拍 2000 + 对偶 400 + 区间 + 场景 + 参数 + 整数规划）。

### 6.4 手机视口目视（UI 改动必做）

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

### 6.5 ⚠️ 验证脚本本身也可能有 bug —— 遇到「偶发失败」的正确处理

**背景（真实教训）**：`param-test.js` 曾经**约一半的运行会失败**，报
`该基在该 λ 处不可行; 从头重解 = infeasible`，且失败项永远锁定在同一道含人工变量的题上。
排查后发现**是引擎的真缺陷**（不是测试写错）：参数线性规划里，基中残留的人工变量必须恰好为 0，
而这条限制当初只夹了「当前行走方向」；同一个基会被向上、向下两次行走各记录一遍，
另一个方向记下的那份区间过宽，合并时恰好取了它，于是把「无可行解」的 λ 区间当成最优区间输出。

**所以遇到偶发失败，按这个顺序处理**：

1. **先连跑 5~10 次**，把失败率摸清楚（偶发 ≠ 可以忽略）
2. **注意失败是否总落在同一个 id / 同一类问题上** —— 那通常意味着特定结构触发，不是纯粹随机
3. **不要先改测试**。写一个最小复现脚本，做法是：从题库里捞出那道题 → 扫一个能触发的参数 →
   把模块的「公式预测值」与「直接重算值」并排打出来。这类一次性脚本**用完即删**——
   历史上那两个定位出上面这个缺陷的脚本（`diagnose-param-flaky.js` / `diagnose-param-283.js`）
   已在整理目录时清掉，再遇到同类问题照这个办法现写一个就行（几十行）。
4. 确认是引擎缺陷就修引擎；**只有确认测试写错了才改测试**，并在注释里写清为什么
5. 修完**连跑 10 次**确认稳定，再跑全量

同理：`test/algorithm/ip-test.js` 里分枝定界有结点上限，触顶时它只保证「目前最好」而不是「最优」，
测试必须用 `complete` 标志区分，否则会误报（这个坑也踩过）。

### 6.6 一次性排查脚本（已清理）

原先根目录有一批 `diagnose-*.js`（单纯形法 / 灵敏度区间 / 整数规划 / 隐枚举 / 参数 LP 的排查脚本）。
它们对应的缺陷都已修完并补了回归测试，**已在整理目录结构时删除**。
再遇到同类问题不用去找它们，照 6.5 的五步走、现写一个最小复现脚本即可。

---

## 7. 代码约定（必须遵守，否则会破坏项目风格）

1. **中文注释，且解释「为什么」而不是「是什么」。** 尤其是分支为什么存在（退化情形、边界条件）。
2. **ES5 风格**：`var`、`Array.prototype.forEach.call`、不用箭头函数 / `let` / `const`（核心源码与界面统一如此；验证脚本 `*.js` 测试文件可以用现代语法）。
3. **零依赖**：不引 CDN、不用 npm 包。所有算法自己实现（这是教学工具的意义，也便于以后翻译成 ArkTS 做鸿蒙原生）。
4. **单文件产物**：改完必须 `node src/build.js`。
5. **算法只有一份实现**：例如 `src/core/sens-core.js` 的建表逻辑刻意镜像 `src/core/simplex-core.js`，并由「建表一致性自检」逐元素比对防止分叉。要改算法核心时，先找找有没有第二份镜像。
6. **手机优先**：触摸目标 ≥ 44×44、正文对比度 ≥ 4.5:1、表格超宽要能横向滚动（`.scroll` 容器 + `addScrollHints`）。
7. **不要把「没跑完」说成「最优」**：分枝定界有结点上限、隐枚举有规模上限，触顶时必须在界面上写明「目前最好，不保证全局最优」。这是本项目的底线。
8. **提交信息用中文**，说清「改了什么 + 为什么」，涉及算法缺陷修复时写清根因。

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
| **题库 JSON 不存在** | 克隆后直接跑 `crosscheck-*.py` 报文件找不到 | 先跑生成它的 node 脚本（见 6.1 的顺序） |
| **Pages 缓存延迟** | 推完立刻验，线上还是旧版 | 等 50~65 秒；验证请求带 `Cache-Control: no-cache` |
| **`curl` exit 23** | 写在 `&&` 链里会静默中断后续命令 | 串命令用 `;`，或改用 Python 发请求 |
| **`search_files` 偶发返回 0** | 明明存在的字符串搜不到 | 改用 `grep`（terminal） |
| **LF/CRLF 警告** | `git add` 时刷一屏 `LF will be replaced by CRLF` | 噪声，忽略即可（sha256 比对时统一把 CRLF 归一化） |
| **`shot.js` 默认跳 `#/simplex`** | 想截首页却截到了单纯形法 | 显式写 `"index.html#/"` |
| **远程审查的触摸目标假警** | 线上 `audit.js` 偶发报「N 个触摸目标 < 44px」，本地重跑为 0 | 是 CDN 慢、元素还没渲染完就量了尺寸；现已对远程 URL 放宽等待（本地 1200ms / 远程 2600ms） |
| **`document.querySelectorAll(...).forEach`** | 老写法 `Array.prototype.forEach.call` 更稳 | 与既有代码保持一致 |

---

## 9. 当前状态（截至最近一次提交）

- 分支 `main`；当前 HEAD 用 `git log --oneline -1` 看（这里不写死 SHA，免得一提交就过期）
- 线上 https://xxin1011.github.io/or-simplex/ 应当与最新提交一致（推完等 50~65 秒再验）
- **UI 回归 104 项全过**；九个算法验证套件全 PASS；四个模块 × 浅深色审查 0 问题
- verify-ui 覆盖：路由、首页卡片数、单纯形法（标准化/图解/迭代/对偶）、灵敏度（区间/四场景/技术系数/参数 LP）、动态规划（五题型）、整数规划（四方法/适用性/收纳卡/最小化）
- **目录已整理**为 `src/{core,ui}` + `test/{algorithm,ui}` + `tools/{screenshots,visual,setup}`，
  `index.html`/`README.md`/`HANDOFF.md` 留在根（见第 2 节）。整理时顺手删掉了 6 个一次性的
  `diagnose-*.js`（对应缺陷都已修完并补了回归），以及若干临时预览脚本与截图（那些是消耗品）。
- **视觉主题已换成「极光底 + 玻璃材质」**：玻璃只用在浮层（品牌区 / 模块卡 / 按钮 / 结论徽章 /
  底部标签栏），正文表格近不透明；浅深两套 + 不支持 `backdrop-filter` 时退回实色。
  落地过程中修掉四个实测抓到的缺陷：模块页标题区与页脚提示裸压在极光上（4.09 / 4.30:1 不达标）、
  深色分段控件把几层白色玻璃叠成中灰（1.89~3.46:1）、极光被 `body` 的实色底整块盖住。
  验证：UI 回归 104/104、无障碍审计 8 组全 0、像素级对比度 8 组全达标
  （新增 `bash tools/verify-visual.sh`，并把 `tools/visual/` 四个量测工具留在了仓库里）。
- **`blob 哈希`不是「构建是否正常」的判据，而是「可复现性」判据**：同一份源码构建两次必须同哈希。
  源码（含 CSS）改了哈希当然会变；判断构建没坏要看产物能否正常运行（UI 回归 + 截图目视）。

### 已知的待办 / 可做的方向

1. **动态规划模块的形式改造**（最大的一个）：目前是「选题型填参数」，
   要改成与其它模块一致的「读入任意 DP 问题 → 规范化输出」。需要把
   「阶段 / 状态 / 决策 / 状态转移方程」做成通用输入形式。
2. 动态规划是不是要放回首页（等 1 完成）
3. 整数规划：用户可能会反馈某道真题的输出形式与教材不一致（分枝定界的树画法、割平面的表格排法），按反馈调整
4. 长期：打包成鸿蒙 HAP 上架华为应用市场（需要软著 300 元 + 4~5 个月审查 + APP 备案，用户已决定暂缓）

---

## 10. 绝对不要做的事

1. 🚫 **不要手改 `index.html`** —— 它是构建产物，改源码后 `node src/build.js` 会覆盖它。
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
9. 🚫 **不要声称「已完成 / 已推送 / 已生效」而不核实** —— 推送用 `git ls-remote` 核实远程 SHA，
   线上效果用 HTTP 取回内容或截图核实，不要凭工具返回码下结论。
