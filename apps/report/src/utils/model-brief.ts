import type { ModelBrief } from '@midscene/core';

const formatModelBrief = (
  modelBrief: ModelBrief,
  includeIntent: boolean,
): string => {
  const { name, modelDescription, intent } = modelBrief;
  const base = modelDescription ? `${name}(${modelDescription})` : name;
  return includeIntent ? `${intent}/${base}` : `${base}`;
};

export const formatModelBriefText = (modelBriefs: ModelBrief[]): string => {
  const includeIntent =
    new Set(modelBriefs.map((brief) => brief.name)).size > 1;
  const briefsToDisplay = includeIntent ? modelBriefs : modelBriefs.slice(0, 1);
  return briefsToDisplay
    .map((brief) => formatModelBrief(brief, includeIntent))
    .join(', ');
};
