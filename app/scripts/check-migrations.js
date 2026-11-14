// Migration safety gate.
// Fails the pipeline when a database migration could lose data or break the
// running app, unless a human explicitly marks it as intended.
//
//   1. File names must look like 001_description.sql and numbers must be unique.
//   2. Destructive SQL (DROP TABLE/COLUMN, TRUNCATE, DELETE without WHERE,
//      column type changes, renames) is blocked unless the file contains:
//        -- migration-safety: allow-destructive <reason>
//   3. If MIGRATION_BASE_REF is set (e.g. origin/main), migrations that already
//      exist on that ref must not be edited or deleted - add a new file instead.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ALLOW_MARKER = /--\s*migration-safety:\s*allow-destructive\s+\S+/i;
const NAME_PATTERN = /^(\d{3,})_[a-z0-9_]+\.sql$/;

const DESTRUCTIVE_RULES = [
  { pattern: /\bDROP\s+TABLE\b/i, reason: 'DROP TABLE deletes data' },
  { pattern: /\bDROP\s+COLUMN\b/i, reason: 'DROP COLUMN deletes data and breaks the currently running version' },
  { pattern: /\bTRUNCATE\b/i, reason: 'TRUNCATE deletes all rows' },
  { pattern: /\bDELETE\s+FROM\s+\w+\s*;/i, reason: 'DELETE without WHERE deletes all rows' },
  { pattern: /\bALTER\s+COLUMN\s+\w+\s+(SET\s+DATA\s+)?TYPE\b/i, reason: 'changing a column type can fail or rewrite the table' },
  { pattern: /\bRENAME\s+(COLUMN|TO)\b/i, reason: 'renaming breaks the currently running version during deploy' },
  { pattern: /\bDROP\s+SCHEMA\b/i, reason: 'DROP SCHEMA deletes data' },
];

/** Strips -- comments so commented-out SQL does not trigger rules. */
const stripComments = (sql) => sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * @param {string} filename
 * @param {string} sql
 * @returns {string[]} problems found in this file
 */
export function checkMigrationSql(filename, sql) {
  const problems = [];
  if (!NAME_PATTERN.test(filename)) problems.push(`${filename}: name must match 001_description.sql (lowercase)`);
  if (stripComments(sql).trim() === '') problems.push(`${filename}: migration is empty`);
  if (!ALLOW_MARKER.test(sql)) {
    for (const rule of DESTRUCTIVE_RULES) {
      if (rule.pattern.test(stripComments(sql))) {
        problems.push(`${filename}: ${rule.reason}. Add "-- migration-safety: allow-destructive <reason>" if intended.`);
      }
    }
  }
  return problems;
}

/** @param {string[]} filenames */
export function checkNumbering(filenames) {
  const seen = new Map();
  const problems = [];
  for (const f of filenames) {
    const n = NAME_PATTERN.exec(f)?.[1];
    if (!n) continue;
    if (seen.has(n)) problems.push(`duplicate migration number ${n}: ${seen.get(n)} and ${f}`);
    seen.set(n, f);
  }
  return problems;
}

function checkHistory(dir, baseRef) {
  try {
    const out = execFileSync('git', ['diff', '--name-status', `${baseRef}...HEAD`, '--', dir], { encoding: 'utf8' });
    return out
      .split('\n')
      .filter((line) => /^[MDR]/.test(line))
      .map((line) => `already-merged migration was changed (${line.trim()}). Never edit applied migrations; add a new one.`);
  } catch (err) {
    console.warn(`[migrations] skipping history check: ${err.message.split('\n')[0]}`);
    return [];
  }
}

function main() {
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const problems = [
    ...checkNumbering(files),
    ...files.flatMap((f) => checkMigrationSql(f, readFileSync(path.join(dir, f), 'utf8'))),
    ...(process.env.MIGRATION_BASE_REF ? checkHistory(dir, process.env.MIGRATION_BASE_REF) : []),
  ];

  if (problems.length) {
    console.error(`Migration safety: FAILED (${problems.length} problem(s))`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`Migration safety: PASSED (${files.length} migration file(s) checked)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
