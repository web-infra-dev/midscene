import { CDVC } from 'check-dependency-version-consistency';

const workspace = new CDVC('.');
const playwright = workspace.getDependency('playwright');
// Replay uses newer CDP APIs. The two SDK test suites keep their established
// declaration. Only exempt this exact difference, including its participants.
const expectedPlaywrightRanges = new Map([
  ['packages/replay', '^1.65.0'],
  ['packages/test', '^1.45.0'],
  ['packages/web-integration', '^1.45.0'],
]);
const playwrightRanges = playwright.versions.flatMap(({ version, packages }) =>
  packages.map(({ pathRelative }) => [pathRelative, version]),
);
const replayException =
  playwright.isMismatching &&
  playwrightRanges.length === expectedPlaywrightRanges.size &&
  playwrightRanges.every(
    ([path, version]) =>
      expectedPlaywrightRanges.get(path.replaceAll('\\', '/')) === version,
  );
const result = replayException
  ? new CDVC('.', { ignoreDep: ['playwright'] })
  : workspace;

if (result.hasMismatchingDependencies) {
  console.error(result.toMismatchSummary());
  process.exitCode = 1;
}
