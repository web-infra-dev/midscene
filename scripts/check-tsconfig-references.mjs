import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const workspacePackageRoots = ['apps', 'packages'];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeRelative(file) {
  return path.relative(workspaceRoot, file).split(path.sep).join('/');
}

function getWorkspaceProjects() {
  const projects = workspacePackageRoots.flatMap((rootDir) => {
    const absoluteRootDir = path.join(workspaceRoot, rootDir);
    if (!fs.existsSync(absoluteRootDir)) {
      return [];
    }

    return fs
      .readdirSync(absoluteRootDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(absoluteRootDir, entry.name))
      .filter((packageDir) =>
        fs.existsSync(path.join(packageDir, 'package.json')),
      )
      .map((packageDir) => {
        const packageJson = readJson(path.join(packageDir, 'package.json'));
        const tsconfigPath = path.join(packageDir, 'tsconfig.json');
        const tsconfig = fs.existsSync(tsconfigPath)
          ? readJson(tsconfigPath)
          : undefined;

        return {
          packageDir,
          packageName: packageJson.name,
          tsconfig,
          tsconfigPath: tsconfig ? tsconfigPath : undefined,
        };
      });
  });

  return projects.sort((a, b) =>
    normalizeRelative(a.packageDir).localeCompare(
      normalizeRelative(b.packageDir),
    ),
  );
}

function getReferencedProjects(projects) {
  return projects.filter(
    (project) =>
      project.tsconfigPath &&
      Array.isArray(project.tsconfig?.references) &&
      project.tsconfig.references.length > 0,
  );
}

function getTsconfigProjects(projects) {
  return projects.filter((project) => project.tsconfigPath);
}

function getWorkspacePackages(projects) {
  const packageByName = new Map();
  const packageByDir = new Map();

  for (const project of projects) {
    if (!project.packageName) {
      continue;
    }

    packageByName.set(project.packageName, project.packageDir);
    packageByDir.set(project.packageDir, project.packageName);
  }

  return { packageByName, packageByDir };
}

function getPackageNameFromSpecifier(specifier, packageByName) {
  if (specifier.startsWith('@')) {
    const [scope, name] = specifier.split('/');
    if (!scope || !name) {
      return undefined;
    }
    const packageName = `${scope}/${name}`;
    return packageByName.has(packageName) ? packageName : undefined;
  }

  const [packageName] = specifier.split('/');
  return packageByName.has(packageName) ? packageName : undefined;
}

function resolveReferencePackageName(tsconfigPath, reference, packageByDir) {
  const referencePath = path.resolve(
    path.dirname(tsconfigPath),
    reference.path,
  );
  const stats = fs.existsSync(referencePath)
    ? fs.statSync(referencePath)
    : undefined;
  const referenceDir =
    stats?.isFile() && path.basename(referencePath) === 'tsconfig.json'
      ? path.dirname(referencePath)
      : referencePath;

  return packageByDir.get(referenceDir);
}

const projects = getWorkspaceProjects();
const packageDirs = projects.map((project) => project.packageDir);
let ts;
let tscPath;
try {
  ts = require(
    require.resolve('typescript', {
      paths: [workspaceRoot, ...packageDirs],
    }),
  );
  tscPath = require.resolve('typescript/bin/tsc', {
    paths: [workspaceRoot, ...packageDirs],
  });
} catch (error) {
  console.error('Unable to resolve TypeScript. Run pnpm install first.');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function parseTsconfig(tsconfigPath) {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    const message = ts.flattenDiagnosticMessageText(
      configFile.error.messageText,
      '\n',
    );
    throw new Error(`${normalizeRelative(tsconfigPath)}: ${message}`);
  }

  return ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    path.dirname(tsconfigPath),
    undefined,
    tsconfigPath,
  );
}

function getModuleSpecifierText(node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }

  if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword &&
    node.arguments.length === 1 &&
    ts.isStringLiteralLike(node.arguments[0])
  ) {
    return node.arguments[0].text;
  }

  if (
    ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteralLike(node.argument.literal)
  ) {
    return node.argument.literal.text;
  }

  return undefined;
}

function collectImportedWorkspacePackages(fileName, packageByName) {
  const sourceText = fs.readFileSync(fileName, 'utf8');
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = new Set();

  function visit(node) {
    const specifier = getModuleSpecifierText(node);
    if (specifier) {
      const packageName = getPackageNameFromSpecifier(specifier, packageByName);
      if (packageName) {
        imports.add(packageName);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return imports;
}

function formatPackageList(packages) {
  return packages.length ? packages.sort().join(', ') : '-';
}

function checkReferenceCycles(projects) {
  const failedTsconfigs = [];

  for (const { tsconfigPath } of projects) {
    const relativeTsconfigPath = normalizeRelative(tsconfigPath);
    const result = spawnSync(
      process.execPath,
      [tscPath, '-b', tsconfigPath, '--dry', '--pretty', 'false'],
      {
        cwd: workspaceRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    if (result.status !== 0) {
      console.error(`✗ cycles ${relativeTsconfigPath}`);
      failedTsconfigs.push({
        tsconfigPath: relativeTsconfigPath,
        output: `${result.stdout || ''}${result.stderr || ''}`,
      });
    } else {
      console.log(`✓ cycles ${relativeTsconfigPath}`);
    }
  }

  if (failedTsconfigs.length > 0) {
    console.error('\nTypeScript dry build failed for:');
    for (const { tsconfigPath } of failedTsconfigs) {
      console.error(`- ${tsconfigPath}`);
    }
    for (const { tsconfigPath, output } of failedTsconfigs) {
      console.error(`\n--- ${tsconfigPath} ---`);
      process.stderr.write(output || '(no output)\n');
      if (output && !output.endsWith('\n')) {
        process.stderr.write('\n');
      }
    }
    return false;
  }

  console.log(
    `TypeScript dry build passed for ${projects.length} referenced tsconfigs.`,
  );
  return true;
}

function checkReferenceImports(projects, packageByName, packageByDir) {
  const problems = [];

  for (const project of projects) {
    const { packageName: ownerPackageName, tsconfig, tsconfigPath } = project;
    const parsed = parseTsconfig(tsconfigPath);
    const importedPackages = new Set();

    for (const fileName of parsed.fileNames) {
      if (!/\.[cm]?[tj]sx?$/.test(fileName)) {
        continue;
      }

      const imports = collectImportedWorkspacePackages(fileName, packageByName);
      for (const packageName of imports) {
        if (packageName !== ownerPackageName) {
          importedPackages.add(packageName);
        }
      }
    }

    const referencedPackages = new Set(
      (tsconfig.references || [])
        .map((reference) =>
          resolveReferencePackageName(tsconfigPath, reference, packageByDir),
        )
        .filter(Boolean),
    );
    const missingReferences = [...importedPackages].filter(
      (packageName) => !referencedPackages.has(packageName),
    );
    const extraReferences = [...referencedPackages].filter(
      (packageName) => !importedPackages.has(packageName),
    );
    const relativeTsconfigPath = normalizeRelative(tsconfigPath);

    if (missingReferences.length || extraReferences.length) {
      console.error(`✗ imports ${relativeTsconfigPath}`);
      problems.push({
        tsconfigPath,
        missingReferences,
        extraReferences,
      });
    } else {
      console.log(`✓ imports ${relativeTsconfigPath}`);
    }
  }

  if (problems.length) {
    console.error('tsconfig references do not match direct workspace imports.');
    for (const problem of problems) {
      console.error(`\n${normalizeRelative(problem.tsconfigPath)}`);
      if (problem.missingReferences.length) {
        console.error(
          `  missing references: ${formatPackageList(problem.missingReferences)}`,
        );
      }
      if (problem.extraReferences.length) {
        console.error(
          `  extra references:   ${formatPackageList(problem.extraReferences)}`,
        );
      }
    }
    return false;
  }

  console.log('tsconfig references match direct workspace imports.');
  return true;
}

const referencedProjects = getReferencedProjects(projects);
const tsconfigProjects = getTsconfigProjects(projects);
const { packageByName, packageByDir } = getWorkspacePackages(projects);
const cyclesPassed = checkReferenceCycles(referencedProjects);
const importsPassed = checkReferenceImports(
  tsconfigProjects,
  packageByName,
  packageByDir,
);

if (!cyclesPassed || !importsPassed) {
  process.exit(1);
}
