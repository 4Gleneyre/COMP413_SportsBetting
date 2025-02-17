import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { BalldontlieAPI } from "@balldontlie/sdk";
admin.initializeApp();
const db = admin.firestore();
const api = new BalldontlieAPI({ apiKey: "066f0ce8-a61a-4aee-82c0-e902d6ad3a0a" });

export const getFutureNbaGames = onSchedule("every 6 hours", async (event) => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 31);
    const endDateString = endDate.toISOString().split("T")[0];

    let allGames: any[] = [];
    let cursor: string | null = null;
    let hasMore = true;

    // Fetch all games with pagination
    while (hasMore) {
      const params: any = {
        start_date: today,
        end_date: endDateString,
        per_page: 100,
      };

      if (cursor) params.cursor = cursor;

      const response = await api.nba.getGames(params);
      allGames = [...allGames, ...response.data];
      hasMore = !!response.meta?.next_cursor;
      cursor = response.meta?.next_cursor?.toString() || null;
    }

    // Batch write to Firestore with chunking
    const batchSize = 500; // Firestore batch limit
    const batches = [];

    for (let i = 0; i < allGames.length; i += batchSize) {
      const batch = db.batch();
      const chunk = allGames.slice(i, i + batchSize);

      chunk.forEach((game) => {
        const docRef = db.collection("events").doc(game.id.toString());
        // Set with merge: true to update existing documents
        batch.set(
          docRef,
          {
            ...game,
            // Convert nested objects to Firestore-friendly format if needed
            home_team: { ...game.home_team },
            visitor_team: { ...game.visitor_team },
            // Add timestamps if desired
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      batches.push(batch.commit());
    }

    // Execute all batches
    await Promise.all(batches);

    console.log(`${allGames.length} games processed successfully`);
  } catch (error) {
    console.error("Error processing games:", error);
  }
});

export const updateRecentNbaGames = onSchedule("every 6 hours", async (event) => {
  try {
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 1); // Get games from 1 day ago
    const startDateString = startDate.toISOString().split("T")[0];
    const endDateString = today.toISOString().split("T")[0];

    let allGames: any[] = [];
    let cursor: string | null = null;
    let hasMore = true;

    // Fetch all recent games with pagination
    while (hasMore) {
      const params: any = {
        start_date: startDateString,
        end_date: endDateString,
        per_page: 100,
      };

      if (cursor) params.cursor = cursor;

      const response = await api.nba.getGames(params);
      allGames = [...allGames, ...response.data];
      hasMore = !!response.meta?.next_cursor;
      cursor = response.meta?.next_cursor?.toString() || null;
    }

    // Batch update Firestore event documents
    const batchSize = 500;
    const batches = [];

    for (let i = 0; i < allGames.length; i += batchSize) {
      const batch = db.batch();
      const chunk = allGames.slice(i, i + batchSize);

      chunk.forEach((game) => {
        const docRef = db.collection("events").doc(game.id.toString());
        batch.set(
          docRef,
          {
            ...game,
            home_team: { ...game.home_team },
            visitor_team: { ...game.visitor_team },
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      });

      batches.push(batch.commit());
    }

    await Promise.all(batches);
    console.log(`Updated ${allGames.length} recent games successfully`);

    // Process games that have now become Final
    // (We assume that if there are pending trades for an event, they have not been processed yet.)
    for (const game of allGames) {
      if (game.status === "Final") {
        // Query for pending trades associated with this event.
        const tradesSnapshot = await db
          .collection("trades")
          .where("eventId", "==", game.id.toString())
          .where("status", "==", "Pending")
          .get();

        if (tradesSnapshot.empty) continue;

        // Determine which team won.
        // (Assumes no ties; if needed you can adjust the logic for ties.)
        let winningTeam: "home" | "visitor" | null = null;
        if (game.home_team_score > game.visitor_team_score) {
          winningTeam = "home";
        } else if (game.visitor_team_score > game.home_team_score) {
          winningTeam = "visitor";
        }

        // Prepare a batch for updating trades and build an accumulator for winning payouts.
        const tradeBatch = db.batch();
        const userIncrements: { [userId: string]: number } = {};

        tradesSnapshot.docs.forEach((tradeDoc) => {
          const trade = tradeDoc.data();
          let newStatus = "Lost";
          if (winningTeam && trade.selectedTeam === winningTeam) {
            newStatus = "Won";
            // Accumulate the expected payout for the user.
            if (trade.userId) {
              userIncrements[trade.userId] =
                (userIncrements[trade.userId] || 0) + (trade.expectedPayout || 0);
            }
          }
          tradeBatch.update(tradeDoc.ref, { status: newStatus });
        });

        await tradeBatch.commit();

        // Now update each winning user's walletBalance using FieldValue.increment.
        // (This ensures that if a user wins multiple trades, the increments are summed.)
        const userBatch = db.batch();
        for (const [userId, incrementAmount] of Object.entries(userIncrements)) {
          const userRef = db.collection("users").doc(userId);
          userBatch.update(userRef, {
            walletBalance: admin.firestore.FieldValue.increment(incrementAmount),
          });
        }
        await userBatch.commit();
      }
    }
  } catch (error) {
    console.error("Error updating recent games:", error);
  }
});

export const placeBet = onCall({
  region: 'us-central1',
  maxInstances: 10,
}, async (request) => {
  // Ensure the user is authenticated.
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "User must be authenticated.");
  }
  
  const uid = request.auth.uid;
  const { eventId, betAmount, selectedTeam } = request.data;

  // Validate required input.
  if (!eventId || betAmount == null || !selectedTeam) {
    throw new HttpsError("invalid-argument", "Missing required fields.");
  }
  if (typeof betAmount !== "number" || betAmount <= 0) {
    throw new HttpsError("invalid-argument", "Bet amount must be a positive number.");
  }

  // Use a transaction for atomicity.
  const userRef = db.collection("users").doc(uid);
  return db.runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) {
      throw new HttpsError("not-found", "User document not found.");
    }
    const userData = userDoc.data();
    const walletBalance = userData?.walletBalance || 0;

    // Ensure the user has enough funds.
    if (betAmount > walletBalance) {
      throw new HttpsError("failed-precondition", "Insufficient balance.");
    }

    // Create the trade document.
    const tradeRef = db.collection("trades").doc();
    transaction.set(tradeRef, {
      userId: uid,
      eventId,
      amount: betAmount,
      expectedPayout: betAmount * 2,
      selectedTeam,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "Pending"
    });

    // Deduct the bet amount from the user's balance and add the trade ID.
    transaction.update(userRef, {
      walletBalance: walletBalance - betAmount,
      trades: admin.firestore.FieldValue.arrayUnion(tradeRef.id)
    });

    // Update the event document with the new trade ID.
    const eventRef = db.collection("events").doc(eventId);
    transaction.update(eventRef, {
      trades: admin.firestore.FieldValue.arrayUnion(tradeRef.id)
    });

    return { tradeId: tradeRef.id };
  });
});