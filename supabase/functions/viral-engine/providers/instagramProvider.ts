import { sociaVaultClient } from "../clients/sociaVaultClient.ts";
import { SocialProvider, ProviderResponse, ViralVideo } from "../types/provider.ts";
import { analyzeViralPotential } from "../analyzers/viralAnalyzer.ts";

export const instagramProvider: SocialProvider = {
  searchByHashtag: async (parsedQuery: string, publishedAfter: string, maxResults: number, minViews: number): Promise<ProviderResponse> => {
    // 1. Fetch Instagram Results
    // The exact endpoint might not use maxResults/minViews exactly the same way, but we request maxResults initially
    const rawData = await sociaVaultClient.fetchInstagramHashtag(parsedQuery, maxResults);
    
    // 2. Extract posts array (SociaVault returns an object of posts in data.posts)
    let rawPosts: any[] = [];
    if (rawData.data && rawData.data.posts) {
      rawPosts = Object.values(rawData.data.posts);
    } else {
      rawPosts = rawData.posts || rawData.data || rawData.items || [];
    }

    // 3. Map to ViralVideo standard interface
    let mappedVideos: ViralVideo[] = rawPosts.map((post: any) => {
      // Mock mapping based on expected Social Vault / BrightData schema
      const views = post.video_view_count || post.play_count || 0;
      const likes = post.like_count || 0;
      const comments = post.comment_count || 0;
      
      return {
        id: post.id || post.shortcode,
        title: post.caption || post.text || "",
        channel: post.owner?.username || post.username || "",
        thumbnail: post.display_url || post.thumbnail_src || post.image_url || "",
        url: post.shortcode ? `https://www.instagram.com/p/${post.shortcode}/` : (post.url || ""),
        description: post.caption || post.text || "",
        publishedAt: post.taken_at_timestamp 
          ? new Date(post.taken_at_timestamp * 1000).toISOString() 
          : (post.created_at || new Date().toISOString()),
        views,
        likes,
        comments,
        duration: post.video_duration ? String(post.video_duration) : "",
        hashtags: post.hashtags || [],
        platform: "instagram",
        viralMetrics: { score: 0, reasons: [] },
      };
    });

    // 3. Filter by minViews
    if (minViews > 0) {
      mappedVideos = mappedVideos.filter(v => v.views >= minViews);
    }

    // 4. Analyze Viral Potential
    const analyzedVideos = mappedVideos.map(analyzeViralPotential);
    analyzedVideos.sort((a, b) => b.viralMetrics.score - a.viralMetrics.score);

    return {
      videos: analyzedVideos,
      meta: { source: "instagram" }
    };
  }
};
