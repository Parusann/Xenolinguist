// Exercise the same authenticated Chromium path as the app. The harness never reads the credential.
export function desktopRequest(page) {
  const send = async (method, url, options = {}) => {
    // Passing a Buffer to page.evaluate serializes millions of numeric properties.
    const binaryBody = Buffer.isBuffer(options.data) || options.data instanceof Uint8Array;
    const data = binaryBody ? Buffer.from(options.data).toString('base64') : options.data;
    const result = await page.evaluate(async ({ method, url, data, binaryBody, headers, timeout }) => {
      const body = data === undefined ? undefined : binaryBody ? Uint8Array.from(atob(data), c => c.charCodeAt(0)) : JSON.stringify(data);
      const response = await fetch(url, { method, signal: AbortSignal.timeout(timeout), headers, body });
      const bytes = new Uint8Array(await response.arrayBuffer());
      const parts = [];
      for (let offset = 0; offset < bytes.length; offset += 49_152)
        parts.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + 49_152))));
      return { status: response.status, base64: parts.join(''), headers: Object.fromEntries(response.headers) };
    }, { method, url, data, binaryBody,
      headers: { ...(data === undefined ? {} : { 'Content-Type': binaryBody ? 'application/octet-stream' : 'application/json' }), ...options.headers },
      timeout: options.timeout ?? 180_000 });
    const body = Buffer.from(result.base64, 'base64');
    return { status: () => result.status, json: async () => JSON.parse(body.toString()), body: async () => body, headers: () => result.headers };
  };
  return { get: (url, options) => send('GET', url, options), post: (url, options) => send('POST', url, options), put: (url, options) => send('PUT', url, options) };
}
