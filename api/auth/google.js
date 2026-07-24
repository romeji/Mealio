// api/auth/google.js — Démarre le flow Google OAuth
export default function handler(req, res) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const baseUrl = process.env.APP_ORIGIN || "https://mealio-fr.vercel.app";
  const redirectUri = baseUrl + "/api/auth/callback";

  if (!clientId) {
    return res.status(500).send("GOOGLE_CLIENT_ID manquant dans les variables Vercel.");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state: req.query.state || "web",
  });

  res.redirect(302, "https://accounts.google.com/o/oauth2/v2/auth?" + params);
}
