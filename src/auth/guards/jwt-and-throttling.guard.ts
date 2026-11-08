import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { isObservable, lastValueFrom } from 'rxjs';
import { AuthThrottlerGuard } from './auth-throttler.guard';
import { JwtAuthGuard } from './jwt-auth.guard';

@Injectable()
export class JwtAndThrottlingGuard implements CanActivate {
  constructor(
    private readonly jwtAuthGuard: JwtAuthGuard,
    private readonly throttlerGuard: AuthThrottlerGuard
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const authenticated = this.jwtAuthGuard.canActivate(context);
      if (isObservable(authenticated)) {
        await lastValueFrom(authenticated);
      } else {
        await authenticated;
      }
    } catch (error: unknown) {
      if (error instanceof HttpException && error.getStatus() === 401) {
        await this.throttlerGuard.canActivate(context);
      }
      throw error;
    }

    return this.throttlerGuard.canActivate(context);
  }
}
