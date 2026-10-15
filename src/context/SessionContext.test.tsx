import { describe, expect, it, beforeEach } from 'vitest';
import { clearStoredUser, clearToken, getStoredUser, getToken, setStoredUser, setToken, type PublicUser } from '../lib/api';

describe('Session Persistence across App Restarts', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('persists token and user in localStorage', () => {
    const user: PublicUser = {
      id: 42,
      username: 'coach_ali',
      role: 'coach',
      displayName: 'علی مرادی',
      coachId: null,
      mustChangePassword: false,
    };

    setToken('test-persistent-token-12345678901234567890');
    setStoredUser(user);

    expect(getToken()).toBe('test-persistent-token-12345678901234567890');
    expect(getStoredUser()).toEqual(user);
  });

  it('clearToken cleans up both token and stored user', () => {
    const user: PublicUser = {
      id: 99,
      username: 'student_sara',
      role: 'student',
      displayName: 'سارا رضایی',
      coachId: 42,
      mustChangePassword: false,
    };

    setToken('token-to-be-cleared-12345678901234567890');
    setStoredUser(user);

    clearToken();

    expect(getToken()).toBeNull();
    expect(getStoredUser()).toBeNull();
  });

  it('clearStoredUser removes only the user object', () => {
    setToken('keep-token-12345678901234567890');
    setStoredUser({
      id: 1,
      username: 'owner',
      role: 'admin',
      displayName: 'مدیر',
      coachId: null,
      mustChangePassword: false,
    });

    clearStoredUser();

    expect(getToken()).toBe('keep-token-12345678901234567890');
    expect(getStoredUser()).toBeNull();
  });
});
