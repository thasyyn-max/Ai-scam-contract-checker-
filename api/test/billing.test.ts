import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phpJson, computeSign, verifyWebhook } from '../src/billing.ts';

test('phpJson escapes forward slashes (Cryptomus/PHP json_encode compatibility)', () => {
  assert.equal(phpJson({ url: 'https://rugsonar.com/x' }), '{"url":"https:\\/\\/rugsonar.com\\/x"}');
});

test('computeSign returns a 32-char md5 hex', () => {
  assert.match(computeSign('{"a":1}', 'k'), /^[0-9a-f]{32}$/);
});

test('verifyWebhook accepts a correctly signed body and rejects tampering', () => {
  const key = 'test_payment_key';
  const data = { order_id: 'rs_1', status: 'paid', amount: '29.00' };
  const sign = computeSign(phpJson(data), key);

  assert.equal(verifyWebhook({ ...data, sign }, key), true, 'valid signature accepted');
  assert.equal(verifyWebhook({ ...data, amount: '0.01', sign }, key), false, 'tampered amount rejected');
  assert.equal(verifyWebhook({ ...data, sign }, 'wrong_key'), false, 'wrong key rejected');
  assert.equal(verifyWebhook(data, key), false, 'missing sign rejected');
});
