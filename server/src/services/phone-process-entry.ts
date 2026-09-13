import { transcribePhones } from './ipa-phones.js';
process.once('disconnect', () => process.exit(1));
process.once('message', async (input: { wav: string }) => {
  try {
    const result = await transcribePhones({ wav: Buffer.from(input.wav, 'base64') });
    process.send?.({ result }, () => process.exit(0));
  } catch (error) {
    const failure = error as Error & { code?: string };
    process.send?.({ error: { name: failure.name, code: failure.code } }, () => process.exit(1));
  }
});
