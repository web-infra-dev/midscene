import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, rs } from '@rstest/core';
import ts from 'typescript';
import { createVisualActionRegistry } from '../../src/visual-action-registry';

const lowLevelVisualMutationMethods = new Set([
  'doubleTapPoint',
  'dragPoint',
  'longPressPoint',
  'pressKey',
  'shellInputKeyevent',
  'shellInputText',
  'swipePoint',
  'tapPoint',
  'typeText',
]);

// These public methods intentionally use ADB for connection setup or read-only
// device inspection. Adding a method here requires reviewing whether it can
// change the displayed frame; visual mutations belong in `visualActions`.
const reviewedPublicAdbMethods = [
  'connect',
  'ensureYadb',
  'forceScreenshot',
  'getDeviceLocalTimeString',
  'getDisplayDensity',
  'getDisplayOrientation',
  'getScreenSize',
  'getUITree',
  'screenshotBase64',
] as const;

function methodName(method: ts.MethodDeclaration): string | undefined {
  return ts.isIdentifier(method.name) || ts.isStringLiteral(method.name)
    ? method.name.text
    : undefined;
}

function isPrivate(method: ts.MethodDeclaration): boolean {
  return Boolean(
    method.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword,
    ),
  );
}

function collectCalls(
  method: ts.MethodDeclaration,
  predicate: (call: ts.CallExpression) => boolean,
): ts.CallExpression[] {
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && predicate(node)) {
      calls.push(node);
    }
    ts.forEachChild(node, visit);
  };
  if (method.body) {
    visit(method.body);
  }
  return calls;
}

function calledThisMethod(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  return ts.isPropertyAccessExpression(callee) &&
    callee.expression.kind === ts.SyntaxKind.ThisKeyword
    ? callee.name.text
    : undefined;
}

function calledVisualAction(call: ts.CallExpression): string | undefined {
  const callee = call.expression;
  if (
    !ts.isPropertyAccessExpression(callee) ||
    !ts.isPropertyAccessExpression(callee.expression) ||
    callee.expression.expression.kind !== ts.SyntaxKind.ThisKeyword ||
    callee.expression.name.text !== 'visualActions'
  ) {
    return undefined;
  }
  return callee.name.text;
}

describe('createVisualActionRegistry', () => {
  it('runs the freshness hook before dispatch with the registered action name', async () => {
    const dispatch = rs
      .fn()
      .mockImplementation(async (uri: string) => `launched:${uri}`);
    const onActionStarting = rs.fn().mockResolvedValue(undefined);
    const actions = createVisualActionRegistry(
      {
        launch: dispatch,
      },
      onActionStarting,
    );

    await expect(actions.launch('com.example.app')).resolves.toBe(
      'launched:com.example.app',
    );
    expect(onActionStarting).toHaveBeenCalledOnce();
    expect(onActionStarting).toHaveBeenCalledWith('launch');
    expect(onActionStarting.mock.invocationCallOrder[0]).toBeLessThan(
      dispatch.mock.invocationCallOrder[0],
    );
  });

  it('marks a composite action only once', async () => {
    const dispatchStep = rs.fn().mockResolvedValue(undefined);
    const onActionStarting = rs.fn().mockResolvedValue(undefined);
    const actions = createVisualActionRegistry(
      {
        swipe: async (repeat: number) => {
          for (let index = 0; index < repeat; index++) {
            await dispatchStep();
          }
        },
      },
      onActionStarting,
    );

    await actions.swipe(3);

    expect(dispatchStep).toHaveBeenCalledTimes(3);
    expect(onActionStarting).toHaveBeenCalledOnce();
    expect(onActionStarting).toHaveBeenCalledWith('swipe');
  });

  it('marks an action before a dispatch that later fails', async () => {
    const actionError = new Error('second gesture failed');
    const dispatchStep = rs
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(actionError);
    const onActionStarting = rs.fn().mockResolvedValue(undefined);
    const actions = createVisualActionRegistry(
      {
        swipe: async () => {
          await dispatchStep();
          await dispatchStep();
        },
      },
      onActionStarting,
    );

    await expect(actions.swipe()).rejects.toBe(actionError);
    expect(onActionStarting).toHaveBeenCalledOnce();
    expect(onActionStarting).toHaveBeenCalledWith('swipe');
    expect(onActionStarting.mock.invocationCallOrder[0]).toBeLessThan(
      dispatchStep.mock.invocationCallOrder[0],
    );
  });
});

describe('AndroidDevice visual action boundary', () => {
  const deviceSourcePath = join(__dirname, '../../src/device.ts');
  const deviceSource = readFileSync(deviceSourcePath, 'utf8');
  const sourceFile = ts.createSourceFile(
    deviceSourcePath,
    deviceSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const androidDeviceClass = sourceFile.statements.find(
    (statement): statement is ts.ClassDeclaration =>
      ts.isClassDeclaration(statement) &&
      statement.name?.text === 'AndroidDevice',
  );

  if (!androidDeviceClass) {
    throw new Error('AndroidDevice class was not found in device.ts');
  }

  const methods = androidDeviceClass.members.filter(ts.isMethodDeclaration);
  const publicMethods = methods.filter(
    (method) => !isPrivate(method) && methodName(method) !== undefined,
  );
  const methodsByName = new Map(
    methods.flatMap((method) => {
      const name = methodName(method);
      return name ? [[name, method] as const] : [];
    }),
  );

  it('keeps public visual mutations behind the registry', () => {
    const bypasses = publicMethods.flatMap((method) => {
      const owner = methodName(method)!;
      return collectCalls(method, (call) => {
        const calledMethod = calledThisMethod(call);
        return Boolean(
          calledMethod &&
            (calledMethod.endsWith('Raw') ||
              lowLevelVisualMutationMethods.has(calledMethod)),
        );
      }).map((call) => `${owner} -> ${calledThisMethod(call)}`);
    });

    expect(bypasses).toEqual([]);
  });

  it('requires every public ADB caller to be reviewed as non-visual', () => {
    const publicAdbMethods = publicMethods
      .filter(
        (method) =>
          collectCalls(method, (call) => calledThisMethod(call) === 'getAdb')
            .length > 0,
      )
      .map((method) => methodName(method)!)
      .sort();

    expect(publicAdbMethods).toEqual([...reviewedPublicAdbMethods].sort());
  });

  it('delegates every public method with a raw implementation to the registry', () => {
    const missingDelegates = methods.flatMap((rawMethod) => {
      const rawName = methodName(rawMethod);
      if (!isPrivate(rawMethod) || !rawName?.endsWith('Raw')) {
        return [];
      }

      const actionName = rawName.slice(0, -'Raw'.length);
      const publicMethod = methodsByName.get(actionName);
      if (!publicMethod || isPrivate(publicMethod)) {
        return [];
      }

      const delegatesToRegistry =
        collectCalls(
          publicMethod,
          (call) => calledVisualAction(call) === actionName,
        ).length > 0;
      return delegatesToRegistry ? [] : [actionName];
    });

    expect(missingDelegates).toEqual([]);
  });
});
