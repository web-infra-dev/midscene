# WebVoyager Evaluation

基于 [WebVoyager](https://github.com/MinorJerry/WebVoyager) 数据集，对比 Midscene / Browser Use / Stagehand 三个框架。

## 目录结构

```
web-voyager/
├── dataset.ts              # 统一任务集（30/75 子集）
├── types.ts                # 统一结果类型
├── judge.ts                # LLM Judge（自动评判）
├── runner-midscene.ts      # Midscene runner
├── runner-browseruse.py    # Browser Use runner (Python)
├── runner-stagehand.ts     # Stagehand runner
├── compare.ts              # 对比报告生成器
├── setup.sh                # 外部框架安装脚本
├── results/                # 结果输出（git ignored）
└── _workspace/             # 外部依赖（git ignored）
    ├── bu-venv/            # Browser Use Python venv
    ├── eval/               # browser-use/eval clone
    └── stagehand/          # stagehand clone + patches
```

## 安装

```bash
# Midscene 无需额外安装（monorepo 内）

# 安装 Browser Use + Stagehand
bash setup.sh --all

# 或单独安装
bash setup.sh --browser-use
bash setup.sh --stagehand
```

## 运行

```bash
# 配置模型（.env 或环境变量）
export MIDSCENE_MODEL_NAME=openai_qwen3.5-plus
export MIDSCENE_MODEL_BASE_URL=...
export MIDSCENE_MODEL_API_KEY=...

# 1. Midscene
npx tsx runner-midscene.ts --subset 30

# 2. Browser Use
source _workspace/bu-venv/bin/activate
cd _workspace/eval
QWEN_API_KEY=xxx QWEN_BASE_URL=xxx QWEN_MODEL_NAME=xxx python run_qwen.py --subset 30

# 3. Stagehand
cd _workspace/stagehand
STAGEHAND_USE_CHAT_COMPLETIONS=true STAGEHAND_NO_TOOL_CHOICE=true \
  OPENAI_API_KEY=xxx OPENAI_BASE_URL=xxx QWEN_MODEL_NAME=xxx \
  npx tsx run_qwen.ts

# 4. 生成对比报告
npx tsx compare.ts --auto
```

## 选项

| Flag | 说明 | 默认值 |
|------|------|--------|
| `--subset 30\|75` | 任务子集 | `30` |
| `--headed` | 显示浏览器 | headless |
| `--skip-judge` | 跳过评判 | 启用 |
| `--only <id>` | 只跑单个任务 | 全部 |
| `--timeout <ms>` | 单任务超时 | `360000` |

## 技术路线对比

| 框架 | 输入方式 | 元素定位 | 语言 |
|------|----------|----------|------|
| Midscene | 纯视觉（截图） | 坐标 | TypeScript |
| Browser Use | 截图 + DOM 元素列表 | 元素 index | Python |
| Stagehand | DOM a11y tree | 元素 index | TypeScript |
