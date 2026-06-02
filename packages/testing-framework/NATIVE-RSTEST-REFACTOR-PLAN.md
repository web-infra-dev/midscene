# testing-framework 重构计划:接入原生 Rstest(去掉 runMidsceneSuite + fork)

> 本文档是一次较长探索后固化的实现计划,供聚焦 session 独立执行。
> 需求来源(权威,冲突以它为准):
> https://codex-ui-testing-framework-d.midscene.pages.dev/zh/ui-testing-framework.html

## 1. 目标(文档定义的产品形态)

- 用户写 `midscene.config.ts`(`defineMidsceneConfig`)+ 自然语言 yaml cases(可选 `.test.ts`)。
  - `include: ['**/*.yaml', '**/*.test.ts']`,支持 `exclude`。
- **「Midscene 是基于 Rstest 封装构建的上层测试框架」**:rstest 是底层引擎,普通用户通过 yaml + config 交互,不直接碰 rstest。
- 两种使用模式:
  - **模式 A(日常)**:`midscene.config.ts` + yaml,用一个命令跑(框架内部用 rstest)。
  - **模式 B(emit 后)**:`midscene emit ./project-folder` 导出**原生 rstest 项目**
    (`rstest.config.ts` + `e2e/*.test.ts` + `package.json`),之后用原生 `rstest` 跑。
  - yaml 与 `.test.ts` 共享「同一个底层运行模型」。
- **本 PR(PR1)范围:模式 A + emit 一起做。**(用户已确认)

## 2. 当前问题(为什么要重构)

- 现有 `runMidsceneSuite`(`src/runner.ts`)+ fork worker(`src/runner-worker.ts`)是**选错入口**的产物:
  `tsx run-suite.ts` 在**主进程** `import midscene.config.ts` → 它 `import` playwright →
  playwright 内置 `@vitest/expect` 在 `globalThis` 抢注 `Symbol.for('$$jest-matchers-object')`(non-configurable);
  再同进程 `runRstest` 时 rstest 自己的 `@vitest/expect` 重定义同 symbol 就崩 → 被迫 fork 子进程绕开。
- **文档里根本没有 `runMidsceneSuite` 这个 API**。它是跑偏的抽象,要删。
- CLI 侧 `packages/cli/src/framework/` 才是正确参考:`runRstest` **in-process、不 fork**。

## 3. 目标架构(已用 PoC 验证可行,见第 4 节)

核心洞察:**让用户的 `midscene.config.ts`(含 playwright)只在 rstest worker 里加载,主进程/runner 不碰它** →
主进程干净,in-process `runRstest` 不冲突,**不需要 fork**。

- 提供一个 **bootstrap test 入口**(virtual module 或 emit 出的物理 `.test.ts`):
  在 rstest worker 里 `import` 用户 `midscene.config` → 发现 yaml/`.test.ts` cases →
  `beforeAll` 用 `target`/`setup` 建 agent → 为每个 case 动态注册一条 `test()`(跑 yaml flow + `yamlSteps`,写 result)→ `afterAll` teardown。
- 模式 A:框架命令生成 virtual bootstrap module + in-process `runRstest`(参考 CLI `runRstestYamlProject`,但**不 fork**)。
- 模式 B(emit):把同样的内容**落盘**成 `rstest.config.ts` + `e2e/*.test.ts` + `package.json`,用户用原生 `rstest` 跑。
- runner 主进程**不** `import` 用户 config(发现/注册都在 worker 的 bootstrap 里),因此不冲突、删 fork。

### 参考实现(CLI 侧,mirror 它但自包含、不依赖 @midscene/cli)
- `packages/cli/src/framework/rstest-runner.ts` — `runRstestYamlProject`:`runRstest` API + `@rsbuild/core` `VirtualModulesPlugin`,in-process。
- `packages/cli/src/framework/rstest-entry.ts` — `defineYamlCaseTest`:rstest `test()` 入口,跑一个 yaml case 写 result。
- `packages/cli/src/framework/rstest-project.ts` — `createRstestYamlProject`:把 yaml files 生成 virtual test modules。
- `packages/cli/src/framework/yaml-case.ts` — 跑单个 yaml case 的核心(193 行,实现 emit/入口时细读)。
- 依赖方向约束(见 memory `testing-framework-dependency-direction`):**`@midscene/testing-framework` 必须自包含,不能 import `@midscene/cli`**(否则与未来 PR2 `cli → testing-framework` 成环)。

## 4. PoC 验证结论(已在 `packages/testing-framework/poc/` 验证,实现后删除该目录)

1. **不冲突**:原生 `rstest run`(0.10.3)跑一个 `import { PlaywrightAgent } from '@midscene/web/playwright'` 的 `.test.ts`,
   1 passed,无 symbol 冲突 → 原生 rstest 模式**不需要 fork**。
2. **动态注册可行**:一个 bootstrap `.test.ts` 用 **top-level await** 异步发现 cases + `for` 循环动态 `test()` +
   `beforeAll` 共享 setup → 3/3 passed,所有动态 test 都看到 `beforeAll` 已执行。
   → 「worker 里发现 cases 并动态注册 test、共享 setup」这一架构基石成立。

## 5. 文件级改动清单(= 任务 #19–#23)

> 现有可复用资产:`src/runtime/`(`setup.ts` 建 agent、`yaml.ts` 的 `runYamlFlowWithCustomSteps` 跑 yaml+yamlSteps、
> `index.ts` 的 `FrameworkSuiteRuntime`)是**好的、要保留复用**的;`src/config.ts`(`collectFrameworkTestFiles`/`loadMidsceneConfig`/`defineMidsceneConfig`)保留。

- **删除**:
  - `src/runner-worker.ts`(整个 fork worker)。
  - `src/runner.ts` 里的 `runMidsceneSuite` + `defaultRstestRunner`(fork)+ `WorkerOutput.testErrors` 等。
  - 回退 commit `0e155dbbf`(worker 报错抽取 testErrors)的代码——重构会重写这些文件,直接去掉即可,不必单独 `git revert`(PR 未合主分支)。
- **新增/改写**:
  1. **rstest test 入口**(类比 CLI `defineYamlCaseTest`):一个在 rstest worker 里调用的 helper,
     用 `FrameworkSuiteRuntime` 完成 setup → 跑单个 yaml case(含 `yamlSteps`)→ 写 result。导出供 emit 的 `.test.ts` 使用。
  2. **bootstrap 入口**(模式 A 核心):top-level await 发现 cases + 动态注册。可以是
     一个 helper(如 `registerMidsceneSuite({ config, projectDir })`),emit 出的 `.test.ts` / virtual bootstrap 都调它。
  3. **in-process runner**(类比 CLI `runRstestYamlProject`):生成 virtual bootstrap module → `runRstest`(不 fork)。
     `@rsbuild/core` 仍按 worker 解析链(相对 `@rstest/core`)拿 `VirtualModulesPlugin`(已验证 rsbuild 2.0.9 该 API 在)。
  4. **`midscene emit`**:把 config + 发现的 cases 落盘成 `rstest.config.ts` + `e2e/*.test.ts` + `package.json`。
     `.test.ts` 内容 = `import config` + 调入口 helper;`rstest.config.ts` = 薄配置(testEnvironment node、include、pool 等),不 import 用户 config。
  5. **命令入口**(模式 A 跑法):提供框架自己的运行命令(如 `midscene test` 或等价 bin),内部 = in-process runner。
- **更新**:
  - `src/index.ts`:移除 `runMidsceneSuite`/`FrameworkRstestRunner`/`RunMidsceneSuiteOptions` 导出;新增 emit / 入口 helper / 命令相关导出。
  - `README.md`:用法从 `runMidsceneSuite()` 改为「写 config + yaml → 命令跑;`midscene emit` 导出原生 rstest 项目」。
  - 单测(`tests/unit-test/`):`runner.test.ts` 重写为新架构;补 emit、bootstrap 发现/注册、入口 helper 的单测。
  - `package.json`:`@rstest/core` 保持 `latest`(devDep,已改为 `latest` = 0.10.3;peerDep 保持 `*`)。

## 6. 已确认的关键决策

- emit 与模式 A **一起在本 PR 做**。
- `midscene.config.ts` **保留**;emit **之后**才是 rstest 原生(`rstest.config.ts` + `.test.ts`)。
- `@rstest/core` 用 **latest**(已改 devDep,工作区改动未 commit;pnpm-lock 已更新)。
- midscene-example 的 `testing-framework-demo/` demo 是手写脚本(不用本包、不用 rstest),是文档的实例对照,**保持远程分支原样、不要改**(本次已 `git checkout` + `git clean` 还原干净)。
- 接受回退 worker 修复 `0e155dbbf` 与整体重构(PR 未合主分支)。

## 7. 验证方式

- `npx nx test testing-framework`(单测)。
- 端到端:可用一个最小 fixture(midscene.config.ts + 一个 yaml)走模式 A 跑通 + `emit` 后用原生 `rstest` 跑通。
  - AI 步骤需 `MIDSCENE_MODEL_*` 等环境变量(见根 CLAUDE.md)。
- `pnpm run lint`(提交前,仓库根)。
- commit scope 用 `testing-framework`(Conventional Commits)。

## 8. 当前工作区状态(交接给新 session)

- `packages/testing-framework/package.json`:`@rstest/core` 已改为 `latest`(未 commit)。
- `pnpm-lock.yaml`:已 `pnpm install` 更新(未 commit)。
- `packages/testing-framework/poc/`:本次 PoC 临时文件,**实现时删除**。
- commit `0e155dbbf`(worker 修复)已 push 到 `origin/codex/testing-framework-config-runner`,重构中去掉其代码。
- midscene-example 当前分支 `codex/add-framework-setup-demo`:demo 已还原到远程,工作区干净。
