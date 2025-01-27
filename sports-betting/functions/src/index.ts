import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { BalldontlieAPI } from "@balldontlie/sdk";

// Initialize Firebase Admin SDK
admin.initializeApp();

// Initialize the BALLDONTLIE API with your API key
const api = new BalldontlieAPI({ apiKey: "066f0ce8-a61a-4aee-82c0-e902d6ad3a0a" });

/**
 * Cloud Function to fetch future NBA games
 */
export const getFutureNbaGames = functions.https.onRequest(async (req, res) => {
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split("T")[0];

    // Fetch games from the API
    const games = await api.nba.getGames({
      start_date: today,
      end_date: "2025-12-31", // Adjust the end date as needed
    });

    // Return the list of games
    res.status(200).json({
      success: true,
      data: games.data,
    });
  } catch (error) {
    console.error("Error fetching future NBA games:", error);

    // Handle errors
    res.status(500).json({
      success: false,
      message: "Failed to fetch future NBA games",
      error: error,
    });
  }
});
