/**
 * Auto-evaluation judge using LLM (follows WebVoyager's auto_eval approach).
 *
 * Takes the task instruction, agent's text response, and final screenshot(s),
 * then asks an LLM to judge SUCCESS or NOT_SUCCESS.
 */
import OpenAI from 'openai';

const JUDGE_SYSTEM_PROMPT = `You are an expert evaluator for web browsing agents. Your task is to judge whether the agent successfully completed the given task.

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

Then provide a brief reason on the next line starting with "Reason: "`;

export async function judgeTask(opts: {
  question: string;
  agentAnswer: string | null;
  screenshots: string[]; // base64 encoded
  judgeModel: string;
  apiKey?: string;
  baseUrl?: string;
}): Promise<{ verdict: 'SUCCESS' | 'NOT_SUCCESS'; reason: string }> {
  const { question, agentAnswer, screenshots, judgeModel, apiKey, baseUrl } =
    opts;

  // Default to MIDSCENE_MODEL_* env vars (same model as the agent)
  const client = new OpenAI({
    apiKey:
      apiKey ||
      process.env.MIDSCENE_JUDGE_API_KEY ||
      process.env.MIDSCENE_MODEL_API_KEY ||
      process.env.OPENAI_API_KEY,
    baseURL:
      baseUrl ||
      process.env.MIDSCENE_JUDGE_BASE_URL ||
      process.env.MIDSCENE_MODEL_BASE_URL ||
      'https://api.openai.com/v1',
    defaultQuery: process.env.MIDSCENE_OPENAI_INIT_CONFIG_JSON
      ? JSON.parse(process.env.MIDSCENE_OPENAI_INIT_CONFIG_JSON).defaultQuery
      : undefined,
    defaultHeaders: process.env.MIDSCENE_OPENAI_INIT_CONFIG_JSON
      ? JSON.parse(process.env.MIDSCENE_OPENAI_INIT_CONFIG_JSON).defaultHeaders
      : undefined,
  });

  const userContent: OpenAI.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: `Task instruction: ${question}\n\nAgent's response: ${agentAnswer || '(no text response)'}`,
    },
  ];

  // Attach screenshots (last 3 max to save tokens)
  const screenshotsToAttach = screenshots.slice(-3);
  for (const screenshot of screenshotsToAttach) {
    userContent.push({
      type: 'image_url',
      image_url: {
        url: screenshot.startsWith('data:')
          ? screenshot
          : `data:image/png;base64,${screenshot}`,
        detail: 'high',
      },
    });
  }

  const response = await client.chat.completions.create({
    model: judgeModel,
    messages: [
      { role: 'system', content: JUDGE_SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    temperature: 0,
    max_tokens: 256,
  });

  const text = response.choices[0]?.message?.content || '';
  const lines = text.trim().split('\n');
  const firstLine = lines[0]?.trim() || '';

  const verdict: 'SUCCESS' | 'NOT_SUCCESS' = firstLine.includes('SUCCESS')
    ? firstLine.includes('NOT_SUCCESS')
      ? 'NOT_SUCCESS'
      : 'SUCCESS'
    : 'NOT_SUCCESS';

  const reasonLine = lines.find((l) => l.startsWith('Reason:'));
  const reason = reasonLine
    ? reasonLine.replace('Reason:', '').trim()
    : text.trim();

  return { verdict, reason };
}
