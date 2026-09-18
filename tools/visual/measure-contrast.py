"""像素级对比度实测：把截图里「文字实际压着的那个颜色」量出来，再算 WCAG 对比度。

用法:
  python tools/visual/measure-contrast.py <截图.png> <rects.json> [dpr] [scrollY] [viewH]
    给了 scrollY/viewH 时，按「只截视口」的截图处理：不在视口内的元素跳过。

为什么不信 audit.js 的旧算法：它沿祖先链找第一个 alpha>0.9 的背景色，不做合成。
页面一旦有半透明玻璃层，它就会跳过玻璃、拿更低的底色去算 —— 数字看着还行，
其实和眼睛看到的没关系。这里改为直接读截图像素。

取底色的两个坑（都踩过，都写在这里）：
  1) 对元素框取众数会被字形带偏。中文粗体字块在框内占比很高，众数可能落在
     墨色上（实测把底色量成 #0c1420、与文字色 #0f1623 几乎相同，算出 1.02 的假告警）。
  2) 改成取「外圈」（框外扩几像素）之后，对紧凑控件又会失效：按钮之间只有 7px
     间隙，外圈采到的基本是邻按钮和空白（把蓝底白字的分段控件量成 #fcfcfc + #fff）。
  → 最终方案：取元素框「内圈」像素的众数。对文字块，上下边内侧是行距留白，
    必是底色；对按钮/胶囊，内圈就是它自己的底色。两条都成立。
"""
import json
import sys
from collections import Counter

from PIL import Image

SKIP = object()


def rel_lum(rgb):
    def f(v):
        v /= 255.0
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (f(c) for c in rgb[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(a, b):
    l1, l2 = rel_lum(a), rel_lum(b)
    if l1 < l2:
        l1, l2 = l2, l1
    return (l1 + 0.05) / (l2 + 0.05)


def parse_color(s, bg):
    """CSS color -> RGB；带 alpha 的与传入的 bg 做合成。"""
    import re
    nums = [float(x) for x in re.findall(r'[\d.]+', (s or '').strip())]
    if len(nums) < 3:
        return None
    rgb = nums[:3]
    a = nums[3] if len(nums) > 3 else 1.0
    if a < 1.0 and bg:
        rgb = [rgb[i] * a + bg[i] * (1 - a) for i in range(3)]
    return rgb


def inner_ring_color(im, box, dpr=2.0, border_css=0.0):
    """取元素框「内圈」像素的众数 ≈ 该元素自己的底色。

    border_css 是该元素的边框宽度（CSS px）。必须把它跳过去：
    边框是一圈**均匀**颜色，而半透明元素的底色往往是一段**渐变** —— 取众数时
    均匀的那一方会赢。实测踩过：求解按钮的 1px 蓝描边压过了它内部的淡蓝玻璃底，
    把底色量成 #2460e8（正好是描边色），算出 1.25:1 的假告警。
    """
    W, H = im.size
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    if w < 2 or h < 2:
        return None
    # 起采位置：跳过边框；带宽取元素短边的 22%，夹在 [3, 9] 设备像素之间
    start = int(round(border_css * dpr)) + 1
    span = int(max(3, min(9, min(w, h) * 0.22)))
    pts = []
    for yy in range(y0, y1):
        for xx in range(x0, x1):
            d = min(xx - x0, x1 - 1 - xx, yy - y0, y1 - 1 - yy)
            if start <= d <= start + span:
                pts.append(im.getpixel((xx, yy)))
    if not pts:
        pts = list(im.crop(box).convert('RGB').getdata())
    if not pts:
        return None
    q = Counter(((r >> 2) << 2, (g >> 2) << 2, (b >> 2) << 2) for r, g, b in pts)
    return q.most_common(1)[0][0]


def main():
    png, rects_json = sys.argv[1], sys.argv[2]
    dpr = float(sys.argv[3]) if len(sys.argv) > 3 else 2.0
    scroll = float(sys.argv[4]) if len(sys.argv) > 4 else None
    viewh = float(sys.argv[5]) if len(sys.argv) > 5 else 844.0

    im = Image.open(png).convert('RGB')
    items = json.load(open(rects_json, encoding='utf-8'))

    print('%-26s %-20s %-9s %-9s %-6s %s' % ('选择器', '文字', '实测底色', '文字色', '对比度', '判定'))
    print('-' * 100)
    fails, skipped = [], 0
    for it in items:
        top_css, h_css = it['y'], it['h']
        if scroll is not None:
            # 视口截图：元素必须完整落在当前视口窗口内
            if top_css < scroll - 0.5 or top_css + h_css > scroll + viewh + 0.5:
                skipped += 1
                continue
            y = int((top_css - scroll) * dpr)
        else:
            y = int(top_css * dpr)
        x = int(it['x'] * dpr)
        w, h = max(1, int(it['w'] * dpr)), max(1, int(it['h'] * dpr))
        if y < 0 or y >= im.size[1]:
            skipped += 1
            continue
        box = (x, y, min(x + w, im.size[0]), min(y + h, im.size[1]))
        bg = inner_ring_color(im, box, dpr, float(it.get('bw') or 0))
        if bg is None:
            skipped += 1
            continue
        fg = parse_color(it['color'], list(bg))
        if fg is None:
            skipped += 1
            continue
        ratio = contrast(fg, list(bg))
        big = it['fs'] >= 24 or (it['fs'] >= 18.66 and int(it['fw'] or 400) >= 700)
        need = 3.0 if big else 4.5
        ok = ratio >= need
        if not ok:
            fails.append((it['sel'], ratio, need))
        print('%-26s %-20s #%02x%02x%02x  #%02x%02x%02x  %5.2f   %s (需 %.1f)' % (
            it['sel'], it['text'][:18], bg[0], bg[1], bg[2],
            int(fg[0]), int(fg[1]), int(fg[2]), ratio,
            'OK  ' if ok else '★不过', need))
    print()
    if skipped:
        print('（跳过 %d 个不在视口内的元素）' % skipped)
    if fails:
        print('不达标 %d 处：%s' % (len(fails), ', '.join('%s(%.2f<%.1f)' % f for f in fails)))
        return 1
    print('全部达标 ✓')
    return 0


if __name__ == '__main__':
    sys.exit(main())
