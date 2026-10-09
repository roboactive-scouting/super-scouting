/**
 * Where a JSON text goes wrong, as a line and a column and one plain sentence (design 12,
 * "Edit as JSON": "Line 46, column 11: a comma is missing at the end of line 45."). The
 * browser's own message differs between engines and rarely names a line, so a small scanner
 * walks the text the way `JSON.parse` does and stops at the first thing it cannot take.
 * `JSON.parse` stays the judge of what is valid; the scanner only says where.
 */

export type JsonProblem = { index: number; line: number; column: number; message: string };

/** 1-based line and column of a character index. */
export function lineColumn(text: string, index: number): { line: number; column: number } {
  const before = text.slice(0, index);
  const line = before.split('\n').length;
  const column = index - (before.lastIndexOf('\n') + 1) + 1;
  return { line, column };
}

class Stop {
  constructor(
    readonly index: number,
    readonly message: string,
  ) {}
}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

function scan(text: string): Stop | null {
  let i = 0;
  /** Where the last complete value ended: a missing comma is reported against its line. */
  let lastEnd = 0;
  const stop = (at: number, message: string): never => {
    throw new Stop(at, message);
  };
  const ws = () => {
    while (i < text.length && ' \t\n\r'.includes(text[i]!)) i++;
  };
  const lineOf = (index: number) => lineColumn(text, index).line;
  const missingComma = (end: number, closer: string) => {
    if (i >= text.length) stop(i, `the text ends before a ${closer} closes it`);
    if (lineOf(Math.max(0, end - 1)) < lineOf(i)) {
      stop(i, `a comma is missing at the end of line ${lineOf(Math.max(0, end - 1))}`);
    }
    stop(i, 'a comma is missing before this');
  };

  const string = () => {
    const start = i;
    i++;
    for (;;) {
      if (i >= text.length || text[i] === '\n')
        stop(start, 'this text is not closed: a " is missing');
      const c = text[i]!;
      if (c === '"') {
        i++;
        lastEnd = i;
        return;
      }
      if (c === '\\') {
        const next = text[i + 1];
        if (next === undefined || !'"\\/bfnrtu'.includes(next))
          stop(i, 'this backslash starts no known escape');
        i += 2;
        continue;
      }
      i++;
    }
  };

  const value = (): void => {
    ws();
    if (i >= text.length) stop(i, 'the text ends where a value should be');
    const c = text[i]!;
    if (c === '{') return object();
    if (c === '[') return array();
    if (c === '"') return string();
    if (c === '-' || (c >= '0' && c <= '9')) {
      NUMBER.lastIndex = i;
      const match = NUMBER.exec(text);
      if (!match) stop(i, 'this is not a number');
      i += match![0].length;
      lastEnd = i;
      return;
    }
    for (const word of ['true', 'false', 'null']) {
      if (text.startsWith(word, i)) {
        i += word.length;
        lastEnd = i;
        return;
      }
    }
    if (c === "'") stop(i, 'text goes in double quotes, not single ones');
    stop(i, `“${c}” cannot start a value`);
  };

  const object = () => {
    i++;
    ws();
    if (text[i] === '}') {
      i++;
      lastEnd = i;
      return;
    }
    for (;;) {
      ws();
      if (text[i] === '}') stop(i, 'a comma before } has nothing after it');
      if (text[i] !== '"') {
        if (i >= text.length) stop(i, 'the text ends before a } closes it');
        stop(i, 'a name here must be in double quotes');
      }
      string();
      ws();
      if (text[i] !== ':') stop(i, 'a colon is missing after the name');
      i++;
      value();
      const end = lastEnd;
      ws();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === '}') {
        i++;
        lastEnd = i;
        return;
      }
      missingComma(end, '}');
    }
  };

  const array = () => {
    i++;
    ws();
    if (text[i] === ']') {
      i++;
      lastEnd = i;
      return;
    }
    for (;;) {
      ws();
      if (text[i] === ']') stop(i, 'a comma before ] has nothing after it');
      value();
      const end = lastEnd;
      ws();
      if (text[i] === ',') {
        i++;
        continue;
      }
      if (text[i] === ']') {
        i++;
        lastEnd = i;
        return;
      }
      missingComma(end, ']');
    }
  };

  try {
    value();
    ws();
    if (i < text.length) stop(i, 'there is more text after the end');
    return null;
  } catch (e) {
    if (e instanceof Stop) return e;
    throw e;
  }
}

/** The first problem in `text`, or null when it is valid JSON. */
export function jsonProblem(text: string): JsonProblem | null {
  try {
    JSON.parse(text);
    return null;
  } catch (e) {
    const found = scan(text);
    // The scanner takes a little more than JSON does (a control character in a string): then
    // the engine's own position, when it gives one.
    const engine = /position (\d+)/.exec(e instanceof Error ? e.message : '');
    const index = found?.index ?? (engine ? Number(engine[1]) : 0);
    const message = found?.message ?? 'this is not valid JSON';
    return { index, ...lineColumn(text, index), message };
  }
}

/** "Line 46, column 11: a comma is missing at the end of line 45." */
export function problemLine(problem: JsonProblem): string {
  return `Line ${problem.line}, column ${problem.column}: ${problem.message}.`;
}
