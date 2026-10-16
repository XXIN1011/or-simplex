---
version: 1
slug: "src-template-html"
primary_target: "src/template.html"
related_targets: ["src/styles/tokens.css","src/styles/components.css","src/styles/theme.css","src/styles/workspace.css"]
---

# 求解器全站界面

模式：Operate。范围：首页、四个计算模块、学习与历史控件、结果和设置。

## Direction contract

THESIS: 用户在视觉方案页选择标准现代工具界面，并指定 Apple 设置与系统工具为参考。以任务清晰度为主，使用熟悉的面板、按钮、表单与表格；不引入新的使用流程。

OWN-WORLD: 冷白页面、白色面板、蓝色主操作、中性细线；正文用系统中文无衬线，公式和数字使用等宽字体。浅色与深色共用一套语义令牌。

STORY: 首页选择算法，空白模型或示例输入，求解后先读结果、再查看逐步推导。草稿、历史和学习切换保持现有能力。

FIRST VIEWPORT: 匹配 preview/design-canon.html：390px 手机页左右约24px留白，紧凑品牌记号、28px标题、模块介绍与非药丸特性行；下方为四行模块索引，细线分隔、右侧方向箭头；双入口底栏保留。计算页顶部返回入口与标题，下方白色输入面板，蓝色求解按钮明确主操作。

FORM: 方案页 canon，由用户选择；seed:70c13106941a78a0。先前候选源依次为大学讲义、瑞士学术图表、学术会议日程、图书馆目录、校园课程索引、植物检索表、数学学会刊物；用户选择优先于抽签。其余目录挑战者留在未选池。

SIGNATURE: 已有底栏滑动指示器作为唯一连续位移动效；表格的入基列、出基行、枢轴格依旧使用语义蓝、琥珀和轮廓，保证可读且可对照。

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

检索依据：ui-ux-pro-max 两次整站检索未获得适配成人数学工具的完整视觉匹配，使用内置优先级作为通用依据；定向键盘焦点检索得到 Focus States 与 Focus Not Obscured。零依赖原生 HTML/CSS，无对应专用 stack，不套用 Tailwind。
