import { test } from 'node:test';
import assert from 'node:assert/strict';
import proxyaddr from 'proxy-addr';
import shellQuote from 'shell-quote';

test('mapped IPv6 trust subnets do not trust unrelated IPv4 clients', () => {
  const malformed = proxyaddr.compile('::ffff:10.0.0.0/8');
  assert.equal(malformed('198.51.100.12'), false);
  const mapped = proxyaddr.compile('::ffff:10.0.0.0/104');
  assert.equal(mapped('10.0.0.12'), true);
  assert.equal(mapped('198.51.100.12'), false);
  assert.equal(proxyaddr.compile('10.0.0.0/8')('10.0.0.12'), true);
});

test('shell quoting rejects line terminators after comments and preserves ordinary arguments', () => {
  // Verify the quoting boundary only; never execute the resulting shell text.
  for (const newline of ['\n', '\r', '\u2028', '\u2029'])
    assert.throws(() => shellQuote.quote(['echo', 'safe', { comment: 'note' }, `argument${newline}suffix`]), TypeError);
  const args = ['echo', 'two words', "apostrophe's", 'C:\\folder with spaces\\input.wav'];
  assert.deepEqual(shellQuote.parse(shellQuote.quote(args)), args);
});
