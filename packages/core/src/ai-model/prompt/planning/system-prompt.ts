import {
  type BuildStandardPlanningSystemPromptInput,
  createPlanningPromptContext,
} from './planning-prompt-context';
import {
  getActionSection,
  getBestPracticesSection,
  getCompletionSection,
  getExamplesSection,
  getMemorySection,
  getOutputFormatSection,
  getPlanningSection,
  getRoleSection,
  getWorkflowSection,
} from './sections';

export async function buildStandardPlanningSystemPrompt(
  input: BuildStandardPlanningSystemPromptInput,
) {
  const context = createPlanningPromptContext(input);
  const sections = [
    ['role', getRoleSection()],
    ['workflow', getWorkflowSection(context)],
    ['planning_rules', getPlanningSection(context)],
    ['completion_rules', getCompletionSection()],
    ['action_rules', getActionSection(context)],
    ['memory_rules', getMemorySection()],
    ['output_format', getOutputFormatSection(context)],
    ['examples', getExamplesSection(context)],
    ['best_practices', getBestPracticesSection()],
  ];
  return `${sections
    .map(([tag, content]) => `<${tag}>\n${content.trim()}\n</${tag}>`)
    .join('\n\n')}\n`;
}
