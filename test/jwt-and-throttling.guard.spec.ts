import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthThrottlerGuard } from '../src/auth/guards/auth-throttler.guard';
import { JwtAndThrottlingGuard } from '../src/auth/guards/jwt-and-throttling.guard';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';

class TestableThrottlerGuard extends AuthThrottlerGuard {
  tracker(req: { user?: { id?: string }; ip: string }): Promise<string> {
    return this.getTracker(req);
  }
}

describe('authenticated throttling', () => {
  it('isolates subjects, shares a subject bucket, and ignores forwarded headers', async () => {
    const throttler = new TestableThrottlerGuard({} as never, {} as never, {} as never);
    const a = await throttler.tracker({ user: { id: 'same' }, ip: '10.0.0.1' });
    const aAgain = await throttler.tracker({ user: { id: 'same' }, ip: '10.0.0.2' });
    const b = await throttler.tracker({ user: { id: 'other' }, ip: '10.0.0.1' });
    const forwardedRequest = {
      user: { id: 'same' },
      ip: '10.0.0.1',
      headers: { 'x-forwarded-for': '198.51.100.22' },
    };
    const spoofed = await throttler.tracker(forwardedRequest);

    expect(a).toBe('user:same');
    expect(aAgain).toBe(a);
    expect(b).not.toBe(a);
    expect(spoofed).toBe(a);
  });

  it('uses the request IP for public traffic', async () => {
    const throttler = new TestableThrottlerGuard({} as never, {} as never, {} as never);
    await expect(throttler.tracker({ ip: '192.0.2.4' })).resolves.toBe('ip:192.0.2.4');
  });

  it('charges invalid JWTs once by IP, preserving 401 until throttled', async () => {
    const unauthorized = new UnauthorizedException();
    const jwt = {
      canActivate: jest.fn().mockRejectedValue(unauthorized),
    } as unknown as JwtAuthGuard;
    const throttler = {
      canActivate: jest.fn().mockResolvedValue(true),
    } as unknown as AuthThrottlerGuard;
    const guard = new JwtAndThrottlingGuard(jwt, throttler);

    await expect(guard.canActivate({} as ExecutionContext)).rejects.toBe(unauthorized);
    expect(throttler.canActivate).toHaveBeenCalledTimes(1);

    const rateLimited = new Error('429');
    (throttler.canActivate as jest.Mock).mockRejectedValueOnce(rateLimited);
    await expect(guard.canActivate({} as ExecutionContext)).rejects.toBe(rateLimited);
    expect(throttler.canActivate).toHaveBeenCalledTimes(2);
  });

  it('does not throttle internal JWT errors', async () => {
    const internal = new Error('internal');
    const jwt = { canActivate: jest.fn().mockRejectedValue(internal) } as unknown as JwtAuthGuard;
    const throttler = { canActivate: jest.fn() } as unknown as AuthThrottlerGuard;

    await expect(
      new JwtAndThrottlingGuard(jwt, throttler).canActivate({} as ExecutionContext)
    ).rejects.toBe(internal);
    expect(throttler.canActivate).not.toHaveBeenCalled();
  });
});
