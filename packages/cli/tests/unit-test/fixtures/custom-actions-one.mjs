export function buildCustomActions(config) {
  return [{ name: `ActionOne:${config.label}` }];
}

export function getPromptRoutingHints({ config }) {
  return `HintOne:${config.label}`;
}
