import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { indoorDoorColumns } from '../../src/plugins/supabase.js';

const migration = readFileSync(
  new URL(
    '../../supabase/migrations/20261019222521_create_vec_destination_points.sql',
    import.meta.url,
  ),
  'utf8',
);

function tableColumns(sql: string): Set<string> {
  const body = /create table public\.vec_destination_points \(([\s\S]*?)\n\);/u.exec(sql)?.[1];
  if (body === undefined) throw new Error('vec_destination_points table not found');
  return new Set(
    body
      .split('\n')
      .map((line) => /^\s{2}([a-z_]+)\s+(?:uuid|text|double|integer|timestamptz|boolean)\b/u.exec(line)?.[1])
      .filter((name): name is string => name !== undefined),
  );
}

describe('indoor door columns', () => {
  it('selects only columns that exist in the vec_destination_points migration', () => {
    const columns = tableColumns(migration);

    expect(columns.size).toBeGreaterThan(10);
    for (const column of indoorDoorColumns.split(',')) {
      expect(columns, column).toContain(column);
    }
  });
});
