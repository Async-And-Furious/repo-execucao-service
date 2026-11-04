import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../src/auth/decorators/public.decorator';
import { ExecucaoController } from '../src/modules/execucao/presentation/controllers/execucao.controller';
import { HealthController } from '../src/modules/health/presentation/controllers/health.controller';

type Operation = { security?: unknown[] };
type Document = { paths: Record<string, Record<string, Operation>> };

const document = JSON.parse(
  readFileSync(join(__dirname, '../docs/openapi.json'), 'utf8')
) as Document;

const toOpenApiPath = (controller: string, route: string): string =>
  `/api/v1/${[controller, route].filter(Boolean).join('/')}`
    .replace(/\/+/g, '/')
    .replace(/:([A-Za-z]+)/g, '{$1}')
    .replace(/\/$/, '');

const controllers = [ExecucaoController, HealthController];

const routesOf = (controller: (typeof controllers)[number]) => {
  const base = Reflect.getMetadata(PATH_METADATA, controller) as string;
  const classPublic = Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
  return Object.getOwnPropertyNames(controller.prototype)
    .map((name) => controller.prototype[name as keyof typeof controller.prototype] as unknown)
    .filter((handler): handler is object => typeof handler === 'function')
    .filter((handler) => Reflect.hasMetadata(METHOD_METADATA, handler))
    .map((handler) => {
      const route = Reflect.getMetadata(PATH_METADATA, handler) as string;
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number];
      return {
        method: method.toLowerCase(),
        path: toOpenApiPath(base, route === '/' ? '' : route),
        isPublic: classPublic || Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true,
      };
    });
};

describe('docs/openapi.json x controllers', () => {
  it.each(controllers)(
    'documents %p routes as public only where @Public() is applied',
    (controller) => {
      const routes = routesOf(controller);
      expect(routes.length).toBeGreaterThan(0);
      for (const { method, path, isPublic } of routes) {
        const operation = document.paths[path]?.[method];
        expect({ route: `${method} ${path}`, documented: operation !== undefined }).toEqual({
          route: `${method} ${path}`,
          documented: true,
        });
        expect({ route: `${method} ${path}`, public: !operation.security?.length }).toEqual({
          route: `${method} ${path}`,
          public: isPublic,
        });
      }
    }
  );

  it('documents no route beyond the controllers', () => {
    const expected = controllers.flatMap(routesOf).map(({ method, path }) => `${method} ${path}`);
    const documented = Object.entries(document.paths).flatMap(([path, ops]) =>
      Object.keys(ops).map((method) => `${method} ${path}`)
    );
    expect(documented.sort()).toEqual(expected.sort());
  });
});
