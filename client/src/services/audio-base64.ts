/** Yield between bounded, three-byte-aligned chunks instead of building millions of character nodes. */
export async function audioBase64(bytes: Uint8Array): Promise<string> {
  const parts: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 49_152) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(offset, offset + 49_152))));
    if (offset + 49_152 < bytes.length) await new Promise<void>(resolve => setTimeout(resolve, 0));
  }
  return parts.join('');
}
