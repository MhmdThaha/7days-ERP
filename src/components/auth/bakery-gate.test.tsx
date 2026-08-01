// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BakeryGate } from '@/components/auth/bakery-gate';

const { mockReplace, mockUseAuth, mockUseServerSessionVerified } = vi.hoisted(() => ({
  mockReplace: vi.fn(),
  mockUseAuth: vi.fn(),
  mockUseServerSessionVerified: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
}));

vi.mock('@/hooks/use-auth', () => ({
  useAuth: mockUseAuth,
}));

vi.mock('@/providers/server-auth-context', () => ({
  useServerSessionVerified: mockUseServerSessionVerified,
}));

describe('BakeryGate', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockUseAuth.mockReset();
    mockUseServerSessionVerified.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders children immediately when SSR verified the session', () => {
    mockUseServerSessionVerified.mockReturnValue(true);
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: true,
      isAuthenticated: false,
    });

    render(
      <BakeryGate>
        <div>Dashboard content</div>
      </BakeryGate>,
    );

    expect(screen.getByText('Dashboard content')).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('blocks until client auth when SSR has not verified the session', () => {
    mockUseServerSessionVerified.mockReturnValue(false);
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: true,
      isAuthenticated: false,
    });

    render(
      <BakeryGate>
        <div>Dashboard content</div>
      </BakeryGate>,
    );

    expect(screen.getByText('Loading your bakery...')).toBeTruthy();
    expect(screen.queryByText('Dashboard content')).toBeNull();
  });

  it('redirects to login when client auth resolves unauthenticated without SSR verification', () => {
    mockUseServerSessionVerified.mockReturnValue(false);
    mockUseAuth.mockReturnValue({
      user: null,
      isLoading: false,
      isAuthenticated: false,
    });

    render(
      <BakeryGate>
        <div>Dashboard content</div>
      </BakeryGate>,
    );

    expect(mockReplace).toHaveBeenCalledWith('/login');
  });
});
