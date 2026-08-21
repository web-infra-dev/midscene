type AsyncAction = (...args: any[]) => Promise<any>;

type VisualActionDefinitions<TActions> = {
  [TName in keyof TActions]: AsyncAction;
};

/**
 * Register visual actions at one boundary so every caller observes the same
 * frame freshness behavior. The boundary is armed before dispatch so frames
 * produced while an ADB input command is still returning count as post-action
 * candidates. Composite actions belong in a single registered callback and
 * therefore arm the boundary only once.
 */
export function createVisualActionRegistry<
  TActions extends VisualActionDefinitions<TActions>,
>(
  definitions: TActions,
  onActionStarting: (actionName: keyof TActions & string) => Promise<void>,
): TActions {
  const registeredActions = {} as TActions;

  for (const actionName of Object.keys(definitions) as Array<
    keyof TActions & string
  >) {
    const dispatch = definitions[actionName];
    registeredActions[actionName] = (async (...args: unknown[]) => {
      await onActionStarting(actionName);
      return await dispatch(...args);
    }) as TActions[typeof actionName];
  }

  return registeredActions;
}
