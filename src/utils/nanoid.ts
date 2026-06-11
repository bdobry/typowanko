export function nanoid(len = 12) {
  return Math.random().toString(36).slice(2, 2 + len);
}
