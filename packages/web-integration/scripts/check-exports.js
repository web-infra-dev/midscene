// scripts/check-exports.js
const fs = require('node:fs');
const path = require('node:path');

function checkConsistency() {
  const pkgPath = path.resolve(__dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const exports = pkg.exports;
  const typesVersions = pkg.typesVersions ? pkg.typesVersions['*'] || {} : {};
  const rootDir = path.dirname(pkgPath);

  const errors = [];

  // Check if each exports entry has a corresponding typesVersions entry, and check if files exist
  for (const [key, value] of Object.entries(exports)) {
    // Check if types file exists
    const typesPath = value.types;
    if (typesPath) {
      const absoluteTypesPath = path.resolve(rootDir, typesPath);
      if (!fs.existsSync(absoluteTypesPath)) {
        errors.push(`File does not exist: ${typesPath}`);
      }

      const tsVersionPath = typesVersions[key.replace('./', '')];
      if (!tsVersionPath) {
        errors.push(`Missing typesVersions entry: ${key}`);
      } else if (tsVersionPath[0] !== typesPath) {
        errors.push(
          `Path mismatch: exports[${key}].types = ${typesPath}, typesVersions[${key}] = ${tsVersionPath[0]}`,
        );
      }
    }

    // Check if import and require files exist
    if (value.import) {
      const importPath = value.import;
      const absoluteImportPath = path.resolve(rootDir, importPath);
      if (!fs.existsSync(absoluteImportPath)) {
        errors.push(`File does not exist: ${importPath}`);
      }
    }

    if (value.require) {
      const requirePath = value.require;
      const absoluteRequirePath = path.resolve(rootDir, requirePath);
      if (!fs.existsSync(absoluteRequirePath)) {
        errors.push(`File does not exist: ${requirePath}`);
      }
    }

    // If value is a string, directly check if the file exists
    if (typeof value === 'string') {
      const absolutePath = path.resolve(rootDir, value);
      if (!fs.existsSync(absolutePath)) {
        errors.push(`File does not exist: ${value}`);
      }
    }
  }

  // Check if each entry in typesVersions has a corresponding entry in exports
  for (const [key, value] of Object.entries(typesVersions)) {
    const exportKey = key === '.' ? key : `./${key}`;
    if (!exports[exportKey]) {
      errors.push(`Missing exports entry: ${exportKey}`);
    }

    // Check if files in typesVersions exist
    if (Array.isArray(value) && value.length > 0) {
      const typePath = value[0];
      const absoluteTypePath = path.resolve(rootDir, typePath);
      if (!fs.existsSync(absoluteTypePath)) {
        errors.push(`File does not exist: ${typePath}`);
      }
    }
  }

  if (errors.length > 0) {
    console.error('Found issues with exports and typesVersions:');
    errors.forEach((err) => console.error(` - ${err}`));
    process.exit(1);
  } else {
    console.log(
      'exports and typesVersions configuration is consistent and all files exist ✓',
    );
  }
}

checkConsistency();
