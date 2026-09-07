import type { PaginationOptions } from "convex/server";

export const MAX_PAGE_SIZE = 100;
export const FALLBACK_PAGE_SIZE = 25;

/** Bound caller-controlled page sizes and reads, including end-cursor requests. */
export function boundedPagination(
  options: PaginationOptions,
): PaginationOptions {
  if (
    !Number.isSafeInteger(options.numItems) ||
    options.numItems < 1 ||
    options.numItems > MAX_PAGE_SIZE
  ) {
    throw new Error(`Page size must be an integer from 1 to ${MAX_PAGE_SIZE}.`);
  }
  return {
    ...options,
    maximumRowsRead: MAX_PAGE_SIZE,
    maximumBytesRead: 1_000_000,
  };
}
