const modelConfigDocUrl = 'https://midscenejs.com/model-config';

export const defaultModelFamilyRequiredForLocateMessage = `Default model family is required for locate. Configure MIDSCENE_MODEL_FAMILY so Midscene can parse locate coordinates correctly. ${modelConfigDocUrl}`;

export function planningModelFamilyRequiredForLocateMessage(slot?: string) {
  if (slot === 'planning') {
    return `Planning model family is required because aiAct is asking the planning model to return locate coordinates. Configure MIDSCENE_PLANNING_MODEL_FAMILY for the planning model, or remove the separate planning model config and configure MIDSCENE_MODEL_FAMILY on the default model. ${modelConfigDocUrl}`;
  }

  return `Default model family is required because aiAct is asking the default model to return locate coordinates during planning. Configure MIDSCENE_MODEL_FAMILY so Midscene can parse planning locate coordinates correctly. ${modelConfigDocUrl}`;
}
