import { describe, expect, it } from 'vitest';
import { createChunker } from './createChunker.js';

describe('createChunker', () => {
  it('gives the default chunker, named "recursive", when there is no flag', () => {
    expect(createChunker(undefined).name).toBe('recursive');
  });

  it('puts the settings in the name, so each variant gets its own collection', () => {
    expect(createChunker('500/100').name).toBe('recursive-500-100');
    expect(createChunker('2000/400').name).toBe('recursive-2000-400');
  });

  it('gives the plain name when the flag spells out the default', () => {
    expect(createChunker('1000/200').name).toBe('recursive');
  });

  it('rejects a flag that is not size/overlap', () => {
    expect(() => createChunker('500')).toThrow('size/overlap');
    expect(() => createChunker('big/small')).toThrow('size/overlap');
  });

  it('rejects an overlap that is not smaller than the size', () => {
    expect(() => createChunker('500/500')).toThrow('bigger than the overlap');
    expect(() => createChunker('0/0')).toThrow('bigger than the overlap');
  });
});
