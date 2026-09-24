import { PassThrough, Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { PromptCancelled, processTerminal, readHidden, type TerminalInput } from './terminal';

/** A stdin that claims to be a TTY and records raw-mode switches. */
function fakeTty(isTTY = true) {
  const stream = new PassThrough() as PassThrough & TerminalInput & { rawModes: boolean[] };
  stream.rawModes = [];
  stream.isTTY = isTTY;
  stream.setRawMode = (mode: boolean) => {
    stream.rawModes.push(mode);
    return stream;
  };
  return stream;
}

function capture() {
  const chunks: string[] = [];
  const out = new Writable({
    write(chunk, _enc, done) {
      chunks.push(String(chunk));
      done();
    },
  });
  return { out, text: () => chunks.join('') };
}

describe('readHidden', () => {
  it('returns what was typed and echoes none of it', async () => {
    const input = fakeTty();
    const { out, text } = capture();
    const pending = readHidden(input, out, 'Password: ');
    input.write('hunter2-secret');
    input.write('\r');
    expect(await pending).toBe('hunter2-secret');
    expect(text()).toBe('Password: \n');
  });

  it('turns raw mode on for the read and off afterwards', async () => {
    const input = fakeTty();
    const pending = readHidden(input, capture().out, '> ');
    input.write('abc\n');
    await pending;
    expect(input.rawModes).toEqual([true, false]);
  });

  it('handles backspace (both encodings) and ignores escape sequences', async () => {
    const input = fakeTty();
    const pending = readHidden(input, capture().out, '> ');
    input.write('abx\u007fc\u001b[Dd\bde\r');
    expect(await pending).toBe('abcde');
  });

  it('keeps a multi-byte character whole on backspace', async () => {
    const input = fakeTty();
    const pending = readHidden(input, capture().out, '> ');
    input.write('סיסמה\u007f\r');
    expect(await pending).toBe('סיסמ');
  });

  it('rejects on Ctrl+C and still restores the terminal', async () => {
    const input = fakeTty();
    const pending = readHidden(input, capture().out, '> ');
    input.write('abc\u0003');
    await expect(pending).rejects.toBeInstanceOf(PromptCancelled);
    expect(input.rawModes).toEqual([true, false]);
  });

  it('refuses to read from something that is not a terminal', async () => {
    const input = fakeTty(false);
    const { out, text } = capture();
    await expect(readHidden(input, out, '> ')).rejects.toThrow(/not a terminal/);
    expect(text()).toBe('');
  });
});

describe('processTerminal', () => {
  it('is interactive only for a TTY with raw mode', () => {
    expect(processTerminal(fakeTty(true), capture().out).interactive).toBe(true);
    expect(processTerminal(fakeTty(false), capture().out).interactive).toBe(false);
    expect(processTerminal(new PassThrough(), capture().out).interactive).toBe(false);
  });
});
