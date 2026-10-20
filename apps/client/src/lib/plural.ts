/** "1 field", "3 fields", "2 entries": a count and its noun. */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
