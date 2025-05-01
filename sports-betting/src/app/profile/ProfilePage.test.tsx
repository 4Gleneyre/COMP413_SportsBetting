import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import '@testing-library/jest-dom';
import { httpsCallable } from 'firebase/functions';
import ProfilePage from './page';
import { useAuth } from '@/contexts/AuthContext';
import {
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  collection,
} from 'firebase/firestore';


// General mocks
jest.mock('next/navigation', () => ({
    useSearchParams: jest.fn(() => 
      new URLSearchParams('userId=123&username=testuser')
    ),
    usePathname: jest.fn(() => '/profile/123'),
  }));

// Auth
jest.mock('@/contexts/AuthContext');

// Firestore helpers we touch
jest.mock('firebase/firestore', () => ({
  getDoc:      jest.fn(),
  getDocs:     jest.fn(),
  query:       jest.fn(),
  where:       jest.fn(),
  orderBy:     jest.fn(),
  limit:       jest.fn(),
  collection:  jest.fn(),
  doc:         jest.fn((db, col, id) => ({ path: `${col}/${id}` })),
}));

// Firebase functions
jest.mock('firebase/functions', () => ({
  httpsCallable: jest.fn()
}));

// Firebase init
jest.mock('@/lib/firebase', () => ({ db: {}, functions: {} }));

// next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />,
}));

// Shallow stubs for child components
jest.mock('@/components/PostItem', () => ({
  __esModule: true,
  default: ({ post }: { post: any }) => (
    <div data-testid="post-item">Mock Post: {post.content}</div>
  ),
}));
jest.mock('@/components/GameInfoModal', () => ({
  __esModule: true,
  default: () => <div data-testid="game-info-modal" />,
}));
jest.mock('@/components/BettingModal', () => ({
  __esModule: true,
  default: () => <div data-testid="betting-modal" />,
}));
jest.mock('@/components/OddsHistoryChart', () => ({
  __esModule: true,
  default: () => <div data-testid="odds-history-chart" />,
}));


// Mock data
const mockUser = {
  uid: '123',
  displayName: 'Test User',
  email: 'test@example.com',
  photoURL: 'https://example.com/photo.jpg',
};

const mockUserDoc = {
  trades: ['trade1'],
  walletBalance: 1000,
  lifetimePnl: 500,
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
    datetime: '2025-04-15T19:30:00',
  },
};

const mockPosts = [
  {
    id: 'post1',
    content: 'Sample post content',
    createdAt: { toDate: () => new Date() },
    userId: '123',
    username: 'testuser',
    userPhotoURL: 'https://example.com/photo.jpg',
    taggedEvents: [],
  },
];

//Shared Firestore mocks                              *

beforeEach(() => {
  jest.clearAllMocks();

  // Auth hook
  (useAuth as jest.Mock).mockReturnValue({
    user: mockUser,
    username: 'testuser',
  });


(httpsCallable as jest.Mock).mockImplementation(() => () =>
  Promise.resolve({
    data: {
      photoURL: null,
      username: 'testuser',
      trades: [mockTrade],  // ensures Trades tab renders
      private: false,
    },
  }),
);

  // getDoc: users / trades / events
  (getDoc as jest.Mock).mockImplementation(({ path }) => {
    if (path === 'users/123') {
      return Promise.resolve({
        exists: () => true,
        data: () => mockUserDoc,
      });
    }
    if (path === 'trades/trade1') {
      return Promise.resolve({
        exists: () => true,
        data: () => mockTrade,
      });
    }
    if (path === 'events/event1') {
      return Promise.resolve({
        exists: () => true,
        data: () => mockTrade.event,
      });
    }
    return Promise.resolve({ exists: () => false });
  });

  // getDocs: posts (any other collection → trades)
  (getDocs as jest.Mock).mockImplementation((q) => {
    const str = String(q);
    if (str.includes('posts')) {
      return Promise.resolve({
        docs: mockPosts.map((p) => ({
          id: p.id,
          data: () => p,
          exists: () => true,
        })),
        forEach: (cb: Function) =>
          mockPosts.forEach((p) =>
            cb({ id: p.id, data: () => p, exists: () => true }),
          ),
      });
    }
    // trades collection
    return Promise.resolve({
      docs: [
        {
          id: 'trade1',
          exists: () => true,
          data: () => mockTrade,
        },
      ],
      forEach: (cb: Function) =>
        cb({ id: 'trade1', exists: () => true, data: () => mockTrade }),
    });
  });

  (query as jest.Mock).mockImplementation(() => ({}));
  (where as jest.Mock).mockImplementation(() => ({}));
  (orderBy as jest.Mock).mockImplementation(() => ({}));
  (collection as jest.Mock).mockImplementation(() => ({}));
});

 //Tests                                              *
describe('ProfilePage', () => {
  test('renders profile page with user information', async () => {
    await act(async () => render(<ProfilePage />));

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('@testuser')).toBeInTheDocument();
    });
  });

  test('displays wallet balance', async () => {
    await act(async () => render(<ProfilePage />));

    await waitFor(() => {
      expect(screen.getByText('$1,000.00')).toBeInTheDocument();
    });
  });

  test('opens “Add Funds” modal when button clicked', async () => {
    await act(async () => render(<ProfilePage />));

    // Button is rendered after wallet loads
    const addFundsBtn = await screen.findByText('Add Funds');
    fireEvent.click(addFundsBtn);

    expect(
      screen.getByRole('heading', { name: 'Add Funds to Wallet' }),
    ).toBeInTheDocument();
  });

  test('switches between Posts and Trades tabs', async () => {
    await act(async () => render(<ProfilePage />));

    // Posts tab is active first
    const postsTab = screen.getByRole('button', { name: 'Posts' });
    expect(postsTab).toHaveClass('border-blue-500');

    // Click Trades tab
    const tradesTab = screen.getByRole('button', { name: 'Trades' });
    fireEvent.click(tradesTab);
    expect(tradesTab).toHaveClass('border-blue-500');
  });

  test('shows sign-in prompt when unauthenticated', async () => {
    // Override auth for this test
    (useAuth as jest.Mock).mockReturnValue({ user: null, username: null });
    const { useSearchParams } = require('next/navigation');
    (useSearchParams as jest.Mock).mockReturnValue(new URLSearchParams(''));
    render(<ProfilePage />);

    expect(
      screen.getByText(/Please sign in to view your profile/i),
    ).toBeInTheDocument();
  });
});
