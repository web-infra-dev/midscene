/**
 * Built-in Midscene YAML step keys. When a `flow` step's action key matches one
 * of these, the framework hands the step to the existing `agent.runYaml`
 * runner. Custom `yamlSteps` are not allowed to reuse these names.
 *
 * The set covers the keys documented for #2509 plus the action keys that the
 * example cases actually use (e.g. `aiWaitFor`, `value`-bearing steps). Extend
 * it together with a test when a missing built-in key surfaces.
 */
export const BUILTIN_YAML_STEP_NAMES: ReadonlySet<string> = new Set([
  'ai',
  'aiAct',
  'aiAction',
  'aiAssert',
  'aiQuery',
  'aiBoolean',
  'aiNumber',
  'aiString',
  'aiLocate',
  'aiInput',
  'aiTap',
  'aiRightClick',
  'aiDoubleClick',
  'aiHover',
  'aiScroll',
  'aiKeyboardPress',
  'aiWaitFor',
  'sleep',
  'javascript',
  'logScreenshot',
  'launch',
  'terminate',
  'runAdbShell',
  'runWdaRequest',
]);

export const isBuiltinYamlStep = (stepName: string): boolean =>
  BUILTIN_YAML_STEP_NAMES.has(stepName);
