import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { BalldontlieAPI } from "@balldontlie/sdk";

admin.initializeApp();
const db = admin.firestore();
const api = new BalldontlieAPI({ apiKey: "066f0ce8-a61a-4aee-82c0-e902d6ad3a0a" });

export const getFutureNbaGames = functions.https.onRequest(async (req, res) => {
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

      chunk.forEach(game => {
        const docRef = db.collection('events').doc(game.id.toString());
        // Set with merge: true to update existing documents
        batch.set(docRef, {
          ...game,
          // Convert nested objects to Firestore-friendly format if needed
          home_team: { ...game.home_team },
          visitor_team: { ...game.visitor_team },
          // Add timestamps if desired
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      });

      batches.push(batch.commit());
    }

    // Execute all batches
    await Promise.all(batches);

    res.status(200).json({
      success: true,
      message: `${allGames.length} games processed successfully`,
      storedCount: allGames.length
    });

  } catch (error) {
    console.error("Error processing games:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process games",
      error: error
    });
  }
});