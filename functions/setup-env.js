/**
 * Helper script to set up Firebase environment variables
 * 
 * Usage:
 * 1. Make sure you have a .env file with the required variables
 * 2. Run: node setup-env.js
 * 3. This will prepare the command to set Firebase environment variables
 */

const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Get the .env file path
const envPath = path.resolve(__dirname, '.env');

try {
  // Check if .env file exists
  if (!fs.existsSync(envPath)) {
    console.error('\x1b[31mError: .env file not found!\x1b[0m');
    console.log('Please create a .env file with your environment variables.');
    console.log('You can copy .env.example as a starting point.');
    process.exit(1);
  }

  // Load environment variables from .env file
  const envConfig = dotenv.parse(fs.readFileSync(envPath));

  // Check if the required variables are set
  const requiredVars = ['OPENAI_API_KEY'];
  const missingVars = requiredVars.filter(varName => !envConfig[varName]);

  if (missingVars.length > 0) {
    console.error('\x1b[31mError: Missing required environment variables!\x1b[0m');
    missingVars.forEach(varName => {
      console.log(`- ${varName} is not set in your .env file`);
    });
    process.exit(1);
  }

  // Generate the Firebase CLI command to set environment variables
  const firebaseEnvConfig = Object.entries(envConfig)
    .map(([key, value]) => `${key}=${value}`)
    .join(',');

  console.log('\x1b[32mSuccess! Use the following command to set Firebase environment variables:\x1b[0m');
  console.log('\x1b[36m');
  console.log(`firebase functions:secrets:set OPENAI_API_KEY`);
  console.log('\x1b[0m');
  console.log('After setting the secrets, update your Firebase configuration to use them.');
  console.log('For more information, see: https://firebase.google.com/docs/functions/config-env');

} catch (error) {
  console.error('\x1b[31mAn error occurred:\x1b[0m', error);
  process.exit(1);
} 