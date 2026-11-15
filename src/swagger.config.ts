import { DocumentBuilder, OpenAPIObject } from '@nestjs/swagger';

export function buildSwaggerConfig(): Omit<OpenAPIObject, 'paths'> {
  return new DocumentBuilder()
    .setTitle('Async Furious - Execucao e Producao')
    .setDescription('Servico de Execucao e Producao')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
}
