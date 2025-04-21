import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import ProfilePage from './page';
import { useAuth } from '@/contexts/AuthContext';
import { getDoc, getDocs } from 'firebase/firestore';
import '@testing-library/jest-dom';
import React from 'react';

// Mock the necessary dependencies
jest.mock('@/contexts/AuthContext');
jest.mock('firebase/firestore', () => {
  const original = jest.requireActual('firebase/firestore');
  return {

    getDoc:      jest.fn(),
    getDocs:     jest.fn(),
    query:       jest.fn(),
    where:       jest.fn(),
    orderBy:     jest.fn(),
    limit:       jest.fn(),
    collection:  jest.fn(),
    doc:         jest.fn((db, col, id) => ({ path: `${col}/${id}` })),
    onSnapshot: jest.fn((docRef, callback) => {

      return () => {};
    }),
  };
});
jest.mock('@/lib/firebase', () => ({
  db: {},
  functions: {}
}));

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />
}));

// Mock PostItem component
jest.mock('@/components/PostItem', () => ({
  __esModule: true,
  default: ({ post }: { post: any }) => (
    <div data-testid="post-item">
      Mock Post: {post.content}
    </div>
  )
}));

// Mock react-markdown and other ESM modules
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>
}));

jest.mock('remark-gfm', () => ({
  __esModule: true,
  default: () => null
}));

// Mock components that use ESM modules
jest.mock('@/components/GameInfoModal', () => ({
  __esModule: true,
  default: () => <div data-testid="game-info-modal">Mock Game Info Modal</div>
}));

jest.mock('@/components/BettingModal', () => ({
  __esModule: true,
  default: () => <div data-testid="betting-modal">Mock Betting Modal</div>
}));

jest.mock('@/components/OddsHistoryChart', () => ({
  __esModule: true,
  default: () => <div data-testid="odds-history-chart">Mock Odds History Chart</div>
}));

// Mock data
const mockUser = {
  uid: '123',
  displayName: 'Test User',
  email: 'test@example.com',
  photoURL: 'https://example.com/photo.jpg'
};

const mockUserData = {
  trades: ['trade1', 'trade2'],
  walletBalance: 1000,
  lifetimePnl: 500
};

const mockTrade = {
  id: 'trade1',
  amount: 100,
  expectedPayout: 200,
  createdAt: { toDate: () => new Date() },
  eventId: 'event1',
  selectedTeam: 'home',
  status: 'Won',
  userId: '123',
  event: {
    id: 'event1',
    home_team: { abbreviation: 'LAL', full_name: 'Los Angeles Lakers' },
    visitor_team: { abbreviation: 'GSW', full_name: 'Golden State Warriors' },
    date: '2024-04-15',
    time: '19:30',
    datetime: '2024-04-15T19:30:00'
  }
};

const mockPosts = [
  {
    id: 'post1',
    content: 'Test post content',
    createdAt: { toDate: () => new Date() },
    userId: '123',
    username: 'testuser',
    userPhotoURL: 'https://example.com/photo.jpg',
    taggedEvents: []
  }
];

beforeAll(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true });
});

afterAll(() => {
  (global.fetch as jest.Mock)?.mockClear?.();
  delete (globalThis as any).fetch;
});

describe('ProfilePage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAuth as jest.Mock).mockReturnValue({
      user: mockUser,
      username: 'testuser'
    });

    // Mock Firestore getDoc
    (getDoc as jest.Mock).mockImplementation((docRef) => {
      if (docRef.path === 'users/123') {
        return Promise.resolve({
          exists: () => true,
          data: () => mockUserData
        });
      }
    
      if (docRef.path === 'trades/trade1') {
        return Promise.resolve({
          exists: () => true,
          data: () => mockTrade
        });
      }
    
      if (docRef.path === 'events/event1') {
        return Promise.resolve({
          exists: () => true,
          data: () => mockTrade.event
        });
      }
    
      return Promise.resolve({
        exists: () => false,
        data: () => null
      });
    });
    

    // Mock Firestore getDocs for trades
    (getDocs as jest.Mock).mockImplementation((query) => {
      // Create a mock query object with toString method
      const mockQuery = {
        toString: () => 'mock-query',
        ...query
      };
      
      // Return different mock data based on the collection being queried
      if (mockQuery.toString().includes('posts')) {
        return Promise.resolve({
          docs: mockPosts.map(post => ({
            id: post.id,
            data: () => post,
            exists: () => true
          })),
          forEach: (callback: (doc: any) => void) => {
            mockPosts.forEach(post => {
              callback({
                id: post.id,
                data: () => post,
                exists: () => true
              });
            });
          }
        });
      }
      
      // For trades collection
      return Promise.resolve({
        docs: [{
          id: 'trade1',
          exists: () => true,
          data: () => mockTrade
        }],
        forEach: (callback: (doc: any) => void) => {
          callback({
            id: 'trade1',
            exists: () => true,
            data: () => mockTrade
          });
        }
      });
    });
  });

  test('renders profile page with user information', async () => {
    await act(async () => {
      render(<ProfilePage />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('@testuser')).toBeInTheDocument();
    });
  });

  test('displays wallet balance correctly', async () => {
    await act(async () => {
      render(<ProfilePage />);
    });
    
    await waitFor(() => {
      expect(screen.getByText('$1,000.00')).toBeInTheDocument();
    });
  });

  test('shows add funds modal when button is clicked', async () => {
    await act(async () => {
      render(<ProfilePage />);
    });
    
    await waitFor(async () => {
      const addFundsButton = await screen.findByText('Add Funds');
      fireEvent.click(addFundsButton);
      expect(screen.getByText('Add Funds to Wallet')).toBeInTheDocument();
    });
  });

  test('switches between posts and trades tabs', async () => {
    await act(async () => {
      render(<ProfilePage />);
    });
    
    await waitFor(async () => {
      // Should start with Posts tab active
      const postsTab = screen.getByRole('button', { name: 'Posts' });
      expect(postsTab).toHaveClass('border-blue-500');
      
      // Click on Trades tab
      const tradesTab = screen.getByRole('button', { name: 'Trade History' });
      fireEvent.click(tradesTab);
      expect(tradesTab).toHaveClass('border-blue-500');
    });
  });

  test('shows sign in message when user is not authenticated', async () => {
    (useAuth as jest.Mock).mockReturnValue({
      user: null,
      username: null
    });

    render(<ProfilePage />);
    
    expect(screen.getByText('Please sign in to view your profile and trade history.')).toBeInTheDocument();
  });
}); 