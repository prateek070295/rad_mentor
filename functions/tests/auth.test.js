import request from "supertest";

describe("requireAdmin middleware", () => {
  let verifyIdTokenMock;
  let getDocMock;
  let collectionMock;
  let docMock;

  const originalAdminEmails = process.env.ADMIN_EMAILS;
  const originalAdminDomains = process.env.ADMIN_EMAIL_DOMAINS;
  const originalAdminUids = process.env.ADMIN_UIDS;

  const buildApp = async ({
    emails = originalAdminEmails ?? "",
    domains = originalAdminDomains ?? "",
    uids = originalAdminUids ?? "",
  } = {}) => {
    jest.resetModules();

    process.env.ADMIN_EMAILS = emails;
    process.env.ADMIN_EMAIL_DOMAINS = domains;
    process.env.ADMIN_UIDS = uids;

    verifyIdTokenMock = jest.fn();
    getDocMock = jest.fn().mockResolvedValue({ exists: false });
    docMock = jest.fn(() => ({ get: getDocMock }));
    collectionMock = jest.fn(() => ({ doc: docMock }));

    jest.unstable_mockModule("firebase-admin/auth", () => ({
      getAuth: jest.fn(() => ({
        verifyIdToken: verifyIdTokenMock,
      })),
    }));

    jest.unstable_mockModule("firebase-admin/firestore", () => ({
      getFirestore: jest.fn(() => ({
        collection: collectionMock,
      })),
    }));

    const express = (await import("express")).default;
    const { default: requireAdmin } = await import("../middleware/auth.js");

    const app = express();
    app.get("/protected", requireAdmin, (req, res) => {
      res.json({ uid: req.user.uid, email: req.user.email, isAdmin: req.user.isAdmin });
    });
    return app;
  };

  afterEach(() => {
    process.env.ADMIN_EMAILS = originalAdminEmails;
    process.env.ADMIN_EMAIL_DOMAINS = originalAdminDomains;
    process.env.ADMIN_UIDS = originalAdminUids;
  });

  test("rejects requests without Authorization header", async () => {
    const app = await buildApp();

    const response = await request(app).get("/protected");
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Forbidden: missing credentials.",
    });
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });

  test("rejects callers without admin privileges", async () => {
    const app = await buildApp();
    getDocMock.mockResolvedValue({ exists: false });
    verifyIdTokenMock.mockResolvedValue({ uid: "user-123", admin: false, email: "user@example.com" });

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer test-token");

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: "Forbidden: admin access required.",
    });
    expect(verifyIdTokenMock).toHaveBeenCalledWith("test-token");
  });

  test("allows callers with admin custom claim", async () => {
    const app = await buildApp();
    getDocMock.mockResolvedValue({ exists: false });
    verifyIdTokenMock.mockResolvedValue({ uid: "admin-1", admin: true, email: "admin@example.com" });

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer admin-token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ uid: "admin-1", email: "admin@example.com", isAdmin: true });
    expect(verifyIdTokenMock).toHaveBeenCalledWith("admin-token");
  });

  test("allows callers on the email allow-list", async () => {
    const app = await buildApp({ emails: "admin@example.com" });
    getDocMock.mockResolvedValue({ exists: false });
    verifyIdTokenMock.mockResolvedValue({ uid: "user-123", admin: false, email: "admin@example.com" });

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ uid: "user-123", email: "admin@example.com", isAdmin: true });
    expect(verifyIdTokenMock).toHaveBeenCalledWith("token");
  });

  test("allows callers matching allow-listed email domains", async () => {
    const app = await buildApp({ domains: "radmentor.com" });
    getDocMock.mockResolvedValue({ exists: false });
    verifyIdTokenMock.mockResolvedValue({ uid: "user-456", admin: false, email: "editor@radmentor.com" });

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ uid: "user-456", email: "editor@radmentor.com", isAdmin: true });
    expect(verifyIdTokenMock).toHaveBeenCalledWith("token");
  });

  test("allows callers from the UID allow-list", async () => {
    const app = await buildApp({ uids: "uid-1,uid-2" });
    getDocMock.mockResolvedValue({ exists: false });
    verifyIdTokenMock.mockResolvedValue({ uid: "uid-2", admin: false, email: "user@example.com" });

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ uid: "uid-2", email: "user@example.com", isAdmin: true });
    expect(verifyIdTokenMock).toHaveBeenCalledWith("token");
  });

  test("allows callers present in the admin collection", async () => {
    const app = await buildApp();
    getDocMock.mockResolvedValue({
      exists: true,
      data: () => ({ isAdmin: true }),
    });
    verifyIdTokenMock.mockResolvedValue({ uid: "user-789", admin: false, email: "user789@example.com" });

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ uid: "user-789", email: "user789@example.com", isAdmin: true });
    expect(verifyIdTokenMock).toHaveBeenCalledWith("token");
    expect(collectionMock).toHaveBeenCalledWith("admin");
    expect(docMock).toHaveBeenCalledWith("user-789");
    expect(getDocMock).toHaveBeenCalledTimes(1);
  });

  test("treats string admin flags in Firestore as truthy", async () => {
    const app = await buildApp();
    getDocMock.mockResolvedValue({
      exists: true,
      data: () => ({ isAdmin: "true" }),
    });
    verifyIdTokenMock.mockResolvedValue({ uid: "user-321", admin: false, email: "user321@example.com" });

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ uid: "user-321", email: "user321@example.com", isAdmin: true });
  });

  test("respects role arrays stored in Firestore admin doc", async () => {
    const app = await buildApp();
    getDocMock.mockResolvedValue({
      exists: true,
      data: () => ({ roles: ["editor", "Admin"] }),
    });
    verifyIdTokenMock.mockResolvedValue({ uid: "user-654", admin: false, email: "user654@example.com" });

    const response = await request(app)
      .get("/protected")
      .set("Authorization", "Bearer token");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ uid: "user-654", email: "user654@example.com", isAdmin: true });
  });
});
