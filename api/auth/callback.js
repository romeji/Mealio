// api/auth/callback.js — Google OAuth → Firebase Custom Token
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

// All credentials from Vercel environment variables (secure)
  const BASE_URL = process.env.APP_ORIGIN || "https://mealio-fr.vercel.app";
const REDIRECT_URI = BASE_URL + "/api/auth/callback";

function getAdmin() {
  if (getApps().length > 0) return getApps()[0];
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    }),
  });
}

export default async function handler(req, res) {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(302, BASE_URL + "/#auth_error=" + encodeURIComponent("Google refusé : " + error));
  }
  if (!code) {
    return res.redirect(302, BASE_URL + "/#auth_error=" + encodeURIComponent("Pas de code OAuth."));
  }

  try {
    // 1. Échanger le code contre les tokens Google
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const tokenData = await tokenRes.json();

    if (tokenData.error) {
      console.error("Token error:", tokenData);
      return res.redirect(302, BASE_URL + "/#auth_error=" + encodeURIComponent("Token échoué : " + (tokenData.error_description || tokenData.error)));
    }

    // 2. Récupérer le profil Google
    const userRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: "Bearer " + tokenData.access_token },
    });
    const gUser = await userRes.json();

    if (!gUser.sub || !gUser.email) {
      return res.redirect(302, BASE_URL + "/#auth_error=" + encodeURIComponent("Profil Google introuvable."));
    }

    // 3. Trouver ou créer l'utilisateur Firebase
    getAdmin();
    const firebaseAuth = getAuth();
    let uid;

    try {
      // Chercher par email d'abord (gère les comptes existants)
      const existing = await firebaseAuth.getUserByEmail(gUser.email);
      uid = existing.uid;
      // Mettre à jour les infos
      await firebaseAuth.updateUser(uid, {
        displayName: gUser.name || existing.displayName || gUser.email,
        photoURL: gUser.picture || existing.photoURL || "",
        emailVerified: true,
      }).catch(() => {});
    } catch (notFound) {
      // Créer un nouvel utilisateur
      const newUser = await firebaseAuth.createUser({
        email: gUser.email,
        displayName: gUser.name || gUser.email,
        photoURL: gUser.picture || "",
        emailVerified: true,
      });
      uid = newUser.uid;
    }

    // 4. Créer le custom token Firebase
    const customToken = await firebaseAuth.createCustomToken(uid, {
      email: gUser.email,
      name: gUser.name || "",
      picture: gUser.picture || "",
    });

    // 5. Rediriger vers la PWA avec le token
    const hashData = [
      "firebase_custom_token=" + encodeURIComponent(customToken),
      "user_email=" + encodeURIComponent(gUser.email),
      "user_name=" + encodeURIComponent(gUser.name || ""),
    ].join("&");

    return res.redirect(302, BASE_URL + "/#" + hashData);

  } catch (err) {
    console.error("Callback error:", err);
    return res.redirect(302, BASE_URL + "/#auth_error=" + encodeURIComponent("Erreur serveur : " + err.message));
  }
}
