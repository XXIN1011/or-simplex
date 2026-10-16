'use strict';

/* GitHub Linux runner 的容器限制可能阻止 Chromium 自带沙箱启动。
   仅 CI 的临时无头浏览器使用这些参数，桌面环境保留浏览器默认沙箱。 */
function launchArgs(opts, port, profile, runtime = { platform: process.platform, ci: process.env.CI }) {
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--hide-scrollbars',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'
  ];
  if (runtime.platform === 'linux' && runtime.ci === 'true') {
    args.push('--no-sandbox', '--disable-dev-shm-usage');
  }
  return args.concat(opts.extraArgs || []);
}

module.exports = { launchArgs };
