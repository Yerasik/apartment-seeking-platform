import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const apartmentsPath = path.join(root, 'public', 'data', 'apartments.json');
const versionPath = path.join(root, 'public', 'version.json');

function sortNewestFirst(list) {
  return [...(list || [])].sort((a, b) => {
    const ta = Date.parse(a?.createdAt || '') || 0;
    const tb = Date.parse(b?.createdAt || '') || 0;
    if (tb !== ta) return tb - ta;
    return String(b?.id || '').localeCompare(String(a?.id || ''));
  });
}

const apartments = JSON.parse(fs.readFileSync(apartmentsPath, 'utf8'));
const sorted = sortNewestFirst(apartments);
fs.writeFileSync(apartmentsPath, `${JSON.stringify(sorted, null, 2)}\n`);

const buildId = new Date().toISOString().replace(/[:.]/g, '-');
fs.writeFileSync(
  versionPath,
  `${JSON.stringify({ buildId, generatedAt: new Date().toISOString() }, null, 2)}\n`
);

console.log(`Sorted ${sorted.length} apartments (newest first). buildId=${buildId}`);
