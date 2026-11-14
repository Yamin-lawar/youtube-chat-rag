import { describe, expect, it, vi } from 'vitest';
import { retryOnLimit } from './retryOnLimit.js';

const options = () => ({ sleep: vi.fn(() => Promise.resolve()), log: vi.fn() });
const minuteLimit = new Error(
  '429 Rate limit reached on tokens per minute (TPM). Please try again in 2s.',
);
const dayLimit = new Error(
  '429 Rate limit reached on tokens per day (TPD). Please try again in 3m.',
);

describe('retryOnLimit', () => {
  it('returns the result without waiting when the first attempt works', async () => {
    const o = options();
    expect(await retryOnLimit(() => Promise.resolve('ok'), o)).toBe('ok');
    expect(o.sleep).not.toHaveBeenCalled();
  });

  it('waits the time the error asks for, plus one second, and tries again', async () => {
    const o = options();
    const attempt = vi.fn().mockRejectedValueOnce(minuteLimit).mockResolvedValueOnce('ok');
    expect(await retryOnLimit(attempt, o)).toBe('ok');
    expect(o.sleep).toHaveBeenCalledWith(3000);
  });

  it('throws a daily limit at once', async () => {
    const o = options();
    await expect(retryOnLimit(() => Promise.reject(dayLimit), o)).rejects.toBe(dayLimit);
    expect(o.sleep).not.toHaveBeenCalled();
  });

  it('throws other errors at once', async () => {
    const o = options();
    await expect(retryOnLimit(() => Promise.reject(new Error('401 bad key')), o)).rejects.toThrow(
      '401',
    );
    expect(o.sleep).not.toHaveBeenCalled();
  });

  it('gives up after the allowed number of waits', async () => {
    const o = { ...options(), maxWaits: 2 };
    const attempt = vi.fn(() => Promise.reject(minuteLimit));
    await expect(retryOnLimit(attempt, o)).rejects.toBe(minuteLimit);
    expect(attempt).toHaveBeenCalledTimes(3);
  });
});
