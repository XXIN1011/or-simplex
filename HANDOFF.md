# 交接文档 · 交给其他 Agent

> 这份文件是给**接手本项目的 AI agent** 看的。目标是：读完之后**第一时间找到文件、改对地方、把验证跑绿、顺利推上 GitHub**。
> 项目背景与算法说明在 `README.md`，本文件只讲**怎么动手**。

---

## 0. 一句话指令（可直接复制给其他 agent）

```
项目「运筹学计算器」在本机路径：C:\Users\Lenovo\.hermes\workspace\or-solver
（Git Bash / MSYS 写法：/c/Users/Lenovo/.hermes/workspace/or-solver）

请先完整读 HANDOFF.md 与 README.md，再动手改。
分支 main，远程 https://github.com/XXIN1011/or-simplex.git
线上 https://xxin1011.github.io/or-simplex/

硬性要求：
1) 只改源文件，改完必须 `node build.js` 重新生成 index.html —— index.html 是构建产物，不要手改。
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
> 「读入任意题目 → 规范化输出」的风格不一致。想放回首页：在 `template.html` 里
> `<!-- 动态规划模块暂不从首页露出 … -->` 那段注释的位置把 `<a class="modcard" href="#/dp">` 加回去即可。

---

## 2. 文件地图（哪些能改、哪些别碰）

### ✅ 源文件（要改就改这些）

| 文件 | 作用 |
|---|---|
| `template.html` | **页面骨架 + 全部 CSS**。三个 `#mod-*` 容器、`<script>` 占位符（`/*__XXX__*/`）、首页卡片都在这里 |
| `build.js` | 构建脚本。`SLOTS` 表定义「占位符 → 源文件」的映射与内联顺序 |
| `router.js` | hash 路由。新增模块要往 `MODULES` 数组里加名字 |
| `simplex-core.js` | 单纯形法核心（大 M 法、对偶解、灵敏度区间） |
| `sens-core.js` | 灵敏度分析核心（场景式 + 参数线性规划） |
| `dp-core.js` | 动态规划核心（通用递推引擎 + 五种题型） |
| `ip-core.js` | 整数规划核心（分枝定界 / 割平面 / 隐枚举 + 适用性判定） |
| `ui.js` / `sens-ui.js` / `dp-ui.js` / `ip-ui.js` | 各模块界面 |
| `input-panel.js` | 可复用输入表组件（`createInputPanel`）+ `addScrollHints` |
| `graph.js` | 图解法 SVG（整数规划会传第三个参数叠加整数格点） |
| `README.md` | 项目说明（功能、代码结构、构建与验证、正确性论证） |

### 🚫 构建产物（**绝对不要手改**）

| 文件 | 说明 |
|---|---|
| `index.html` | 由 `node build.js` 生成，是所有源码内联后的成品。改它 = 下次构建就没了 |

### 🔧 验证脚本（改完要跑，见第 6 节）

`verify-ui.js`（UI 回归，当前 **104 项**）· `audit.js`（触摸目标/对比度/表单标注）
`edge-test.js` · `test-simplex.js` · `dual-test.js` · `sens-test.js` · `scenario-test.js` · `param-test.js` · `dp-test.js` · `ip-test.js`（算法对拍）
`crosscheck*.py`（与 scipy/HiGHS 对拍）· `graph-bounds.js`（图解越界）· `probe-layout.js`（布局）
`shot.js`（手机视口截图）· `fill-*.js`（截图用的表单填充脚本）· `diagnose*.js`（排查辅助）

### 🙈 被 gitignore 的（克隆后**不存在**，见第 5 节的坑）

`random-bank.json` `dual-bank.json` `sens-bank.json` `scenario-bank.json` `param-bank.json`
（随机题库，由 node 脚本生成）· `*.png`（本地截图）· `device.json` `token.txt` `poll-token.py`（授权相关，**绝不入库**）

---

## 3. 第一次上手（三条命令）

```bash
cd /c/Users/Lenovo/.hermes/workspace/or-solver   # 或 cd "C:/Users/Lenovo/.hermes/workspace/or-solver"
git status                                        # 应为空（干净）
node build.js                                     # 期望输出：构建完成 index.html : 226.x KB
node verify-ui.js                                 # 期望输出：合计: 104 通过 / 0 失败
```

三条都通过 = 环境正常，可以开始改。

---

## 4. 构建流程（**每次改完源码都必须做**）

```bash
node build.js
```

它做的唯一一件事：把 `template.html` 里的 11 个占位符替换成对应源文件的全文，产出**根目录的 `index.html`**。

```
/*__CORE__*/      ← simplex-core.js      /*__DP_CORE__*/   ← dp-core.js
/*__SENS_CORE__*/ ← sens-core.js         /*__DP_UI__*/     ← dp-ui.js
/*__PANEL__*/     ← input-panel.js       /*__IP_CORE__*/   ← ip-core.js
/*__GRAPH__*/     ← graph.js             /*__IP_UI__*/     ← ip-ui.js
/*__UI__*/        ← ui.js                /*__ROUTER__*/    ← router.js
/*__SENS_UI__*/   ← sens-ui.js
```

**顺序有意义**：后者可以调用前者定义的全局函数（例如 `sens-ui.js` 会用 `simplex-core.js` 的 `fmtNum`）。插入新模块时，核心要排在界面之前、`router.js` 排最后。

### 新增一个模块要动四处

1. `template.html`：加 `<div class="mod" id="mod-xxx">…</div>` 容器，**并加两个 `<script>` 占位符**
2. `build.js`：往 `SLOTS` 里加两条映射（顺序要对）
3. `router.js`：把 `'xxx'` 加进 `MODULES`
4. `template.html` 首页：加一张 `<a class="modcard" href="#/xxx">` 卡片

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
node build.js                                  # 期望：构建完成 index.html : 226.x KB
node verify-ui.js                              # 期望：合计: 104 通过 / 0 失败
node edge-test.js                              # 期望：9 通过 / 0 失败
node test-simplex.js                           # 生成 random-bank.json
python crosscheck.py                           # 期望：不一致: 0 条
node dual-test.js                              # 生成 dual-bank.json
python crosscheck-dual.py                      # 期望：强对偶 通过 400 / 失败 0
node sens-test.js                              # 生成 sens-bank.json；期望：全部通过 ✓（区间不多不少）
python crosscheck-sens.py                      # 期望：结论: PASS
node scenario-test.js                          # 生成 scenario-bank.json
python crosscheck-scenario.py                  # 期望：结论: PASS
node param-test.js                             # 生成 param-bank.json
python crosscheck-param.py                     # 期望：结论: PASS
node dp-test.js                                # 期望：结论: PASS
node ip-test.js                                # 期望：结论: PASS（约 30 秒）
node graph-bounds.js index.html                # 期望：6 通过 / 0 越界
node audit.js "index.html"                     # 期望：触摸目标 0 个、对比度 0 个
node audit.js "index.html#/sens"               # 逐个模块都查一遍
node audit.js "index.html#/dp"
node audit.js "index.html#/ip"
```

`ip-test.js` 是随机用例，跑一次通过不代表没问题——**改动涉及整数规划时请连跑 3~5 次**（曾经有过随机偶发失败）。

### 6.2 只改了界面 / 样式

```bash
node build.js && node verify-ui.js && node audit.js "index.html" && node audit.js "index.html#/ip"
node graph-bounds.js index.html      # 改了 graph.js 或图解相关 CSS 才需要
```

### 6.3 只改了某个算法核心（最省的做法）

改哪个模块就跑它自己的套件 + 那一个模块的审查，例如整数规划：

```bash
node ip-test.js && node build.js && node verify-ui.js && node audit.js "index.html#/ip"
python crosscheck-param.py           # 若动了 simplex-core.js，几乎所有对拍都要重跑
```

> **动了 `simplex-core.js` 要特别小心**：灵敏度分析、动态规划、整数规划都依赖它，
> 必须跑完整套（对拍 2000 + 对偶 400 + 区间 + 场景 + 参数 + 整数规划）。

### 6.4 手机视口目视（UI 改动必做）

```bash
node shot.js "index.html#/ip" "out.png" 390 0 "@fill-ip-classic.js"     # 手机视口截图
node shot.js "index.html#ip"  "out.png" 390 0 "@fill-ip-classic.js" dark # 深色模式
```

`shot.js` 用法：`node shot.js <页面[#hash]|url> <输出png> <宽> <是否点求解> [@填充脚本] [dark]`
**注意**：不带 hash 时会**默认跳到 `#/simplex`**，要看首页请显式写 `"index.html#/"`。

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
3. **不要先改测试**。写一个最小复现脚本（参考 `diagnose-param-flaky.js` / `diagnose-param-283.js`
   的写法：从题库里捞出那道题 → 扫一个能触发的参数 → 把模块的「公式预测值」与「直接重算值」并排打出来）
4. 确认是引擎缺陷就修引擎；**只有确认测试写错了才改测试**，并在注释里写清为什么
5. 修完**连跑 10 次**确认稳定，再跑全量

同理：`ip-test.js` 里分枝定界有结点上限，触顶时它只保证「目前最好」而不是「最优」，
测试必须用 `complete` 标志区分，否则会误报（这个坑也踩过）。

### 6.6 排查辅助脚本（可复用）

| 脚本 | 用途 |
|---|---|
| `diagnose.js` / `diagnose-sens.js` | 单纯形法 / 灵敏度区间的排查 |
| `diagnose-ip.js` | 整数规划四种方法 vs 暴力枚举不一致时，打印题目与双方结果、验可行性 |
| `diagnose-enum.js` | 隐枚举的枚举表逐行核对（含 min 方向） |
| `diagnose-param-flaky.js` / `diagnose-param-283.js` | 参数 LP 的偶发失败复现与根因定位 |

---

## 7. 代码约定（必须遵守，否则会破坏项目风格）

1. **中文注释，且解释「为什么」而不是「是什么」。** 尤其是分支为什么存在（退化情形、边界条件）。
2. **ES5 风格**：`var`、`Array.prototype.forEach.call`、不用箭头函数 / `let` / `const`（核心源码与界面统一如此；验证脚本 `*.js` 测试文件可以用现代语法）。
3. **零依赖**：不引 CDN、不用 npm 包。所有算法自己实现（这是教学工具的意义，也便于以后翻译成 ArkTS 做鸿蒙原生）。
4. **单文件产物**：改完必须 `node build.js`。
5. **算法只有一份实现**：例如 `sens-core.js` 的建表逻辑刻意镜像 `simplex-core.js`，并由「建表一致性自检」逐元素比对防止分叉。要改算法核心时，先找找有没有第二份镜像。
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

### 已知的待办 / 可做的方向

1. **动态规划模块的形式改造**（最大的一个）：目前是「选题型填参数」，
   要改成与其它模块一致的「读入任意 DP 问题 → 规范化输出」。需要把
   「阶段 / 状态 / 决策 / 状态转移方程」做成通用输入形式。
2. 动态规划是不是要放回首页（等 1 完成）
3. 整数规划：用户可能会反馈某道真题的输出形式与教材不一致（分枝定界的树画法、割平面的表格排法），按反馈调整
4. 长期：打包成鸿蒙 HAP 上架华为应用市场（需要软著 300 元 + 4~5 个月审查 + APP 备案，用户已决定暂缓）

---

## 10. 绝对不要做的事

1. 🚫 **不要手改 `index.html`** —— 它是构建产物，改源码后 `node build.js` 会覆盖它。
2. 🚫 **不要引入任何外部依赖**（CDN、npm 包、字体文件）—— 这个项目要能离线单文件运行。
3. 🚫 **不要把 `token.txt` / `device.json` / 任何 token 提交进仓库**（已在 `.gitignore` 里，别去动它）。
4. 🚫 **不要往 Netlify 推** —— 已解绑删除；只用 GitHub Pages。
5. 🚫 **不要为了「让验证通过」而放宽验证标准** —— 验证脚本是这个项目质量的唯一保障，
   历史上每一个真缺陷（影子价格符号、灵敏度区间过宽、对偶比值漏 M 项、0-1 上界未加入、
   割平面新增列顶位右端项、隐枚举最小化比反了）都是它抓出来的。
   如果验证失败，**先怀疑代码，再怀疑测试**；确认是测试写错了再改测试，并在注释里写清原因。
6. 🚫 **不要声称「已完成 / 已推送 / 已生效」而不核实** —— 推送用 `git ls-remote` 核实远程 SHA，
   线上效果用 HTTP 取回内容或截图核实，不要凭工具返回码下结论。
