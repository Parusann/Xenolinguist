import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { desktopRequest } from '../../scripts/desktop-request.mjs';

async function fixture(t) {
  const server = createServer(async (req, res) => {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    res.setHeader('x-method', req.method);
    res.setHeader('x-content-type', req.headers['content-type'] ?? 'none');
    res.end(Buffer.concat(chunks));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const page = { evaluate: (fn, arg) => {
    if (arg.binaryBody) assert.equal(typeof arg.data, 'string');
    return fn(JSON.parse(JSON.stringify(arg)));
  } };
  return { request: desktopRequest(page), url: `http://127.0.0.1:${server.address().port}` };
}

test('desktop transport preserves long raw audio through POST/PUT without object serialization', async t => {
  const { request, url } = await fixture(t);
  const bytes = Buffer.alloc(9_600_044);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
  for (const method of ['post', 'put']) {
    const response = await request[method](url, { data: bytes });
    assert.equal(response.status(), 200);
    assert.equal(response.headers()['x-method'], method.toUpperCase());
    assert.equal(response.headers()['x-content-type'], 'application/octet-stream');
    assert.ok((await response.body()).equals(bytes));
  }
});

test('desktop transport preserves JSON requests and empty GET responses', async t => {
  const { request, url } = await fixture(t);
  const data = { text: 'retained 🌍', nested: [1, null, true] };
  const response = await request.post(url, { data });
  assert.deepEqual(await response.json(), data);
  assert.equal(response.headers()['x-content-type'], 'application/json');
  const empty = await request.get(url);
  assert.equal((await empty.body()).length, 0);
  assert.equal(empty.headers()['x-method'], 'GET');
});
