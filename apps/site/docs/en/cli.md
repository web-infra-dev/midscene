# Command Line Tools

`@midscene/cli` is the command line version of Midscene. You can use it to run 



It is suitable for executing very simple tasks. For example, you can write a one-line npm script to check if the build result can launch normally, or extract some data from the web page and write the result into a JSON file.

:::info Demo Project
you can check the demo project of command line tools here: [https://github.com/web-infra-dev/midscene-example/blob/main/command-line](https://github.com/web-infra-dev/midscene-example/blob/main/command-line)
:::

## Preparation

* Install Node.js

⁠Ensure that you have [Node.js](https://nodejs.org/) installed.

* Config the OpenAI API key, or [customize model provider](./model-provider.html)

```bash
# replace with your own
export OPENAI_API_KEY="sk-abcdefghijklmnopqrstuvwxyz"
```

## Examples

Visit github status page and save the status to `./status.json`

```bash
npx @midscene/cli --url https://www.githubstatus.com/ \
  --query-output status.json \
  --query '{name: string, status: string}[], service status of github page'
```

Serve the `./dist` path statically and check if the `index.html` can launch normally

```bash
npx @midscene/cli --serve ./dist --url index.html --assert 'page title is "My App"'
```

Use headed mode (i.e. visible browser) to visit bing.com and search for 'weather today'

```bash
npx @midscene/cli --headed --url https://wwww.bing.com --action "type 'weather today', hit enter" --sleep 3000
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

1. Always put options before any action param.
2. The order of action parameters matters. For example, `--action "some action" --query "some data"` means that the action is taken first, followed by a query.
3. If you have some more complex requirements, such as loop operations, using the SDK version (instead of this cli) is an easier way to achieve them.
4. Midscene CLI reads the `.env` file by dotenv in the current working directory, allowing you to place some configuration in it.
