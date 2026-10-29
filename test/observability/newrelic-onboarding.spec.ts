import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = resolve(__dirname, '../..');

describe('New Relic onboarding contract', () => {
  it('documents a credential-free local environment with the agent disabled before startup', () => {
    const example = readFileSync(resolve(root, '.env.example'), 'utf8');

    expect(example).toMatch(/^NEW_RELIC_ENABLED="false"$/m);
    expect(example).toMatch(/^NEW_RELIC_NO_CONFIG_FILE="true"$/m);
    expect(example).toMatch(/^NEW_RELIC_APP_NAME="af-execucao-local"$/m);
    expect(example).toMatch(/^NEW_RELIC_LICENSE_KEY=""$/m);
  });

  it('declares environment-only HML telemetry without duplicate forwarding or embedded credentials', () => {
    const config = readFileSync(resolve(root, 'k8s/configmap.yaml'), 'utf8');
    const expected = {
      NEW_RELIC_NO_CONFIG_FILE: 'true',
      NEW_RELIC_APP_NAME: 'af-execucao-hml',
      NEW_RELIC_DISTRIBUTED_TRACING_ENABLED: 'true',
      NEW_RELIC_APPLICATION_LOGGING_ENABLED: 'true',
      NEW_RELIC_APPLICATION_LOGGING_LOCAL_DECORATING_ENABLED: 'true',
      NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED: 'false',
      NEW_RELIC_LOG: 'stdout',
    };

    for (const [key, value] of Object.entries(expected)) {
      expect(config).toMatch(new RegExp(`^  ${key}: ['"]${value}['"]$`, 'm'));
    }
    expect(config).not.toContain('NEW_RELIC_LICENSE_KEY');
    expect(config).not.toMatch(/^\s*NEW_RELIC_ENABLED:\s*['"]?false/m);
    for (const filename of ['newrelic.js', 'newrelic.cjs']) {
      expect(existsSync(resolve(root, filename))).toBe(false);
    }
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    expect(
      Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter((name) =>
        name.startsWith('@opentelemetry/')
      )
    ).toEqual([]);
  });

  it('loads the agent before any application module at the public entrypoint', () => {
    const source = ts.createSourceFile(
      'main.ts',
      readFileSync(resolve(root, 'src/main.ts'), 'utf8'),
      ts.ScriptTarget.Latest
    );
    const imports = source.statements.filter(ts.isImportDeclaration);

    expect(source.statements[0]).toBe(imports[0]);
    expect(imports[0]?.moduleSpecifier).toEqual(expect.objectContaining({ text: 'newrelic' }));
  });

  it('ships a production agent that loads without credentials when explicitly disabled', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
    expect(manifest.dependencies.newrelic).toBe('14.4.0');

    const child = spawnSync(
      process.execPath,
      [
        '-e',
        "const agent = require('newrelic'); process.stdout.write(typeof agent.getLinkingMetadata);",
      ],
      {
        cwd: root,
        env: {
          NEW_RELIC_ENABLED: 'false',
          NEW_RELIC_NO_CONFIG_FILE: 'true',
          NEW_RELIC_LICENSE_KEY: '',
          NEW_RELIC_APP_NAME: 'af-execucao-local',
          NEW_RELIC_LOG: 'stdout',
        },
        encoding: 'utf8',
        timeout: 10000,
      }
    );

    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stderr).toBe('');
    expect(child.stdout.startsWith('function')).toBe(true);
    expect(child.stdout).toContain('Module disabled in configuration. Not starting.');
  });
});
