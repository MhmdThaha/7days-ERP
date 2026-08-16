import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const afterMock = vi.fn();

vi.mock('next/server', () => ({
  after: (task: () => Promise<void>) => afterMock(task),
}));

import { scheduleAfterResponse } from '@/lib/server/schedule-after-response';

describe('scheduleAfterResponse', () => {
  beforeEach(() => {
    afterMock.mockReset();
  });

  it('registers the task with Next.js after() and reports success', () => {
    const task = vi.fn(async () => undefined);
    afterMock.mockImplementation(() => undefined);

    expect(scheduleAfterResponse(task)).toBe(true);
    expect(afterMock).toHaveBeenCalledWith(task);
  });

  it('returns false when after() throws so callers can fall back', () => {
    afterMock.mockImplementation(() => {
      throw new Error('no request context');
    });

    expect(scheduleAfterResponse(async () => undefined)).toBe(false);
  });
});
