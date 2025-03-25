/**
 * Test script for the NBA betting analysis function
 * 
 * To use:
 * 1. Make sure you have set up your .env file with the OpenAI API key
 * 2. Run: node test-analysis.js
 */

require('dotenv').config();
const OpenAI = require('openai');

// Mock teams and date for testing
const homeTeam = "Los Angeles Lakers";
const awayTeam = "Boston Celtics"; 
const gameDate = "2024-02-15";

async function testBettingAnalysis() {
  console.log(`Testing NBA betting analysis for ${homeTeam} vs ${awayTeam} on ${gameDate}...`);
  
  try {
    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Call OpenAI with web search
    console.log("Calling OpenAI API with web search...");
    const response = await openai.responses.create({
      model: "gpt-4o",
      tools: [
        { 
          type: "web_search_preview",
          search_context_size: "high"
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
      tool_choice: { type: "web_search_preview" },
      temperature: 0.2,
    });

    // Display the response
    console.log("\n=== ANALYSIS RESULTS ===\n");
    console.log(response.output_text);
    
    // Check for citation data if available
    console.log("\n=== CITATION DATA ===\n");
    try {
      const messageItem = response.output.find(item => item.type === 'message');
      if (messageItem && 'content' in messageItem) {
        const content = messageItem.content;
        if (Array.isArray(content) && content.length > 0 && 'annotations' in content[0]) {
          const annotations = content[0].annotations;
          if (Array.isArray(annotations)) {
            annotations.forEach((anno, i) => {
              if (anno.type === 'url_citation') {
                console.log(`[${i+1}] ${anno.title || 'Source'}: ${anno.url}`);
              }
            });
          }
        }
      }
    } catch (e) {
      console.log("No citation data available");
    }

    console.log("\nTest completed successfully!");
  } catch (error) {
    console.error("Error during test:", error);
  }
}

// Run the test
testBettingAnalysis(); 