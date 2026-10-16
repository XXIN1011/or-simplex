---
name: 运筹学计算器
description: 以清晰输入、可读数字与可核查过程为中心的系统工具界面
colors:
  fg: "#182230"
  fg2: "#536174"
  fg3: "#657287"
  line: "#dce2eb"
  line2: "#c4cdd9"
  control-line: "#8491a3"
  bg: "#f5f7fa"
  card: "#fff"
  input: "#fff"
  soft: "#f1f4f9"
  zebra: "#fafbfd"
  accent: "#2563eb"
  accent-hi: "#5b8cf7"
  accent-soft: "#eef4ff"
  accent-text: "#1d4ed8"
  button-bg: "#2563eb"
  button-fg: "#fff"
  leave-soft: "#fff5e9"
  pivot: "#f59e0b"
  pivot-soft: "#fef3c7"
  violet: "#7c3aed"
  violet-soft: "#f4f0ff"
  ok: "#116b33"
  ok-soft: "#eefbf2"
  warn: "#b45309"
  warn-soft: "#fff8ea"
  err: "#c02626"
  err-soft: "#fef3f2"
  dark-fg: "#ecf0f7"
  dark-fg2: "#adb8cb"
  dark-fg3: "#9aa8be"
  dark-line: "#303948"
  dark-line2: "#46546a"
  dark-control-line: "#6b7c94"
  dark-bg: "#0d1016"
  dark-card: "#151a23"
  dark-input: "#1c222d"
  dark-soft: "#1b212c"
  dark-zebra: "#181e28"
  dark-accent: "#7aa2ff"
  dark-accent-hi: "#a3bdff"
  dark-accent-soft: "#1b2740"
  dark-accent-text: "#9ab8ff"
  dark-button-bg: "#9ab8ff"
  dark-button-fg: "#10182a"
  dark-leave-soft: "#2e2416"
  dark-pivot: "#fbbf24"
  dark-pivot-soft: "#3d320f"
  dark-violet: "#b79bff"
  dark-violet-soft: "#241d3a"
  dark-ok: "#4ade80"
  dark-ok-soft: "#0f2a1c"
  dark-warn: "#fbbf24"
  dark-warn-soft: "#2f2710"
  dark-err: "#f87171"
  dark-err-soft: "#301a1a"
typography:
  headline:
    fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","HarmonyOS Sans SC","PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","HarmonyOS Sans SC","PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.4
  body:
    fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","HarmonyOS Sans SC","PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","HarmonyOS Sans SC","PingFang SC","Microsoft YaHei",sans-serif'
    fontSize: "12px"
    fontWeight: 650
  formula:
    fontFamily: 'ui-monospace,"SF Mono","Cascadia Mono",Consolas,"Courier New",monospace'
    fontSize: "12.5px"
    lineHeight: 1.95
rounded:
  sm: "8px"
  default: "10px"
  lg: "14px"
  xl: "16px"
spacing:
  s1: "4px"
  s2: "8px"
  s3: "12px"
  s4: "16px"
  s5: "24px"
  s6: "32px"
components:
  button-primary:
    backgroundColor: "{colors.button-bg}"
    textColor: "{colors.button-fg}"
    rounded: "{rounded.default}"
    padding: "12px 16px"
  button-primary-hover:
    backgroundColor: "{colors.accent-text}"
    textColor: "{colors.button-fg}"
  button-secondary:
    backgroundColor: "{colors.input}"
    textColor: "{colors.fg}"
    rounded: "{rounded.default}"
    padding: "8px 13px"
  numeric-input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.fg}"
    rounded: "{rounded.sm}"
    padding: "0 2px"
    width: "58px"
    height: "44px"
  panel:
    backgroundColor: "{colors.card}"
    textColor: "{colors.fg}"
    rounded: "{rounded.lg}"
    padding: "20px"
  status-tag:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
    rounded: "999px"
    padding: "3px 10px"
  module-row:
    backgroundColor: "{colors.card}"
    textColor: "{colors.fg}"
    padding: "20px 16px"
  bottom-nav:
    backgroundColor: "{colors.card}"
    textColor: "{colors.fg2}"
    rounded: "{rounded.xl}"
    padding: "5px"
---

# Design System: 运筹学计算器

运输模块 `#/transport` 延用 Operate 模式及现有主题：费用居中、供应在右、需求在底的运输表；供需状态即时可见，处理费 / 罚金放在折叠配置中，虚拟线路在平衡预览与结果中以文字和底色共同标识。结果顺序为目标、真实费用 / 收益及罚金、剩余或缺货、最终方案，再到初始解及 MODI 逐步推导；宽表保持独立横向滚动。桌面与手机复用同一份数据、主题、草稿、历史及单步控件。

## Overview

**Creative North Star: "清晰的系统工具"**

采用用户确认的标准现代工具语言，参考 Apple 设置与系统工具的熟悉秩序。冷白与石板色承载页面，实色分组面板承载任务，蓝色指出操作、选中状态与关键数值。阅读重点是模型、结果和推导；视觉不改变既有算法或输入流程。

界面密度随内容而变：首页以四行分组索引建立选择顺序，计算页使用清晰的表单与可横向滚动的数表。中文采用系统无衬线，公式使用本地等宽字体，无外部字体、CDN 或运行时依赖。浅色与深色使用同一组语义角色，三档显示模式让当前选择保持可见。

**Key Characteristics:**
- 实色分组面板、细分隔线、克制阴影。
- 蓝色操作与中性正文，数学状态使用有意义的颜色和形状。
- 可读数表、清晰焦点与适合触摸的控件。
- 首页与设置双入口底栏，连续位移只服务底栏选中指示器。

依据：`src/styles/tokens.css` 定义令牌，`components.css` 定义基础组件，`theme.css` 覆盖最终状态，`workspace.css` 定义工作区与断点；`src/template.html` 定义入口、说明及导航结构。实现细节与本文件冲突时，应先核查这四层样式的实际级联。

## Colors

主色是清晰的工具蓝；灰蓝中性色维持安静的页面层次，状态色保留数学与反馈语义。前置令牌表中的 `dark-` 项对应 `html[data-theme="dark"]` 对同名 CSS 变量的覆盖；组件仍使用原始语义变量，不根据主题复制组件。

### Primary

- **工具蓝**（`accent`）：焦点、可操作提示、图解可行域与重要数值。
- **阅读蓝**（`accent-text`）：小字号链接、分段选中项、数值端点；避免把较亮的装饰蓝直接用作浅底小字。
- **淡蓝承载面**（`accent-soft`）：选中指示器、入基列与过程标签。
- **主操作对**（`button-bg` / `button-fg`）：浅色为蓝底白字，深色为浅蓝底深字；保持这对语义角色一起切换。

### Secondary

- **计算琥珀**（`pivot` / `pivot-soft` / `leave-soft`）：枢轴与出基行；警告角色用 `warn` / `warn-soft`。
- **矩阵紫**（`violet` / `violet-soft`）：指派输入列头的既有识别角色，不扩展为第二套主操作色。
- **解状态绿与错误红**（`ok` / `err` 及各自淡底）：最优结论、成功圈选、输入错误与不可行反馈。

### Neutral

- **页面冷白**（`bg`）、**实色面板**（`card`）、**输入承载面**（`input`）区分背景、阅读与编辑区域。
- **柔和灰蓝**（`soft`）与**隔行浅底**（`zebra`）承载表头、辅助块和数表行序。
- **正文石板**（`fg`）、**次要说明**（`fg2`）、**弱提示**（`fg3`）形成文字层次。
- **细分隔**（`line`）、**较强分隔**（`line2`）、**控件边界**（`control-line`）分担结构线与输入边界。

**The Semantic Color Rule.** 状态颜色必须与文字、轮廓、圈选或位置标记共同出现；不得仅凭颜色区分入基、出基、枢轴或求解结论。

## Typography

**Body Font:** 本机系统中文无衬线，完整回退栈见前置令牌。标题沿用此栈，不加载独立展示字体。

**Label/Mono Font:** 公式采用本地等宽字体栈；表格、输入与解值使用 `tabular-nums`。一般数表仍使用正文栈，不要求所有数字改为等宽字体。

**Character:** 字号、字重与留白建立层级。标题紧凑，长说明舒展，数字保持稳定的横向对齐。

### Hierarchy

- **Headline**：移动端页面标题（28px / 700 / 1.3）；普通模块在 768px 起为 32px，首页在 1000px 起为 36px。
- **Title**：模块索引名称（18px / 650 / 1.4）；结果章节（16px / 700），算法收纳标题（16.5px / 700）。
- **Body**：全局基准见前置令牌；实际说明多为 13–14px，约 1.65–1.8 行高。首页模块说明最大 65ch，主介绍最大 42em。
- **Label**：表头和标签主要为 12px / 650，说明常为 12–12.5px；上下标保留至少 12px。
- **Formula**：标准化表达式（12.5px / 1.95），保留空格并允许换行。
- **Solution**：关键解值（18px / 700 / 1.85），采用等宽数字。

**The Readable Numbers Rule.** 宽表通过横向滚动容纳列，不能靠持续缩小数字塞满手机视口。

## Layout

使用居中单列工作区，默认最大宽度为 820px；1000px 起为 1000px，1100px 起外层为 1240px，首页、整数规划、灵敏度与指派页面保持最大 1000px，设置页最大 680px。单纯形页面仅在已有结果且视口至少 1100px 时采用左右栏：左栏 340–420px，栏距 24px，右栏容纳结果。

默认外层上边距 24px、左右 20px；480px 及以下左右 16px，首页另加左右 8px，形成约 24px 的首页阅读边界。768px 起顶部留白 40px。底部保留 `108px + env(safe-area-inset-bottom)`，固定底栏位于 `10px + env(safe-area-inset-bottom)`，滚动焦点还保留底部避让空间。

空间节奏以 4 / 8 / 12 / 16 / 24 / 32px 为核心，控件与数据表允许现有的细粒度间距。面板默认内边距 20px，手机为 16px。历史列表在 480px 及以下改为上下排列，操作右对齐；360px 及以下输入引导采用纵向。

指派矩阵页保留紧凑的辅助区：页头后 12px，输入引导底部外距 12px、内距 8px，规模、草稿和历史区顶部 4px。顺序为矩阵、求解操作、长说明；缩短说明区间距时仍保留 44px 触摸目标。

## Elevation & Depth

以实色明度和细线分层，常规面板无投影。分段控件选中项以小阴影形成可按压的独立面；浮动底栏用单层柔和阴影与正文区分。禁止把旧玻璃、极光或大面积模糊重新作为界面材质。

### Shadow Vocabulary

- **静态面板**：`--shadow-1: none`。
- **分段选中项**：`0 1px 3px rgba(15,22,35,.12)`。
- **浮动导航**：`0 6px 24px -12px rgba(15,22,35,.32)`。
- **输入焦点**：浅色 `0 0 0 3px rgba(37,99,235,.20)`，深色 `0 0 0 3px rgba(122,162,255,.28)`；同时保留键盘可见轮廓。

**The Solid Surface Rule.** 输入、历史与结果保持不透明实色承载面，阴影只强调实际存在的层级与选中状态。

## Shapes

输入框使用小圆角（8px），按钮与结果工作块使用中圆角（10px），输入面板、帮助及算法收纳区使用大圆角（14px），底栏使用更柔和外轮廓（16px）。分段按钮为 7px，底栏内部选中块为 11px。首页分组列表仅首行上角与末行下角圆润，中间以直线衔接。

状态标签保留药丸形，算法编号与指派圈选保留圆形；这些形状有具体语义。首页特性行采用普通文字，不把所有短语做成胶囊。

## Components

### Buttons

主操作清楚、次操作紧凑。普通按钮至少 44px 高，主求解按钮至少 48px 高；主操作通常填满操作行。普通按钮使用输入底、较强分隔边框与正文色；主按钮使用 `button-bg` / `button-fg`。鼠标悬停时普通按钮转柔和底，主按钮浅色转阅读蓝、深色转 `accent-hi`；按下轻移 1px，禁用透明度为 .45 且不位移。键盘轮廓为强调色 2px、外扩 2px。

### Chips

过程标签为小字号、轻量淡底；完成与中止标签切换成功或警告语义。基变量小标签使用较小圆角（6px），不将纯信息标签表现为可点击按钮。

### Cards / Containers

面板用实色 `card`、1px 细边、14px 圆角、默认 20px 内距，手机 16px。结果内的普通卡片收紧为 10px 圆角。结论块用成功、错误或警告边框和相应淡底，并以文字标题明确状态。折叠说明和算法面板保留 `details` / `summary` 的展开状态。

### Inputs / Fields

数字框为 58 × 44px，居中、16px 字号；小型场景框宽 52px。关系选择器与数字框等高，输入边界使用 `control-line`。空输入以弱提示色显示占位 0。焦点同时使用蓝色边框、焦点环及键盘轮廓；错误由 `aria-invalid="true"` 的红边与红色内轮廓表达。

### Navigation

底栏只有首页与设置两项。每项至少 80px 宽、50px 高，SVG 图标 19px、文字 12px；选中项为阅读蓝与较重文字，淡蓝指示器独立滑动。位移与宽度用 300ms `cubic-bezier(0,0,.58,1)`，透明度用 200ms linear。其他控件以颜色、边框的短过渡为主；辅助箭头可旋转。减少动态效果时关闭过渡、动画与平滑滚动。

显示设置提供跟随系统、浅色、深色三项等宽按钮；选中项为实色面板、阅读蓝文字与小阴影。首页四个模块使用整行链接、左对齐名称说明、右侧 SVG 箭头与细分隔线；鼠标悬停转柔和灰蓝，按下转淡蓝。

### Numerical Tables

输入表保持 44px 控件，输出单纯形表正文 13px、表头 12px，以隔行浅底与边线帮助扫描。入基列用淡蓝，出基行用淡琥珀，枢轴格用琥珀淡底与 1.5px 内轮廓。指派矩阵保留圈定 0、删除线 0、禁止 ×；覆盖线以 3px 琥珀线横穿行列中心，标签使用不透明衬底维持文字清楚。解释与图例随表保留，横向滚动只发生在表格容器。

## Do's and Don'ts

### Do:

- **Do** 复用语义颜色变量，并同时核查浅色与深色状态。
- **Do** 用细分隔、实色背景、字号与留白建立层级。
- **Do** 保持普通控件至少 44px、主求解按钮至少 48px，并给固定底栏留出滚动空间。
- **Do** 保留可见键盘焦点、横向表格滚动及数学状态的文字或形状提示。
- **Do** 让紧凑矩阵页的长说明位于求解操作之后。

### Don't:

- **Don't** 恢复玻璃模糊、极光背景或用装饰阴影覆盖数字阅读面。
- **Don't** 只凭颜色表达计算状态，或缩小数字来消除宽表滚动。
- **Don't** 给首页特性文字增加无交互意义的药丸容器。
- **Don't** 把主题切换改为无法直接看见三档选择的循环按钮。
