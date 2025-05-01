import React from 'react';
import {
  render,
  screen,
  act,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import '@testing-library/jest-dom';

import TrendingPage from './page';

// Firestore helpers we touch
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  getDocs:    jest.fn(),
  query:      jest.fn(),
  where:      jest.fn(),
  orderBy:    jest.fn(),
  limit:      jest.fn(),
}));

// Firebase init (db)
jest.mock('@/lib/firebase', () => ({ db: {} }));

// Replace heavy child components with simple stubs
jest.mock('@/components/TeamLogo', () => ({
  __esModule: true,
  default: ({ abbreviation }: { abbreviation: string }) => (
    <div data-testid="team-logo">{abbreviation}</div>
  ),
}));
jest.mock('@/components/GameInfoModal', () => ({
  __esModule: true,
  default: () => <div data-testid="game-info-modal">Mock GameInfoModal</div>,
}));
jest.mock('@/components/BettingModal', () => ({
  __esModule: true,
  default: () => <div data-testid="betting-modal">Mock BettingModal</div>,
}));

// next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (p: any) => <img {...p} />,
}));

import {
  getDocs,
} from 'firebase/firestore';

// Shared mock data
const mockEvents = [
  {
    id: 'e1',
    status: '2025-05-10T18:00:00Z',
    trades: ['t1', 't2', 't3'],
    home_team: { abbreviation: 'HT', full_name: 'Home Team' },
    visitor_team: { abbreviation: 'VT', full_name: 'Visitor Team' },
    homeTeamCurrentOdds: 45,
    visitorTeamCurrentOdds: 55,
  },
  {
    id: 'e2',
    status: '2025-05-11T18:00:00Z',
    trades: [],
    home_team: { abbreviation: 'A', full_name: 'Alpha' },
    visitor_team: { abbreviation: 'B', full_name: 'Beta' },
    homeTeamCurrentOdds: 60,
    visitorTeamCurrentOdds: 40,
  },
];

//Tests
describe('TrendingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeletons initially', async () => {
    // keep getDocs pending
    (getDocs as jest.Mock).mockReturnValue(new Promise(() => {}));

    await act(async () => render(<TrendingPage />));

    // heading should be visible
    expect(
      screen.getByRole('heading', { name: /Trending Events/i }),
    ).toBeInTheDocument();

    // skeleton divs: five gray boxes with animate-pulse class
    const skeletons = screen
      .getAllByRole('generic')
      .filter((el) => el.className.includes('animate-pulse'));
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('displays trending events after loading', async () => {
    (getDocs as jest.Mock).mockResolvedValue({
      empty: false,
      docs: mockEvents.map((e) => ({
        id: e.id,
        data: () => e,
      })),
    });

    await act(async () => render(<TrendingPage />));

    // wait for event names to appear
    await waitFor(() => {
      expect(screen.getByText('Home Team')).toBeInTheDocument();
      expect(screen.getByText('Visitor Team')).toBeInTheDocument();
    });

    // click the first card → modal shows
    const firstCard = screen.getByText('Home Team').closest('div');
    fireEvent.click(firstCard!);

    expect(screen.getByTestId('game-info-modal')).toBeInTheDocument();
  });

  it('shows "No trending events available" when there are none', async () => {
    (getDocs as jest.Mock).mockResolvedValue({ empty: true, docs: [] });

    await act(async () => render(<TrendingPage />));

    await waitFor(() => {
      expect(
        screen.getByText(/No trending events available/i),
      ).toBeInTheDocument();
    });
  });
});
