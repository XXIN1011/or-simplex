/* =========================================================================
   图解法：当决策变量恰好 2 个时，用 SVG 画出可行域、目标函数等值线与最优解
   ---------------------------------------------------------------------------
   思路：把「视口矩形的四条边」也当成约束加进去，于是可行域被限制成有界多边形，
   顶点有限、直接求凸包即可，不必单独写多边形裁剪。
   ========================================================================= */

var format = require('../core/format.js');
var fmtNum = format.fmtNum;
var renderGraph = (function () {
  'use strict';

  var W = 330, H = 250;
  var PL = 36, PR = 14, PT = 12, PB = 26;

  /* 两直线求交：a1x+b1y=c1 与 a2x+b2y=c2 */
  function solve2(a1, b1, c1, a2, b2, c2) {
    var d = a1 * b2 - a2 * b1;
    if (Math.abs(d) < 1e-12) return null;
    return { x: (c1 * b2 - c2 * b1) / d, y: (a1 * c2 - a2 * c1) / d };
  }

  /* 选一个好看的刻度间隔（1/2/5 × 10ⁿ） */
  function niceStep(range) {
    var raw = range / 5;
    if (!(raw > 0)) return 1;
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var n = raw / mag;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * mag;
  }

  function dedupe(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var dup = false;
      for (var j = 0; j < out.length; j++) {
        if (Math.abs(out[j].x - pts[i].x) < 1e-7 && Math.abs(out[j].y - pts[i].y) < 1e-7) { dup = true; break; }
      }
      if (!dup) out.push(pts[i]);
    }
    return out;
  }

  function feasible(p, cons) {
    if (p.x < -1e-7 || p.y < -1e-7) return false;
    for (var k = 0; k < cons.length; k++) {
      var c = cons[k];
      var lhs = c.coef[0] * p.x + c.coef[1] * p.y;
      var tol = 1e-7 * Math.max(1, Math.abs(c.rhs));
      if (c.rel === '<=' && lhs > c.rhs + tol) return false;
      if (c.rel === '>=' && lhs < c.rhs - tol) return false;
      if (c.rel === '=' && Math.abs(lhs - c.rhs) > tol) return false;
    }
    return true;
  }

  /* Andrew's monotone chain 凸包 */
  function hull(pts) {
    if (pts.length < 3) return pts.slice();
    var p = pts.slice().sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    function cr(o, a, b) { return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x); }
    var lo = [], up = [], i;
    for (i = 0; i < p.length; i++) {
      while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p[i]) <= 1e-12) lo.pop();
      lo.push(p[i]);
    }
    for (i = p.length - 1; i >= 0; i--) {
      while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p[i]) <= 1e-12) up.pop();
      up.push(p[i]);
    }
    lo.pop(); up.pop();
    return lo.concat(up);
  }

  /* 直线 a x + b y = c 落在矩形内的那一段（返回两个端点） */
  function lineInRect(a, b, c, x1, y1, x2, y2) {
    var pts = [];
    if (Math.abs(b) > 1e-12) {
      [x1, x2].forEach(function (x) {
        var y = (c - a * x) / b;
        if (y >= y1 - 1e-9 && y <= y2 + 1e-9) pts.push({ x: x, y: y });
      });
    }
    if (Math.abs(a) > 1e-12) {
      [y1, y2].forEach(function (y) {
        var x = (c - b * y) / a;
        if (x >= x1 - 1e-9 && x <= x2 + 1e-9) pts.push({ x: x, y: y });
      });
    }
    pts = dedupe(pts);
    if (pts.length < 2) return null;
    var best = [pts[0], pts[1]], bd = -1;
    for (var i = 0; i < pts.length; i++) {
      for (var j = i + 1; j < pts.length; j++) {
        var d = Math.pow(pts[i].x - pts[j].x, 2) + Math.pow(pts[i].y - pts[j].y, 2);
        if (d > bd) { bd = d; best = [pts[i], pts[j]]; }
      }
    }
    return best;
  }

  function n1(v) { return (+v).toFixed(1); }

  /* 主入口：返回 { svg, caption } ；不适用（非 2 变量 / 无约束 / 无可行解）时返回 null */
  /* ip 是可选参数：整数规划模块用它把「整数格点」和「最优整数解」一起画出来。
     ip = { best: [x1, x2] }，给了就在可行域上叠加格点，并把最优整数解单独标出。 */
  function renderGraph(prob, res, ip) {
    var cons = prob.constraints || [];
    if (prob.c.length !== 2 || cons.length === 0) return null;
    if (res.status === 'infeasible') return null;

    /* ---- 1. 收集候选坐标值（用 90 分位，避免个别大数把图压扁） ---- */
    var xs = [], ys = [];
    cons.forEach(function (k) {
      if (Math.abs(k.coef[0]) > 1e-12) { var v = k.rhs / k.coef[0]; if (v > 0) xs.push(v); }
      if (Math.abs(k.coef[1]) > 1e-12) { var w = k.rhs / k.coef[1]; if (w > 0) ys.push(w); }
    });
    for (var i = 0; i < cons.length; i++) {
      for (var j = i + 1; j < cons.length; j++) {
        var q = solve2(cons[i].coef[0], cons[i].coef[1], cons[i].rhs,
                       cons[j].coef[0], cons[j].coef[1], cons[j].rhs);
        if (q && isFinite(q.x) && isFinite(q.y) && q.x > 1e-9 && q.y > 1e-9) {
          xs.push(q.x); ys.push(q.y);
        }
      }
    }
    if (res.solution && res.solution.length === 2) {
      if (res.solution[0] > 0) xs.push(res.solution[0]);
      if (res.solution[1] > 0) ys.push(res.solution[1]);
    }
    function pick(arr, fb) {
      if (!arr.length) return fb;
      var a = arr.slice().sort(function (p, r) { return p - r; });
      var v = a[Math.min(a.length - 1, Math.floor(a.length * 0.9))];
      return v > 0 ? v : fb;
    }

    /* ---- 2. 求「视口矩形内的可行域」顶点：把四条边也当成约束加进去 ---- */
    function vertsOf(xmax, ymax) {
      var ext = cons.concat([
        { coef: [1, 0], rel: '<=', rhs: xmax },
        { coef: [0, 1], rel: '<=', rhs: ymax },
        { coef: [1, 0], rel: '>=', rhs: 0 },
        { coef: [0, 1], rel: '>=', rhs: 0 }
      ]);
      var cand = [];
      for (var a = 0; a < ext.length; a++) {
        for (var b2 = a + 1; b2 < ext.length; b2++) {
          var pt = solve2(ext[a].coef[0], ext[a].coef[1], ext[a].rhs,
                          ext[b2].coef[0], ext[b2].coef[1], ext[b2].rhs);
          if (pt && isFinite(pt.x) && isFinite(pt.y) && feasible(pt, cons)) cand.push(pt);
        }
      }
      return hull(dedupe(cand));
    }

    /* 第一遍用较宽松的范围（约束截距可能远大于实际可行范围），
       拿到真实顶点后再用它收紧视图，图才不会被大片空白挤扁 */
    var bx = pick(xs, 10) * 1.6, by = pick(ys, 10) * 1.6;
    var probeVerts = vertsOf(bx, by);
    var xmax = bx, ymax = by;
    if (probeVerts.length >= 3) {
      var mx = 0, my = 0;
      probeVerts.forEach(function (p) { if (p.x > mx) mx = p.x; if (p.y > my) my = p.y; });
      if (mx > 0 && my > 0) { xmax = mx * 1.18; ymax = my * 1.18; }
    }
    var verts = vertsOf(xmax, ymax);
    if (verts.length < 2) return null;

    /* ---- 3. 坐标变换 ---- */
    var pw = W - PL - PR, ph = H - PT - PB;
    var scale = Math.min(pw / xmax, ph / ymax);
    function sx(x) { return PL + x * scale; }
    function sy(y) { return H - PB - y * scale; }

    var out = [];
    out.push('<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="图解法">');

    /* ③ 网格 + 刻度 */
    var stepx = niceStep(xmax), stepy = niceStep(ymax);
    for (var gx = stepx; gx <= xmax + 1e-9; gx += stepx) {
      out.push('<line class="g-grid" x1="' + n1(sx(gx)) + '" y1="' + n1(sy(0)) +
               '" x2="' + n1(sx(gx)) + '" y2="' + n1(sy(ymax)) + '"/>');
      out.push('<text x="' + n1(sx(gx)) + '" y="' + n1(sy(0) + 11) + '" text-anchor="middle">' +
               (Math.round(gx * 100) / 100) + '</text>');
    }
    for (var gy = stepy; gy <= ymax + 1e-9; gy += stepy) {
      out.push('<line class="g-grid" x1="' + n1(sx(0)) + '" y1="' + n1(sy(gy)) +
               '" x2="' + n1(sx(xmax)) + '" y2="' + n1(sy(gy)) + '"/>');
      out.push('<text x="' + n1(sx(0) - 5) + '" y="' + n1(sy(gy) + 3) + '" text-anchor="end">' +
               (Math.round(gy * 100) / 100) + '</text>');
    }
    out.push('<text x="' + n1(sx(0) - 6) + '" y="' + n1(sy(0) + 11) + '" text-anchor="end">0</text>');

    /* ④ 各约束直线 */
    cons.forEach(function (k) {
      var seg = lineInRect(k.coef[0], k.coef[1], k.rhs, 0, 0, xmax, ymax);
      if (seg) {
        out.push('<line class="g-cline" x1="' + n1(sx(seg[0].x)) + '" y1="' + n1(sy(seg[0].y)) +
                 '" x2="' + n1(sx(seg[1].x)) + '" y2="' + n1(sy(seg[1].y)) + '"/>');
      }
    });

    /* ⑤ 可行域 */
    if (verts.length >= 3) {
      var poly = verts.map(function (p) { return n1(sx(p.x)) + ',' + n1(sy(p.y)); }).join(' ');
      out.push('<polygon class="g-feas" points="' + poly + '"/>');
    } else {
      out.push('<line class="g-feas-line" x1="' + n1(sx(verts[0].x)) + '" y1="' + n1(sy(verts[0].y)) +
               '" x2="' + n1(sx(verts[1].x)) + '" y2="' + n1(sy(verts[1].y)) + '"/>');
    }

    /* ⑤.5 整数格点：整数规划的可行解只能落在这些点上，所以先把可行域里的格点全标出来。
       点数设上限，避免变量取值范围很大时把 SVG 撑爆。 */
    if (ip) {
      var dotCount = 0;
      for (var gx = 0; gx <= xmax + 1e-9 && dotCount < 600; gx += 1) {
        for (var gy = 0; gy <= ymax + 1e-9 && dotCount < 600; gy += 1) {
          if (!feasible({ x: gx, y: gy }, cons)) continue;
          out.push('<circle class="g-int" cx="' + n1(sx(gx)) + '" cy="' + n1(sy(gy)) + '" r="2.6"/>');
          dotCount++;
        }
      }
    }

    /* ⑥ 目标函数等值线：过原点的与过最优点的各一条 */
    var c1 = prob.c[0], c2 = prob.c[1];
    if (Math.abs(c1) > 1e-12 || Math.abs(c2) > 1e-12) {
      var ks = [0];
      if (res.status === 'optimal' && res.solution) {
        ks.push(c1 * res.solution[0] + c2 * res.solution[1]);
      }
      ks.forEach(function (kk, idx) {
        var seg2 = lineInRect(c1, c2, kk, 0, 0, xmax, ymax);
        if (seg2) {
          out.push('<line class="g-contour' + (idx ? ' g-contour-hi' : '') +
                   '" x1="' + n1(sx(seg2[0].x)) + '" y1="' + n1(sy(seg2[0].y)) +
                   '" x2="' + n1(sx(seg2[1].x)) + '" y2="' + n1(sy(seg2[1].y)) + '"/>');
        }
      });
    }

    /* ⑦ 坐标轴 */
    out.push('<line class="g-axis" x1="' + n1(sx(0)) + '" y1="' + n1(sy(0)) +
             '" x2="' + n1(sx(xmax)) + '" y2="' + n1(sy(0)) + '"/>');
    out.push('<line class="g-axis" x1="' + n1(sx(0)) + '" y1="' + n1(sy(0)) +
             '" x2="' + n1(sx(0)) + '" y2="' + n1(sy(ymax)) + '"/>');
    out.push('<text class="g-lbl" x="' + n1(sx(xmax) - 6) + '" y="' + n1(sy(0) - 5) + '" text-anchor="end">x1</text>');
    out.push('<text class="g-lbl" x="' + n1(sx(0) + 5) + '" y="' + n1(sy(ymax) + 9) + '">x2</text>');

    /* ⑧ 最优解点 */
    if (res.status === 'optimal' && res.solution && res.solution.length === 2) {
      var ox = sx(res.solution[0]), oy = sy(res.solution[1]);
      out.push('<circle class="g-opt" cx="' + n1(ox) + '" cy="' + n1(oy) + '" r="4"/>');

      /* 标注默认放在顶点右上方。可最优解常常正好落在右上角，那样标注会被画布裁掉，
         所以先按字数估一下宽度：顶到右边界就翻到左侧改右对齐，顶到上边界就挪到下方。 */
      var lbl = '(' + fmtNum(res.solution[0]) + ', ' + fmtNum(res.solution[1]) + ')';
      var estW = lbl.length * 6.5;      /* 12.5px 字号下每字符约 6.5px，故意估宽一点留余量 */
      var lx = ox + 7, ly = oy - 6, tail = false;
      if (ox + 7 + estW > W - 2) { lx = ox - 7; tail = true; }
      if (ly - 12 < 2) { ly = oy + 15; }
      out.push('<text class="g-optlbl" x="' + n1(lx) + '" y="' + n1(ly) + '"'
        + (tail ? ' text-anchor="end"' : '') + '>' + lbl + '</text>');
    }

    /* ⑧.5 最优整数解：和松弛问题的最优解（橙点）分开标，一眼能看出两者的差距 ——
       这正是「为什么要用整数规划而不能直接对松弛解四舍五入」的直观理由。 */
    if (ip && ip.best && ip.best.length === 2) {
      var ix = sx(ip.best[0]), iy = sy(ip.best[1]);
      out.push('<circle class="g-ipopt" cx="' + n1(ix) + '" cy="' + n1(iy) + '" r="5.5"/>');
      var ilbl = '整数最优 (' + fmtNum(ip.best[0]) + ', ' + fmtNum(ip.best[1]) + ')';
      var iw = ilbl.length * 6.5;
      var ix2 = ix + 8, iy2 = iy + 15, itail = false;
      if (ix + 8 + iw > W - 2) { ix2 = ix - 8; itail = true; }
      if (iy2 > H - 3) iy2 = iy - 8;
      out.push('<text class="g-ipoptlbl" x="' + n1(ix2) + '" y="' + n1(iy2) + '"'
        + (itail ? ' text-anchor="end"' : '') + '>' + ilbl + '</text>');
    }

    out.push('</svg>');

    var caption = '蓝色区域 = 可行域　橙色虚线 = 目标函数等值线（越靠外 z 越大）'
      + (res.status === 'optimal' ? '　橙点 = 最优解（等值线平移到可行域边界时取到）' : '')
      + (res.status === 'unbounded' ? '　本例可行域无界，等值线可以一直外移 → 无界解' : '');
    if (ip) {
      caption += '　灰点 = 可行域里的整数格点（整数解只能从这些点里挑）'
        + (ip.best ? '　绿点 = 最优整数解' : '');
    }

    return { svg: out.join(''), caption: caption };
  }

  /* 原先这行是把 renderGraph 挂到全局对象上给 ui.js / ip-ui.js 取用，现在直接返回 */
  return renderGraph;
})();

/* 对外接口：renderGraph(prob, res[, ip]) -> { svg, caption }。
   跨模块调用一律走 require：ui.js / ip-ui.js 都 require 本模块取用，不再有任何
   全局挂载（原先那行 global 赋值已删除）。 */
module.exports = {
  renderGraph: renderGraph
};
