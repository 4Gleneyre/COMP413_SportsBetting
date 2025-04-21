import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { act } from 'react';
import LeaderboardPage from './page';

// Mock firebase/functions
jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn(),
  getFunctions: jest.fn(() => ({})),
}));

// Mock firebase config
jest.mock('@/lib/firebase', () => ({
  functions: {},
}));

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn();
let intersectionObserverCallback: any = null;

mockIntersectionObserver.mockImplementation((callback) => {
  intersectionObserverCallback = callback;
  return {
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn()
  };
});

window.IntersectionObserver = mockIntersectionObserver;

describe('LeaderboardPage', () => {
  const mockUsers = [
    {
      id: '1',
      username: 'user1',
      totalPnL: 100.50,
      winRate: 0.65,
      totalBets: 20
    },
    {
      id: '2',
      username: 'user2',
      totalPnL: -50.25,
      winRate: 0.45,
      totalBets: 15
    }
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    intersectionObserverCallback = null;
  
    const mockCallableFn = jest.fn().mockResolvedValue({
      data: {
        users: mockUsers,
        hasMore: true
      }
    });
  
    (require('firebase/functions').httpsCallable as jest.Mock).mockReturnValue(mockCallableFn);
  });

  it('renders loading state initially', async () => {
    // Mock a delayed response to ensure loading state is visible
    const mockHttpsCallable = jest.fn().mockReturnValue(
      jest.fn().mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)))
    );
    (require('firebase/functions').httpsCallable as jest.Mock).mockImplementation(mockHttpsCallable);
    
    await act(async () => {
      render(<LeaderboardPage />);
    });

    expect(screen.getByText('Top Performers')).toBeInTheDocument();
    // Check for loading skeleton
    const skeletonElements = screen.getAllByRole('generic').filter(
      element => element.className.includes('animate-pulse')
    );
    expect(skeletonElements.length).toBeGreaterThan(0);
    expect(screen.queryByText('user1')).not.toBeInTheDocument();
  });

  it('displays user data after loading', async () => {
    await act(async () => {
      render(<LeaderboardPage />);
    });

    await waitFor(() => {
      expect(screen.getByText('user1')).toBeInTheDocument();
      expect(screen.getByText('user2')).toBeInTheDocument();
    });

    // Check if PnL values are displayed correctly
    expect(screen.getByText('$100.50')).toBeInTheDocument();
    
    // For negative values, we need to use a more flexible approach
    const negativePnLElement = screen.getByText((content, element) => {
      return element?.textContent === '$-50.25';
    });
    expect(negativePnLElement).toBeInTheDocument();
  });

  it('displays user statistics correctly', async () => {
    await act(async () => {
      render(<LeaderboardPage />);
    });

    await waitFor(() => {
      // Check for bet counts
      expect(screen.getByText('20 bets')).toBeInTheDocument();
      expect(screen.getByText('15 bets')).toBeInTheDocument();
      
      // Check for win rates
      expect(screen.getByText('65.0% win rate')).toBeInTheDocument();
      expect(screen.getByText('45.0% win rate')).toBeInTheDocument();
    });
  });

  it('handles error state', async () => {
    // Mock an error response
    const mockCallableFn = jest.fn().mockRejectedValue(new Error('Failed to fetch'));
    (require('firebase/functions').httpsCallable as jest.Mock).mockReturnValue(mockCallableFn);

    jest.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      render(<LeaderboardPage />);
    });

    // Wait for error state
    await waitFor(() => {
      expect(screen.getByText('Top Performers')).toBeInTheDocument();
      expect(screen.queryByText('user1')).not.toBeInTheDocument();
    });

    // Restore console.error
    jest.restoreAllMocks();
  });

  it('applies correct styling based on PnL values', async () => {
    await act(async () => {
      render(<LeaderboardPage />);
    });

    await waitFor(() => {
      // Positive PnL should have green styling
      const positivePnL = screen.getByText('$100.50');
      expect(positivePnL).toHaveClass('text-green-600');

      // Negative PnL should have red styling
      const negativePnL = screen.getByText((content, element) => {
        return element?.textContent === '$-50.25';
      });
      expect(negativePnL).toHaveClass('text-red-600');
    });
  });
}); 