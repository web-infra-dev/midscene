# Midscene MCP

⚠️ Note that midscene is currently only in the experimental stage and not online, and availability is not guaranteed at present

## Usage

## Features

Midscene MCP Server allows you to control browsers using natural language commands, supporting the following features:

- **Page Control:** You can directly control your current browser through the bridge mode provided by chrome devtools
- **Navigation:** Open URLs, go forward, and go back.
- **Interaction:** Clicking, Input, and Hovering.
- **Achieving Goals:** Accomplish tasks by describing goals in natural language, letting AI complete them automatically.
- **Screenshots:** Capture screenshots of the current page.
- **JavaScript Execution:** Execute JavaScript code on the current page.
- **Tab Management:** Get list of tabs, allowing LLM to select which tab to operate on.

> step1:
* Donwload and Install chrome devtools: https://github.com/web-infra-dev/midscene/actions/runs/14595366638
* Switch to `Bridge Mode` and click allow connection

> step2:
* Install Midscene MCP Server:

```json
{
  "mcpServers": {
    "mcp-midscene": {
      "command": "npx",
      "args": [
        "-y",
        "@midscene/mcp@0.15.2-beta-20250422125908.0"
      ],
      "env": {
        "OPENAI_API_KEY": "YOUR_OPENAI_API_KEY",
        "MIDSCENE_MODEL_NAME": "YOUR_MODEL_NAME",
        "MCP_SERVER_REQUEST_TIMEOUT": "800000"
      }
    }
  }
}
```

* For reference configuration of the model, you can refer to:

## Inspect the MCP server

> [!NOTE]

Starting multiple inspect pages may cause the /message sse link error to occur in MTP

```bash
# before run this command, you need to build the library first
pnpm run inspect
```


## TODO

- [x] Support launching in Puppeteer mode
- [x] Provide comprehensive usage documentation
- [ ] Provide examples
- [ ] Optimize automated tests
- [ ] Test usability/effectiveness
- Tools
    - [x] Support getting tab list, allowing LLM to decide which tab to use
    - [ ] Test effectiveness of controlling Android
