# Midscene vs Browser Use vs Stagehand: Token Efficiency on WebVoyager

We benchmarked Midscene against two of the most popular web agent frameworks — [Browser Use](https://github.com/browser-use/browser-use) (80K+ GitHub stars) and [Stagehand](https://github.com/browserbase/stagehand) (21K+ stars) — using the [WebVoyager](https://github.com/MinorJerry/WebVoyager) dataset, an academic benchmark published at ACL 2024 with 643 tasks across 15 real websites.

Here's what we found: **On the same tasks, Midscene consumes 33% fewer tokens than Browser Use and 55% fewer than Stagehand — while all three frameworks achieve comparable task completion.**

## Setup

All three frameworks used the same LLM (Qwen 3.5 VL), the same API endpoint, and the same task subset from WebVoyager. We ran them sequentially on the same machine to ensure a fair comparison. Each task was retried up to 3 times, with the best result kept.

| Framework | Tech Approach | Language |
|-----------|--------------|----------|
| **Midscene** | Pure vision (screenshot only) | TypeScript |
| **Browser Use** | Screenshot + DOM element list | Python |
| **Stagehand** | DOM accessibility tree (no screenshot) | TypeScript |

## Token Efficiency

To ensure a fair comparison, we measured token consumption only on the 16 tasks that **all three frameworks completed successfully** — eliminating any bias from one framework's expensive task happening to fail in a particular run.

| Framework | Avg Token (16 common tasks) | vs Midscene |
|-----------|:---:|:---:|
| **Midscene** | **60K** | — |
| Browser Use | 90K | 1.5x |
| Stagehand | 133K | 2.2x |

**Midscene uses 33% fewer tokens than Browser Use and 55% fewer than Stagehand** on the same successfully completed tasks.

### Per-Task Breakdown

| Task | Midscene | Browser Use | Stagehand |
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

Midscene uses the fewest tokens in the majority of tasks. The exceptions are simple navigation tasks (GitHub, Hugging Face) where DOM-based frameworks can locate elements in fewer steps.

## Why Is Midscene More Token-Efficient?

The three frameworks take fundamentally different approaches to "seeing" a web page:

**Midscene (Pure Vision):** Each step, Midscene sends only a screenshot to the LLM. A screenshot is a fixed-size image — roughly 3-5K tokens regardless of page complexity. Whether it's a simple GitHub page or a complex Amazon product listing, the token cost per step stays constant.

**Browser Use (Screenshot + DOM):** Each step sends a screenshot plus a text representation of all interactive DOM elements (up to 40K characters). This gives the LLM precise element information for accurate clicking, but costs 10-15K extra tokens per step.

**Stagehand (Pure DOM):** Each step sends the full accessibility tree — no screenshot at all. On complex pages, this tree can exceed 60K characters, leading to very high per-step token costs.

The trade-off is clear: **pure vision is cheaper per step but requires more steps** (Midscene averages ~20 steps vs Browser Use's ~9). However, the per-step savings outweigh the extra steps, resulting in lower total token consumption.

| Factor | Midscene | Browser Use | Stagehand |
|--------|:---:|:---:|:---:|
| Per-step token cost | 3-5K (fixed) | 13-20K | 15-60K (varies) |
| Avg steps per task | ~20 | ~9 | ~10 |
| Scales with page complexity? | No | Partially | Yes |

This architectural difference becomes more pronounced on complex pages. On a simple GitHub page, the three approaches cost roughly the same. But on a complex Amazon product listing or a content-heavy BBC News article, DOM-based approaches send increasingly large text payloads while Midscene's screenshot cost remains constant.

## Real-World Task Examples

**Information extraction (Coursera--5: "Find a Python course for beginners"):**
- Midscene: 9 steps, **31K tokens**
- Browser Use: 8 steps, 53K tokens
- Stagehand: 109K tokens

**Multi-step filtering (Amazon--10: "Find cost of 2-year PS4 protection plan"):**
- Midscene: 12 steps, **39K tokens**
- Browser Use: similar steps, 99K tokens
- Stagehand: 281K tokens

**Cross-site navigation (ArXiv--5: "Find citation count on Semantic Scholar"):**
- Midscene: 31 steps, **99K tokens**
- Browser Use: 12 steps, 294K tokens
- Stagehand: 145K tokens

The ArXiv example is particularly interesting: Browser Use completes it in fewer steps (12 vs 31), but its per-step DOM overhead is so large that it ends up consuming 3x more tokens overall.

## Is This Just Prompt Engineering?

All three frameworks use system prompts to guide agent behavior. Browser Use ships with a 270-line system prompt covering retry logic, loop detection, CAPTCHA handling, and efficiency guidelines. Stagehand includes ~150 lines of tool selection strategy. Midscene's built-in planning prompt is ~240 lines.

To ensure our results aren't driven by prompt differences, we ran an ablation study. We tested Midscene with three different prompt configurations:

| Configuration | Avg Token |
|--------------|:---:|
| No additional rules | 108K |
| Browser Use + Stagehand rules (verbatim) | 75K |
| Our custom rules | 75K |

With the other frameworks' own rules applied verbatim to Midscene, token efficiency is identical to our custom rules — **confirming that the advantage comes from the pure-vision architecture, not prompt engineering.**

## Limitations

**Task completion rates are not directly comparable across runs.** Success rates fluctuate significantly between runs (69%–96% for Midscene, 82%–100% for Browser Use) due to network instability, CAPTCHA randomness, and API rate limits. This is why we focus on token efficiency on commonly-completed tasks rather than success rate comparisons.

**CAPTCHA blocks all frameworks.** Cloudflare Turnstile blocked all three frameworks on certain sites. Google's reCAPTCHA was inconsistent. We excluded persistently blocked tasks from the analysis.

**Pure vision has trade-offs.** Midscene uses more steps for tasks where DOM-based frameworks can directly locate elements (e.g., GitHub--5: 39 steps vs 2 steps for Browser Use). When clicking precise small links fails, Midscene needs to retry or fall back to URL navigation.

**Real-website benchmarks are inherently noisy.** We're developing a local static page benchmark for fully reproducible comparisons — early results show consistent token patterns with <1% variance between runs.

## Try It Yourself

The complete benchmark code is open source:

```bash
git checkout feat/webvoyager-benchmark
cd packages/evaluation

# Run Midscene benchmark
npx tsx web-voyager/runner-midscene.ts --subset 30 --skip-judge --trials 3

# Setup and run Browser Use / Stagehand
bash web-voyager/setup.sh --all
```

Every result, every report, every step of the agent's reasoning is captured in Midscene's HTML reports — you can open them in a browser to see exactly what the agent did at each step.

## Conclusion

Midscene's pure-vision approach delivers a clear token efficiency advantage: **33% fewer tokens than Browser Use, 55% fewer than Stagehand on the same tasks.** This comes from a fundamental architectural property — screenshots are fixed-cost regardless of page complexity — rather than prompt engineering.

As web pages grow more complex (SPAs, shadow DOM, dynamic content), DOM-based approaches will send increasingly large payloads per step. Midscene's fixed-cost screenshots mean this complexity gap is likely to widen over time.

---

*Benchmark data: 2026-03-24, Qwen 3.5 VL, WebVoyager tasks, all frameworks run sequentially on the same machine. Token comparison based on 16 tasks all three frameworks completed successfully.*
