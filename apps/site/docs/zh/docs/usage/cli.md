# 命令行工具

`@midscene/cli` 是 Midscene 的命令行版本。它适合执行简单的任务或体验 Midscene 的基础功能。

## 准备工作

* 安装 Node.js

确保你已经安装了 [Node.js](https://nodejs.org/)。

* 配置 AI 服务

```bash
# 请替换为你自己的 API 密钥
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

相关文档：
* [自定义模型服务](./model-vendor.html)

## 示例

```bash
# headed 模式（即可见浏览器）访问 baidu.com 并搜索“天气”
npx @midscene/cli --headed --url https://www.baidu.com --action "输入 '天气', 敲回车" --sleep 3000

# 访问 Github 状态页面并将状态保存到 ./status.json
npx @midscene/cli --url https://www.githubstatus.com/ \
  --query-output status.json \
  --query '{serviceName: string, status: string}[], github 页面的服务状态，返回服务名称'
```

你也可以先全局安装 @midscene/cli 再调用

```bash
# install
npm i -g @midscene/cli

# call by `midscene`
midscene --url https://wwww.bing.com --action "type 'weather today', hit enter"
```

## 使用方法

Usage: `midscene [options] [actions]`

Options: 

```log
Options:
  --url <url>                 The URL to visit, required
  --user-agent <ua>           The user agent to use, optional
  --viewport-width <width>    The width of the viewport, optional
  --viewport-height <height>  The height of the viewport, optional
  --viewport-scale <scale>    The device scale factor, optional
  --headed                    Run in headed mode, default false
  --help                      Display this help message
  --version                   Display the version

Actions (参数顺序很重要，可以支持多次使用):
  --action <action>           Perform an action, optional
  --assert <assert>           Perform an assert, optional
  --query-output <path>       Save the result of the query to a file, this must be put before --query, optional
  --query <query>             Perform a query, optional
  --wait-for <assertion>      Wait for a condition to be met. The timeout is set to 15 seconds. optional
  --sleep <ms>                Sleep for a number of milliseconds, optional`
```

## 注意事项

1. Options 参数（任务信息）应始终放在 Actions 参数之前。
2. Actions 参数的顺序很重要。例如，`--action "某操作" --query "某数据"` 表示先执行操作，然后再查询。
3. 如果有更复杂的需求，比如循环操作，使用 SDK 版本（而不是这个命令行工具）会更合适。
