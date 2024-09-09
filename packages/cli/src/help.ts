if (process.argv.indexOf('--help') !== -1) {
  console.log(`
  Usage: midscene [options] [actions]

  Options:
    --url <url>                 The URL to visit, required
    --user-agent <ua>           The user agent to use, optional
    --viewport-width <width>    The width of the viewport, optional
    --viewport-height <height>  The height of the viewport, optional
    --viewport-scale <scale>    The device scale factor (dpr), optional
    --headed                    Run in headed mode, default false
    --help                      Display this help message
    --version                   Display the version

  Actions (the order matters, can be used multiple times):
    --action <action>           Perform an action, optional
    --assert <assert>           Perform an assert, optional
    --query-output <path>       Save the result of the query to a file, this must be put before --query, optional
    --query <query>             Perform a query, optional
    --wait-for <assertion>      Wait for a condition to be met. The timeout is set to 15 seconds. optional
    --sleep <ms>                Sleep for a number of milliseconds, optional

  Examples:
    # headed mode (i.e. visible browser) to visit bing.com and search for 'weather today'
    midscene --headed --url "https://wwww.bing.com" --action "type 'weather today' in search box, hit enter" --wait-for "there is weather info in the page"

    # visit github status page and save the status to ./status.json
    midscene --url "https://www.githubstatus.com/" \\
      --query-output status.json \\
      --query '{name: string, status: string}[], service status of github page'

  Examples with Chinese Prompts
    # headed 模式（即可见浏览器）访问 baidu.com 并搜索“天气”
    midscene --headed --url "https://www.baidu.com" --action "在搜索框输入 '天气', 敲回车" --wait-for 界面上出现了天气信息

    # 访问 Github 状态页面并将状态保存到 ./status.json
    midscene --url "https://www.githubstatus.com/" \\
      --query-output status.json \\
      --query '{serviceName: string, status: string}[], github 页面的服务状态，返回服务名称'
  `);
  process.exit(0);
} else if (process.argv.indexOf('--version') !== -1) {
  const versionFromPkgJson = require('../package.json').version;
  console.log(`@midscene/cli version ${versionFromPkgJson}`);
  process.exit(0);
}
