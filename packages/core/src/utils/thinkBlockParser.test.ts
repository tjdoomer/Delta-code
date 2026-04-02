import { describe, it, expect } from 'vitest';
import { extractThinkBlocks, StreamingThinkExtractor } from './thinkBlockParser.js';

describe('extractThinkBlocks', () => {
  it('should extract a single think block', () => {
    const input = 'Hello <think>reasoning here</think> world';
    const { text, thinkContent } = extractThinkBlocks(input);
    expect(text).toBe('Hello  world');
    expect(thinkContent).toBe('reasoning here');
  });

  it('should extract multiple think blocks', () => {
    const input = '<think>first</think> text <think>second</think>';
    const { text, thinkContent } = extractThinkBlocks(input);
    expect(text).toBe('text');
    expect(thinkContent).toBe('first\n\nsecond');
  });

  it('should return null thinkContent when no think blocks', () => {
    const { text, thinkContent } = extractThinkBlocks('just plain text');
    expect(text).toBe('just plain text');
    expect(thinkContent).toBeNull();
  });

  it('should handle multiline think blocks', () => {
    const input = '<think>\nline 1\nline 2\n</think>result';
    const { text, thinkContent } = extractThinkBlocks(input);
    expect(text).toBe('result');
    expect(thinkContent).toBe('line 1\nline 2');
  });

  it('should handle empty think blocks', () => {
    const input = '<think></think>text';
    const { text, thinkContent } = extractThinkBlocks(input);
    expect(text).toBe('text');
    expect(thinkContent).toBeNull(); // empty think = null
  });
});

describe('StreamingThinkExtractor', () => {
  it('should extract think content from a single chunk', () => {
    const ext = new StreamingThinkExtractor();
    const result = ext.process('Hello <think>reason</think> world');
    expect(result.visibleText).toBe('Hello  world');
    expect(result.completedThink).toBe('reason');
  });

  it('should handle think block spanning two chunks', () => {
    const ext = new StreamingThinkExtractor();

    const r1 = ext.process('Hello <think>start of ');
    expect(r1.visibleText).toBe('Hello ');
    expect(r1.completedThink).toBeNull(); // not complete yet

    const r2 = ext.process('reasoning</think> world');
    expect(r2.visibleText).toBe(' world');
    expect(r2.completedThink).toBe('start of reasoning');
  });

  it('should handle think block spanning many chunks', () => {
    const ext = new StreamingThinkExtractor();

    ext.process('<think>');
    const r2 = ext.process('chunk 1 ');
    expect(r2.completedThink).toBeNull();

    const r3 = ext.process('chunk 2 ');
    expect(r3.completedThink).toBeNull();

    const r4 = ext.process('chunk 3</think>done');
    expect(r4.completedThink).toBe('chunk 1 chunk 2 chunk 3');
    expect(r4.visibleText).toBe('done');
  });

  it('should handle partial tag at chunk boundary', () => {
    const ext = new StreamingThinkExtractor();

    // "<think" split across boundary
    const r1 = ext.process('text <thi');
    expect(r1.visibleText).toBe('text ');

    const r2 = ext.process('nk>reasoning</think>');
    expect(r2.completedThink).toBe('reasoning');
  });

  it('should handle text with no think blocks', () => {
    const ext = new StreamingThinkExtractor();
    const result = ext.process('just regular text');
    expect(result.visibleText).toBe('just regular text');
    expect(result.completedThink).toBeNull();
  });

  it('should reset state between streams', () => {
    const ext = new StreamingThinkExtractor();

    // Start a think block but don't finish
    ext.process('<think>partial');
    ext.reset();

    // After reset, should work cleanly
    const result = ext.process('fresh text');
    expect(result.visibleText).toBe('fresh text');
    expect(result.completedThink).toBeNull();
  });
});
