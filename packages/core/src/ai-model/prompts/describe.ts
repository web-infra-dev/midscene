import { getPreferredLanguage } from '@midscene/shared/env';

const examplesMap: Record<string, string[]> = {
  Chinese: [
    '"登录表单中的"登录"按钮"',
    '"搜索输入框，placeholder 为"请输入关键词""',
    '"顶部导航栏中文字为"首页"的链接"',
    '"联系表单中的提交按钮"',
    '"aria-label 为"打开菜单"的菜单图标"',
  ],
  English: [
    '"Login button with text \'Sign In\'"',
    '"Search input with placeholder \'Enter keywords\'"',
    '"Navigation link with text \'Home\' in header"',
    '"Submit button in contact form"',
    '"Menu icon with aria-label \'Open menu\'"',
  ],
};

const getExamples = (language: string) => {
  const examples = examplesMap[language] || examplesMap.English;
  return examples.map((e) => `- ${e}`).join('\n');
};

export const elementDescriberInstruction = () => {
  const preferredLanguage = getPreferredLanguage();

  return `
Describe the element in the red rectangle for precise identification.

IMPORTANT: You MUST write the description in ${preferredLanguage}.

CRITICAL REQUIREMENTS:
1. UNIQUENESS: The description must uniquely identify this element on the current page
2. UNIVERSALITY: Use generic, reusable selectors that work across different contexts
3. PRECISION: Be specific enough to distinguish from similar elements

DESCRIPTION STRUCTURE:
1. Element type (button, input, link, div, etc.)
2. Primary identifier (in order of preference):
   - Unique text content: "with text 'Login'"
   - Unique attribute: "with aria-label 'Search'"
   - Unique class/ID: "with class 'primary-button'"
   - Unique position: "in header navigation"
3. Secondary identifiers (if needed for uniqueness):
   - Visual features: "blue background", "with icon"
   - Relative position: "below search bar", "in sidebar"
   - Parent context: "in login form", "in main menu"

GUIDELINES:
- Keep description under 25 words
- Prioritize semantic identifiers over visual ones
- Use consistent terminology across similar elements
- Avoid page-specific or temporary content
- Don't mention the red rectangle or selection box
- Focus on stable, reusable characteristics
- **Write the description in ${preferredLanguage}**

EXAMPLES:
${getExamples(preferredLanguage)}

Return JSON:
{
  "description": "unique element identifier",
  "error"?: "error message if any"
}`;
};
