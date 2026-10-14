import { describe, it, expect, afterEach } from 'vitest';
import { setSession, getUserSession, deleteSession } from './session-helper';
import { ILocalSession } from '@/types/auth/local-session.types';

describe('session-helper', () => {
  afterEach(() => {
    deleteSession();
  });

  it('round-trips non-ASCII characters in the stored session', () => {
    setSession({ name: 'Nórbért Fejér', email: 'norbi@example.com' } as ILocalSession);

    const session = getUserSession();

    expect(session?.name).toBe('Nórbért Fejér');
  });

  it('round-trips characters outside the Latin-1 range', () => {
    setSession({ name: 'Łukasz 李雷 🚀' } as ILocalSession);

    expect(getUserSession()?.name).toBe('Łukasz 李雷 🚀');
  });

  it('returns null when no session is stored', () => {
    expect(getUserSession()).toBeNull();
  });
});
