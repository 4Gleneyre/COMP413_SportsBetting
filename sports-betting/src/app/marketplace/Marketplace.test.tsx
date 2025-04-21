/**
 * @jest-environment jsdom
 */
import React from 'react';
import { render, screen, act, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock next/image
jest.mock('next/image', () => ({
  __esModule: true,
  default: (props: any) => <img {...props} />
}));

// Mock Firebase modules

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc:         jest.fn((db, col, id) => ({ path: `${col}/${id}`, id })),
  onSnapshot: jest.fn(),
  query:      jest.fn(),
  getDoc:     jest.fn(),
}));

jest.mock('@/lib/firebase', () => ({
  db: {}
}));

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(),
}));

jest.mock('firebase/functions', () => ({
  getFunctions: jest.fn(),
  httpsCallable: jest.fn(),
}));

// Mock components
jest.mock('@/components/GameInfoModal', () => ({
  __esModule: true,
  default: () => <div data-testid="game-info-modal">Mock GameInfoModal</div>
}));

jest.mock('@/components/BettingModal', () => ({
  __esModule: true,
  default: () => <div data-testid="betting-modal">Mock BettingModal</div>
}));

// Imports under test
import MarketplacePage from './page';
import { getAuth } from 'firebase/auth';
import { collection, doc, onSnapshot, query, getDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Helpers & shared mocks
const fakeUser = { uid: 'u1' };
const noopUnsub = jest.fn();

// Stub getAuth().onAuthStateChanged
;(getAuth as jest.Mock).mockReturnValue({
  currentUser: fakeUser,
  onAuthStateChanged: (cb: (u: any) => void) => {
    // Immediately invoke with our fake user
    cb(fakeUser);
    return noopUnsub;
  },
});

// Stub httpsCallable to a no-op resolved fn
const mockSellFn = jest.fn().mockResolvedValue({ data: {} });
const mockBuyFn  = jest.fn().mockResolvedValue({ data: {} });
;(httpsCallable as jest.Mock)
  .mockImplementation((fn, name) =>
    name === 'sellBet' ? mockSellFn
    : name === 'buyBet'  ? mockBuyFn
    : jest.fn().mockResolvedValue({ data: {} })
  );


// Stub getDoc for pending bets
(getDoc as jest.Mock).mockImplementation((docRef) => {
    if (docRef.path === 'users/u1') {
      return Promise.resolve({
        exists: () => true,
        data:   () => ({ trades: ['b1'] }),
      });
    }
    if (docRef.path === 'trades/b1') {
      return Promise.resolve({
        id:     'b1',          
        exists: () => true,
        data:   () => ({
          eventId:           'e1',
          eventName:         'Event One',
          selectedTeam:      'home',
          amount:            50,
          currentStakeValue: 60,
          forSale:           false,
          salePrice:         undefined,
          userId:            'u1',
          status:            'Pending',
        }),
      });
    }
  return Promise.resolve({ exists: () => false });
});

describe('<MarketplacePage />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (onSnapshot as jest.Mock).mockReset();
  });

  it("shows fallback when no pending or for-sale bets", async () => {
    // 1) stub getDoc for user → no trades
    (getDoc as jest.Mock).mockResolvedValueOnce({
      exists: () => true,
      data:   () => ({ trades: [] })
    });
  
    (onSnapshot as jest.Mock)
      .mockImplementationOnce((q, cb) => { cb({ docs: [] }); return () => {}; }) // events
      .mockImplementationOnce((q, cb) => { cb({ docs: [] }); return () => {}; }); // forSale
  
    render(<MarketplacePage />);
    
    expect(
      await screen.findByText("You have no held pending bets to sell.")
    ).toBeInTheDocument();
  
    // Buy side fallback
    expect(
      await screen.findByText("No betting positions for sale at the moment.")
    ).toBeInTheDocument();
  });

  it("renders pending bets and allows sell", async () => {
    // stub getDoc: first call → user has [ 'b1' ], second call → trade b1
    (getDoc as jest.Mock)
      .mockResolvedValueOnce({
        exists: () => true,
        data:   () => ({ trades: ["b1"] })
      })
      .mockResolvedValueOnce({
        id:     "b1",
        exists: () => true,
        data:   () => ({
          eventId:           "e1",
          eventName:         "Event One",
          selectedTeam:      "home",
          amount:            50,
          currentStakeValue: 60,
          forSale:           false,
          userId:            "u1",
          status:            "Pending",
        }),
      });
  
    // stub both snapshots → no docs (we don’t care about events or forSale here)
    (onSnapshot as jest.Mock)
      .mockImplementationOnce((q, cb) => { cb({ docs: [] }); return () => {}; })
      .mockImplementationOnce((q, cb) => { cb({ docs: [] }); return () => {}; });
  
    render(<MarketplacePage />);
  
    // Pending bet should show
    expect(await screen.findByText(/\$ *50\.00/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sell" })).toBeInTheDocument();
  
    // Click Sell
    fireEvent.click(screen.getByRole("button", { name: "Sell" }));
    await waitFor(() => {
      expect(mockSellFn).toHaveBeenCalledWith({
        betId:     "b1",
        salePrice: 60,
      });
    });
  });
});
