import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

const parseAllowList = (value) =>
  (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

const allowedEmails = new Set(
  parseAllowList(process.env.ADMIN_EMAILS).map((email) => email.toLowerCase()),
);
const allowedDomains = new Set(
  parseAllowList(process.env.ADMIN_EMAIL_DOMAINS).map((domain) =>
    domain.toLowerCase(),
  ),
);
const allowedUids = new Set(parseAllowList(process.env.ADMIN_UIDS));

const hasAdminPrivileges = (decodedToken) => {
  if (!decodedToken) return { isAdmin: false, source: null };

  if (decodedToken.admin === true) {
    return { isAdmin: true, source: "token.admin" };
  }

  const tokenRole =
    typeof decodedToken.role === "string"
      ? decodedToken.role.trim().toLowerCase()
      : "";
  if (tokenRole === "admin") {
    return { isAdmin: true, source: "token.role" };
  }

  const tokenRoles = Array.isArray(decodedToken.roles)
    ? decodedToken.roles
        .map((role) =>
          typeof role === "string" ? role.trim().toLowerCase() : "",
        )
        .filter(Boolean)
    : [];
  if (tokenRoles.includes("admin")) {
    return { isAdmin: true, source: "token.roles" };
  }

  const email =
    typeof decodedToken.email === "string"
      ? decodedToken.email.trim().toLowerCase()
      : "";
  if (email) {
    if (allowedEmails.has(email)) return { isAdmin: true, source: "allowlist.email" };
    const domain = email.split("@")[1];
    if (domain && allowedDomains.has(domain.trim().toLowerCase())) {
      return { isAdmin: true, source: "allowlist.domain" };
    }
  }

  const uid = decodedToken.uid ? String(decodedToken.uid).trim() : "";
  if (uid && allowedUids.has(uid)) {
    return { isAdmin: true, source: "allowlist.uid" };
  }

  return { isAdmin: false, source: null };
};

const isTruthyFlag = (value) => {
  if (value === true) return true;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  if (typeof value === "number") {
    return value === 1;
  }
  return false;
};

const hasRoleFlag = (value) => {
  if (!value) return false;
  if (typeof value === "string") {
    return value.trim().toLowerCase() === "admin";
  }
  if (Array.isArray(value)) {
    return value.some((entry) =>
      typeof entry === "string" && entry.trim().toLowerCase() === "admin",
    );
  }
  return false;
};

const fetchAdminRecord = async (uid) => {
  if (!uid) return { isAdmin: false, source: null, reason: "missing-uid" };
  try {
    const snap = await getFirestore()
      .collection("admins")
      .doc(String(uid))
      .get();
    if (!snap.exists) {
      return { isAdmin: false, source: null, reason: "doc-missing" };
    }
    const data = snap.data() || {};
    if (isTruthyFlag(data.isAdmin)) {
      return { isAdmin: true, source: "firestore.isAdmin", reason: null };
    }
    if (hasRoleFlag(data.role)) {
      return { isAdmin: true, source: "firestore.role", reason: null };
    }
    if (hasRoleFlag(data.roles)) {
      return { isAdmin: true, source: "firestore.roles", reason: null };
    }
    return {
      isAdmin: false,
      source: null,
      reason: "flag-not-true",
      dataSnapshot: data,
    };
  } catch (error) {
    console.warn("Admin lookup failed:", { uid, error });
    return { isAdmin: false, source: null, reason: "lookup-error" };
  }
};

/**
 * Express middleware enforcing Firebase admin authentication.
 * Verifies Bearer ID tokens and ensures the caller is authorised.
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
    const { isAdmin: claimAdmin, source: claimSource } = hasAdminPrivileges(decodedToken);
    let adminSource = claimSource;
    let isAdmin = claimAdmin;

    let firestoreResult = null;
    if (!isAdmin) {
      firestoreResult = await fetchAdminRecord(decodedToken?.uid);
      isAdmin = firestoreResult.isAdmin;
      if (isAdmin) {
        adminSource = firestoreResult.source || "firestore";
      }
    }

    if (!isAdmin) {
      console.warn("Admin access denied", {
        uid: decodedToken?.uid ?? null,
        email: decodedToken?.email ?? null,
        reason: firestoreResult?.reason || "no-match",
      });
      return res.status(403).json({ error: "Forbidden: admin access required." });
    }

    console.info("Admin access granted", {
      uid: decodedToken?.uid ?? null,
      email: decodedToken?.email ?? null,
      source: adminSource,
    });

    req.user = { ...decodedToken, isAdmin: true, adminSource };
    return next();
  } catch (error) {
    console.error("Admin auth middleware failed:", error);
    return res.status(403).json({ error: "Forbidden: authentication failed." });
  }
}
