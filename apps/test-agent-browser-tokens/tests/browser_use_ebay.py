"""
browser-use: open ebay.com, search for headphones, measure token usage.
Comparable to Midscene's PuppeteerAgent test.
"""
import asyncio
import os
import json
import time

# Disable global-agent proxy for the AI API calls (same issue as Midscene test)
os.environ["GLOBAL_AGENT_HTTP_PROXY"] = ""
os.environ["GLOBAL_AGENT_HTTPS_PROXY"] = ""

from browser_use import Agent
from browser_use.browser.session import BrowserSession
from browser_use.browser.profile import BrowserProfile
from browser_use.llm.openai.like import ChatOpenAILike

CHROME_PATH = os.environ.get(
    "CHROME_PATH",
    "/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome",
)

# Parse proxy config for the browser (same proxy as Midscene test)
def get_proxy_config():
    proxy_url = os.environ.get("HTTPS_PROXY") or os.environ.get("HTTP_PROXY")
    if not proxy_url:
        return None
    try:
        from urllib.parse import urlparse
        parsed = urlparse(proxy_url)
        return {
            "server": f"{parsed.scheme}://{parsed.hostname}:{parsed.port}",
            "username": parsed.username or "",
            "password": parsed.password or "",
        }
    except Exception:
        return None


async def main():
    # Configure the LLM - DashScope Qwen (OpenAI-compatible)
    llm = ChatOpenAILike(
        model=os.environ.get("MIDSCENE_MODEL_NAME", "qwen3.5-plus").strip('"'),
        api_key=os.environ.get("MIDSCENE_MODEL_API_KEY", "").strip('"'),
        base_url=os.environ.get("MIDSCENE_MODEL_BASE_URL", "https://dashscope.aliyuncs.com/compatible-mode/v1").strip('"'),
        temperature=0.2,
        timeout=300.0,
        max_retries=2,
        max_completion_tokens=4096,
        reasoning_effort="none",
        dont_force_structured_output=True,
    )

    proxy_config = get_proxy_config()
    extra_args = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--ignore-certificate-errors",
    ]

    # Configure browser profile
    profile = BrowserProfile(
        executable_path=CHROME_PATH,
        headless=True,
        disable_security=True,
        extra_chromium_args=extra_args,
        viewport={"width": 1280, "height": 800},
        proxy=proxy_config,
    )

    browser_session = BrowserSession(browser_profile=profile)

    print("\n========================================")
    print("browser-use: open ebay.com, search for headphones")
    print("========================================\n")

    start_time = time.time()

    agent = Agent(
        task='打开 https://www.ebay.com ，在搜索框中输入"耳机"，然后点击搜索按钮，等待搜索结果出现',
        llm=llm,
        browser_session=browser_session,
        use_vision=True,
        max_actions_per_step=3,
        use_thinking=False,
    )

    history = await agent.run(max_steps=10)

    end_time = time.time()
    total_time = end_time - start_time

    # Extract token usage
    usage = history.usage
    print("\n========================================")
    print("Token Usage Breakdown")
    print("========================================\n")

    if usage:
        if usage.by_model:
            for model_name, model_usage in usage.by_model.items():
                print(f"Model: {model_name}")
                print(f"  Prompt tokens:     {model_usage.prompt_tokens}")
                print(f"  Completion tokens: {model_usage.completion_tokens}")
                print(f"  Total tokens:      {model_usage.total_tokens}")
                cached = getattr(model_usage, "prompt_cached_tokens", 0) or getattr(model_usage, "cached_tokens", 0) or 0
                print(f"  Cached tokens:     {cached}")
                print()

        print("========================================")
        print("TOTAL TOKEN USAGE SUMMARY")
        print("========================================")
        print(f"Total AI calls:         {usage.entry_count}")
        print(f"Total prompt tokens:    {usage.total_prompt_tokens}")
        print(f"Total completion tokens:{usage.total_completion_tokens}")
        print(f"Total tokens:           {usage.total_tokens}")
        print(f"Total cached tokens:    {usage.total_prompt_cached_tokens}")
        print(f"Total time:             {total_time:.1f}s")
        print("========================================\n")
    else:
        print("No usage data available")
        print(f"Total time: {total_time:.1f}s")

    # Check if the task was successful
    is_done = history.is_done() if hasattr(history, "is_done") else "unknown"
    print(f"Task completed: {is_done}")
    print(f"Total steps: {len(history.history)}")

    await browser_session.close()


if __name__ == "__main__":
    asyncio.run(main())
