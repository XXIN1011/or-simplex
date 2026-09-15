"""用已保存的 GitHub 凭据创建仓库、推送、开启 GitHub Pages

用法: python deploy-github.py [repo名]   默认 or-simplex
前提: token.txt 里是本机 git 凭据管理器取出的有效 token
说明: 本机 github.com 主站被 Steam++ hosts 劫持不可达，但 api.github.com 与
       git 均可用，因此全部操作走 API + git，不依赖网页端。
"""
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)

REPO = sys.argv[1] if len(sys.argv) > 1 else 'or-simplex'


def load_token():
    """优先读 token.txt；没有就从本机 git 凭据管理器取。
    （这台机器 github.com 网页端被 Steam++ hosts 劫持不可达，
      但 Windows 凭据管理器里存有可用的 GitHub OAuth token。）"""
    if os.path.exists('token.txt'):
        return open('token.txt', encoding='utf-8').read().strip()
    p = subprocess.run(['git', 'credential', 'fill'],
                       input='protocol=https\nhost=github.com\n\n',
                       capture_output=True, text=True, timeout=40)
    for line in p.stdout.splitlines():
        if line.startswith('password='):
            return line.split('=', 1)[1].strip()
    raise SystemExit('取不到 GitHub 凭据：请先在能上网的环境登录一次 GitHub，'
                     '或手动写入 token.txt')


TOKEN = load_token()
API = 'https://api.github.com'
ENV = dict(os.environ, GIT_TERMINAL_PROMPT='0')   # 禁止 git 弹交互提示


def api(method, path, body=None):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        'Authorization': 'token ' + TOKEN,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'hermes-or-solver',
    })
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            raw = r.read().decode('utf-8')
            return r.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8')
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {'raw': raw}
    except Exception as e:
        return -1, {'err': str(e)}


def git(*args, check=True):
    p = subprocess.run(['git'] + list(args), cwd=ROOT, capture_output=True,
                       text=True, env=ENV)
    if check and p.returncode != 0:
        raise RuntimeError('git ' + ' '.join(args) + ' 失败:\n' + (p.stderr or p.stdout))
    return p


# ---------- 1. 身份 ----------
st, me = api('GET', '/user')
if st != 200:
    print('取得用户信息失败:', st, me); sys.exit(1)
LOGIN = me['login']
print('[1] 登录账号 =', LOGIN)

# ---------- 2. 创建仓库 ----------
st, r = api('GET', f'/repos/{LOGIN}/{REPO}')
if st == 200:
    print('[2] 仓库已存在:', r['html_url'])
else:
    st, r = api('POST', '/user/repos', {
        'name': REPO,
        'description': '面向教学的线性规划单纯形法计算器：逐步展示每一次迭代过程',
        'private': False, 'auto_init': False,
        'has_issues': True, 'has_wiki': False, 'has_projects': False,
    })
    if st not in (200, 201):
        print('[2] 创建仓库失败:', st, r); sys.exit(1)
    print('[2] 仓库已创建:', r['html_url'])

# ---------- 3. 提交并推送 ----------
if not os.path.isdir(os.path.join(ROOT, '.git')):
    git('init', '-b', 'main')
    print('[3] git 仓库已初始化')

git('config', 'user.name', 'XiaoXin')
git('config', 'user.email', '2624962001@qq.com')
git('config', 'core.quotepath', 'false')

git('add', '-A')
tracked = git('ls-files').stdout.split()
leak = [f for f in tracked if f in ('token.txt', 'device.json', 'random-bank.json', 'poll-token.py')]
if leak:
    print('[3] 警告：检测到敏感文件将被提交:', leak); sys.exit(1)
print('[3] 将提交文件数 =', len(tracked))

if git('status', '--porcelain').stdout.strip():
    git('commit', '-m', '单纯形法计算器：教学向逐步迭代 + 大 M 法符号化检验数')

git('remote', 'remove', 'origin', check=False)
git('remote', 'add', 'origin', f'https://github.com/{LOGIN}/{REPO}.git')

p = git('push', '-u', 'origin', 'main', '--force', check=False)
if p.returncode != 0:
    print('[3] 首次 push 失败，改用内嵌 token 重试:', (p.stderr or '')[:300])
    p = git('push', f'https://{TOKEN}@github.com/{LOGIN}/{REPO}.git',
            'HEAD:main', '--force', check=False)
if p.returncode != 0:
    print('[3] push 仍然失败:\n', p.stderr or p.stdout); sys.exit(1)
print('[3] 推送完成 -> main')

# ---------- 4. 开启 GitHub Pages ----------
st, r = api('GET', f'/repos/{LOGIN}/{REPO}/pages')
if st == 200:
    print('[4] Pages 已开启:', r.get('html_url'))
else:
    st, r = api('POST', f'/repos/{LOGIN}/{REPO}/pages',
                {'source': {'branch': 'main', 'path': '/'}})
    if st in (200, 201):
        print('[4] Pages 已开启:', r.get('html_url'))
    elif st == 409:
        print('[4] Pages 已存在')
    else:
        print('[4] 开启 Pages 返回:', st, r)

PAGES_URL = f'https://{LOGIN.lower()}.github.io/{REPO}/'
print('[4] 线上地址:', PAGES_URL)

# ---------- 5. 等待构建并验证 ----------
print('[5] 等待 Pages 构建...')
ok = False
for i in range(40):
    time.sleep(5)
    try:
        req = urllib.request.Request(PAGES_URL, headers={'User-Agent': 'hermes'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode('utf-8', 'ignore')
        if 'simplexSolve' in html and '单纯形法' in html:
            print(f'   第{i+1}次探测: 上线成功，{len(html)} 字节，关键标记齐全')
            print('VERIFIED_URL=' + PAGES_URL)
            ok = True
            break
        print(f'   第{i+1}次探测: 已响应但内容未就绪（{len(html)} 字节）')
    except Exception as e:
        print(f'   第{i+1}次探测: 未就绪 ({type(e).__name__})')

if not ok:
    print('   超时：Pages 可能仍在构建，稍后自行访问', PAGES_URL)
