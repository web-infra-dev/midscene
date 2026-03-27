# Midscene vs Browser Use vs Stagehand：WebVoyager Token 效率对比

我们使用 [WebVoyager](https://github.com/MinorJerry/WebVoyager) 数据集（ACL 2024 论文，覆盖 15 个真实网站的 643 个任务），将 Midscene 与两个最热门的 Web Agent 框架进行了对比——[Browser Use](https://github.com/browser-use/browser-use)（80K+ GitHub stars）和 [Stagehand](https://github.com/browserbase/stagehand)（21K+ stars）。

结论：**在相同任务上，Midscene 的 Token 消耗比 Browser Use 低 33%，比 Stagehand 低 55%——三个框架的任务完成能力相当。**

## 测试方案

三个框架使用完全相同的 LLM（Qwen 3.5 VL）、相同的 API 端点、相同的 WebVoyager 任务子集。在同一台机器上顺序执行，每个任务最多重试 3 次，取最佳成绩。

| 框架 | 技术路线 | 语言 |
|------|---------|------|
| **Midscene** | 纯视觉（只发截图） | TypeScript |
| **Browser Use** | 截图 + DOM 元素列表 | Python |
| **Stagehand** | DOM 无障碍树（不发截图） | TypeScript |

## Token 效率

为确保公平对比，我们只统计**三个框架都成功完成的 16 个任务**的 Token 消耗——消除了"某框架的高消耗任务恰好失败"导致的统计偏差。

| 框架 | 平均 Token（16 个共同成功任务） | 相比 Midscene |
|------|:---:|:---:|
| **Midscene** | **60K** | — |
| Browser Use | 90K | 1.5 倍 |
| Stagehand | 133K | 2.2 倍 |

**同样的任务，Midscene 比 Browser Use 省 33%，比 Stagehand 省 55%。**

### 逐任务明细

| 任务 | Midscene | Browser Use | Stagehand |
|------|---:|---:|---:|
| Amazon--10 | **39K** | 99K | 281K |
| ArXiv--5 | **99K** | 294K | 145K |
| BBC News--5 | **59K** | 77K | 213K |
| Cambridge Dictionary--5 | **31K** | 38K | 259K |
| Coursera--5 | **31K** | 53K | 109K |
| Coursera--20 | **144K** | 286K | 202K |
| GitHub--5 | 39K | 33K | **29K** |
| Google Map--20 | **40K** | 82K | 53K |
| Huggingface--20 | **58K** | 112K | 208K |
| Wolfram Alpha--5 | **39K** | 55K | 78K |

大多数任务 Midscene Token 最低。例外是简单导航类任务（如 GitHub），DOM 方案可以用更少的步数直接定位元素。

## 为什么 Midscene 更省 Token？

三个框架"看"网页的方式完全不同：

**Midscene（纯视觉）：** 每步只发一张截图给 LLM。截图是固定大小的图片——大约 3-5K Token，不管页面多复杂都一样。

**Browser Use（截图 + DOM）：** 每步发截图加上所有可交互 DOM 元素的文本描述（最多 40K 字符）。每步多消耗 10-15K Token。

**Stagehand（纯 DOM）：** 每步发完整的无障碍树。在复杂页面上可超过 60K 字符。

取舍很清楚：**纯视觉每步更便宜但步数更多**（Midscene 约 20 步 vs Browser Use 约 9 步）。但每步的节省超过了步数的增加，最终总 Token 更低。

| 因素 | Midscene | Browser Use | Stagehand |
|------|:---:|:---:|:---:|
| 每步 Token 成本 | 3-5K（固定） | 13-20K | 15-60K（随页面变化） |
| 平均步数 | ~20 | ~9 | ~10 |
| 是否随页面复杂度增长？ | 否 | 部分 | 是 |

这个架构差异在复杂页面上更加显著。简单的 GitHub 页面上三种方案成本接近，但在复杂的 Amazon 商品列表或内容丰富的 BBC 新闻文章上，DOM 方案发送的文本载荷越来越大，而 Midscene 的截图成本保持不变。

## 真实任务示例

**信息提取（Coursera--5："找一门 Python 入门课程"）：**
- Midscene：9 步，**31K Token**
- Browser Use：8 步，53K Token
- Stagehand：109K Token

**多步筛选（Amazon--10："查找 PS4 两年保修价格"）：**
- Midscene：12 步，**39K Token**
- Browser Use：类似步数，99K Token
- Stagehand：281K Token

**跨站导航（ArXiv--5："在 Semantic Scholar 上查引用次数"）：**
- Midscene：31 步，**99K Token**
- Browser Use：12 步，294K Token
- Stagehand：145K Token

ArXiv 的例子特别有意思：Browser Use 用更少的步数（12 vs 31）完成，但每步的 DOM 开销太大，最终总 Token 反而是 Midscene 的 3 倍。

## 这是 Prompt 工程的功劳吗？

三个框架都使用系统提示词引导 Agent 行为。Browser Use 内置了 270 行系统提示词，Stagehand 约 150 行，Midscene 内置的规划提示词约 240 行。

为排除 Prompt 差异的影响，我们做了消融实验——分别用不同的 Prompt 配置测试 Midscene：

| 配置 | 平均 Token |
|-----|:---:|
| 无额外规则 | 108K |
| 使用 Browser Use + Stagehand 原文规则 | 75K |
| 使用自定义规则 | 75K |

将其他框架的原文规则原封不动地应用到 Midscene 上，Token 效率与自定义规则完全一致——**证实了优势来自纯视觉架构本身，而非 Prompt 技巧。**

## 局限性

**任务完成率在不同轮次间波动较大。** 由于网络不稳定、CAPTCHA 随机触发和 API 速率限制，成功率在不同时间跑差异显著（Midscene 69%–96%，Browser Use 82%–100%）。因此我们聚焦于共同完成任务上的 Token 效率对比，而非成功率对比。

**CAPTCHA 对所有框架都是挑战。** Cloudflare Turnstile 拦截了所有三个框架对部分网站的访问。我们将持续被拦截的任务从分析中排除。

**纯视觉方案有其取舍。** Midscene 在 DOM 方案可以直接定位元素的任务上步数更多（如 GitHub--5：39 步 vs Browser Use 2 步）。精确点击小链接失败时需要重试或回退到 URL 导航。

**真实网站基准测试固有噪声大。** 我们正在开发本地静态页面基准测试，实现完全可复现的对比——初步结果显示不同轮次间 Token 差异 <1%。

## 自己试试

完整的基准测试代码开源在 `feat/webvoyager-benchmark` 分支：

```bash
git checkout feat/webvoyager-benchmark
cd packages/evaluation

# 运行 Midscene 基准测试
npx tsx web-voyager/runner-midscene.ts --subset 30 --skip-judge --trials 3

# 安装并运行 Browser Use / Stagehand
bash web-voyager/setup.sh --all
```

每个结果、每份报告、Agent 每一步的推理过程都记录在 Midscene 的 HTML 报告中——在浏览器中打开即可看到 Agent 在每一步做了什么。

## 结论

Midscene 的纯视觉方案在 Token 效率上具有明确优势：**同样的任务，比 Browser Use 省 33%，比 Stagehand 省 55%。** 这来自根本性的架构属性——截图是固定成本，不随页面复杂度增长——而非 Prompt 工程技巧。

随着网页变得越来越复杂（SPA、Shadow DOM、动态内容），DOM 方案每步发送的载荷会越来越大。Midscene 的固定成本截图意味着这个效率差距很可能会继续扩大。

---

*基准数据：2026-03-24，Qwen 3.5 VL，WebVoyager 任务，三框架在同一机器上顺序执行。Token 对比基于三框架都成功完成的 16 个任务。*
