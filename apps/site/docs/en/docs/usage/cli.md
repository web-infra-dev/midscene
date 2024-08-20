# Command Line Tools

`@midscene/cli` is the command line version of Midscene. It is suitable for executing very simple tasks or experiencing the basics of Midscene.

## Preparation

* Install Node.js

⁠Ensure that you have [Node.js](https://nodejs.org/) installed.

* Config AI vendor

```bash
# replace by your own
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

Related Docs:
* [Customize model vendor](./model-vendor.html)

## Examples

```bash
# headed mode (i.e. visible browser) to visit bing.com and search for 'weather today'
npx @midscene/cli --headed --url https://wwww.bing.com --action "type 'weather today', hit enter" --sleep 3000

# visit github status page and save the status to ./status.json
npx @midscene/cli --url https://www.githubstatus.com/ \
  --query-output status.json \
  --query '{name: string, status: string}[], service status of github page'
```

Or you may install @midscene/cli globally before calling

```bash
# install
npm i -g @midscene/cli

# call by `midscene`
midscene --url https://wwww.bing.com --action "type 'weather today', hit enter"
```

## Usage

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

Actions (the order matters, can be used multiple times):
  --action <action>           Perform an action, optional
  --assert <assert>           Perform an assert, optional
  --query-output <path>       Save the result of the query to a file, this must be put before --query, optional
  --query <query>             Perform a query, optional
  --wait-for <assertion>      Wait for a condition to be met. The timeout is set to 15 seconds. optional
  --sleep <ms>                Sleep for a number of milliseconds, optional
```


## Note

1. Always put options before any action param
2. The order of action param matters. For example, `--action "some action" --query "some data"` means taking some action first, then querying.
3. If you have some more complex requirements, such as loop operations, using the SDK version (instead of this cli) is an easier way to achieve them.
