"""检查底部固定 tab 栏是否遮住页面末尾的内容（首页的 GitHub 链接）。
用法: python tools/visual/check-overlap.py <rects.json>

固定定位元素用 getBoundingClientRect 量到的是「视口坐标」，而其它元素量到的
是「文档坐标」（脚本里加了 scrollY）—— 两者不能直接比。要滚动到页面最底部
再比：那一刻文档坐标的视口位置 = y_doc - (scrollHeight - viewportHeight)。
"""
import json
import sys

d = json.load(open(sys.argv[1], encoding='utf-8'))
by = {i['sel']: i for i in d}
tb = by.get('.tabbar')
if not tb:
    print('没量到 .tabbar'); sys.exit(1)
vh, sh = tb['vh'], tb['sh']
max_scroll = max(0, sh - vh)
print('视口高 %d | 文档高 %d | 最大滚动 %d' % (vh, sh, max_scroll))
print('tabbar: 视口 y = %d..%d  (fixed=%s)' % (tb['y'], tb['y'] + tb['h'], tb['fixed']))
print()
bad = 0
for sel in ('.foottip', '.repolink', '.tabbar a.on'):
    it = by.get(sel)
    if not it:
        print('%-12s 未量到' % sel); continue
    # 滚到最底时，该元素在视口里的位置
    v_top = it['y'] - max_scroll
    v_bot = v_top + it['h']
    overlap = min(v_bot, tb['y'] + tb['h']) - max(v_top, tb['y'])
    ok = overlap <= 0
    if not ok:
        bad += 1
    print('%-12s 文档 y=%4d..%-4d | 滚到底时视口 y=%4d..%-4d | 与 tabbar 重叠 %s%d px  %s'
          % (sel, it['y'], it['y'] + it['h'], v_top, v_bot,
             '+' if overlap > 0 else '', max(0, overlap), 'OK' if ok else '★被遮住'))
print()
print('结论：%s' % ('存在遮挡' if bad else '无遮挡'))
