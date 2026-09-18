#!/usr/bin/env bash
# 视觉与无障碍验证：像素级对比度实测
#
# 为什么需要单独一套：test/ui/audit.js 的对比度是「按背景色逐层 alpha 合成」算出来的
# 近似值 —— getComputedStyle 拿不到 background-image，所以页面底下的极光渐变不参与
# 计算，对「压在玻璃上的文字」结论偏乐观。这里改成直接读截图像素：取文字实际压着的
# 那个颜色再算 WCAG 对比度，不受层数、模糊、渐变影响，是权威校验。
#
# 用法: bash tools/verify-visual.sh
# 退出码 0 表示全部达标。
cd "$(dirname "$0")/.." || exit 1
FAIL=0

shot() { node tools/visual/shot-vp.js "$1" "$2" "$3" "$4" "$5" >/dev/null 2>&1; }
probe() {   # $1=hash $2=输出json $3=dark? $4=填充脚本
  if [ "$3" = dark ]; then
    PROBE_FILL="$4" node tools/visual/probe-color.js "index.html$1" dark > "$2"
  else
    PROBE_FILL="$4" node tools/visual/probe-color.js "index.html$1" > "$2"
  fi
}

OUT=preview/verify; mkdir -p "$OUT"
echo "构建：$(node src/build.js)"

check() {   # $1=名字 $2=hash $3=dark? $4=填充脚本
  local name="$1" hash="$2" mode="$3" fill="$4" png json
  png="$OUT/vp-$name.png"; json="$OUT/r-$name.json"
  shot "index.html$hash" "$png" 0 "$mode" "$fill"
  probe "$hash" "$json" "$mode" "$fill"
  echo
  echo "===== $name ====="
  local res
  res=$(python tools/visual/measure-contrast.py "$png" "$json" 2 0 844 2>/dev/null)
  echo "$res" | grep -E "★不过|不达标|全部达标"
  echo "$res" | grep -qE "★不过|不达标" && FAIL=1
  return 0
}

check home-light       "#/"        ""     ""
check home-dark        "#/"        dark   ""
check simplex-light    "#/simplex" ""     fill-sample.js
check simplex-dark     "#/simplex" dark   fill-sample.js
check sens-light       "#/sens"    ""     fill-sens.js
check sens-dark        "#/sens"    dark   fill-sens.js
check ip-light         "#/ip"      ""     fill-ip.js
check ip-dark          "#/ip"      dark   fill-ip.js

echo
if [ $FAIL -eq 0 ]; then
  echo "像素级对比度：全部达标 ✓"
else
  echo "★ 有项目不达标，见上"
fi
exit $FAIL
