import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

//Mocks
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

// Stub authenticated user
import { useAuth } from '@/contexts/AuthContext';
(useAuth as jest.Mock).mockReturnValue({ user: { uid: 'u1' } });

import ForYou from './page';
import * as firestore from 'firebase/firestore';

describe('ForYou Feed', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeletons initially', async () => {
    // Keep getDocs pending to maintain loading state
    (firestore.getDocs as jest.Mock).mockReturnValue(new Promise(() => {}));

    await act(async () => {
      render(<ForYou />);
    });

    // Page title should render
    expect(screen.getByText('For You')).toBeInTheDocument();

    // Skeleton divs should be visible
    const skeletons = screen
      .getAllByRole('generic')
      .filter(el => el.className.includes('animate-pulse'));
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('displays posts after loading', async () => {
    // Mock Firestore snapshot that returns one post
    (firestore.getDocs as jest.Mock).mockResolvedValue({
      forEach: (cb: Function) =>
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
        })
    });

    // getDoc is not used but stub it anyway
    (firestore.getDoc as jest.Mock).mockResolvedValue({});

    await act(async () => {
      render(<ForYou />);
    });

    await waitFor(() => {
      expect(screen.getByText('Mock Post: post1')).toBeInTheDocument();
    });
  });

  it('shows "No posts available yet" when there are no posts', async () => {
    // getDocs returns empty snapshot
    (firestore.getDocs as jest.Mock).mockResolvedValue({ forEach: () => {} });
    (firestore.getDoc as jest.Mock).mockResolvedValue({});

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
