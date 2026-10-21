# Grounding evaluation

This Vitest suite runs `aiLocate` once per testcase in `../testcases`. It uses each testcase's original-language instruction and original screenshot. A point is correct when its center falls inside the inclusive `[top, right, bottom, left]` ground-truth box; a `REFUSAL` is correct only when `aiLocate` explicitly reports that the target was not found.

Install workspace dependencies at the repository root, configure the Midscene model environment variables, and run:

```sh
pnpm --dir benchmark/grounding-new/evaluation evaluate
```

At minimum, set `MIDSCENE_MODEL_NAME` and the API settings required by that model, such as `MIDSCENE_MODEL_API_KEY` and `MIDSCENE_MODEL_BASE_URL`. If you configure a separate locate model, set `MIDSCENE_LOCATE_MODEL_NAME` and its API settings as well. The output filename uses the locate model name when one is set, otherwise the default model name.

To run one testcase, pass a Vitest name filter:

```sh
pnpm --dir benchmark/grounding-new/evaluation evaluate -t GUI-MOBILE100-factors-v1-023
```

Each invocation creates `output/<Date.now()>/<model-name>-<testcase-name>.json`. Each JSON records the instruction, ground truth, prediction, correctness, elapsed time, and any execution error. Incorrect answers and execution errors fail their Vitest tests after the JSON is written. The output directory is ignored by Git. No aggregate report is generated.
Characters outside letters, digits, `.`, `_`, and `-` in the model name become `_` in the filename; the JSON keeps the original model name.
