import { describe, expect, it, vi } from 'vitest';
import { handleReportsRequest, type ReportsHandlerDependencies } from '../api/reports';

function dependencies(): ReportsHandlerDependencies {
  return {
    verifyIdToken: vi.fn().mockResolvedValue({ uid: 'verified-uid', email: 'owner@example.com' }),
    list: vi.fn().mockResolvedValue([]),
    usage: vi.fn().mockResolvedValue({
      period: '2026-08', plan: 'free', completed: 0, reserved: 0, limit: 5, remaining: 5,
    }),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe('/api/reports', () => {
  it('lists only the verified principal reports and usage', async () => {
    const deps = dependencies();
    const response = await handleReportsRequest(new Request('https://example.test/api/reports', {
      headers: { authorization: 'Bearer valid' },
    }), deps);
    expect(response.status).toBe(200);
    expect(deps.list).toHaveBeenCalledWith(expect.objectContaining({ uid: 'verified-uid' }));
    await expect(response.json()).resolves.toMatchObject({ reports: [], usage: { limit: 5 } });
  });

  it('deletes a report under the verified UID and rejects a supplied UID', async () => {
    const deps = dependencies();
    const response = await handleReportsRequest(new Request('https://example.test/api/reports', {
      method: 'DELETE',
      headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
      body: JSON.stringify({ reportId: '7f6e6f6b-38d5-4a24-9541-90aa8d91ff21' }),
    }), deps);
    expect(response.status).toBe(200);
    expect(deps.delete).toHaveBeenCalledWith(
      'verified-uid',
      '7f6e6f6b-38d5-4a24-9541-90aa8d91ff21',
    );

    const impersonation = await handleReportsRequest(new Request('https://example.test/api/reports', {
      method: 'DELETE',
      headers: { authorization: 'Bearer valid', 'content-type': 'application/json' },
      body: JSON.stringify({ reportId: '7f6e6f6b-38d5-4a24-9541-90aa8d91ff21', uid: 'other' }),
    }), deps);
    expect(impersonation.status).toBe(400);
  });
});
