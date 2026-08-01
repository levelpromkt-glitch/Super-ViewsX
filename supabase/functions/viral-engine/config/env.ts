export const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) {
    throw new Error(`Environment variable ${key} is not set.`);
  }
  return value;
};

export const env = {
  SOCIAVAULT_API_KEY: Deno.env.get("SOCIAVAULT_API_KEY"),
  SOCIAVAULT_URL: Deno.env.get("SOCIAVAULT_URL"),
  APIFY_API_TOKEN: Deno.env.get("APIFY_API_TOKEN"),
};
