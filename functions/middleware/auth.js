import { getAuth } from "firebase-admin/auth";

/**
 * Express middleware enforcing Firebase admin authentication.
 * Verifies Bearer ID tokens and ensures the caller has `admin: true`.
 */
export default async function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const prefix = "Bearer ";
    if (!authHeader.startsWith(prefix)) {
      return res.status(403).json({ error: "Forbidden: missing credentials." });
    }

    const idToken = authHeader.slice(prefix.length).trim();
    if (!idToken) {
      return res.status(403).json({ error: "Forbidden: invalid credential format." });
    }

    const decodedToken = await getAuth().verifyIdToken(idToken);
    if (!decodedToken?.admin) {
      return res.status(403).json({ error: "Forbidden: admin access required." });
    }

    req.user = decodedToken;
    return next();
  } catch (error) {
    console.error("Admin auth middleware failed:", error);
    return res.status(403).json({ error: "Forbidden: authentication failed." });
  }
}
