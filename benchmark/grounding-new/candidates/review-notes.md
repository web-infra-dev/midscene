# Candidate review

Candidate testcases are separate from the benchmark testcases and evaluation runs. The first batch contains 100 samples, with 20 from each source. Sources were sampled without replacement using a fixed seed, followed by scene, duplicate and annotation checks. The cases retain the source instruction, image and ground truth; Chinese instructions and category reasons are drafts for review.

`iterator.json` records the seed, source revisions, emitted record IDs and the remaining randomized queues. `pool/` contains source record indexes without local temporary paths. Remaining records are a candidate queue, not a claim that every record has passed scene, annotation, privacy or duplication review. OSWorld-G has no platform field: its pool includes the complete initial case index with screening statuses; the queue currently contains the 40 provisionally identified Web records with rectangular or refusal annotations. Web polygon annotations and uncertain scenes remain in its index for further review.

When preparing a later batch, select without replacement from each remaining source queue, review the screenshot and annotation, and update the emitted IDs and batch history. Balance the sources as far as available eligible records permit. Do not add candidates to the official testcase directory until they have been selected and reviewed.

The following initial observations are retained for review; they do not change the upstream image, instruction or ground truth:

| Candidate | Observation |
| --- | --- |
| candidate-00005 | The upstream refusal annotation may conflict with the visible time controls. |
| candidate-00014 | The box covers a course card; the requested application action may require another step. |
| candidate-00016 | The screenshot contains an email address; review before publication. |
| candidate-00031 | The requested product appears more than once; check whether the target is unambiguous. |
| candidate-00046 | The requested text appears on multiple tracks, while the box covers an icon on the first track. |
| candidate-00050 | The instruction refers to a pop-up, while the annotated button appears to allow notifications. |
| candidate-00074 | The box covers an entire advertising banner; verify its clickable extent. |
| candidate-00079 | The capitalization of the referenced username differs from the visible name. |
| candidate-00091 | The number in the instruction appears to differ from the annotated screenshot text. |

Other screenshots can also contain names or public contact information; check each selected image before public release. Candidate-00093 is a tablet interface and is currently classified as Mobile.

The second batch contains 200 candidates: GroundUI-1K 48, UI-I2E-Bench 49, ScreenSpot-v2 48, WebClick 48 and OSWorld-G 7. It prioritizes screenshots not used in the official testcases or earlier candidates. Screened-out records remain in the source queues for possible later review; observations from this batch are retained in `pool/batch-2-screening.json`.

| Candidate | Observation |
| --- | --- |
| candidate-00109 | The source date “06/03/2026” can be interpreted in multiple formats. |
| candidate-00120 | The source labels the requested upload button as absent; verify the refusal against the screenshot. |
| candidate-00299 | The requested month is several months away, while the source GT points to the next-month button; check whether the single action is a suitable target. |

The third batch contains 200 candidates: 50 each from GroundUI-1K, UI-I2E-Bench, ScreenSpot-v2 and WebClick. Remaining nonduplicate OSWorld-G scenes were outside the current mobile and web scope, so none were added in this batch. Screened-out records remain in the source queues; screening observations are recorded in `pool/batch-3-screening.json`.
