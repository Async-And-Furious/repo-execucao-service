import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class AuthThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: { user?: { id?: string }; ip: string }): Promise<string> {
    return Promise.resolve(req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`);
  }
}
