export function buildCustomActions(config) {
  return [{ name: `ActionTwo:${config.label}` }];
}

export function getPromptRoutingHints({ config }) {
  return `HintTwo:${config.label}`;
}
