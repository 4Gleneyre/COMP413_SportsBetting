import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

const db = admin.firestore();

export const sellBet = onCall({
  region: "us-central1"
}, async (request) => {
  const { betId, salePrice } = request.data;
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Not signed in");
  if (!betId || typeof salePrice !== "number") throw new HttpsError("invalid-argument", "Missing or invalid arguments");

  const betRef = db.collection("trades").doc(betId);
  const betSnap = await betRef.get();
  if (!betSnap.exists) throw new HttpsError("not-found", "Bet not found");
  const betData = betSnap.data();
  if (betData.userId !== auth.uid) throw new HttpsError("permission-denied", "You do not own this bet");
  if (betData.forSale) throw new HttpsError("failed-precondition", "Bet already for sale");
  if (betData.status && betData.status !== "Pending") throw new HttpsError("failed-precondition", "Bet is not pending");

  await betRef.update({ forSale: true, salePrice });
  return { success: true };
});

export const buyBet = onCall({
  region: "us-central1"
}, async (request) => {
  const { betId } = request.data;
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Not signed in");
  if (!betId) throw new HttpsError("invalid-argument", "Missing betId");

  const betRef = db.collection("trades").doc(betId);
  await db.runTransaction(async (transaction) => {
    const betSnap = await transaction.get(betRef);
    if (!betSnap.exists) throw new HttpsError("not-found", "Bet not found");
    const betData = betSnap.data();
    if (!betData.forSale) throw new HttpsError("failed-precondition", "Bet not for sale");
    if (betData.userId === auth.uid) throw new HttpsError("failed-precondition", "Cannot buy your own bet");
    const salePrice = betData.salePrice;
    if (typeof salePrice !== "number") throw new HttpsError("invalid-argument", "Invalid sale price");

    const buyerRef = db.collection("users").doc(auth.uid);
    const sellerRef = db.collection("users").doc(betData.userId);
    const [buyerSnap, sellerSnap] = await Promise.all([
      transaction.get(buyerRef),
      transaction.get(sellerRef)
    ]);
    if (!buyerSnap.exists) throw new HttpsError("not-found", "Buyer not found");
    if (!sellerSnap.exists) throw new HttpsError("not-found", "Seller not found");
    const buyer = buyerSnap.data();
    const seller = sellerSnap.data();
    if ((buyer.walletBalance ?? 0) < salePrice) throw new HttpsError("failed-precondition", "Insufficient funds");

    // Transfer bet
    transaction.update(betRef, {
      userId: auth.uid,
      forSale: false,
      salePrice: null
    });
    // Update wallets
    transaction.update(buyerRef, {
      walletBalance: (buyer.walletBalance ?? 0) - salePrice,
      trades: admin.firestore.FieldValue.arrayUnion(betId)
    });
    transaction.update(sellerRef, {
      walletBalance: (seller.walletBalance ?? 0) + salePrice,
      trades: admin.firestore.FieldValue.arrayRemove(betId)
    });
  });
  return { success: true };
});
