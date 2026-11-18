import { describe, expect, it } from 'vitest';
import { DOC_TYPE, carriesFile, loadFileProblem } from './fileDrop';

describe('dropping files on a load', () => {
  it('takes PDF, PNG and JPG up to 10 MB', () => {
    expect(loadFileProblem('BOL.pdf', 1000)).toBe('');
    expect(loadFileProblem('pod.JPG', 1000)).toBe('');
    expect(loadFileProblem('scale.png', 1000)).toBe('');
    expect(loadFileProblem('notes.docx', 1000)).toMatch(/only PDF, PNG or JPG/);
    expect(loadFileProblem('big.pdf', 11 * 1024 * 1024)).toMatch(/larger than 10 MB/);
  });
  it('knows a drag that carries a file', () => {
    expect(carriesFile({ dataTransfer: { types: ['Files'] } } as never)).toBe(true);
    expect(carriesFile({ dataTransfer: { types: [DOC_TYPE, 'text/plain'] } } as never)).toBe(true);
    expect(carriesFile({ dataTransfer: { types: ['text/plain'] } } as never)).toBe(false);
  });
});
