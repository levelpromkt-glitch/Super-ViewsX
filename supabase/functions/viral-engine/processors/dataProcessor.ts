export const processRawVideos = (rawVideos: any[]) => {
  // Remove duplicates
  const uniqueVideos = [];
  const ids = new Set();
  
  for (const v of rawVideos) {
    if (!v.id) continue;
    if (!ids.has(v.id)) {
      ids.add(v.id);
      
      // Extract hashtags from description and title
      const textToSearch = `${v.snippet?.title || ""} ${v.snippet?.description || ""}`;
      const hashtags = extractHashtags(textToSearch);
      
      uniqueVideos.push({
        ...v,
        extractedHashtags: hashtags,
      });
    }
  }
  
  return uniqueVideos;
};

const extractHashtags = (text: string): string[] => {
  if (!text) return [];
  const regex = /#[\w\u0590-\u05ff]+/ig;
  const matches = text.match(regex) || [];
  const uniqueTags = [...new Set(matches.map(t => t.toLowerCase()))];
  return uniqueTags;
};
