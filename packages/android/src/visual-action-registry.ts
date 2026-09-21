type AsyncAction = (...args: any[]) => Promise<any>;

type VisualActionDefinitions<TActions> = {
  [TName in keyof TActions]: AsyncAction;
};

/**
 * Register visual actions at one boundary so every caller observes the same
 * post-action frame freshness behavior. Composite actions belong in a single
 * registered callback and therefore settle the boundary only once.
 */
export function createVisualActionRegistry<
  TActions extends VisualActionDefinitions<TActions>,
>(
  definitions: TActions,
  onActionSettled: (actionName: keyof TActions & string) => Promise<void>,
): TActions {
  const registeredActions = {} as TActions;

  for (const actionName of Object.keys(definitions) as Array<
    keyof TActions & string
  >) {
    const dispatch = definitions[actionName];
    registeredActions[actionName] = (async (...args: unknown[]) => {
      try {
        return await dispatch(...args);
      } finally {
        await onActionSettled(actionName);
      }
    }) as TActions[typeof actionName];
  }

  return registeredActions;
}
