# Primary-factor grounding dataset / 十主考点定位测试集

Frozen revision: **Web primary v3 + Mobile primary v1, 2026-10-08**, 200 cases.
This is the exact query/GT/image selection evaluated in batch
`web-mobile200-primary-astra-20261008-141330`. Membership and order are fixed by
`_data/dataset/case_names.json`; historical version numbers in case IDs are retained.

固定版本：**Web primary v3 + Mobile primary v1，2026-10-08，共 200 题**。
query、GT 与图片均为上述批次评测的版本；成员及顺序以
`_data/dataset/case_names.json` 为准，保留 case ID 中的历史版本号。

## Composition and selection / 配额与筛选标准

Each case has one primary factor. Secondary factors may overlap; these quotas do
not by themselves establish a statistically orthogonal factorial design.

每题指定一个主考点，次要因子可以重叠；主类配额本身不等同于统计意义上的正交实验设计。

| Primary factor / 主考点 | Web | Mobile | Selection criterion / 筛选标准 |
| --- | ---: | ---: | --- |
| Element basic / 直接元素定位 | 20 | 20 | Visible text or appearance directly identifies the target / 直接根据可见文字或外观定位 |
| Unfamiliar Icon / 不常见图标 | 5 | 5 | Recognize an application/domain-specific symbol / 识别应用或领域专用符号 |
| Small Target / 小目标 | 10 | 10 | A small visible landing target among nearby content / 小落点及邻近干扰 |
| Color Recognition / 颜色识别 | 5 | 5 | Color distinguishes similarly shaped candidates / 同形或近似形状，必须按颜色区分 |
| Functional / 功能意图定位 | 20 | 20 | Map intent to a visible functional control / 从意图判断功能入口 |
| Reasoning / 推理 | 20 | 20 | Infer a unique target from visible information or limited semantic knowledge / 根据画面信息或有限语义知识推导唯一目标 |
| Fine-grained Manipulation / 控件内部精确位置 | 5 | 5 | Official GT for a specific part inside a control/chart / 控件或图表内部局部位置，有对应官方 GT |
| Relative Position / 相对位置 | 5 | 5 | A visible unique anchor establishes direction/order / 相对可见唯一锚点确定方向或序位 |
| Disambiguation / 重复元素消歧 | 5 | 5 | An explicit anchor distinguishes repeated targets / 用明确锚点区分重复候选 |
| Refusal / 目标不存在 | 5 | 5 | Official no-target annotation and no satisfying visible target / 官方无目标标注，画面中无满足全部条件的目标 |
| Total / 合计 | 100 | 100 | |

`primary_factor`, `primary_factor_reason`, secondary tags, and original benchmark
categories remain in the manifest. Mobile selection standards include the exact
roster in `mobile-search-standards.json`; reasoning diversity is recorded in
`web-reasoning-diversity.json` and `mobile-reasoning-diversity.json`.
Mobile Reasoning covers numerical comparison, calendar/time, state/role, semantic
understanding, and multiple constraints/association, four cases each.

逐题主类及理由、次要因子、原 benchmark 类别保存在 manifest；Mobile 具体标准和
名单见 `mobile-search-standards.json`，两端推理多样性见各自 reasoning-diversity 记录。
Mobile 推理分数值比较、时间日历、状态角色、语义理解、多条件关联，各四题。

Unfamiliar-icon rarity is a reviewer judgment. The Mobile small-target selection
uses a 360-pixel short-side reference scale, GT short edge ≤28 pixels and area
≤0.5%; this is a curation threshold, not physical device dp or an official metric.

图标是否不常见为人工判断。Mobile 小目标采用图片短边缩放至 360 像素时，GT 短边
≤28 像素、面积≤0.5%的筛选线；这不是设备真实 dp，也不是官方指标。

### Four-category report mapping / 四分类报告映射

Functional → `functional`, Reasoning → `reason`, Refusal → `refusal`; the other
six primary factors → `basic`. Each platform therefore has **55/20/20/5** cases.
`source_task_class` and native `source_category` preserve earlier/native labels.
This mapping changes metadata, not queries or answers.

现有四分类报告中，每端 Basic 55、Functional 20、Reason 20、Refusal 5。
`source_task_class` 和原始 `source_category` 保留旧标签及来源分类；此映射只调整元数据。

## Sources / 来源

| Source / 来源 | Web | Mobile | Pinned revision / 固定版本 | Recorded license metadata / 原记录许可 |
| --- | ---: | ---: | --- | --- |
| [VenusBench-GD](https://huggingface.co/datasets/inclusionAI/VenusBench-GD) | 68 | 55 | `7e5714566f912203c9989b06ef4c08bdf913e3fa` | MIT; not_declared_in_dataset_card |
| [WebClick](https://huggingface.co/datasets/Hcompany/WebClick) | 6 | 0 | `9482a7d5aaa8f4cd5d28d9ed0c8e0c48d20b1e4a` | Apache-2.0 |
| [MMBench-GUI L2](https://huggingface.co/datasets/OpenGVLab/MMBench-GUI) | 5 | 27 | `e27757e3910e0d5995b811f916b509b4e34a4690` | Apache-2.0 |
| [MedSPOT](https://huggingface.co/datasets/Tajamul21/MedSPOT) | 3 | 0 | `dc65c80d24cd380e08ff7de2b2aa63b7d20bef60` | not recorded |
| [GroundUI-18K](https://huggingface.co/datasets/agent-studio/GroundUI-18K) | 2 | 0 | `f061eba2b7e3fffcf511694f15ad3ca38898ab9e` | MIT |
| [OSWorld-G](https://github.com/xlang-ai/OSWorld-G) | 2 | 0 | `daa6bd8e0e629f0917ad2984df930bf0bd967540` | Apache-2.0 |
| [FineState-Bench](https://huggingface.co/datasets/Willtime2006/Static-FineBench) | 4 | 10 | `d65c3451e573d3641b6297f8aa57b623878b1731` | MIT declared in repository README; dataset card unspecified; not_declared_in_dataset_card |
| [ScreenSpot-v2](https://huggingface.co/datasets/OS-Copilot/ScreenSpot-v2) | 10 | 8 | `5efbb1f1b5463a575f2eb7bc30fe29e49c15f93c` | Apache-2.0 |

License values are frozen provenance, including undeclared or inconsistent
historical entries. They are not a blanket redistribution license for this mix.
The source URLs, record IDs, revisions, raw annotations where available, and
conversion notes are retained per row.

许可列沿用固定来源记录，包含未声明或历史不一致的值，不为混合集统一赋予新许可。
逐题保留来源 URL、ID、版本、已有原始标注和转换说明。

## GT and scoring / GT 与计分

- Queries, GT coordinates, and original image bytes are unchanged from the
  evaluated snapshot. Existing rounded/unrounded conversions remain as recorded.
  / query、GT 和原图与已评测快照一致；旧题逐题保留已有取整或非取整转换。
- New normalized GT uses decoded image width/height without rounding or padding.
  / 新题归一化 GT 乘实际解码图片尺寸，不取整、不扩大框。
- FineState fine cases use the original locate instruction and current-state
  `processing_details.loactebbox` (the upstream field spelling), not the broad
  component box or a future interaction state.
  / FineState 精细题使用原 locate 指令和作者当前状态局部框 `loactebbox`。
- Four Mobile color cases use original FineState interact instructions paired
  with official `interactbbox` for visible color swatches. This benchmark tests
  point localization only, not drag execution or final interaction state.
  / 四道 Mobile 颜色题保留作者 interact 指令和可见色块的官方 interactbbox；只评落点。
- Positive cases pass when the predicted point falls inside GT. Refusal retains
  null GT and passes only with protocol-confirmed `not-found`. API/parse failures
  remain incorrect in the planned denominator.
  / 正例点落框内通过；Refusal 保留空 GT，仅明确未找到通过；API/解析失败计错。

This primary-factor revision did not use model scores for selection. The retained
Refusal subsets have an earlier calibration history against model outcomes,
recorded in `refusal-selection.json`; they are not a random benchmark sample.

本次主考点版本未按模型分数选题。保留的 Refusal 存在此前按模型结果校准抽样的历史，
见 `refusal-selection.json`；不能将其视为原 benchmark 的随机样本。

## Files and integrity / 文件与一致性

```text
_data/
  cases/<case_name>/
    index.json                   # Query, GT, primary factor, tags, expected outcome
    <case_name>.png|jpg           # Unmodified original screenshot bytes
  dataset/
    case_names.json              # Ordered authoritative 200-case roster
    manifest.jsonl               # Portable paths and complete source metadata
    image-hashes.json            # Original image SHA-256 per case
    case-index-hashes.json       # Evaluated runtime index SHA-256 per case
    audit.json                   # Current composition, source counts, snapshot hashes
    migration-audit.json         # Path-only metadata changes and semantic/byte checks
    web-audit.json               # Original Web v3 curation receipt
    mobile-audit.json            # Original Mobile v1 curation receipt
    *-official-source-verification.json # Web fine / all Mobile source checks
    *-reasoning-diversity.json    # Reasoning subtype coverage
    mobile-search-standards.json # Mobile standards and roster per primary factor
```

Image paths resolve relative to `_data/dataset/`; index image filenames resolve
relative to their case folder. Historical `prior_image_path` fields are provenance
text, not runtime dependencies. `original_dataset_root` is a portable historical
snapshot label. Only these path fields differ from the evaluated manifest;
`migration-audit.json` records each change. All 200 evaluated index files and
image bytes are copied exactly. Original source records are unchanged.

图片路径相对于 `_data/dataset/`；index 图片名相对于所在 case 目录。旧图片路径只用于
历史溯源，不参与加载；旧本机根路径改为历史快照标签。迁移仅适配这些路径元数据，
逐题记录见 `migration-audit.json`。200 份已评测 index 和原图按字节复制，原始来源记录未改。

Existing `source-validation.json`, `secondary-review.json`,
`refusal-semantic-review.json`, and `review-evidence/` are historical curation
records scoped to their named cases; `audit.json` is the current dataset receipt.
Original Web/Mobile curation receipts retain their pre-evaluation status wording.

已有 source-validation、secondary-review、refusal-semantic-review 和 review-evidence
为对应 case 的历史复核记录；当前版本以 audit.json 为准。两端原始抽样记录保留当时
“未评测”的状态文字，不能用该旧字段判断当前运行状态。

Run `pnpm validate:data` from `benchmark/grounding` to verify 200 unique original
screenshots, dimensions, index hashes, query/GT consistency, GT bounds, ten-factor
quotas on each platform, and four-category mapping. Original case files occupy
205,370,074 bytes (about 196 MiB). Runtime reports and credentials are ignored by Git.

在 benchmark/grounding 执行 `pnpm validate:data`，核对 200 张唯一原图、尺寸、index 哈希、
query/GT 一致性、框边界、两端十主类配额及四分类映射。case 文件约 196 MiB；
模型认证信息和运行报告由 Git 忽略。
