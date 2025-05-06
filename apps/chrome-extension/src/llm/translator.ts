/**
 * LLM Translator Service for Midscene Smart-Shopping Assistant
 * - Maintains conversation history for context
 * - Uses few-shot examples with clear delimiters
 */

import { Anthropic } from "@anthropic-ai/sdk";
import { useEnvConfig } from "../store";

export interface TranslatorResponse {
  goal: string;
  midscene_prompt: string;
  summary: string[];
}

const { ANTHROPIC_API_KEY } = useEnvConfig.getState().config;

const anthropic = new Anthropic({
  /** 🔒 Proxy this in prod instead of exposing the key */ 
  apiKey: ANTHROPIC_API_KEY ?? "",
});

// Store conversation history
const conversationHistory: Array<{role: 'user' | 'assistant', content: string}> = [];
const MAX_HISTORY_TURNS = 3; // Keep track of recent interactions

/**
 * Translates user goal with conversation context
 */
export async function translateUserGoal(
  userInput: string,
): Promise<TranslatorResponse> {
  const messages = buildMessages(userInput);

  const completion = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    messages: [
      { role: "user", content: `System: ${messages.system}` },
      ...messages.conversation
    ],
    temperature: 0.2,
    max_tokens: 1000
  });

  // Safety checks for response
  const content = completion.content[0].type === 'text' ? completion.content[0].text : '';
  if (!content) {
    throw new Error("Model returned empty response");
  }

  if (!content.startsWith("{")) {
    throw new Error("Model did not return valid JSON");
  }  

  const parsed = JSON.parse(content) as TranslatorResponse;
  const result = cleanResponse(parsed, userInput);
  
  // Store this interaction in history
  conversationHistory.push({ role: 'user', content: userInput });
  conversationHistory.push({ role: 'assistant', content: JSON.stringify(result) });
  
  // Trim history if it gets too long
  while (conversationHistory.length > MAX_HISTORY_TURNS * 2) {
    conversationHistory.shift();
  }
  
  return result;
}

/**
 * Clear conversation history (e.g., when starting a new shopping session)
 */
export function clearConversationHistory(): void {
  conversationHistory.length = 0;
}

/* ---------- helpers ---------- */

function buildMessages(userInput: string) {
  // System message for Anthropic API
  const systemMessage = 
    "You are MidsceneTranslator. Convert shopping instructions to JSON with focused, single-step actions.\n\n" +
    "IMPORTANT RULES (in order of priority):\n" +
    "1. HIGHEST PRIORITY - Search behavior:\n" +
    "   - When using the search bar, STRIP OUT ACTION VERBS - only use the product name/noun phrase in the search query\n" +
    "   - If input is a brand name, product name, or short phrase after a search, CLICK it instead of searching again\n" +
    "   - Example: for 'buy low fat milk', search for 'low fat milk'\n\n" +
    "2. HIGH PRIORITY - Context awareness:\n" +
    "   - PAY ATTENTION TO CONTEXT - if user previously searched for a product, treat single words as selections from search results\n" +
    "   - If a product is already in view, prefer clicking over searching\n\n" +
    "3. MEDIUM PRIORITY - Sorting and filtering:\n" +
    "   - When user has specific requirements (price, rating, features), first click 'Sort by' or filter buttons\n" +
    "   - Only after sorting/filtering, look for products in the filtered results\n" +
    "   - Example: for 'perfume under $50', first search for 'perfume', then sort by price low to high\n\n" +
    "4. LOW PRIORITY - General rules:\n" +
    "   - Provide ONLY ONE STEP at a time - do not chain multiple actions\n" +
    "   - Never automatically add 'add to cart' unless explicitly requested\n" +
    "   - Make summary match exactly what the command will do - no more, no less\n\n" +
    "5. RESPONSE FORMAT:\n" +
    "   - ALWAYS respond with **only** a single JSON object with exactly the format {\"goal\": string, \"midscene_prompt\": string, \"summary\": string[]}\n" +
    "   - No explanations, no comments, just the JSON\n";
  
  // Build conversation messages array for Anthropic API
  const conversationMsgs: Array<{role: 'user' | 'assistant', content: string}> = [];
  
  // Add example conversations for sorting/filtering if no history exists
  if (conversationHistory.length === 0) {
    conversationMsgs.push(
      { role: 'user', content: 'find me headphones under $50' },
      { role: 'assistant', content: JSON.stringify({
        goal: 'find headphones under $50',
        midscene_prompt: 'search for "headphones", wait for results, click "Sort by" button, select "Price: Low to High", wait for results to load',
        summary: ['Search for headphones', 'Sort by price low to high']
      })},
      { role: 'user', content: 'show me highly rated laptops' },
      { role: 'assistant', content: JSON.stringify({
        goal: 'show highly rated laptops',
        midscene_prompt: 'search for "laptops", wait for results, click "Sort by" button, select "Avg. Customer Review", wait for results to load',
        summary: ['Search for laptops', 'Sort by customer ratings']
      })}
    );
  }
  
  // Add conversation history if available
  if (conversationHistory.length > 0) {
    conversationMsgs.push(...conversationHistory);
  }
  
  // Add current request
  conversationMsgs.push({ role: 'user', content: userInput });
  
  return {
    system: systemMessage,
    conversation: conversationMsgs
  };
}

function stripActionVerbs(text: string): string {
  // Common shopping action verbs to remove
  const actionVerbs = [
    'buy', 'purchase', 'get', 'find', 'search for', 'look for',
    'order', 'add', 'select', 'choose', 'pick', 'want', 'need'
  ];
  
  // Create a regex pattern that matches these verbs at the start of the string
  const pattern = new RegExp(`^(${actionVerbs.join('|')})\\s+`, 'i');
  
  // Remove the action verb if found at the start
  return text.replace(pattern, '').trim();
}

function cleanResponse(
  res: TranslatorResponse,
  original: string,
): TranslatorResponse {
  const summary = res.summary.map((s) => (s.length <= 14 ? s : s.slice(0, 14) + "..."));
  
  // Clean the prompt and strip action verbs from search queries
  let prompt = res.midscene_prompt
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s*then\s*/gi, ", ")
    .trim();
    
  // If the prompt contains a search action, strip action verbs from the search query
  if (prompt.includes('search for')) {
    const searchMatch = prompt.match(/search for "([^"]+)"/);
    if (searchMatch) {
      const originalQuery = searchMatch[1];
      const cleanedQuery = stripActionVerbs(originalQuery);
      prompt = prompt.replace(originalQuery, cleanedQuery);
    }
  }
  
  return { goal: res.goal || original, midscene_prompt: prompt, summary };
}

/**
 * Regenerates a midscene_prompt based on user-edited summary steps
 */
export async function regeneratePlanFromSummary(
  editedSummary: string[],
  originalGoal: string,
  originalPrompt?: string // Pass the original prompt for context
): Promise<TranslatorResponse> {
  const systemPrompt = 
    "You are MidsceneTranslator, converting shopping instructions to precise browser automation commands.\n\n" +
    "The user has edited the summary steps of an automation plan. You need to generate a new midscene_prompt " +
    "that accomplishes exactly these edited steps.\n\n" +
    "Rules:\n" +
    "1. ONLY generate the midscene_prompt field - the summary is already finalized by the user\n" +
    "2. Each step in the summary must be reflected in your generated midscene_prompt\n" +
    "3. Your midscene_prompt must use valid browser commands like 'click', 'type', 'wait', etc.\n" +
    "4. Separate commands with commas\n" +
    "5. Keep focused on the edited steps - don't add extra actions\n\n" +
    "RESPOND WITH STRICTLY ONLY THIS JSON OBJECT FORMAT - {\"midscene_prompt\": \"your commands here\"}\n" +
    "Do not add ANY text before or after the JSON. No explanations, no comments, just pure JSON.";

  const userMessage = 
    `Original goal: ${originalGoal}\n` +
    `${originalPrompt ? `Original midscene_prompt: ${originalPrompt}\n` : ''}` +
    `User-edited summary steps: ${JSON.stringify(editedSummary)}\n\n` +
    `Create a new midscene_prompt that matches these edited steps exactly.`;

  try {
    const completion = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      messages: [
        { role: "user", content: `System: ${systemPrompt}` },
        { role: "user", content: userMessage }
      ],
      temperature: 0.2,
      max_tokens: 1000
    });

    // Get response content
    const content = completion.content[0].type === 'text' ? completion.content[0].text : '';
    if (!content || !content.startsWith("{")) {
      throw new Error("Model did not return valid JSON");
    }  

    // Parse just the midscene_prompt from the response
    const parsedResponse = JSON.parse(content);
    const newPrompt = parsedResponse.midscene_prompt;
    
    if (!newPrompt || typeof newPrompt !== 'string') {
      throw new Error("Missing or invalid midscene_prompt in response");
    }

    // Clean up the prompt similar to how we do in translateUserGoal
    const cleanedPrompt = newPrompt
      .replace(/\s*,\s*/g, ", ")
      .replace(/\s*then\s*/gi, ", ")
      .trim();

    // Return the new response with user-edited summary
    return {
      goal: originalGoal,
      midscene_prompt: cleanedPrompt,
      summary: editedSummary // Keep the user's edited summary as-is
    };
  } catch (error) {
    console.error("Error regenerating plan:", error);
    throw new Error(`Failed to regenerate plan: ${error instanceof Error ? error.message : String(error)}`);
  }
}