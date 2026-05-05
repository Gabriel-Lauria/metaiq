const fs = require('fs');
const path = require('path');

const root = process.cwd();
const inputPaths = process.argv.slice(2);
const defaultTargets = ['metaiq-frontend/src', 'metaiq-backend/src', 'metaiq-backend/seed.ts', 'metaiq-backend/backup.sql'];
const targets = inputPaths.length ? inputPaths : defaultTargets;
const allowedExtensions = new Set(['.ts', '.html', '.scss', '.json', '.sql']);
const excludedSegments = new Set(['node_modules', 'dist', 'coverage', '.git', '.angular']);
const suspiciousPattern = /Ã[¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿]|Ãƒ|Ã‚|Â·|Âª|Âº|Â°|â€|âœ|âš|ðŸ|�/;

function isExcluded(fullPath) {
  return fullPath.split(path.sep).some((segment) => excludedSegments.has(segment));
}

function collectFiles(entryPath, output = []) {
  const resolved = path.resolve(root, entryPath);
  if (!fs.existsSync(resolved) || isExcluded(resolved)) {
    return output;
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(resolved)) {
      collectFiles(path.join(resolved, child), output);
    }
    return output;
  }

  if (allowedExtensions.has(path.extname(resolved))) {
    output.push(resolved);
  }

  return output;
}

function findMojibakeLines(content) {
  const offenders = [];
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    if (suspiciousPattern.test(lines[index])) {
      offenders.push({
        lineNumber: index + 1,
        preview: lines[index].trim().slice(0, 160),
      });
    }
  }

  return offenders;
}

const findings = [];

for (const target of targets) {
  for (const file of collectFiles(target)) {
    const content = fs.readFileSync(file, 'utf8');
    const offenders = findMojibakeLines(content);
    if (offenders.length) {
      findings.push({
        file: path.relative(root, file),
        offenders,
      });
    }
  }
}

if (!findings.length) {
  console.log('Encoding check passed: no suspicious mojibake found.');
  process.exit(0);
}

console.error('Encoding check failed. Suspicious text found in:');
for (const finding of findings) {
  console.error(`- ${finding.file}`);
  for (const offender of finding.offenders.slice(0, 5)) {
    console.error(`  line ${offender.lineNumber}: ${offender.preview}`);
  }
}
process.exit(1);
