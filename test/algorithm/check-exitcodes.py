"""用真实小题库、错误预期和空题库验证七个对拍脚本的进程退出码。"""
import copy
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile

HERE = Path(__file__).resolve().parent
CASES = [
    ('crosscheck.py', 'random-bank.json', 'js_obj'),
    ('crosscheck-dual.py', 'dual-bank.json', 'obj'),
    ('crosscheck-sens.py', 'sens-bank.json', 'samples'),
    ('crosscheck-scenario.py', 'scenario-bank.json', 'cases'),
    ('crosscheck-param.py', 'param-bank.json', 'jsZ'),
    ('crosscheck-assign.py', 'assignment-bank.json', 'js_objective'),
    ('crosscheck-transport.py', 'transport-bank.json', 'objective'),
]

with tempfile.TemporaryDirectory(prefix='or-exitcodes-') as tmp:
    for script, filename, key in CASES:
        bank = json.loads((HERE / filename).read_text(encoding='utf-8'))
        record = next(r for r in bank if r.get('js_status', r.get('status', 'optimal')) == 'optimal')
        good = [record]
        bad = copy.deepcopy(good)
        if key == 'samples':
            sample = next(s for s in bad[0]['samples'] if s['tag'] == 'in')
            sample['predicted'] += 10000
        elif key == 'cases':
            case = next(c for c in bad[0]['cases'] if c['jsOk'] and c['jsStatus'] == 'optimal')
            case['jsObj'] += 10000
        else:
            bad[0][key] += 10000
        for label, data, expected in [('正确', good, 0), ('错误', bad, 1), ('空题库', [], 1)]:
            Path(tmp, filename).write_text(json.dumps(data), encoding='utf-8')
            env = dict(os.environ, OR_TEST_BANK_DIR=tmp)
            # 保留调用方提供的 Python 依赖路径，也兼容桌面内置解释器。
            code = 'import sys,runpy;sys.path[:0]=' + repr(sys.path) + ';runpy.run_path(sys.argv[1],run_name="__main__")'
            run = subprocess.run([sys.executable, '-X', 'utf8', '-c', code, str(HERE / script)],
                                 env=env, capture_output=True, text=True, encoding='utf-8', timeout=60)
            if run.returncode != expected:
                print(run.stdout, run.stderr)
                raise SystemExit(f'{script} {label}: 期望退出码 {expected}，实际 {run.returncode}')
            print(f'PASS {script} {label}: exit={run.returncode}')

    # 运输禁运还需验证无解分支，以及供需/目标值均正确但偷走禁运格的伪解。
    bank = json.loads((HERE / 'transport-bank.json').read_text(encoding='utf-8'))
    impossible = next(r for r in bank if r['status'] == 'infeasible')
    false_impossible = copy.deepcopy(next(r for r in bank if r['status'] == 'optimal'))
    false_impossible.update(status='infeasible', objective=None, allocation=None)
    illegal_flow = {'problem': {'direction':'min', 'cost':[[0,'M'],['M',0]], 'supply':[1,1], 'demand':[1,1]},
                    'status':'optimal', 'objective':0, 'allocation':[[0,1],[1,0]]}
    for label, record, expected in [('正确禁运无解', impossible, 0), ('可行题误报无解', false_impossible, 1), ('禁运伪解', illegal_flow, 1)]:
        Path(tmp, 'transport-bank.json').write_text(json.dumps([record]), encoding='utf-8')
        env = dict(os.environ, OR_TEST_BANK_DIR=tmp)
        run = subprocess.run([sys.executable, '-X', 'utf8', '-c', code, str(HERE / 'crosscheck-transport.py')],
                             env=env, capture_output=True, text=True, encoding='utf-8', timeout=60)
        if run.returncode != expected:
            print(run.stdout, run.stderr)
            raise SystemExit(f'crosscheck-transport.py {label}: 期望退出码 {expected}，实际 {run.returncode}')
        print(f'PASS crosscheck-transport.py {label}: exit={run.returncode}')
