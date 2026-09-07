/**
 * Converts a human-readable string into a URL-safe slug.
 * Normalizes unicode, lowercases, replaces non-alphanumeric characters with
 * hyphens, strips leading/trailing hyphens, and caps length at 60 characters.
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
