---
version: 1
slug: "src-template-html"
primary_target: "src/template.html"
related_targets: ["src/styles/tokens.css","src/styles/components.css","src/styles/theme.css","src/styles/workspace.css"]
---

# 求解器全站界面

模式：Operate。范围：首页、五个计算模块、学习与历史控件、结果和设置。

## Direction contract

THESIS: 采用标准现代工具界面，参考 Apple 设置与系统工具的信息组织方式。以任务清晰度为主，使用熟悉的面板、按钮、表单与表格；保持现有使用流程。

OWN-WORLD: 冷白页面、白色面板、蓝色主操作、中性细线；正文用系统中文无衬线，公式和数字使用等宽字体。浅色与深色共用一套语义令牌。

STORY: 首页选择算法，空白模型或示例输入，求解后先读结果、再查看逐步推导。草稿、历史和学习切换保持现有能力。

FIRST VIEWPORT: 390px 手机页左右约24px留白，紧凑品牌记号、28px标题、模块介绍与非药丸特性行；下方为五行模块索引，细线分隔、右侧方向箭头；保留双入口底栏。计算页顶部为返回入口与标题，下方白色输入面板，蓝色求解按钮明确主操作。

FORM: 使用实色分组面板、系统字体和语义颜色，具体令牌、组件与断点以 DESIGN.md 和实际样式为准。

SIGNATURE: 已有底栏滑动指示器作为唯一连续位移动效；表格的入基列、出基行、枢轴格依旧使用语义蓝、琥珀和轮廓，保证可读且可对照。

FINISH: 发布前完成界面回归、浅深主题和响应式检查，并使 DESIGN.md 与实现保持一致。

实现采用零依赖的原生 HTML/CSS；保持可见键盘焦点、焦点避让和现有表单事件契约。
