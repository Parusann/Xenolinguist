export interface SourceSpan { start: number; end: number; text: string }
const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' });

/** Half-open UTF-16 offsets into the ORIGINAL source, including decomposed accents. */
export function graphemes(source: string): SourceSpan[] {
  return Array.from(segmenter.segment(source), ({ segment, index }) => ({
    start: index, end: index + segment.length, text: segment,
  }));
}

export function sourceSpan(source: string, start: number, end: number): SourceSpan {
  return { start, end, text: source.slice(start, end) };
}
