#!/usr/bin/env bash
# 视觉与无障碍验证：像素级对比度实测
#
# 为什么需要单独一套：test/ui/audit.js 的对比度是「按背景色逐层 alpha 合成」算出来的
# 近似值 —— getComputedStyle 拿不到 background-image，所以页面底下的极光渐变不参与
# 计算，对「压在玻璃上的文字」结论偏乐观。这里改成直接读截图像素：取文字实际压着的
# 那个颜色再算 WCAG 对比度，不受层数、模糊、渐变影响，是权威校验。
#
# ★ 为什么每个模块要量多个滚动位置：一次视口截图只有 844px 高，只量顶部会漏掉正文
#   深处的表格与卡片 —— 而「全玻璃」正是把那些承载面调透明了，漏测等于没测。
#
# 用法: bash tools/verify-visual.sh [--verbose]
# 退出码 0 表示全部达标。
cd "$(dirname "$0")/.." || exit 1
FAIL=0
OUT=preview/verify
mkdir -p "$OUT"
VERBOSE="${1:-}"

echo "构建：$(node src/build.js)"
echo

# 名称|hash|模式|填充脚本|滚动位置(逗号分隔)
CASES="
home-light|#/|light||0
home-dark|#/|dark||0
simplex-light|#/simplex|light|fill-sample.js|0,1400
simplex-dark|#/simplex|dark|fill-sample.js|0,1400
sens-light|#/sens|light|fill-sens.js|0,1400
sens-dark|#/sens|dark|fill-sens.js|0,1400
ip-light|#/ip|light|fill-ip.js|0,1400
ip-dark|#/ip|dark|fill-ip.js|0,1400
"

while IFS='|' read -r name hash mode fill offs; do
  [ -z "$name" ] && continue
  [ -z "$offs" ] && offs=0
  IFS=',' read -ra OFFS <<< "$offs"
  for off in "${OFFS[@]}"; do
    png="$OUT/vp-$name-$off.png"; json="$OUT/r-$name-$off.json"
    node tools/visual/shot-vp.js "index.html$hash" "$png" "$off" "$mode" "$fill" >/dev/null 2>&1
    if [ "$mode" = dark ]; then
      PROBE_FILL="$fill" node tools/visual/probe-color.js "index.html$hash" dark > "$json"
    else
      PROBE_FILL="$fill" node tools/visual/probe-color.js "index.html$hash" > "$json"
    fi
    res=$(python tools/visual/measure-contrast.py "$png" "$json" 2 "$off" 844 2>/dev/null)
    cnt=$(printf '%s\n' "$res" | grep -cE "OK |★不过")
    if printf '%s\n' "$res" | grep -qE "★不过"; then
      printf "%-18s scroll=%-5s 检查 %2s 项 : ★ 不达标\n" "$name" "$off" "$cnt"
      printf '%s\n' "$res" | grep "★不过" | sed 's/^/      /'
      FAIL=1
    else
      min=$(printf '%s\n' "$res" | grep -oE "[0-9]+\.[0-9]+ " | tr -d ' ' | sort -n | head -1)
      printf "%-18s scroll=%-5s 检查 %2s 项 : 全部达标（最低 %s）\n" "$name" "$off" "$cnt" "$min"
    fi
    if [ "$VERBOSE" = "--verbose" ]; then printf '%s\n' "$res" | sed 's/^/      /'; fi
  done
done <<< "$CASES"

echo
if [ $FAIL -eq 0 ]; then
  echo "像素级对比度：全部达标 ✓"
else
  echo "★ 有项目不达标，见上"
fi
exit $FAIL
