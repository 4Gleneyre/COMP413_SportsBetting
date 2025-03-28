import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { BalldontlieAPI } from "@balldontlie/sdk";
import OpenAI from "openai";
import * as dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

// Load environment variables from .env file
dotenv.config();

admin.initializeApp();
const db = admin.firestore();
const api = new BalldontlieAPI({ apiKey: "066f0ce8-a61a-4aee-82c0-e902d6ad3a0a" });

// Initialize the Google Generative AI client
const geminiApiKey = process.env.GEMINI_API_KEY || "";
const genAI = new GoogleGenerativeAI(geminiApiKey);

/**
 * Gets AI-predicted odds for a basketball game using Gemini
 * @param homeTeam The home team data
 * @param visitorTeam The visitor team data
 * @returns Promise resolving to an object with home and visitor team winning percentages
 */
async function getPredictedOdds(homeTeam: any, visitorTeam: any) {
  try {
    // Default odds in case the AI call fails
    const defaultOdds = { homeTeamOdds: 50, visitorTeamOdds: 50 };
    
    if (!geminiApiKey) {
      console.warn("GEMINI_API_KEY not configured. Using default odds.");
      return defaultOdds;
    }
    
    const model = genAI.getGenerativeModel({
      model: "gemini-2.0-flash",
    });
    
    // Create a prompt with relevant team information
    const prompt = `Predict the probability of each team winning in the upcoming NBA game:
    
    Home Team: ${homeTeam.full_name} (${homeTeam.abbreviation})
    Away Team: ${visitorTeam.full_name} (${visitorTeam.abbreviation})
    
    Based on team statistics, recent performance, and historical matchups, what is the probability that each team will win?
    Return the percentage chance for each team as JSON with the following fields:
    - team-1-winning: percentage chance the home team wins (as a number)
    - team-2-winning: percentage chance the visitor team wins (as a number)
    The percentages should add up to 100%.`;
    
    // Generate content with structured output
    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
      },
    });
    
    const result = response.response.text();
    // Parse the JSON response
    const odds = JSON.parse(result);
    
    // Validate that the odds add up to approximately 100%
    const total = odds["team-1-winning"] + odds["team-2-winning"];
    if (total < 95 || total > 105) {
      console.warn(`Odd percentages don't sum close to 100% (${total}%). Using default odds.`);
      return defaultOdds;
    }
    
    return {
      homeTeamOdds: odds["team-1-winning"],
      visitorTeamOdds: odds["team-2-winning"]
    };
  } catch (error) {
    console.error("Error getting predicted odds from Gemini:", error);
    return { homeTeamOdds: 50, visitorTeamOdds: 50 };
  }
}

export const getFutureNbaGames = onSchedule("every 1 hours", async (event) => {
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

      // Process each game in the chunk, getting AI predictions for odds
      for (const game of chunk) {
        // Get AI-predicted odds for this game
        const predictedOdds = await getPredictedOdds(game.home_team, game.visitor_team);
        
        const docRef = db.collection("events").doc(game.id.toString());
        // Set with merge: true to update existing documents
        batch.set(
          docRef,
          {
            ...game,
            // Convert nested objects to Firestore-friendly format if needed
            home_team: { ...game.home_team },
            visitor_team: { ...game.visitor_team },
            // Use AI-predicted odds instead of default 50-50
            homeTeamCurrentOdds: predictedOdds.homeTeamOdds,
            visitorTeamCurrentOdds: predictedOdds.visitorTeamOdds,
            // Add timestamps if desired
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        // Create the oddsHistory subcollection with initial odds
        const oddsHistoryRef = docRef.collection("oddsHistory").doc();
        batch.set(oddsHistoryRef, {
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          homeTeamOdds: predictedOdds.homeTeamOdds,
          visitorTeamOdds: predictedOdds.visitorTeamOdds,
          source: "gemini-ai"
        });
      }

      batches.push(batch.commit());
    }

    // Execute all batches
    await Promise.all(batches);

    console.log(`${allGames.length} games processed successfully with AI-predicted odds`);
  } catch (error) {
    console.error("Error processing games:", error);
  }
});

export const updateRecentNbaGames = onSchedule("every 1 hours", async (event) => {
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

        // Prepare a batch for updating trades
        const tradeBatch = db.batch();
        // Create a map to track P&L updates for each user
        const userUpdates: { [userId: string]: { walletIncrement: number, pnlIncrement: number } } = {};

        tradesSnapshot.docs.forEach((tradeDoc) => {
          const trade = tradeDoc.data();
          let newStatus = "Lost";
          let pnlChange = -trade.amount; // Default to losing the bet amount
          
          if (winningTeam && trade.selectedTeam === winningTeam) {
            newStatus = "Won";
            // Calculate the net profit (payout - bet amount)
            const profit = (trade.expectedPayout || 0) - trade.amount;
            pnlChange = profit;
            
            // Track wallet and P&L increments for this user
            if (trade.userId) {
              if (!userUpdates[trade.userId]) {
                userUpdates[trade.userId] = { walletIncrement: 0, pnlIncrement: 0 };
              }
              userUpdates[trade.userId].walletIncrement += trade.expectedPayout || 0;
              userUpdates[trade.userId].pnlIncrement += pnlChange;
            }
          } else {
            // For losses, only update P&L (wallet was already decreased when bet was placed)
            if (trade.userId) {
              if (!userUpdates[trade.userId]) {
                userUpdates[trade.userId] = { walletIncrement: 0, pnlIncrement: 0 };
              }
              userUpdates[trade.userId].pnlIncrement += pnlChange;
            }
          }
          
          tradeBatch.update(tradeDoc.ref, { status: newStatus });
        });

        await tradeBatch.commit();

        // Update each user's walletBalance and lifetimePnl
        const userBatch = db.batch();
        for (const [userId, updates] of Object.entries(userUpdates)) {
          const userRef = db.collection("users").doc(userId);
          
          // Update wallet balance for winners (or could be zero for losers)
          if (updates.walletIncrement > 0) {
            userBatch.update(userRef, {
              walletBalance: admin.firestore.FieldValue.increment(updates.walletIncrement),
            });
          }
          
          // Always update the lifetimePnl field
          userBatch.update(userRef, {
            lifetimePnl: admin.firestore.FieldValue.increment(updates.pnlIncrement),
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
    
    // Initialize lifetimePnl field if it doesn't exist
    const userUpdates: any = {
      walletBalance: walletBalance - betAmount,
    };
    
    // If lifetimePnl doesn't exist, initialize it to 0
    if (userData?.lifetimePnl === undefined) {
      userUpdates.lifetimePnl = 0;
    }

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
    // For betting, lower probability (odds) should result in higher payouts
    // This formula gives a payout of 2x for a 50% probability
    const expectedPayout = betAmount * (100 / selectedOdds);

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

    // Add the trade ID to the user's trades array
    userUpdates.trades = admin.firestore.FieldValue.arrayUnion(tradeRef.id);
    
    // Update the user document with all changes
    transaction.update(userRef, userUpdates);

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

export const getLeaderboard = onCall(
  {
    region: "us-central1",
    maxInstances: 10,
  },
  async (request) => {
    // Ensure the user is authenticated
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "User must be authenticated.");
    }

    // Destructure pagination parameters from request.data
    const { pageSize, lastPnL, lastUserId } = request.data;
    const effectivePageSize = typeof pageSize === "number" && pageSize > 0 ? pageSize : 10;

    try {
      // Create a query for users ordered by lifetimePnl descending
      let usersQuery = admin
        .firestore()
        .collection("users")
        .orderBy("lifetimePnl", "desc") // Use lifetimePnl as it's the field actually used in backend
        .limit(effectivePageSize);

      // If we have a last user's PnL and ID for pagination
      if (lastPnL !== undefined && lastUserId) {
        usersQuery = usersQuery.startAfter(lastPnL, lastUserId);
      }

      const usersSnapshot = await usersQuery.get();
      
      // Process user documents to include only necessary data for leaderboard
      const users = usersSnapshot.docs.map(doc => {
        const userData = doc.data();
        return {
          id: doc.id,
          username: userData.username || userData.displayName || 'Anonymous',
          totalPnL: userData.lifetimePnl || 0,
          winRate: userData.winRate || 0,
          totalBets: userData.totalBets || 0,
        };
      });

      // Return leaderboard data along with a flag indicating if there are more results
      return { 
        users,
        hasMore: users.length === effectivePageSize
      };
    } catch (error) {
      console.error("Error fetching leaderboard:", error);
      throw new HttpsError("internal", "Error fetching leaderboard");
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