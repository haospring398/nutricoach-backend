import { randomBytes } from 'crypto';

/**
 * Build a URL-safe slug from a (possibly Vietnamese) title plus a short
 * random suffix to guarantee uniqueness on duplicate titles.
 *
 *   "10 Thực phẩm giàu protein" → "10-thuc-pham-giau-protein-a1b2"
 *
 * Slugs are immutable after article creation (editing the title does not
 * change the slug) — changing slugs breaks shared links and SEO.
 */
export function slugify(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining diacritics
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 200);
  const suffix = randomBytes(2).toString('hex'); // 4 hex chars
  return base ? `${base}-${suffix}` : suffix;
}

/** Words / 200 wpm, rounded up, floored at 1. */
export function computeReadingTimeMin(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}
