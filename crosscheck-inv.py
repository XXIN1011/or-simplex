# -*- coding: utf-8 -*-
"""
inv-core.js（JS）与 python/inventory.py（Python）的交叉对拍。

两个文件的算法是各自独立写的，公式抄错、系数写反、边界处理不同都会暴露。
流程：
    node inv-test.js          -> 生成 inv-bank.json（题目 + JS 结果）
    python crosscheck-inv.py  -> 用 Python 实现重解，逐项比对

用法：  python crosscheck-inv.py
退出码：0 = 全部一致；1 = 有偏差（明细会打印）
"""

import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, 'python'))

try:
    from inventory import (eoq_basic, epq_production, eoq_shortage,
                           quantity_discount, multiproduct_constrained)
except ImportError as e:
    print('✗ 无法导入 python/inventory.py：%s' % e)
    sys.exit(2)

BANK = os.path.join(HERE, 'inv-bank.json')
if not os.path.exists(BANK):
    print('✗ 找不到 inv-bank.json，请先运行：node inv-test.js')
    sys.exit(2)

with open(BANK, encoding='utf-8') as f:
    bank = json.load(f)

FAILS = []
COUNT = [0]
MAXDEV = {}


def rel(got, want):
    if want == 0:
        return abs(got - want)
    return abs(got - want) / abs(want)


def ck(tag, js, py, tol=1e-9):
    """比对 JS 与 Python 的同一个量。"""
    COUNT[0] += 1
    if js is None or py is None:
        return
    d = rel(float(js), float(py))
    key = tag.split(':')[0]
    if d > MAXDEV.get(key, 0):
        MAXDEV[key] = d
    if d > tol:
        FAILS.append('%s  JS=%r  PY=%r  相对偏差=%.3e (tol=%g)' % (tag, js, py, d, tol))


# ==============================================================================
def do_eoq(case):
    p = case['params']
    r = eoq_basic(D=p['D'], c1=p['c1'], c3=p['c3'], K=p['K'], verbose=False)
    j = case['js']
    ck('eoq:Q', j['Q'], r['Q_star'])
    ck('eoq:T', j['T'], r['T_star'])
    ck('eoq:C', j['C'], r['C_star'])
    ck('eoq:orderTimes', j['orderTimes'], r['order_times_per_year'])
    ck('eoq:maxInv', j['maxInv'], r['max_inventory'])
    ck('eoq:avgInv', j['avgInv'], r['avg_inventory'])
    ck('eoq:costOrder', j['costOrder'], r['cost_ordering'])
    ck('eoq:costHold', j['costHold'], r['cost_holding'])
    if p['K'] is not None:
        ck('eoq:costPurchase', j['costPurchase'], r['cost_purchase'])
        ck('eoq:costTotal', j['costTotal'], r['cost_total'])


def do_epq(case):
    p = case['params']
    r = epq_production(D=p['D'], d=p['d'], p=p['p'], c1=p['c1'], c3=p['c3'],
                       K=p['K'], periods_per_year=p['n'], verbose=False)
    j = case['js']
    ck('epq:Q', j['Q'], r['Q_star'])
    ck('epq:S', j['S'], r['S_star'])
    ck('epq:T', j['T'], r['T_star'])
    ck('epq:tProduce', j['tProduce'], r['t_produce'])
    ck('epq:tConsume', j['tConsume'], r['t_consume'])
    ck('epq:C', j['C'], r['C_star'])
    ck('epq:rho', j['rho'], r['rho'])
    ck('epq:produceTimes', j['produceTimes'], r['produce_times_per_year'])
    ck('epq:costOrder', j['costOrder'], r['cost_ordering'])
    ck('epq:costHold', j['costHold'], r['cost_holding'])


def do_short(case):
    p = case['params']
    r = eoq_shortage(D=p['D'], c1=p['c1'], c2=p['c2'], c3=p['c3'],
                     K=p['K'], verbose=False)
    j = case['js']
    for a, b in [('Q', 'Q_star'), ('S', 'S_star'), ('B', 'B_star'), ('T', 'T_star'),
                 ('tStock', 't_stock'), ('tShort', 't_short'),
                 ('shortageRatio', 'shortage_ratio'), ('C', 'C_star'),
                 ('avgInv', 'avg_inventory'), ('avgShort', 'avg_shortage'),
                 ('costOrder', 'cost_ordering'), ('costHold', 'cost_holding'),
                 ('costShort', 'cost_shortage')]:
        ck('short:%s' % a, j[a], r[b])
    ck('short:eoqQ', j['eoqQ'], r['eoq_benchmark']['Q'])
    ck('short:eoqC', j['eoqC'], r['eoq_benchmark']['C'])


def do_disc(case):
    p = case['params']
    breaks = [(t['lo'], t['K']) for t in p['tiers']]
    kw = {'holding_rate': p['rate']} if p['mode'] == 'rate' else {'c1': p['c1']}
    r = quantity_discount(D=p['D'], c3=p['c3'], breaks=breaks, verbose=False, **kw)
    j = case['js']
    ck('disc:Q', j['Q'], r['Q_star'])
    ck('disc:K', j['K'], r['K_star'])
    ck('disc:costTotal', j['costTotal'], r['cost_star'])
    ck('disc:costHold', j['costHold'], r['cost_holding'])
    ck('disc:costOrder', j['costOrder'], r['cost_ordering'])
    ck('disc:costPurchase', j['costPurchase'], r['cost_purchase'])
    ck('disc:eoqNoDiscount', j['eoqNoDiscount'], r['eoq_no_discount'])
    COUNT[0] += 1
    if j['bestBracket'] != r['best_bracket']:
        FAILS.append('disc:bestBracket  JS=%r PY=%r' % (j['bestBracket'], r['best_bracket']))
    # 逐档：EOQ、候选批量、该候选的费用、可行性
    COUNT[0] += 1
    if len(j['tiers']) != len(r['brackets']):
        FAILS.append('disc:档位数不同 JS=%d PY=%d' % (len(j['tiers']), len(r['brackets'])))
        return
    for i, (jt, pt) in enumerate(zip(j['tiers'], r['brackets'])):
        ck('disc:tier%d.eoq' % i, jt['eoq'], pt['eoq'])
        ck('disc:tier%d.c1' % i, jt['c1'], pt['c1'])
        COUNT[0] += 1
        jc, pc = jt['candidate'], pt['candidate']
        if (jc is None) != (pc is None):
            FAILS.append('disc:tier%d.candidate  JS=%r PY=%r' % (i, jc, pc))
        elif jc is not None:
            ck('disc:tier%d.candidate' % i, jc, pc)
            ck('disc:tier%d.cost' % i, jt['costTotal'], pt['cost'])
        COUNT[0] += 1
        jf = ('可行' in jt['status'])
        pf = ('可行' in pt['status'])
        if jf != pf:
            FAILS.append('disc:tier%d 可行性判定不同 JS=%r PY=%r' % (i, jt['status'], pt['status']))


def do_multi(case):
    p = case['params']
    r = multiproduct_constrained(items=p['items'], constraint=p['constraint'],
                                 limit=p['limit'], average_basis=p['averageBasis'],
                                 verbose=False)
    j = case['js']
    ck('multi:lambda', j['lambda'], r['lambda_star'], 1e-8)
    ck('multi:resourceUsed', j['resourceUsed'], r['resource_used'], 1e-8)
    ck('multi:total', j['total'], r['total_cost'], 1e-9)
    ck('multi:totalUncon', j['totalUncon'], r['total_cost_unconstrained'], 1e-9)
    COUNT[0] += 1
    if j['binding'] != r['binding']:
        FAILS.append('multi:binding  JS=%r PY=%r' % (j['binding'], r['binding']))
    COUNT[0] += 1
    if len(j['items']) != len(r['items']):
        FAILS.append('multi:产品数不同 JS=%d PY=%d' % (len(j['items']), len(r['items'])))
        return
    for i, (ji, pi) in enumerate(zip(j['items'], r['items'])):
        ck('multi:item%d.Q' % i, ji['Q'], pi['Q'], 1e-8)
        ck('multi:item%d.resource' % i, ji['resourceUsed'], pi['resource_used'], 1e-8)
        ck('multi:item%d.costTotal' % i, ji['costTotal'], pi['cost_total'], 1e-9)
        ck('multi:item%d.eoq' % i, ji['eoq'], pi['eoq'], 1e-9)


DISPATCH = {'eoq': do_eoq, 'epq': do_epq, 'short': do_short,
            'disc': do_disc, 'multi': do_multi}

NAMES = {'eoq': '9.2 EOQ', 'epq': '9.4 陆续到货', 'short': '9.3 允许缺货',
         'disc': '9.5 批量折扣', 'multi': '9.6 多产品约束'}

by_model = {}
for case in bank['cases']:
    m = case['model']
    try:
        DISPATCH[m](case)
    except Exception as e:
        FAILS.append('%s 第 %d 题抛异常：%s: %s' % (m, case['id'], type(e).__name__, e))
    by_model[m] = by_model.get(m, 0) + 1

print('=' * 76)
print('  inv-core.js（JS）  <->  python/inventory.py（Python）  交叉对拍')
print('=' * 76)
print('  题库：%s（%d 题）' % (os.path.basename(BANK), len(bank['cases'])))
print()
print('  %-18s %8s   %s' % ('模型', '题数', '最大相对偏差'))
print('  ' + '-' * 68)
for m in ['eoq', 'epq', 'short', 'disc', 'multi']:
    if m not in by_model:
        continue
    devs = [v for k, v in MAXDEV.items() if k.startswith(m + ':')]
    worst = max(devs) if devs else 0.0
    print('  %-18s %8d   %.2e' % (NAMES[m], by_model[m], worst))
print()
print('  比对项数：%d' % COUNT[0])
print('  不一致项：%d' % len(FAILS))
if FAILS:
    print()
    print('  ✗ 明细（最多 40 条）：')
    for f in FAILS[:40]:
        print('    - ' + f)
    sys.exit(1)
print()
print('  ✓ 两套独立实现结果完全一致。')
sys.exit(0)
