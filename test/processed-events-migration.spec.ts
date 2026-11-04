import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('processed_events guarded migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../prisma/migrations/20261103000000_drop_empty_processed_events/migration.sql'
    ),
    'utf8'
  );

  it('locks before checking emptiness and drops without cascade in a transaction', () => {
    expect(migration).toMatch(/^BEGIN;/);
    expect(migration).toMatch(/LOCK TABLE public\.processed_events IN ACCESS EXCLUSIVE MODE/);
    expect(migration.indexOf('LOCK TABLE')).toBeLessThan(
      migration.indexOf('IF EXISTS (SELECT 1 FROM')
    );
    expect(migration).toMatch(
      /RAISE EXCEPTION 'Refusing to drop public\.processed_events: table contains data'/
    );
    expect(migration).toMatch(/DROP TABLE public\.processed_events RESTRICT/);
    expect(migration).not.toMatch(/CASCADE/i);
    expect(migration).toMatch(/to_regclass\('public\.processed_events'\)/);
    expect(migration.trimEnd()).toMatch(/COMMIT;$/);
  });
});
