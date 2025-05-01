import React from 'react';
import {
  render,
  screen,
  act,
  waitFor,
  fireEvent,
} from '@testing-library/react';
import '@testing-library/jest-dom';

import Events from './page';

// Mocks

// utils that power the component
jest.mock('@/utils/eventFetching', () => ({
  fetchEvents:      jest.fn(),
  fetchEventById:   jest.fn(),
  formatEventDate:  jest.fn((s: string) => s), // identity for tests
}));

// Firestore 
jest.mock('firebase/firestore', () => ({}));

// Firebase init
jest.mock('@/lib/firebase', () => ({ db: {} }));

// Auth
jest.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: null }),
}));

// next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (p: any) => <img {...p} />,
}));

// Heavy child components
jest.mock('@/components/TeamLogo', () => ({
  __esModule: true,
  default: ({ abbreviation }: { abbreviation: string }) => (
    <div data-testid="team-logo">{abbreviation}</div>
  ),
}));
jest.mock('@/components/DateRangePicker', () => ({
  __esModule: true,
  default: () => <div data-testid="date-range-picker" />,
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

// react-markdown + remark-gfm (ESM)
jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
}));
jest.mock('remark-gfm', () => ({ __esModule: true, default: () => null }));

// IntersectionObserver (jsdom doesn’t implement it)
beforeAll(() => {
  class IOStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // @ts-ignore
  window.IntersectionObserver = IOStub;
});

// Shared mock data

const mockEvents = [
  {
    id: 'e1',
    sport: 'basketball',
    status: '2025-05-04T18:00:00Z',
    trades: ['t1'],
    home_team:    { abbreviation: 'HT', full_name: 'Home Team' },
    visitor_team: { abbreviation: 'VT', full_name: 'Visitor Team' },
    homeTeamCurrentOdds: 40,
    visitorTeamCurrentOdds: 60,
  },
  {
    id: 'e2',
    sport: 'soccer',
    date: '2025-05-05',
    datetime: '2025-05-05T20:00:00Z',
    trades: [],
    home_team:    { abbreviation: 'AAA', full_name: 'Alpha' },
    visitor_team: { abbreviation: 'BBB', full_name: 'Beta' },
    homeTeamCurrentOdds: 55,
    visitorTeamCurrentOdds: 45,
  },
];

// Tests
const { fetchEvents } = jest.requireMock('@/utils/eventFetching');

describe('Events page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading skeletons initially', async () => {
    // keep fetchEvents pending so loading state persists
    (fetchEvents as jest.Mock).mockReturnValue(new Promise(() => {}));

    await act(async () => render(<Events />));

    // skeletons are generic divs with animate-pulse
    const skeletons = screen
      .getAllByRole('generic')
      .filter((el) => el.className.includes('animate-pulse'));
    expect(skeletons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders events once data is loaded', async () => {
    (fetchEvents as jest.Mock).mockResolvedValue({
      events:  mockEvents,
      lastDoc: null,
      hasMore: false,
    });
  
    await act(async () => render(<Events />));
  
    await waitFor(() => {
      expect(screen.getAllByText('Home Team').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Visitor Team').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Alpha').length).toBeGreaterThan(0);
    });
  
    const firstCard = screen.getAllByText('Home Team')[0].closest('div')!;
    fireEvent.click(firstCard);
  
    expect(screen.getByTestId('game-info-modal')).toBeInTheDocument();
  });
  

  it('shows empty state when fetch returns no events', async () => {
    (fetchEvents as jest.Mock).mockResolvedValue({
      events:  [],
      lastDoc: null,
      hasMore: false,
    });

    await act(async () => render(<Events />));

    await waitFor(() => {
      expect(
        screen.getByText(/No upcoming events found/i),
      ).toBeInTheDocument();
    });
  });
});
