import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';


jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />
}));

jest.mock('@/contexts/AuthContext', () => ({
  useAuth: jest.fn()
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  getDocs:    jest.fn(),
  query:      jest.fn(),
  where:      jest.fn(),
  orderBy:    jest.fn(),
  limit:      jest.fn(),
  doc:        jest.fn(),
  getDoc:     jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
  db: {}
}));

jest.mock('@/components/GameInfoModal', () => ({
  __esModule: true,
  default: () => <div data-testid="game-info-modal">Mock GameInfoModal</div>
}));

jest.mock('@/components/BettingModal', () => ({
  __esModule: true,
  default: () => <div data-testid="betting-modal">Mock BettingModal</div>
}));

jest.mock('@/components/PostItem', () => ({
  __esModule: true,
  default: ({ post }: { post: any }) => (
    <div data-testid="post-item">Mock Post: {post.content}</div>
  )
}));

// Provide a stubbed authenticated user
import { useAuth } from '@/contexts/AuthContext';
(useAuth as jest.Mock).mockReturnValue({ user: { uid: 'u1' } });

import ForYou from './page';
import * as firestore from 'firebase/firestore';


describe('ForYou Feed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeletons initially', async () => {
    // Keep both fetches pending so loading flags stay true
    (firestore.getDocs as jest.Mock).mockReturnValue(new Promise(() => {}));

    await act(async () => {
      render(<ForYou />);
    });

    // Trending Events header and Posts header should show up
    expect(screen.getByText('Trending Events 🔥')).toBeInTheDocument();
    expect(screen.getByText('Posts')).toBeInTheDocument();

    // There should be multiple ".animate-pulse" skeleton divs
    const skeletons = screen
      .getAllByRole('generic')
      .filter(el => el.className.includes('animate-pulse'));
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('displays trending events and posts after loading', async () => {
    const mockEvents = [
      {
        id: 'e1',
        status: '2025-04-21T00:00:00Z',
        trades: ['t1', 't2'],
        home_team:    { abbreviation: 'HT', full_name: 'Home Team' },
        visitor_team: { abbreviation: 'VT', full_name: 'Visitor Team' },
        homeTeamCurrentOdds: 30,
        visitorTeamCurrentOdds: 70,
      },
      {
        id: 'e2',
        status: '2025-04-22T00:00:00Z',
        trades: [],
        home_team:    { abbreviation: 'H2', full_name: 'Home2 Team' },
        visitor_team: { abbreviation: 'V2', full_name: 'Visitor2 Team' },
        homeTeamCurrentOdds: 50,
        visitorTeamCurrentOdds: 50,
      },
    ];

    let callCount = 0;
    (firestore.getDocs as jest.Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // first call → top events
        return Promise.resolve({
          empty: false,
          docs: mockEvents.map(e => ({ id: e.id, data: () => e })),
        });
      } else {
        // second call → posts
        return Promise.resolve({
          forEach: (cb: Function) => {
            cb({
              id: 'p1',
              data: () => ({
                content: 'post1',
                createdAt: { toDate: () => new Date() },
                updatedAt: null,
                userId: 'u1',
                username: 'user1',
                userPhotoURL: 'url',
                mediaUrl: undefined,
                mediaType: undefined,
                taggedEvents: []
              })
            });
          }
        });
      }
    });
    // stub getDoc so it never blocks
    (firestore.getDoc as jest.Mock).mockResolvedValue({ exists: () => false });

    await act(async () => {
      render(<ForYou />);
    });

    await waitFor(() => {
      expect(screen.getByText('Home Team')).toBeInTheDocument();
      expect(screen.getByText('Visitor Team')).toBeInTheDocument();
      expect(screen.getByText('Mock Post: post1')).toBeInTheDocument();
    });
  });

  it('shows "No trending events available" when there are none', async () => {
    // first getDocs → no events
    (firestore.getDocs as jest.Mock).mockResolvedValue({ empty: true, docs: [] });
    (firestore.getDocs as jest.Mock)
    .mockResolvedValueOnce({ empty: true, docs: [] })       // events
    .mockResolvedValueOnce({ forEach: (_cb: Function) => {} }); // posts

    await act(async () => {
      render(<ForYou />);
    });

    await waitFor(() => {
      expect(screen.getByText('No trending events available')).toBeInTheDocument();
    });
  });

  it('shows "No posts available yet" when there are no posts', async () => {
    let callCount = 0;
    (firestore.getDocs as jest.Mock).mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // events call → some events so "Trending Events" renders
        return Promise.resolve({ empty: false, docs: [] });
      }
      // posts call → no posts
      return Promise.resolve({ forEach: () => {} });
    });
    (firestore.getDoc as jest.Mock).mockResolvedValue({ exists: () => false });

    await act(async () => {
      render(<ForYou />);
    });

    await waitFor(() => {
      expect(
        screen.getByText('No posts available yet. Check back later!')
      ).toBeInTheDocument();
    });
  });
});
