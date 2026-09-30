# Frozen grounding dataset / 固定定位测试集

This directory contains the evaluated **Web v4.7 + Mobile v4.6** subset: **200 cases**. It preserves the original screenshots, queries, expected outcomes, GT boxes, case names, and case tags. Case names retain their historical revision numbers; membership and order are defined by `_data/dataset/case_names.json`.

本目录包含已评测的 **Web v4.7 + Mobile v4.6，共 200 题**。原图、query、预期答案类型、GT 框、case 名称与 tags 均保留原样。各 case 名称中的历史版本号保留不变；本版成员及顺序以 `_data/dataset/case_names.json` 为准。

## Composition / 组成

| Platform / 平台 | Basic | Functional | Reason | Refusal | Total / 总计 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Web | 30 | 40 | 25 | 5 | 100 |
| Mobile | 30 | 40 | 25 | 5 | 100 |
| Total / 总计 | 60 | 80 | 50 | 10 | 200 |

- **Basic**: direct element grounding from text or visual appearance. / 按文字或外观直接定位元素。
- **Functional**: locate the control that performs the described function. / 理解功能后定位对应控件。
- **Reason**: identify a uniquely qualifying visible target using constraints or reasoning. / 结合条件或推理选出画面中的唯一目标。
- **Refusal**: no visible target satisfies all stated conditions; the official GT box is `null`. / 画面中没有满足全部条件的目标，官方 GT 框为 `null`。

PC cases, superseded cases, credentials, and historical model results are not part of this dataset. / 本数据集不包含已归档 PC 题、已被替换的题、认证信息及历史模型运行结果。

## Layout / 目录

```text
_data/
  cases/<case_name>/
    index.json                 # Query, image filename, GT, expected outcome, tags
    <original-image>.png|jpg   # Original bytes: 194 PNG + 6 JPEG, no resizing
  dataset/
    case_names.json           # Authoritative ordered 200-case roster
    manifest.jsonl            # Source records, classification, license, image path
    image-hashes.json          # SHA-256 from the evaluated snapshot, keyed by case name
    case-index-hashes.json     # SHA-256 of unchanged index.json files
    audit.json                # Frozen composition and curation decisions
    migration-audit.json       # File hashes and exact path-only manifest adaptations
    source-validation.json    # Historical independent validation before evaluation
    secondary-review.json     # Ten newly added Reason semantic/GT reviews
    refusal-selection.json    # Historical subset calibration procedure
    refusal-semantic-review.json # Reviews of the retained ten Refusal cases
    review-evidence/          # Existing overlays/crops used in five Web Reason reviews
```

`manifest.jsonl` image and review-evidence paths resolve **relative to `_data/dataset/`**. Each `index.json` image filename resolves relative to its own case directory. The authoritative manifest preserves each source URL, pinned source revision, source record ID, available original annotations, license metadata, and coordinate-conversion notes.

`manifest.jsonl` 中的图片与复核证据路径均**相对于 `_data/dataset/`**；每份 `index.json` 的图片文件名则相对于所在 case 目录。清单保留来源 URL、固定来源版本、原始记录 ID、已有原始标注、许可元数据与坐标转换说明。

Some `index.json` notes mention historical `_data/imports/...` paths from the source repository. They are provenance text, not file-loading dependencies; the current manifest is `_data/dataset/manifest.jsonl`. These notes are intentionally unchanged so that index file hashes match the evaluated snapshot.

部分 `index.json` 的说明仍提及旧仓库的 `_data/imports/...` 路径；这是历史溯源文字，不参与文件加载。当前完整清单为 `_data/dataset/manifest.jsonl`。保留原说明可使 index 文件哈希与已评测快照完全一致。

## Sources and license metadata / 来源与许可元数据

The license column reproduces the frozen source metadata; the dataset is not relicensed under a single blanket license. Source-specific evidence URLs and original values, where recorded, are retained in each manifest row.

许可列沿用固定版本中的来源元数据，未将混合数据统一改为另一种许可；已有的许可证据链接与来源原值均保留在逐题清单中。

| Source / 来源 | Cases / 题数 | Recorded license / 原记录许可 | Pinned revision / 固定版本 |
| --- | ---: | --- | --- |
| [VenusBench-GD](https://huggingface.co/datasets/inclusionAI/VenusBench-GD) | 148 | MIT | `7e5714566f912203c9989b06ef4c08bdf913e3fa` |
| [MMBench-GUI L2](https://huggingface.co/datasets/OpenGVLab/MMBench-GUI) | 32 | Apache-2.0 | `e27757e3910e0d5995b811f916b509b4e34a4690` |
| [ScreenSpot-v2](https://huggingface.co/datasets/OS-Copilot/ScreenSpot-v2) | 15 | Apache-2.0 | `5efbb1f1b5463a575f2eb7bc30fe29e49c15f93c` |
| [WebClick](https://huggingface.co/datasets/Hcompany/WebClick) | 5 | Apache-2.0 | `9482a7d5aaa8f4cd5d28d9ed0c8e0c48d20b1e4a` |

## Migration checks / 迁移校验

Source: `midscene-evaluation`, commit `7f029e4c5cc491a3eb611d1d85d88a9743a9c237`, import `grounding/_data/imports/gui-grounding-web-v4p7-mobile-v4p6-200`. The import was cross-checked against the frozen snapshot used by run bundle `gui-grounding-web-v4p7-mobile-v4p6-qwen37plus-retry-20260929-193516` before copying.

迁移源为以上 commit 中的 200 题清单；复制前已与上述已评测运行包的固定快照逐题比对。

- All 200 image SHA-256 values and 200 `index.json` SHA-256 values match the evaluated snapshot. / 200 张原图和 200 份 index 的 SHA-256 均与已评测快照一致。
- Queries, GT boxes, expected outcomes, and tags are unchanged. The 190 positive cases have in-bounds boxes; the ten Refusal cases retain `null` GT. / query、GT、预期类型和 tags 未改；190 道正例框在图内，10 道 Refusal 保持空 GT。
- All 200 original image hashes are unique. Dimensions are checked against PNG/JPEG headers. / 200 张原图哈希均唯一，尺寸与图片头一致。
- Manifest changes only make image and review-evidence paths portable. Source annotations and semantics are unchanged; per-field changes are listed in `migration-audit.json`. / 清单仅适配相对路径，逐字段变更在迁移记录中列明。
- Historical baseline run paths are stored as stable run IDs; no host-specific absolute paths are required. / 历史校准运行以运行 ID 记录，无本机绝对路径依赖。

Case files occupy 221,234,985 bytes (about 211 MiB); provenance and review evidence add about 5.2 MiB. These are original image bytes, not report thumbnails.

case 文件共 221,234,985 字节（约 211 MiB），溯源资料与复核证据约 5.2 MiB；测评使用原图，不使用报告缩略图。

## Evaluation and curation boundaries / 评测与抽样口径

For a positive case, a predicted point must lie inside the GT box. For Refusal, only a protocol-confirmed not-found result is correct. API errors, parsing errors, and other failures remain incorrect in the full selected-case denominator.

正例以预测点落在 GT 框内为正确；Refusal 仅认可协议明确返回的未找到目标。API、解析或其他执行失败均计错，保留在所选题目总分母中。

The retained five Refusal cases per platform were selected, at the user's request, to approximate prior GPT/Seed ten-case pass rates while preserving semantic clarity and application/type diversity. This is historical subset calibration, not a random or model-independent estimate of full-benchmark ability. New Reason selection did not use model outcomes. `refusal-selection.json` and the review records retain these decisions; no historical model-result files are bundled.

每端保留的五道 Refusal 按用户要求，在语义清楚、应用与类型多样的前提下，尽量接近此前 GPT/Seed 在十道题上的通过率。这属于历史结果校准抽样，不能视为随机、模型无关的完整 benchmark 能力估计；新增 Reason 未使用模型结果选题。相关决策和复核记录随数据保留，未打包旧模型结果文件。
