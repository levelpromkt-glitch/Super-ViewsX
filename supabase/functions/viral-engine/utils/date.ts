export const parsePeriodToISO = (period: string): string => {
  const now = new Date();
  const match = period.match(/^(\d+)(h|d|m)$/);
  if (!match) return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(); // Default 7d
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  if (unit === 'h') {
    now.setHours(now.getHours() - value);
  } else if (unit === 'd') {
    now.setDate(now.getDate() - value);
  } else if (unit === 'm') {
    now.setMonth(now.getMonth() - value);
  }
  return now.toISOString();
};
