import type { JsonValue } from '../cli/test-project';
import { WorkflowParseError } from '../errors';

export interface VariableResolutionLocation {
  projectName: string;
  sourcePath: string;
  phase: 'beforeAll' | 'beforeEach' | 'steps' | 'afterEach' | 'afterAll';
  stepIndex: number;
  caseIndex?: number;
}

export interface ResolveWorkflowVariablesOptions {
  variables?: Readonly<Record<string, JsonValue>>;
  env?: Readonly<NodeJS.ProcessEnv>;
  location: VariableResolutionLocation;
}

const variableNamePattern = '[A-Za-z_][A-Za-z0-9_]*';

const interpolationExpression = new RegExp(
  `\\$\\{\\{\\s*(${variableNamePattern})\\s*\\}\\}|\\$\\{([^{}]+)\\}`,
  'g',
);
const exactEnvExpression = new RegExp(
  `^\\$\\{\\{\\s*(${variableNamePattern})\\s*\\}\\}$`,
);
const exactProjectExpression = /^\$\{([^{}]+)\}$/;
const supportedEnvBody = new RegExp(`^\\s*(${variableNamePattern})\\s*$`);

const supportedReferenceHint =
  'Use "${{NAME}}" for environment variables or "${name}" for project variables.';

const missingVariable = (
  kind: 'environment' | 'project',
  name: string,
  options: ResolveWorkflowVariablesOptions,
): never => {
  throw new WorkflowParseError(
    `Undefined ${kind} variable "${name}" in ${options.location.sourcePath}.`,
    { ...options.location, variable: name, variableKind: kind },
  );
};

const projectVariable = (
  name: string,
  options: ResolveWorkflowVariablesOptions,
): JsonValue => {
  if (!Object.hasOwn(options.variables ?? {}, name)) {
    return missingVariable('project', name, options);
  }
  return options.variables![name];
};

const environmentVariable = (
  name: string,
  options: ResolveWorkflowVariablesOptions,
): string => {
  const value = options.env?.[name];
  if (value === undefined) return missingVariable('environment', name, options);
  return value;
};

const interpolationValue = (
  name: string,
  value: JsonValue,
  options: ResolveWorkflowVariablesOptions,
): string => {
  if (typeof value === 'object' && value !== null) {
    throw new WorkflowParseError(
      `Project variable "${name}" must be a primitive when embedded in a string.`,
      {
        ...options.location,
        variable: name,
        variableKind: 'project',
      },
    );
  }
  return String(value);
};

const assertSupportedEnvReferences = (
  value: string,
  options: ResolveWorkflowVariablesOptions,
): void => {
  let searchFrom = 0;
  while (searchFrom < value.length) {
    const start = value.indexOf('${{', searchFrom);
    if (start === -1) return;

    const end = value.indexOf('}}', start + 3);
    if (end === -1) {
      throw new WorkflowParseError(
        `Unterminated variable reference "${value.slice(start)}" in ${options.location.sourcePath}. ${supportedReferenceHint}`,
        { ...options.location },
      );
    }

    const body = value.slice(start + 3, end);
    if (!supportedEnvBody.test(body)) {
      throw new WorkflowParseError(
        `Unsupported variable reference "\${{${body}}}" in ${options.location.sourcePath}. ${supportedReferenceHint}`,
        {
          ...options.location,
          variable: body.trim(),
          variableKind: 'environment',
        },
      );
    }

    searchFrom = end + 2;
  }
};

const resolveString = (
  value: string,
  options: ResolveWorkflowVariablesOptions,
): JsonValue => {
  assertSupportedEnvReferences(value, options);

  const exactEnv = exactEnvExpression.exec(value);
  if (exactEnv) return environmentVariable(exactEnv[1], options);
  const exactProject = exactProjectExpression.exec(value);
  if (exactProject) return projectVariable(exactProject[1], options);

  return value.replace(
    interpolationExpression,
    (_match, environmentName: string | undefined, projectName: string) =>
      environmentName
        ? environmentVariable(environmentName, options)
        : interpolationValue(
            projectName,
            projectVariable(projectName, options),
            options,
          ),
  );
};

export const resolveWorkflowVariables = (
  value: unknown,
  options: ResolveWorkflowVariablesOptions,
): unknown => {
  if (typeof value === 'string') return resolveString(value, options);
  if (Array.isArray(value)) {
    return value.map((child) => resolveWorkflowVariables(child, options));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        resolveWorkflowVariables(child, options),
      ]),
    );
  }
  return value;
};
