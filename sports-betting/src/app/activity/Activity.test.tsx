import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mocks
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn()
}));

jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn()
}));

jest.mock('@/lib/firebase', () => ({
  functions: {}
}));

// Provide a fake user
import { useAuth } from '@/contexts/AuthContext';
(useAuth as jest.Mock).mockReturnValue({ user: { uid: 'u1' } });

import { httpsCallable } from 'firebase/functions';
import ActivityPage from './page';

// Stub IntersectionObserver before tests
beforeAll(() => {
  class MockIntersectionObserver {
    constructor(private cb: any) {}
    observe() {}
    disconnect() {}
  }
  // @ts-ignore
  window.IntersectionObserver = MockIntersectionObserver;
});

describe('<ActivityPage />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeletons initially', async () => {
    // make getLatestActivity never resolve
    const never = new Promise(() => {});
    (httpsCallable as jest.Mock).mockReturnValue(() => never);

    await act(async () => {
      render(<ActivityPage />);
    });

    // There should be several skeleton divs with the animate-pulse class
    const skeletons = screen
      .getAllByRole('generic')
      .filter(el => el.className.includes('animate-pulse'));
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('shows empty state when no trades are returned', async () => {
    // getLatestActivity resolves with empty trades
    const mockFn = jest.fn().mockResolvedValue({ data: { trades: [] } });
    (httpsCallable as jest.Mock).mockReturnValue(mockFn);

    await act(async () => {
      render(<ActivityPage />);
    });

    await waitFor(() => {
      expect(
        screen.getByText('No betting activity yet. Be the first to place a bet!')
      ).toBeInTheDocument();
    });
  });

  it('renders a trade and displays correct info', async () => {
    // Create a trade with invalid timestamp to test fallback
    const mockTrade = {
      id: 't1',
      amount: 100,
      expectedPayout: 250,
      selectedTeam: 'home' as const,
      status: 'Pending',
      createdAt: { _seconds: NaN, _nanoseconds: 0 },
      event: {
        home_team:    { full_name: 'Home Team' },
        visitor_team: { full_name: 'Visitor Team' }
      }
    };
    const mockFn = jest.fn().mockResolvedValue({ data: { trades: [mockTrade] } });
    (httpsCallable as jest.Mock).mockReturnValue(mockFn);

    await act(async () => {
      render(<ActivityPage />);
    });

    // Wait for trade to render
    await waitFor(() => {
      expect(screen.getByText('Home Team')).toBeInTheDocument();
      expect(screen.getByText('vs Visitor Team')).toBeInTheDocument();
      // Invalid timestamp should show fallback
      expect(screen.getByText('Date unavailable')).toBeInTheDocument();
      // Status badge
      expect(screen.getByText('Pending')).toBeInTheDocument();
      // Bet amounts
      expect(screen.getByText('Bet Amount: $100')).toBeInTheDocument();
      expect(screen.getByText('Potential Payout: $250.00')).toBeInTheDocument();
    });

    // Check that the container has pending‐status styling
    const tradeCard = screen.getByTestId('trade-card');
    expect(tradeCard).toHaveClass('border-yellow-400');
    expect(tradeCard).toHaveClass('animate-glow-border');
  });
});