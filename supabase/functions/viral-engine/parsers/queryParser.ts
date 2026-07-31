export const parseQuery = (rawQuery: string, platform?: string): string => {
  if (!rawQuery) return "";
  const trimmed = rawQuery.trim();
  
  // If it's a single word without `#`, add it.
  if (platform === "instagram") {
    let clean = trimmed;
    if (clean.startsWith("#")) {
      clean = clean.substring(1);
    }
    // Instagram hashtags cannot contain spaces or special characters (other than underscore)
    clean = clean.replace(/[^a-zA-Z0-9_]/g, '');
    return clean;
  }

  if (!trimmed.includes(" ") && !trimmed.startsWith("#")) {
    return `#${trimmed}`;
  }
  
  // Otherwise, return exactly as typed
  return trimmed;
};
