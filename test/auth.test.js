import test from 'node:test';
import assert from 'node:assert/strict';
import { signToken, verifyToken, signStateToken, verifyStateToken } from '../api/_lib/auth.js';
import login from '../api/login.js';

test('missing APP_SECRET cannot mint or verify sessions', () => {
  const before = process.env.APP_SECRET;
  delete process.env.APP_SECRET;
  try {
    assert.throws(() => signToken({ exp: Date.now() + 1000 }), /APP_SECRET/);
    assert.equal(verifyToken('anything.anything'), null);
  } finally {
    if (before === undefined) delete process.env.APP_SECRET;
    else process.env.APP_SECRET = before;
  }
});

test('session and OAuth state tokens have separate signing purposes', () => {
  const before = process.env.APP_SECRET;
  process.env.APP_SECRET = 'test-secret-with-enough-entropy';
  try {
    const session = signToken({ exp: Date.now() + 1000 });
    const state = signStateToken({ exp: Date.now() + 1000 });
    assert.ok(verifyToken(session));
    assert.ok(verifyStateToken(state));
    assert.equal(verifyToken(state), null);
    assert.equal(verifyStateToken(session), null);
  } finally {
    if (before === undefined) delete process.env.APP_SECRET;
    else process.env.APP_SECRET = before;
  }
});

test('expired and malformed tokens are rejected', () => {
  const before = process.env.APP_SECRET;
  process.env.APP_SECRET = 'another-test-secret';
  try {
    assert.equal(verifyToken(signToken({ exp: Date.now() - 1 })), null);
    assert.equal(verifyToken('not-a-token'), null);
  } finally {
    if (before === undefined) delete process.env.APP_SECRET;
    else process.env.APP_SECRET = before;
  }
});

test('login fails closed before touching the database when APP_SECRET is missing', async () => {
  const beforePassword = process.env.APP_PASSWORD;
  const beforeSecret = process.env.APP_SECRET;
  process.env.APP_PASSWORD = 'correct horse battery staple';
  delete process.env.APP_SECRET;
  const headers = {};
  const response = {
    statusCode: 0,
    setHeader(name, value) { headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  try {
    await login({ method: 'POST', body: { password: 'correct horse battery staple' }, headers: {} }, response);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.body, { error: 'server-config' });
    assert.equal(headers['Set-Cookie'], undefined);
  } finally {
    if (beforePassword === undefined) delete process.env.APP_PASSWORD;
    else process.env.APP_PASSWORD = beforePassword;
    if (beforeSecret === undefined) delete process.env.APP_SECRET;
    else process.env.APP_SECRET = beforeSecret;
  }
});
