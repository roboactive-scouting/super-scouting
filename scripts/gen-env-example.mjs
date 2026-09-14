#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSHEET_PATH = join(ROOT, 'docs/ops/ENVIRONMENT.md');
const TARGETS = {
  client: join(ROOT, 'apps/client/.env.example'),
  server: join(ROOT, 'apps/server/.env.example'),
};

const strip = (cell) => cell.replaceAll('`', '').replaceAll('**', '').trim();

function parseSection(markdown, heading) {
  const start = markdown.indexOf(heading);
  if (start === -1) throw new Error(`ENVIRONMENT.md is missing the section "${heading}"`);
  const rest = markdown.slice(start + heading.length);
  const end = rest.indexOf('\n## ');
  const body = end === -1 ? rest : rest.slice(0, end);
  return body
    .split('\n')
    .filter((line) => line.trim().startsWith('|'))
    .slice(2) // header row and separator row
    .map((line) => line.split('|').slice(1, -1))
    .filter((cells) => cells.length >= 4 && strip(cells[0]).length > 0)
    .map((cells) => ({
      name: strip(cells[0]),
      what: strip(cells[1]),
      where: strip(cells[2]),
      secret: /yes/i.test(strip(cells[3])),
    }));
}

export function parseWorksheet(markdown) {
  return {
    client: parseSection(markdown, '## 1. Client'),
    server: parseSection(markdown, '## 2. Server'),
  };
}

export function renderEnvExample(app, variables) {
  const lines = [
    `# apps/${app}/.env.example`,
    '#',
    '# GENERATED — do not edit by hand.',
    '# It is generated from docs/ops/ENVIRONMENT.md by `pnpm env:example`.',
    '# No real value belongs in this file, in this repository, in a commit message,',
    '# or in a chat message. Names and placeholders only (SPEC-FINAL Appendix B).',
    '',
  ];
  for (const v of variables) {
    lines.push(`# ${v.what}`);
    lines.push(`# Where: ${v.where}`);
    if (v.secret) lines.push('# SECRET — set it in the Vercel dashboard, never here.');
    lines.push(`${v.name}=`);
    lines.push('');
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

export function main(argv = process.argv.slice(2)) {
  const check = argv.includes('--check');
  const parsed = parseWorksheet(readFileSync(WORKSHEET_PATH, 'utf8'));
  let drifted = false;
  for (const app of ['client', 'server']) {
    const rendered = renderEnvExample(app, parsed[app]);
    const path = TARGETS[app];
    let current = null;
    try {
      current = readFileSync(path, 'utf8');
    } catch {
      current = null;
    }
    if (current === rendered) continue;
    if (check) {
      drifted = true;
      console.error(`drift: ${path} does not match docs/ops/ENVIRONMENT.md`);
    } else {
      writeFileSync(path, rendered, 'utf8');
      console.warn(`wrote ${path}`);
    }
  }
  if (check && drifted) {
    console.error('Run `pnpm env:example` and commit the result.');
    process.exit(1);
  }
}

// Run only when invoked directly, never when imported by the test.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
