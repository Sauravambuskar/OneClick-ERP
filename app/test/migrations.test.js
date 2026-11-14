import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMigrationSql, checkNumbering } from '../scripts/check-migrations.js';

test('safe additive migration passes', () => {
  assert.deepEqual(checkMigrationSql('003_add_notes.sql', 'ALTER TABLE customers ADD COLUMN notes TEXT;'), []);
});

test('DROP COLUMN is blocked', () => {
  const problems = checkMigrationSql('003_drop.sql', 'ALTER TABLE customers DROP COLUMN phone;');
  assert.equal(problems.length, 1);
});

test('destructive change is allowed with an explicit marker', () => {
  const sql = '-- migration-safety: allow-destructive column unused since v2\nALTER TABLE customers DROP COLUMN phone;';
  assert.deepEqual(checkMigrationSql('003_drop.sql', sql), []);
});

test('commented-out SQL is ignored', () => {
  assert.deepEqual(checkMigrationSql('003_x.sql', '-- DROP TABLE customers;\nSELECT 1;'), []);
});

test('bad names and duplicate numbers are reported', () => {
  assert.equal(checkMigrationSql('NewThing.sql', 'SELECT 1;').length, 1);
  assert.equal(checkNumbering(['001_a.sql', '001_b.sql']).length, 1);
});
