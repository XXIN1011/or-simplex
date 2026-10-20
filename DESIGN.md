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

运输模块 `#/transport` 延用 Operate 模式及现有主题：费用居中、供应在右、需求在底的运输表；供需状态即时可见，虚拟线路按零费用计算，在平衡预览与结果中以文字和底色共同标识。结果顺序为目标、剩余或缺货、最终方案，再到初始解及位势法逐步推导；宽表保持独立横向滚动。桌面与手机复用同一份数据、主题、草稿、历史及单步控件。

## Overview

运输原始输入表中的数字直接融入网格，无独立输入框边框；编辑和错误状态用内侧轮廓标识，仍保留 44px 触摸区域。输入说明采用短句，平衡预览折叠展示。结果表中的供需量与格内主数字字号、字重一致。位势检验使用同一张表：基格显示带细框的基变量运量，非基格显示检验数，行位势在右、列位势在底。

原始表的运费、供应量与需求量采用一致的数字字体和字重。闭回路的上一帧、播放、下一帧、重播、帧间隔与帧状态在同一行居中对齐；窄屏在控制栏内横向滚动，保持触摸尺寸。θ 展示为 min{负号格的调整前运量} = 确定值，不再展示 θΔ。最优性结论使用 Δ ≥ 0，判定、禁运说明与目标值分别成行。

最小元素分配及初始可行解表按当前快照标记：行供应或列需求耗尽后，该行或列的可运非基格以 × 划去；尚可分配的非基格留空。基格保留带框运量，含补入的零值基；禁运格仍写“禁运”。位势表及闭回路不沿用这些划去标记。

运输演示沿用实色表面与蓝色选中轮廓：最小元素分配用静态步骤表标出所选格、并列候选与剩余供需；格内版式按教材：左上角费用角标、运量居中、基变量在运量外套细方框、闭回路正负号写在运量左侧；连线从费用角标下方正交连接并带方向箭头，避免穿过居中数字。闭回路逐帧播放时，最后一个节点只连到该格，θ 帧才补闭合边；新增线段单独描边，已画好的连线保持静态，不再整条回路重放淡入。回路格按正负号分别用强调色与警示色的浅底，其他格在演示期间淡出。瓶颈行列用警告语义色与文字标识。演示不自动开始，不插值生成中间运量；播放完毕即停止，离开模块、隐藏步骤或折叠推导会暂停，编辑题目会销毁。减少动态效果模式保留完整的手动阶段。只有“状态确实在变”的步骤才拆帧：回路超过 6 格时逐格揭示会让窄屏反复横向滚动，改为整条回路一次标出；退化换基 θ=0 没有可视变化，与 θ 帧合并。位势法的行位势 u 固定在表最右列、列位势 v 在底行；位势与检验数保持整表静态，不逐帧披露。窄屏仅滚动表内，固定行名与供应列并定位当前格。首页五个模块处于同一导航列表，首尾圆角由实际位置决定，不依赖某个模块名称。

**Creative North Star: "清晰的系统工具"**

采用标准现代工具语言，参考 Apple 设置与系统工具的界面秩序。冷白与石板色承载页面，实色分组面板承载任务，蓝色指出操作、选中状态与关键数值。阅读重点是模型、结果和推导；视觉不改变既有算法或输入流程。

界面密度随内容而变：首页以五行分组索引建立选择顺序，计算页使用清晰的表单与可横向滚动的数表。中文采用系统无衬线，公式使用本地等宽字体，无外部字体、CDN 或运行时依赖。浅色与深色使用同一组语义角色，三档显示模式让当前选择保持可见。

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
- **表格网格**（`grid`）只用于产销平衡表 / 运输表的单元格分隔线：比 `line2` 深一档，与卡片底约 3.4:1、与表头 `soft` 底约 3.1:1，手机上也分得清格子；面板结构线不使用它。

**The Semantic Color Rule.** 状态颜色必须与文字、轮廓、圈选或位置标记共同出现；不得仅凭颜色区分入基、出基、枢轴或求解结论。

## Typography

**Body Font:** 系统中文无衬线，完整回退栈见前置令牌。标题沿用此栈，不加载独立展示字体。

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

空间节奏以 4 / 8 / 12 / 16 / 24 / 32px 为核心，控件与数据表允许现有的细粒度间距。面板默认内边距 20px，手机为 16px。历史列表始终将摘要放左、操作放右；600px 及以下时间单独成行，右侧恢复与删除按钮竖排；360px 及以下输入引导采用纵向。

指派矩阵页保留紧凑的辅助区：页头后 12px，输入引导底部外距 12px、内距 8px，草稿和历史区顶部 4px。各模块通过表格下方增减按钮编辑行列，不提供独立的自定义规模控件。顺序为矩阵、求解操作、长说明；缩短说明区间距时仍保留 44px 触摸目标。

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

### Problem History

历史折叠标题使用时钟图标与数量标记，展开后“清空记录”与标题共用一行。记录之间用细线分隔，桌面将题型、规模与时间并排，矩阵或目标数据作为次要预览；运输题另外列出供应、需求，预览中的空白输入按 0 显示，保存原文不变。恢复按钮使用淡蓝底，删除使用弱化的垃圾桶图标，悬停时才显示错误语义色。全部操作保持至少 44px 触摸尺寸；列表在自身区域滚动，不影响页面宽度。恢复、删除、清空确认及本地存储约定保持一致。

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

底栏随滚动让位：向下滚动（内容上移）时整条滑出屏幕并淡出，向上滚动累计超过 10px 才滑回；接近页面顶部 24px 内始终露出，切页必定恢复。退场 220ms 加速、入场 300ms `--ease-out`，只动 transform 与 opacity（不碰 bottom，避免逐帧重排）；隐藏时在动画结束后置 `visibility:hidden`，让两个入口退出 Tab 顺序。

显示设置提供跟随系统、浅色、深色三项等宽按钮；选中项为实色面板、阅读蓝文字与小阴影。首页五个模块使用整行链接、左对齐名称说明、右侧 SVG 箭头与细分隔线；鼠标悬停转柔和灰蓝，按下转淡蓝。

### Integer Branch Tree

整数规划的分枝定界树使用系统字体、真实结点按钮与辅助 SVG 连线。蓝色与“继续分枝”、绿色与“当时更新最好解”、较粗边框与“最终 / 当前最好结点”、中性色与剪枝原因、虚线与“未展开”共同表达状态；剪枝沿用正常搜索语义。缩放范围为 40%–200%：结构档（40%–60%）只显示编号、简短状态与最好标记；概览档（75%）增加实际访问序号和分枝条件；详情档（100% 起）显示松弛界值及完整处理结果，并随放大增大文字。最小字号保持 12px，操作目标至少 44px；320px 窄屏默认 40%，其他手机默认 50%，桌面默认 100%。缩放重新排布同一批结点与连线，保留当前视野附近的结点及图内滑动，不隐藏占位。按钮按实际访问顺序进入自然 Tab 顺序，定位后在原说明处提供返回入口，焦点显示沿用强调色轮廓。

### Numerical Tables

输入表保持 44px 控件，输出单纯形表正文 13px、表头 12px，以隔行浅底与边线帮助扫描。入基列用淡蓝，出基行用淡琥珀，枢轴格用琥珀淡底与 1.5px 内轮廓。指派矩阵保留圈定 0、删除线 0、禁止 ×；覆盖线以 3px 琥珀线横穿行列中心，标签使用不透明衬底维持文字清楚。解释与图例随表保留，横向滚动只发生在表格容器。

产销平衡表与运输表排成实线网格：每格只画右边和下边，整表补上边和左边，横竖两向同为 2px 且共用 `grid` 令牌，表头圆角改方以免网格线与圆角相争。线宽不用 1px（手机上会淡成一条）也不用 1.5px（Chrome 会舍入回 1px）。演示表横向滚动时固定行名列与供应列，固定列整块压住滚动内容，格内费用角标不得从固定列上方透出；滚动位置按格边界取整，避免半格和半个角标露在固定列旁。固定列外侧被裁掉的那一列属于正常滚动裁剪，不另行加遮罩或投影。

## 状态与维护入口

行为规则统一维护在 [交互约定](docs/交互约定.md)。组件状态样板已建立，执行 `npm run build` 后运行 `node tools/ui/component-states.js`，打开 `preview/component-states.html`；生成物随 `preview/` 忽略，不接入正式路由，也不访问真实草稿、历史或偏好。使用真实鼠标和 Tab 检查悬停、键盘焦点，页内按钮切换浅深色。

- 主按钮、次按钮沿用上述尺寸与状态；危险操作保留删除文字或可访问名称，历史清空保留确认。禁用按钮不位移，键盘焦点使用可见轮廓。
- 分段控件选中使用实色底、字重与 `aria-pressed`；数字框空白显示占位 0，有效输入保留原文，错误同时使用 `aria-invalid`、错误轮廓和求解反馈。运输格内错误仍使用内轮廓。
- 草稿反馈保持稳定，失败明确说明未能保存；历史以文字区分空、正常、损坏和不可用。读屏状态播报不逐字重复整段说明。
- 旧结果采用灰度及明确的“修改前题目”提示，避免整体低透明度使文字难读；整数、指派、运输及灵敏度按行为约定清除结果。最优、不可行、无界和未确认最优分别使用对应标题，未完成使用警告表现。
- 折叠区保留展开符号和可见焦点；学习及播放控件显示步数或帧数，首尾禁用并保留手动操作。底栏选中由颜色、字重与指示器共同表达，焦点控件避让固定底栏。

样式按 `tokens → components → theme → workspace` 构建：tokens 维护语义取值；components 维护通用结构与尺寸；theme 维护主题及交互状态；workspace 维护页面布局和模块特有表现。本轮移除通用错误边框的 `!important`，合并重复分段尺寸、禁用透明度与选择色规则，学习工具栏通过 `--card-pad` 控制内距。运输格内状态仍由模块样式负责，不合并数学语义不同的表格。

数学显示沿用既有规则：变量保留 x、s、a 及下标，目标值使用 z，单纯形检验数使用 σ，运输检验数使用 Δ；基变量以名称或细框表达，禁运以 M / 禁运文字表达，指派保留 ×。颜色必须配合文字、轮廓、正负号、圈选或位置标记。

输入中的分数原文保存在草稿中，求解时经 `number-input` 转换为 JavaScript 数值，并非全程精确有理数运算。显示沿用 `fmtNum`：绝对值小于 1e-9 显示 0；尝试分母不超过 200 的分数，匹配阈值为 1e-7；否则使用 6 位有效数字并去除尾随 0。本轮不改变计算容差或显示精度，不能从显示舍入反推数学状态。

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
