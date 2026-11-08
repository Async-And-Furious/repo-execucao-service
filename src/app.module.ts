import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { DatabaseModule } from './shared/infrastructure/database/database.module';
import { AuthModule } from './auth/auth.module';
import { ExecucaoModule } from './modules/execucao/execucao.module';
import { HealthModule } from './modules/health/health.module';
import { RolesGuard } from './auth/guards/roles.guard';
import { GlobalExceptionFilter } from './shared/infrastructure/filters/global-exception.filter';
import { pinoHttpOptions } from './shared/infrastructure/logging/pino-logger.config';
import { AuthThrottlerGuard } from './auth/guards/auth-throttler.guard';
import { JwtAndThrottlingGuard } from './auth/guards/jwt-and-throttling.guard';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    LoggerModule.forRoot({ pinoHttp: pinoHttpOptions }),
    ThrottlerModule.forRoot([{ name: 'short', ttl: 60000, limit: 100 }]),
    DatabaseModule,
    AuthModule,
    ExecucaoModule,
    HealthModule,
  ],
  providers: [
    AuthThrottlerGuard,
    { provide: APP_GUARD, useClass: JwtAndThrottlingGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
})
export class AppModule {}
