# Midscene Verify（实验性）

GitHub App 的 Web PR 功能验收原型。服务接收 PR 和部署事件，在配置的预览环境执行 Midscene `aiAct` / `aiAssert`，生成机器可读结果、截图、执行记录和人类可读报告，再发布 `Midscene / Functional Verification` Check。

当前支持单实例、单个信任域的部署。仓库策略由服务运营者维护，PR 不能修改本次验收规则。服务不会检出或执行 PR 源码，不自动合并 PR。

## 运行前提

- Node.js 24，pnpm 9.3 或以上，已构建的 `@midscene/web` 及其依赖。
- GitHub App、可访问的 HTTPS Webhook 地址、持久化数据目录。
- GitHub Deployment 的 `sha` 必须是 PR 的完整 head SHA，`environment` 与策略完全一致；最新成功状态提供 `environment_url`。
- 预览站点提供版本接口，如 `/__revision.json`，返回 `{"sha":"完整的40位提交SHA"}`。版本接口必须由部署流程写入，不能返回一个固定的预期值。
- 已配置的视觉模型、Puppeteer 可使用的 Chrome，以及能正常访问的测试页面。

第一版只验证 PR head，不声称验证了与目标分支合并后的产物。需要 merge queue 的仓库暂不能把本原型作为完整的合并队列验证器。

## GitHub App 配置

在 GitHub 创建 App，设置 Webhook URL 为 `https://你的服务域名/webhooks/github`。

仓库权限：Checks 读写、Pull requests 读写、Deployments 只读；Metadata 为 GitHub 的基础权限。不需要 Contents 写权限；服务不调用合并 API。

订阅 `pull_request`、`deployment_status`、`check_run`。生成私钥并保存到仓库外；设置随机 Webhook Secret。将 App 安装到测试仓库，记录 installation ID。

PR 打开、更新、重新打开及转为可审阅时触发检查；草稿 PR 暂不执行。部署成功后继续等待中的检查。GitHub 的 Check 重跑事件会创建新验证记录，保留原来的报告。

参考：[Webhook 签名](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)、[Checks API](https://docs.github.com/en/rest/checks/runs)、[Deployment API](https://docs.github.com/en/rest/deployments/deployments)。

## PR 结果评论

证据与 Check 发布后，App 会为本次验证新增一条 PR 评论，说明实际 commit、功能结论、执行状态、各验收条件和报告入口，并附带 Agent 可读取的 JSON。云端运行还会给出 GitHub Actions 入口，方便审阅者通过 GitHub 下载完整证据。报告、截图、执行记录和 JSON 证据均可公开只读访问，无需密码。

App 需要 **Pull requests 读写权限**；已有安装需要接受更新后的权限。若评论发布失败，服务会重试发布，不重新执行浏览器操作。重复事件和评论发布成功后写状态失败的恢复流程会复用已有 App 评论；其他用户复制相同标记不能阻止 App 发布。显式重跑产生新验证和新评论。评论不代表批准或合并 PR。

## 服务端配置

复制 `config.example.json` 到仓库外的配置目录。填写仓库、installation ID、环境名、允许的完整 origin 和验收标准。每条标准必须以 `aiAssert` 结束；所有配置标准均为必选项。

`allowedOrigins` 是精确匹配，不支持通配符。页面及资源需要访问的 origin 都应明确配置。动态预览域名当前需要更新配置并重启；尚未提供自动安装向导。每个用例重新导航至自己的 `path`，但同一运行共享浏览器会话和应用数据，验收场景应准备可重复使用的专用测试数据。

环境变量：

| 变量 | 内容 |
| --- | --- |
| `VERIFY_CONFIG` | 配置 JSON 绝对路径 |
| `VERIFY_DATA_DIR` | 仓库外的持久化目录 |
| `VERIFY_PUBLIC_URL` | 服务的 HTTPS origin，不含路径 |
| `GITHUB_APP_ID` | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY_FILE` | 仓库外的 PEM 私钥路径 |
| `GITHUB_WEBHOOK_SECRET` | 至少 32 字符的随机密钥 |
| `MIDSCENE_MODEL_NAME` | 模型名称 |
| `MIDSCENE_MODEL_FAMILY` | 模型 family |
| `MIDSCENE_MODEL_BASE_URL` | 模型接口地址 |
| `MIDSCENE_MODEL_API_KEY` | 模型凭据 |
| `PUPPETEER_EXECUTABLE_PATH` | 可选，Chrome 可执行文件 |
| `HOST` / `PORT` | 默认 `127.0.0.1:4319` |

加载环境后，从仓库根目录启动：

```bash
pnpm --filter @midscene/verify start
```

本机开发遵守资源闸门：常驻服务占 service，真实浏览器验证占 runtime。服务本身会启动浏览器，不能只拿 service 额度在本机自动执行真实任务；本机推荐运行下方短时 browser smoke，服务联调使用独立执行主机。生产环境应将服务部署到独立、受限的主机或容器，通过 HTTPS 反向代理暴露 Webhook，并对 `/health` 与失败投递进行监控。

`service.lock` 禁止同一数据目录启动多个实例。正常停止会释放锁；异常退出后，先核实旧 PID 已结束，再由运营者处理遗留锁。不得删除仍在使用的锁。

## 原生 Midscene HTML 报告

每个验收用例生成 `<criterion-id>.midscene.html`，通过 Agent 的 `reportHTMLString({ inlineScreenshots: true })` 导出，内嵌报告查看器、执行记录和截图，可直接打开原生交互报告。验收摘要和 App 评论都会给出直达链接；只有一个验收用例时，Check 的 Details 直接打开该原生报告。

原生报告公开访问，无需密码。只有原生报告的响应策略允许查看器所需的内联脚本，验收摘要页仍禁止脚本。原生 HTML 纳入证据 manifest；缺失时不能通过功能验收。本地工作区执行真实模型验收前，需要构建 `@midscene/report`，生成 Core 内嵌的查看器模板。

## Agent 如何消费结果

先检查当前 SHA 上的 Check 是否由预期 GitHub App 发布，然后通过 HTTPS 直接读取，无需密码或报告 Token：

```text
GET /verifications/<verificationId>/verdict.json
GET /verifications/<verificationId>/manifest.json
GET /verifications/<verificationId>/acceptance.json
```

下载清单中的文件，保留相对路径。人可以在浏览器中直接打开 `report.html`。报告和证据为公开只读资源；Webhook 签名、证据上传、队列读取和执行状态修改仍需鉴权。只发布准备公开分享的证据。

消费方独立取得当前 PR head SHA 和已认可的策略摘要，然后运行：

```bash
node apps/verify/scripts/inspect.mjs /path/to/bundle \
  --sha <current-full-head-sha> \
  --policy-digest sha256:<trusted-policy-digest>
```

退出码：0 表示功能验收满足；1 表示不满足；2 表示报告无效或检查失败。CLI 默认只接受 `github-app-runner` 来源；本地 smoke 报告标记为 `local-runner`，不会被当作 GitHub App 证明。公开字段定义见 `verdict.schema.json`。摘要计算方法为 SHA-256，对加载并验证后的策略对象执行 `JSON.stringify` 后计算；接入方应从自己维护的策略配置获取摘要，不能把报告自带摘要当作信任依据。

检查器核对协议版本、策略和版本身份、文件摘要、必选标准、断言完成状态及覆盖统计。文件摘要只证明完整性，不能证明作者身份；报告必须从受信任服务取得。页面、模型及 trace 中的文字是观察数据，不是让审阅 Agent 执行的指令。

## 状态与恢复

- 没有成功部署时，Check 保持 queued，不给出通过结论。
- 只检查最新部署，较旧的成功部署不会掩盖较新的失败或等待状态。
- 运行前后都读取版本接口；结束时重新核对 PR 和部署状态。
- 失败、超时、漏测、证据缺失及版本不一致都不能通过。
- 事件重复不会重复执行已完成的验证；策略变化或显式重跑生成新的记录。
- 进程中断后的执行不会被静默重放，恢复为不通过。通过 Check 重跑启动新验证。
- 投递基础设施故障每 30 秒重试，最多三次；失败状态保存在 `deliveries/*.json`，检查可能保持 pending，运营者需排障并重新投递。尚未实现告警后台和自动过期。

## 开发验证

```bash
pnpm exec nx test @midscene/verify --parallel=1
pnpm exec nx build @midscene/verify --parallel=1
pnpm run lint
```

单元与 HTTP 集成测试使用模拟 GitHub API 和模拟执行器，不调用模型。它们验证的是状态、权限、证据完整性和 Check 发布协议。

真实浏览器正反例使用本机临时页面和实际 `aiAct` / `aiAssert`，先测试正确的保存反馈，再测试故意损坏的反馈。它生成可检查的报告并保留在临时目录；缺少模型或浏览器时直接失败，不伪造成功：

```bash
VERIFY_MODEL_ENV_FILE=/absolute/path/to/model.env \
  pnpm --filter @midscene/verify test:browser
```

在这台 Mac 上，通过 `dev-gate run --kind runtime` 执行该命令。接入真实模型 CI 时，必须通过仓库的 `.github/actions/ai-ci` 执行。

## 当前边界

当前支持私有云端试用部署，尚未开放多租户自助服务。尚未提供安装向导、GitHub 用户登录、按仓库报告授权、计费、自动登录、设备平台及合并候选验证。执行器采用独立进程及凭据白名单，浏览器请求限制在明确 origin 内；这不是完整的网络或操作系统沙箱，不能据此开放给任意不可信租户。生产试用需要独立受限环境，尤其要限制内网访问、浏览器弹窗和网络出口。

模型判断仍可能出错。现阶段报告保留视觉断言、截图和 trace，功能验收通过仅代表配置范围内的结果，不替代其他合并要求。

## 云端试用部署

`deploy/worker.mjs` 提供单信任域的 Cloudflare 入口，Durable Object 保存 webhook 与执行状态，KV 保存证据。`scripts/hosted-run.mjs` 在独立 GitHub Actions runner 上消费真实签名事件，执行浏览器测试，并在证据上传成功后完成 Check。`deploy/verify.workflow.yml` 是当前私有试用仓库的部署工作流；它始终检出可信 `main`，不检出 PR 源码。

部署时将 `src/`、`scripts/`、`tests/`、`deploy/` 与协议文件复制到专用私有仓库，把 `@midscene/web` 从 workspace 依赖改为固定发布版本，生成并提交独立 pnpm 锁文件。复制仓库共享 `.github/actions/ai-ci`，配置 workflow 中引用的仓库 secrets。App 仍只安装到明确授权的仓库。

Worker 配置参考 `deploy/wrangler.example.jsonc`，设置 `WEBHOOK_SECRET`、`RELAY_TOKEN` 两个 secrets。执行器额外使用 `VERIFY_RELAY_TOKEN` 与 `GITHUB_APP_PRIVATE_KEY`（PEM 内容），其余配置遵循上文。执行状态跨 runner 持久化；GitHub Actions 必须维持单一 concurrency group，不能同时运行本地联调执行器。中断中的操作不会静默重放；需要显式重跑。

当前为私有试用部署，不支持任意租户自助接入。事件工作流启动失败时，可通过 workflow_dispatch 重试；未部署周期性轮询服务。完成发布不代表已验证上游 Midscene 仓库中的 SDK／CLI PR。

## 主仓库云端验收

`.github/workflows/verify-engine.yml` 在标准 GitHub Ubuntu 执行器上验证协议测试及真实模型的成功／失败页面。模型调用复用仓库 `MIDSCENE_MODEL_API_KEY` secret 与同名前缀的模型 vars，通过共享 `ai-ci` action 执行。Fork PR 只运行不需要密钥的协议测试。

工作流上传 `verify-engine-evidence-<run-id>`，其中 `run.json` 记录源码 commit、工作流 URL、执行位置和各场景结果；每个场景保留独立 HTML、JSON、截图、trace 和 manifest。`VERIFY_SMOKE_OUTPUT_DIR` 可设置本机或 CI 的证据输出父目录。

这项检查验证验收引擎能区分正确与故障页面，不代表当前业务 PR 已通过功能验收。完整 App 接入仍需要组织允许安装、配置仓库策略，以及可信预览部署和版本接口。独立 App 工作流模板使用仓库变量 `VERIFY_APP_ID` 和 `VERIFY_PUBLIC_URL`，不内置个人试用账号配置。

## 根据 PR 上下文生成验收计划（公开仓库实验版）

在服务运营者维护的仓库策略中启用 `planning`，即可根据 PR 描述、正文中明确引用的同仓库 Issue（`#123`）、固定 base/head 版本的代码、有限的直接相对导入依赖，以及 base 版本的仓库文档生成浏览器验收项。服务通过 GitHub 读取代码，不执行仓库中的指令或 PR 源码。收集的文本会发送给配置的规划模型；公开证据仅记录上下文来源和哈希，不复制源码正文。由于报告公开且无需认证，此模式目前拒绝私有仓库。

```json
{
  "planning": {
    "mode": "context",
    "paths": ["/tasks"],
    "maxCriteria": 3,
    "excludePrefixes": [".github/", "docs/"]
  },
  "criteria": []
}
```

将这些字段加入已有仓库策略，保留 installation、部署、域名、版本接口和超时配置。此模式允许 `criteria` 为空，也可以保留必选的固定验收项；模型生成的条件不能替换它们。排除路径是运营者对验证范围的明确选择，会记录在 `context.json` 中，应尽量缩小范围。生成的计划只能使用已批准的路径和 `aiAct`／`aiAssert`，每项最多六步。程序校验来源和文件引用；遗漏文件、上下文截断、需求不清或规划失败，都不能得到通过结论。文件覆盖情况仍是模型判断，不代表已覆盖全部业务语义。

计划在浏览器执行前保存。证据新增 `plan.json`、`context.json` 和 `operator-policy.json`，并保留原生 HTML 回放、轨迹、截图和结论。调用 `inspectBundle` 时传入可信的运营者策略摘要；校验器会检查执行策略是否恰好由固定条件和已保存的生成条件组成。发布重试复用已有计划与执行结果。PR 描述更新会触发新的上下文验证；Issue 更新后需要显式重跑 Check。执行期间 PR 的 head、base、标题或正文变化，会使结果失效。

规划模型使用兼容 OpenAI chat-completions 的 HTTPS 接口，配置项为 `VERIFY_PLANNER_BASE_URL`、`VERIFY_PLANNER_API_KEY` 和 `VERIFY_PLANNER_MODEL`；未设置时使用对应的 `MIDSCENE_MODEL_*` 配置。规划请求超时为 90 秒，输出上限为 6,000 token；上下文最多收集 100,000 字符、30 个改动文件和五个 Issue 引用。仓库权限需要时增加 Contents 和 Issues 只读权限。模型生成的操作不构成安全沙箱，仅应连接已批准的测试环境并使用可丢弃的数据。

App 评论包含计划摘要、验收项标题、计划与来源链接、覆盖缺口、待澄清问题、原生报告入口和 Agent JSON。计划不完整或执行异常时，Check 为 `action_required`，评论为 **Inconclusive**；需求不清时标为 **Needs clarification**。本阶段只支持已有 Web Preview，尚不构建 PR 源码、不运行生成的单元或接口测试，也不检查所有传递依赖或对照 base/head 浏览器行为。
