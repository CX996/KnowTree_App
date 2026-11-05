import assert from 'node:assert/strict';
import test from 'node:test';
import { sanitizeAuditMetadata } from '../src/services/audit.js';

test('audit metadata removes secrets and personal content', () => {
  assert.deepEqual(
    sanitizeAuditMetadata({
      invitationId: 'invite-1',
      email: 'reader@example.com',
      password: 'secret123',
      accessToken: 'token',
      body: 'private knowledge',
      status: 'active',
    }),
    {
      invitationId: 'invite-1',
      status: 'active',
    },
  );
});

test('audit metadata keeps only bounded primitive values', () => {
  const sanitized = sanitizeAuditMetadata({
    count: 2,
    enabled: true,
    nested: { id: 'hidden' },
    long: 'x'.repeat(300),
  });

  assert.equal(sanitized.count, 2);
  assert.equal(sanitized.enabled, true);
  assert.equal('nested' in sanitized, false);
  assert.equal(String(sanitized.long).length, 160);
});
