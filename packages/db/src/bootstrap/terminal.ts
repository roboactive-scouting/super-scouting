import { createInterface } from 'node:readline/promises';
import type { BootstrapTerminal } from './bootstrapAdmin';

export type TerminalInput = NodeJS.ReadableStream & {
  isTTY?: boolean;
  setRawMode?: (mode: boolean) => unknown;
};
export type TerminalOutput = NodeJS.WritableStream;

export class PromptCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'PromptCancelled';
  }
}

// Arrow keys, Home/End and friends arrive as escape sequences; none belong in a password.
// eslint-disable-next-line no-control-regex
const ESCAPE_SEQUENCE = /\u001b\[[0-9;]*[A-Za-z~]/g;

/**
 * Reads one line with echo OFF. Raw mode is the only way: in the terminal's normal
 * (cooked) mode the terminal itself echoes each key before the process sees it, so
 * nothing the process writes can hide it. Writes nothing but the question and a
 * newline — not even a `*` per key, which would print the password's length.
 */
export function readHidden(
  input: TerminalInput,
  output: TerminalOutput,
  question: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      reject(new Error('stdin is not a terminal; cannot read a password without echo'));
      return;
    }
    output.write(question);
    let value = '';
    input.setRawMode(true);
    input.setEncoding('utf8');
    input.resume();

    const finish = (error?: Error) => {
      input.removeListener('data', onData);
      input.setRawMode!(false);
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
    };

    const onData = (chunk: string | Buffer) => {
      for (const ch of String(chunk).replace(ESCAPE_SEQUENCE, '')) {
        if (ch === '\r' || ch === '\n') return finish();
        if (ch === '\u0003') return finish(new PromptCancelled()); // Ctrl+C
        if (ch === '\u007f' || ch === '\b') {
          value = Array.from(value).slice(0, -1).join('');
          continue;
        }
        if (ch < ' ') continue;
        value += ch;
      }
    };
    input.on('data', onData);
  });
}

export function processTerminal(
  input: TerminalInput = process.stdin,
  output: TerminalOutput = process.stdout,
): BootstrapTerminal {
  return {
    interactive: input.isTTY === true && typeof input.setRawMode === 'function',
    say: (line) => {
      output.write(`${line}\n`);
    },
    ask: async (question) => {
      const rl = createInterface({ input, output });
      try {
        return await rl.question(question);
      } finally {
        rl.close();
      }
    },
    askHidden: (question) => readHidden(input, output, question),
  };
}
