# 运筹学计算器

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

求解运筹学问题并展示可核查的计算过程。已有项目文档将教学、逐步理解算法作为核心用途。

## Operating Context

原生 HTML/CSS 与 ES5 JavaScript，构建为可离线使用的单文件 index.html。面向桌面浏览器和手机浏览器，不增加外部字体、CDN 或运行时依赖。

## Capabilities and Constraints

- 保留单纯形法、灵敏度分析、整数规划、指派问题、显示设置及现有题目历史、草稿和学习模式；新增运输问题（最小元素法 → MODI 与闭回路），复用相同基础能力。
- 本次用户确认允许更换整体视觉风格；旧玻璃与极光约定不再限制本次视觉设计。
- 现有模块的功能、数据、数学术语、DOM id 与事件契约保持；运输算法在 src/core 独立实现，维持 ES5 与 web → core 单向依赖。
- 首页五个模块入口、首页与设置底栏、三档主题和空白输入流程继续保留。
- 源文件修改后重新构建；必须运行项目验证及视觉检查。

## Evidence on Hand

HANDOFF.md、README.md、src/template.html、src/styles/ 和现有算法及浏览器回归测试。工作区已有尚未提交的题目历史等功能，不覆盖这些改动。

## Accessibility & Inclusion

中文界面；数字使用等宽及等宽数字；保持键盘焦点、至少 44px 的触摸目标、横向表格滚动及文字对比度。
