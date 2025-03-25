import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { BalldontlieAPI } from "@balldontlie/sdk";
import OpenAI from "openai";
import * as dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

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
            // Add default odds fields
            homeTeamCurrentOdds: 50,
            visitorTeamCurrentOdds: 50,
            // Add timestamps if desired
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // Create the oddsHistory subcollection with initial odds
        const oddsHistoryRef = docRef.collection("oddsHistory").doc();
        batch.set(oddsHistoryRef, {
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          homeTeamOdds: 50,
          visitorTeamOdds: 50
        });
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
            // Preserve current odds values by not overwriting them (using merge: true)
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
  if (selectedTeam !== "home" && selectedTeam !== "visitor") {
    throw new HttpsError("invalid-argument", "Selected team must be either 'home' or 'visitor'.");
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

    // Get the event document to retrieve the current odds
    const eventRef = db.collection("events").doc(eventId);
    const eventDoc = await transaction.get(eventRef);
    
    if (!eventDoc.exists) {
      throw new HttpsError("not-found", "Event not found.");
    }
    
    const eventData = eventDoc.data()!;
    
    // Get the appropriate odds based on the selected team
    const selectedOdds = selectedTeam === "home" 
      ? eventData.homeTeamCurrentOdds 
      : eventData.visitorTeamCurrentOdds;
    
    // Calculate expected payout based on odds
    // For simplicity, we use a linear payout model: higher odds = higher payout
    // In a real betting system, you'd use more complex calculations
    const oddsMultiplier = 2 * (selectedOdds / 50); // Normalize to 2x at 50% odds
    const expectedPayout = betAmount * oddsMultiplier;

    // Create the trade document.
    const tradeRef = db.collection("trades").doc();
    transaction.set(tradeRef, {
      userId: uid,
      eventId,
      amount: betAmount,
      expectedPayout: expectedPayout,
      selectedTeam,
      selectedOdds: selectedOdds, // Save the odds at the time of bet
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      status: "Pending"
    });

    // Deduct the bet amount from the user's balance and add the trade ID.
    transaction.update(userRef, {
      walletBalance: walletBalance - betAmount,
      trades: admin.firestore.FieldValue.arrayUnion(tradeRef.id)
    });

    // Update the event document with the new trade ID.
    transaction.update(eventRef, {
      trades: admin.firestore.FieldValue.arrayUnion(tradeRef.id)
    });

    return { 
      tradeId: tradeRef.id,
      expectedPayout: expectedPayout,
      selectedOdds: selectedOdds
    };
  });
});

export const getLatestActivity = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  async (request) => {
    // Ensure the user is authenticated.
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    // Destructure pagination parameters from request.data.
    const { pageSize, lastCreatedAt } = request.data;
    const effectivePageSize =
      typeof pageSize === "number" && pageSize > 0 ? pageSize : 15;

    // Create a query for the trades collection ordered by createdAt descending.
    let tradesQuery = admin
      .firestore()
      .collection("trades")
      .orderBy("createdAt", "desc")
      .limit(effectivePageSize);

    // If a lastCreatedAt cursor is provided, start after that timestamp.
    if (lastCreatedAt) {
      // Assumes lastCreatedAt is a millisecond timestamp.
      const lastTimestamp = admin.firestore.Timestamp.fromMillis(lastCreatedAt);
      tradesQuery = tradesQuery.startAfter(lastTimestamp);
    }

    try {
      const tradesSnapshot = await tradesQuery.get();

      // Process each trade document.
      const trades = await Promise.all(
        tradesSnapshot.docs.map(async (doc) => {
          const tradeData = doc.data();

          // Fetch user data if needed
          let userData = null;
          if (tradeData.userId) {
            const userDoc = await admin.firestore().collection("users").doc(tradeData.userId).get();
            userData = userDoc.exists ? { 
              displayName: userDoc.data()?.displayName || "Anonymous User" 
            } : null;
          }
          
          // Remove the sensitive userId field from the trade data
          delete tradeData.userId;

          // Fetch associated event details.
          let eventData = null;
          if (tradeData.eventId) {
            const eventDoc = await admin.firestore().collection("events").doc(tradeData.eventId).get();
            eventData = eventDoc.exists ? eventDoc.data() : null;
          }

          return {
            id: doc.id,
            ...tradeData,
            event: eventData,
            user: userData
          };
        })
      );

      return { trades };
    } catch (error) {
      console.error("Error fetching latest activity:", error);
      throw new HttpsError("internal", "Error fetching latest activity");
    }
  }
);

// This is using a web search-enabled OpenAI model to analyze NBA games for betting purposes
export const getGameBettingAnalysis = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  async (request) => {
    // Ensure the user is authenticated
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    // Get the input parameters
    const { homeTeam, awayTeam, gameDate } = request.data;

    // Validate required input
    if (!homeTeam || !awayTeam || !gameDate) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required fields: homeTeam, awayTeam, and gameDate are required."
      );
    }

    try {
      // Initialize OpenAI client with API key
      // Note: In production, you should store this key in Firebase environment secrets
      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Call OpenAI with web search enabled
      const response = await openai.responses.create({
        model: "gpt-4o",
        tools: [
          { 
            type: "web_search_preview",
            search_context_size: "high" // Use high quality search for better analysis
          }
        ],
        input: `Provide a detailed sports betting analysis for the NBA game between ${homeTeam} and ${awayTeam} scheduled for ${gameDate}. 
                Include the following:
                1. Recent team performance and trends
                2. Key player stats and any injury updates
                3. Head-to-head history between these teams
                4. Current betting odds (spread, over/under, moneyline)
                5. Expert opinions and predictions
                6. Relevant statistical trends that might impact betting decisions
                
                Format this information in a clear, organized manner for someone making a betting decision.
                Include citations to your sources.`,
        tool_choice: { type: "web_search_preview" }, // Force web search for consistent results
        temperature: 0.2, // Lower temperature for more factual responses
      });

      // Get the analysis text from the response
      const analysisText = response.output_text || '';
      
      // Log the completion for debugging
      console.log(`Completed search request for ${homeTeam} vs ${awayTeam} game analysis`);

      // For typescript, we need to handle the response structure properly
      // Let's extract any citations if available
      let citations: Array<{text: string, url: string, title: string}> = [];
      
      try {
        // Access annotations if available in the right format
        // This structure depends on the OpenAI API version, may need adjustments
        const messageItem = response.output.find(item => item.type === 'message');
        if (messageItem && 'content' in messageItem) {
          const content = messageItem.content;
          if (Array.isArray(content) && content.length > 0 && 'annotations' in content[0]) {
            const annotations = content[0].annotations;
            if (Array.isArray(annotations)) {
              citations = annotations
                .filter(anno => anno.type === 'url_citation')
                .map(anno => {
                  // Type assertion to handle the TypeScript error
                  const urlCitation = anno as { 
                    type: string; 
                    text?: string;
                    start_index?: number; 
                    end_index?: number; 
                    url?: string; 
                    title?: string 
                  };
                  
                  // Safely access properties with optional chaining
                  return {
                    text: urlCitation.start_index !== undefined && urlCitation.end_index !== undefined 
                          ? analysisText.substring(urlCitation.start_index, urlCitation.end_index)
                          : 'Citation',
                    url: urlCitation.url || '#',
                    title: urlCitation.title || 'Source'
                  };
                });
            }
          }
        }
      } catch (e) {
        console.warn('Failed to extract citations:', e);
        // Continue with the analysis even if citation extraction fails
      }

      // Return the analysis results with citations if available
      return {
        analysis: analysisText,
        citations: citations,
        metadata: {
          homeTeam,
          awayTeam,
          gameDate,
          generatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }
      };
    } catch (error) {
      console.error("Error generating betting analysis:", error);
      throw new HttpsError(
        "internal",
        "Failed to generate betting analysis. Please try again later."
      );
    }
  }
);