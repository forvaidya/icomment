import fs from 'fs';
import { execSync } from 'child_process';

const indexPath = './index.html';
const html = fs.readFileSync(indexPath, 'utf-8');

let sha = process.env.CF_PAGES_COMMIT_SHA || '';
if (!sha) {
  try {
    sha = execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    sha = 'unknown';
  }
}

const updated = html.replace(
  /<footer>.*?<\/footer>/s,
  `<footer><a href="http://www.awanipro.com" target="_blank">awanipro.com</a> • v:${sha}</footer>`
);

fs.writeFileSync(indexPath, updated);
console.log(`✓ Injected SHA: ${sha}`);
