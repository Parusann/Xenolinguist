// Exercise the same authenticated Chromium path as the app. The harness never reads the credential.
export function desktopRequest(page) {
  const send = async (method, url, options = {}) => {
    const result = await page.evaluate(async ({ method, url, data, timeout }) => {
      const response = await fetch(url, { method, signal: AbortSignal.timeout(timeout), headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
      const bytes = new Uint8Array(await response.arrayBuffer());
      let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
      return { status: response.status, base64: btoa(binary), headers: Object.fromEntries(response.headers) };
    }, { method, url, data: options.data, timeout: options.timeout ?? 180_000 });
    const body = Buffer.from(result.base64, 'base64');
    return { status: () => result.status, json: async () => JSON.parse(body.toString()), body: async () => body, headers: () => result.headers };
  };
  return { get: (url, options) => send('GET', url, options), post: (url, options) => send('POST', url, options) };
}
