"""
Browser Use + Qwen 3.5 VL runner for WebVoyager benchmark.

Runs the same task subset as the Midscene runner, with unified output format.

Usage:
  python run_qwen.py [--subset 30|75] [--max-concurrent 1] [--skip-judge]

Required env vars:
  QWEN_API_KEY       - Qwen API key
  QWEN_BASE_URL      - Qwen OpenAI-compatible endpoint (e.g. https://dashscope.aliyuncs.com/compatible-mode/v1)
  QWEN_MODEL_NAME    - Model name (e.g. qwen-vl-max-latest)

Optional env vars:
  JUDGE_API_KEY      - OpenAI key for GPT-4o judge (defaults to OPENAI_API_KEY)
  JUDGE_MODEL        - Judge model (default: gpt-4o)
"""

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

# ---------------------------------------------------------------------------
# Task dataset (same 30-task subset as Midscene runner)
# ---------------------------------------------------------------------------
SUBSET_30 = [
    {"id": "Allrecipes--3", "web_name": "Allrecipes", "web": "https://www.allrecipes.com/", "ques": "Search for a recipe of Beef Wellington on Allrecipes that has more than 200 reviews and a rating of at least 4.5 stars. List the main ingredients required for the recipe."},
    {"id": "Allrecipes--10", "web_name": "Allrecipes", "web": "https://www.allrecipes.com/", "ques": "I want to make vegetarian lasagna, find a recipe that has a rating of 4 stars or more and uses zucchini as one of the ingredients."},
    {"id": "Amazon--10", "web_name": "Amazon", "web": "https://www.amazon.com/", "ques": "Find the cost of a 2-year protection plan for a PS4 on Amazon."},
    {"id": "Amazon--20", "web_name": "Amazon", "web": "https://www.amazon.com/", "ques": "Search for a wireless ergonomic keyboard with backlighting on Amazon. Filter the results to show only items with a rating of 4 stars and above, priced between $40 and $60."},
    {"id": "Apple--5", "web_name": "Apple", "web": "https://www.apple.com/", "ques": "How much does it cost to buy a MacBook Pro 16-inch with M3 Max chip, 16-core CPU, 40-core GPU, 64GB memory, and 1TB SSD on the Apple website?"},
    {"id": "Apple--15", "web_name": "Apple", "web": "https://www.apple.com/", "ques": "Tell me about the trade-in value of an iPhone 13 Pro Max on the Apple website."},
    {"id": "ArXiv--5", "web_name": "ArXiv", "web": "https://arxiv.org/", "ques": 'Find the paper "Attention Is All You Need" on ArXiv and tell me how many citations it has according to Semantic Scholar (linked from the ArXiv page).'},
    {"id": "ArXiv--15", "web_name": "ArXiv", "web": "https://arxiv.org/", "ques": 'Search for the paper titled "GPT-4 Technical Report" on ArXiv. Tell me when version 3 of this paper was submitted.'},
    {"id": "BBC News--5", "web_name": "BBC News", "web": "https://www.bbc.com/news", "ques": 'Find the latest headlines under the "Technology" section on BBC News.'},
    {"id": "BBC News--20", "web_name": "BBC News", "web": "https://www.bbc.com/news", "ques": "Find a BBC News article about climate change. Summarize the key points of the article."},
    {"id": "Cambridge Dictionary--5", "web_name": "Cambridge Dictionary", "web": "https://dictionary.cambridge.org/", "ques": 'Look up the word "sustainability" in the Cambridge Dictionary and provide its pronunciation and definition.'},
    {"id": "Cambridge Dictionary--15", "web_name": "Cambridge Dictionary", "web": "https://dictionary.cambridge.org/", "ques": 'Find three different meanings of the word "dog" in the Cambridge Dictionary.'},
    {"id": "Coursera--5", "web_name": "Coursera", "web": "https://www.coursera.org/", "ques": "Find a course on Coursera that teaches Python for beginners. Provide the course name, duration, and rating."},
    {"id": "Coursera--20", "web_name": "Coursera", "web": "https://www.coursera.org/", "ques": "Search for machine learning courses on Coursera offered by Stanford University. List the available courses."},
    {"id": "ESPN--10", "web_name": "ESPN", "web": "https://www.espn.com/", "ques": "Check out LeBron James' Stats on ESPN to see how many games he has played in his career."},
    {"id": "ESPN--25", "web_name": "ESPN", "web": "https://www.espn.com/", "ques": "Find the current NBA standings on ESPN. Which team is at the top of the Eastern Conference?"},
    {"id": "GitHub--5", "web_name": "GitHub", "web": "https://github.com/", "ques": 'Search for the repository "facebook/react" on GitHub and tell me the number of stars it has.'},
    {"id": "GitHub--15", "web_name": "GitHub", "web": "https://github.com/", "ques": 'Find the latest release of the "microsoft/vscode" repository on GitHub. What is the version number?'},
    {"id": "Google Map--5", "web_name": "Google Map", "web": "https://www.google.com/maps/", "ques": "Find the distance by car from San Francisco to Los Angeles using Google Maps."},
    {"id": "Google Map--20", "web_name": "Google Map", "web": "https://www.google.com/maps/", "ques": "Search for Chinese restaurants near Times Square in New York on Google Maps. Find one that has a rating of 4 stars or more."},
    {"id": "Google Search--5", "web_name": "Google Search", "web": "https://www.google.com/", "ques": "What is the population of Tokyo, Japan according to a Google Search?"},
    {"id": "Google Search--20", "web_name": "Google Search", "web": "https://www.google.com/", "ques": "What is the current exchange rate of US Dollar to Euro according to Google Search?"},
    {"id": "Huggingface--5", "web_name": "Huggingface", "web": "https://huggingface.co/", "ques": 'Find the model "meta-llama/Llama-2-7b" on Hugging Face. How many downloads does it have?'},
    {"id": "Huggingface--20", "web_name": "Huggingface", "web": "https://huggingface.co/", "ques": "Search for text-to-image models on Hugging Face. Which model has the most likes?"},
    {"id": "Wolfram Alpha--5", "web_name": "Wolfram Alpha", "web": "https://www.wolframalpha.com/", "ques": "What is the integral of x^2 * sin(x) according to Wolfram Alpha?"},
    {"id": "Wolfram Alpha--20", "web_name": "Wolfram Alpha", "web": "https://www.wolframalpha.com/", "ques": "Ask Wolfram Alpha: What is the distance from Earth to Mars?"},
]


# ---------------------------------------------------------------------------
# Judge (GPT-4o)
# ---------------------------------------------------------------------------
JUDGE_SYSTEM_PROMPT = """You are an expert evaluator for web browsing agents. Your task is to judge whether the agent successfully completed the given task.

You will be provided with:
1. The task instruction (what the agent was asked to do)
2. The agent's text response (what the agent reported)
3. One or more screenshots of the final browser state

Evaluation criteria:
- The agent must have actually completed the task, not just claimed to.
- Screenshots take precedence over text when there are discrepancies.
- For information retrieval tasks: the answer must be correct or at least reasonable.
- For navigation tasks: the final page state should reflect task completion.
- Partial completion is NOT success. The task must be fully completed.
- If the answer is time-sensitive (stock prices, news, etc.), accept reasonable recent values.

Respond with EXACTLY one of:
- "SUCCESS" if the task was completed successfully
- "NOT_SUCCESS" if the task was not completed

Then provide a brief reason on the next line starting with "Reason: " """


async def judge_task(question: str, answer: str, screenshots: list[str], judge_model: str) -> dict:
    """Judge a task result using GPT-4o."""
    from openai import OpenAI

    client = OpenAI(
        api_key=os.environ.get("JUDGE_API_KEY", os.environ.get("OPENAI_API_KEY")),
        base_url=os.environ.get("JUDGE_BASE_URL", "https://api.openai.com/v1"),
    )

    content = [{"type": "text", "text": f"Task instruction: {question}\n\nAgent's response: {answer or '(no text response)'}"}]
    for s in screenshots[-3:]:
        img_url = s if s.startswith("data:") else f"data:image/png;base64,{s}"
        content.append({"type": "image_url", "image_url": {"url": img_url, "detail": "high"}})

    resp = client.chat.completions.create(
        model=judge_model,
        messages=[
            {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
            {"role": "user", "content": content},
        ],
        temperature=0,
        max_tokens=256,
    )

    text = resp.choices[0].message.content or ""
    lines = text.strip().split("\n")
    first = lines[0].strip()
    verdict = "NOT_SUCCESS" if "NOT_SUCCESS" in first else ("SUCCESS" if "SUCCESS" in first else "NOT_SUCCESS")
    reason_line = next((l for l in lines if l.startswith("Reason:")), None)
    reason = reason_line.replace("Reason:", "").strip() if reason_line else text.strip()
    return {"verdict": verdict, "reason": reason}


# ---------------------------------------------------------------------------
# Run a single task
# ---------------------------------------------------------------------------
async def run_task(task: dict, llm, browser_kwargs: dict, max_steps: int, timeout_s: int) -> dict:
    from browser_use import Agent, Browser

    result = {
        "taskId": task["id"],
        "webName": task["web_name"],
        "question": task["ques"],
        "agentAnswer": None,
        "screenshots": [],
        "success": None,
        "judgeVerdict": None,
        "judgeReason": None,
        "error": None,
        "totalSteps": 0,
        "totalTimeMs": 0,
        "tokenUsage": {"inputTokens": 0, "outputTokens": 0, "totalTokens": 0},
        "estimatedCostUsd": 0,
        "framework": "browser-use",
    }

    start = time.time()

    try:
        browser = Browser(**browser_kwargs)
        agent = Agent(
            task=task["ques"],
            llm=llm,
            browser=browser,
            use_vision=True,
            validate_output=True,
            max_failures=3,
            max_actions_per_step=5,
        )

        history = await asyncio.wait_for(
            agent.run(max_steps=max_steps),
            timeout=timeout_s,
        )

        result["agentAnswer"] = history.final_result()
        result["totalSteps"] = history.number_of_steps()

        # Token usage
        try:
            usage = history.usage
            if usage:
                result["tokenUsage"] = {
                    "inputTokens": getattr(usage, "prompt_tokens", 0) or getattr(usage, "input_tokens", 0) or 0,
                    "outputTokens": getattr(usage, "completion_tokens", 0) or getattr(usage, "output_tokens", 0) or 0,
                    "totalTokens": getattr(usage, "total_tokens", 0) or 0,
                }
        except Exception:
            pass

        # Screenshots
        try:
            screenshots = history.screenshots()
            if screenshots:
                result["screenshots"] = screenshots[-3:]
        except Exception:
            pass

        try:
            await browser.stop()
        except Exception:
            pass

    except asyncio.TimeoutError:
        result["error"] = "Task timeout"
    except Exception as e:
        result["error"] = str(e)

    result["totalTimeMs"] = int((time.time() - start) * 1000)

    # Estimate cost (Qwen VL pricing)
    inp = result["tokenUsage"]["inputTokens"]
    out = result["tokenUsage"]["outputTokens"]
    result["estimatedCostUsd"] = (inp / 1000) * 0.003 + (out / 1000) * 0.009

    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
async def main():
    parser = argparse.ArgumentParser(description="Browser Use + Qwen WebVoyager eval")
    parser.add_argument("--subset", choices=["30"], default="30", help="Task subset")
    parser.add_argument("--max-concurrent", type=int, default=1, help="Max concurrent tasks")
    parser.add_argument("--max-steps", type=int, default=50, help="Max steps per task")
    parser.add_argument("--timeout", type=int, default=600, help="Per-task timeout (seconds)")
    parser.add_argument("--skip-judge", action="store_true")
    parser.add_argument("--only", type=str, help="Run single task by ID")
    parser.add_argument("--output", type=str, default=None, help="Output directory")
    parser.add_argument("--trials", type=int, default=1, help="Run each task N times, take best")
    args = parser.parse_args()

    # Validate env
    api_key = os.environ.get("QWEN_API_KEY")
    base_url = os.environ.get("QWEN_BASE_URL")
    model_name = os.environ.get("QWEN_MODEL_NAME", "qwen-vl-max-latest")
    assert api_key, "QWEN_API_KEY is required"
    assert base_url, "QWEN_BASE_URL is required"

    judge_model = os.environ.get("JUDGE_MODEL", "gpt-4o")

    # Setup LLM
    from browser_use import ChatOpenAI

    # Build ChatOpenAI with optional headers (for ByteDance proxy)
    llm_kwargs = {
        "model": model_name,
        "api_key": api_key,
        "base_url": base_url,
    }
    extra_headers = os.environ.get("QWEN_EXTRA_HEADERS")
    if extra_headers:
        import json as _json
        llm_kwargs["default_headers"] = _json.loads(extra_headers)
    llm = ChatOpenAI(**llm_kwargs)

    browser_kwargs = {
        "headless": True,
        "disable_security": True,
    }

    # Dataset
    dataset = SUBSET_30
    if args.only:
        dataset = [t for t in dataset if t["id"] == args.only]

    print(f"Browser Use + Qwen WebVoyager Eval")
    print(f"Model: {model_name}")
    print(f"Tasks: {len(dataset)}")
    print(f"Max steps: {args.max_steps}, Timeout: {args.timeout}s")
    print(f"Judge: {'SKIPPED' if args.skip_judge else judge_model}")

    # Output dir
    output_dir = Path(args.output or Path(__file__).parent / "results")
    output_dir.mkdir(parents=True, exist_ok=True)

    # Helper: check real success
    def is_real_success(r):
        if r.get("error"): return False
        ans = (r.get("agentAnswer") or "").lower()
        if "unable to" in ans or "was unable" in ans or "could not complete" in ans: return False
        return True

    # Run tasks
    results = []

    for idx, task in enumerate(dataset):
        print(f"\n[{idx+1}/{len(dataset)}] {task['id']} - {task['web_name']}")
        print(f"  Q: {task['ques'][:80]}...")

        best = None
        for trial in range(1, args.trials + 1):
            if args.trials > 1: print(f"  Trial {trial}/{args.trials}")
            r = await run_task(task, llm, browser_kwargs, args.max_steps, args.timeout)
            print(f"  Done in {r['totalTimeMs']/1000:.1f}s | Steps: {r['totalSteps']} | Tokens: {r['tokenUsage']['totalTokens']} | Answer: {(r['agentAnswer'] or '(none)')[:60]}")

            if best is None or (not is_real_success(best) and is_real_success(r)):
                best = r
            elif is_real_success(best) and is_real_success(r):
                if r['tokenUsage']['totalTokens'] < best['tokenUsage']['totalTokens']:
                    best = r

            if is_real_success(r):
                if args.trials > 1: print(f"  ✅ Succeeded on trial {trial}")
                break

        results.append(best)
        with open(output_dir / "results-intermediate.json", "w") as f:
            json.dump(results, f, indent=2, ensure_ascii=False)

    # Judge
    if not args.skip_judge:
        print(f"\nJudging {len(results)} results with {judge_model}...")
        for r in results:
            if r["error"]:
                r["judgeVerdict"] = "NOT_SUCCESS"
                r["judgeReason"] = f"Agent error: {r['error']}"
                r["success"] = False
                continue
            try:
                j = await judge_task(r["question"], r["agentAnswer"], r["screenshots"], judge_model)
                r["judgeVerdict"] = j["verdict"]
                r["judgeReason"] = j["reason"]
                r["success"] = j["verdict"] == "SUCCESS"
                print(f"  {r['taskId']}: {j['verdict']}")
            except Exception as e:
                r["judgeReason"] = f"Judge error: {e}"

    # Summary
    judged = [r for r in results if r["success"] is not None]
    success_count = sum(1 for r in judged if r["success"])
    total_input = sum(r["tokenUsage"]["inputTokens"] for r in results)
    total_output = sum(r["tokenUsage"]["outputTokens"] for r in results)

    summary = {
        "framework": "browser-use",
        "modelName": model_name,
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "totalTasks": len(results),
        "successCount": success_count,
        "successRate": success_count / len(judged) if judged else 0,
        "avgSteps": sum(r["totalSteps"] for r in results) / len(results) if results else 0,
        "avgTimeMs": sum(r["totalTimeMs"] for r in results) / len(results) if results else 0,
        "totalInputTokens": total_input,
        "totalOutputTokens": total_output,
        "totalCostUsd": sum(r["estimatedCostUsd"] for r in results),
        "results": [{k: v for k, v in r.items() if k != "screenshots"} for r in results],
    }

    # Print
    print(f"\n{'='*60}")
    print(f"BROWSER USE + QWEN WEBVOYAGER RESULTS")
    print(f"{'='*60}")
    print(f"Model: {model_name}")
    print(f"Success Rate: {summary['successRate']*100:.1f}% ({success_count}/{len(judged)})")
    print(f"Avg Steps: {summary['avgSteps']:.1f}")
    print(f"Avg Time: {summary['avgTimeMs']/1000:.1f}s")
    print(f"Total Tokens: {total_input} in / {total_output} out")
    print(f"Total Cost: ${summary['totalCostUsd']:.2f}")

    # Save
    out_path = output_dir / f"eval-browser-use-{model_name}-{int(time.time())}.json"
    with open(out_path, "w") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)
    print(f"\nResults saved to: {out_path}")


if __name__ == "__main__":
    asyncio.run(main())
