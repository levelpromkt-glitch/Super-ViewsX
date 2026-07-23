export const parseQuery = (rawQuery: string): string => {
  if (!rawQuery) return "";
  const trimmed = rawQuery.trim();
  
  // If it's a single word without `#`, add it.
  if (!trimmed.includes(" ") && !trimmed.startsWith("#")) {
    return `#${trimmed}`;
  }
  
  // Otherwise, return exactly as typed
  return trimmed;
};
