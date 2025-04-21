import { Timestamp } from 'firebase/firestore';
import type { Event } from './events';

export interface Trade {
  id: string;
  amount: number;
  expectedPayout: number;
  createdAt: Timestamp;
  eventId: string;
  selectedTeam: 'home' | 'visitor' | 'draw';
  status: string;
  userId: string;
  event?: Event;
  currentValue?: number | null;
  soldValue?: number; // Added field for storing the sold value
}
