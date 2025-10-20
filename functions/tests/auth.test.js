import request from 'supertest';

describe('requireAdmin middleware', () => {
  let verifyIdTokenMock;
  let requireAdmin;
  let app;

  const buildApp = async () => {
    jest.resetModules();
    verifyIdTokenMock = jest.fn();

    jest.unstable_mockModule('firebase-admin/auth', () => ({
      getAuth: jest.fn(() => ({
        verifyIdToken: verifyIdTokenMock,
      })),
    }));

    const express = (await import('express')).default;
    ({ default: requireAdmin } = await import('../middleware/auth.js'));

    const instance = express();
    instance.get('/protected', requireAdmin, (req, res) => {
      res.json({ uid: req.user.uid });
    });
    return instance;
  };

  beforeEach(async () => {
    app = await buildApp();
  });

  test('rejects requests without Authorization header', async () => {
    const response = await request(app).get('/protected');
    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Forbidden: missing credentials.',
    });
    expect(verifyIdTokenMock).not.toHaveBeenCalled();
  });

  test('rejects non-admin callers', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'user-123', admin: false });

    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer test-token');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({
      error: 'Forbidden: admin access required.',
    });
    expect(verifyIdTokenMock).toHaveBeenCalledWith('test-token');
  });

  test('allows admin callers and attaches decoded token', async () => {
    verifyIdTokenMock.mockResolvedValue({ uid: 'admin-1', admin: true });

    const response = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer admin-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ uid: 'admin-1' });
    expect(verifyIdTokenMock).toHaveBeenCalledWith('admin-token');
  });
});
