const fs = require('fs');
const path = require('path');

const root = process.cwd();
const inputPaths = process.argv.slice(2);
const defaultTargets = ['metaiq-frontend/src', 'metaiq-backend/src', 'metaiq-backend/seed.ts', 'metaiq-backend/backup.sql'];
const targets = inputPaths.length ? inputPaths : defaultTargets;
const allowedExtensions = new Set(['.ts', '.html', '.scss', '.json', '.sql']);
const excludedSegments = new Set(['node_modules', 'dist', 'coverage', '.git', '.angular']);
const repairablePattern = /(?:Ã[¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿]|Ãƒ|Ã‚|Â[·ªº°]|â[€œš][^\u0000-\u007F]*|ðŸ[^\u0000-\u007F]*|�[^\r\n"'`<>{}\[\]]*)+/g;
const suspiciousScore = /Ã[¡¢£¤¥¦§¨©ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿]|Ãƒ|Ã‚|Â[·ªº°]|â€|âœ|âš|ðŸ|�/g;

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

function countSuspicious(text) {
  return (text.match(suspiciousScore) || []).length;
}

function decodeSegment(segment) {
  let current = segment;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const decoded = Buffer.from(current, 'latin1').toString('utf8');
    if (decoded === current || countSuspicious(decoded) > countSuspicious(current)) {
      break;
    }
    current = decoded;
  }

  return current;
}

let changedFiles = 0;

for (const target of targets) {
  for (const file of collectFiles(target)) {
    const original = fs.readFileSync(file, 'utf8');
    if (!suspiciousScore.test(original)) {
      continue;
    }

    const repaired = original.replace(repairablePattern, (segment) => decodeSegment(segment));
    if (repaired !== original) {
      fs.writeFileSync(file, repaired, 'utf8');
      changedFiles += 1;
      console.log(`repaired ${path.relative(root, file)}`);
    }
  }
}

console.log(`repair complete: ${changedFiles} file(s) updated.`);
