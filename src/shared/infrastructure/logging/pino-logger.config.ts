import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Options } from 'pino-http';
import { AsyncLocalStorage } from 'node:async_hooks';

const CORRELATION_ID_HEADER = 'x-correlation-id';
const CORRELATION_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,128}$/;

export function resolveCorrelationId(request: IncomingMessage): string {
  const header = request.headers[CORRELATION_ID_HEADER];
  const supplied = Array.isArray(header) ? header[0] : header;
  return supplied && CORRELATION_ID_PATTERN.test(supplied) ? supplied : randomUUID();
}

export const pinoHttpOptions: Options = {
  genReqId: (request, response) => {
    const correlationId = resolveCorrelationId(request);
    response.setHeader(CORRELATION_ID_HEADER, correlationId);
    return correlationId;
  },
  customProps: (request) => ({ ...currentLogContext(), correlationId: request.id }),
  mixin: (_context, _level, _logger) => currentLogContext(),
  customLogLevel: (_request, response, error) => {
    if (error || response.statusCode >= 500) return 'error';
    if (response.statusCode >= 400) return 'warn';
    return 'info';
  },
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    censor: '[REDACTED]',
  },
};

// Campos estruturados padrao dos logs de dominio e de eventos.
export interface LogContext {
  ordemServicoId?: string;
  eventId?: string;
  correlationId?: string;
}

const eventLogContext = new AsyncLocalStorage<LogContext>();

export function logContext(context: LogContext): LogContext {
  return { ...eventLogContext.getStore(), ...context };
}

export function runWithLogContext<T>(context: LogContext, callback: () => T): T {
  return eventLogContext.run(context, callback);
}

export function currentLogContext(): LogContext {
  return eventLogContext.getStore() ?? {};
}
