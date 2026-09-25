import { supabase } from "@/lib/supabase";
import { readEdgeFunctionErrorMessage } from "@/lib/edgeFunctionError";

export type SocialPlatform = "tiktok" | "youtube" | "instagram";

export type ConnectedAccount = {
  id: string;
  platform: SocialPlatform;
  platform_user_id: string;
  platform_username: string | null;
  label: string | null;
  connected_at: string;
};

export class SocialAccountsError extends Error {
  constructor(message: string, public code: string) {
    super(message);
    this.name = "SocialAccountsError";
  }
}

export const SocialAccountsService = {
  async listConnected(): Promise<ConnectedAccount[]> {
    const { data, error } = await supabase.rpc("get_my_social_accounts");
    if (error) throw new SocialAccountsError(error.message, "RPC_ERROR");
    return (data || []) as ConnectedAccount[];
  },

  async disconnect(accountId: string): Promise<void> {
    const { error } = await supabase.rpc("disconnect_social_account", { p_account_id: accountId });
    if (error) throw new SocialAccountsError(error.message, "RPC_ERROR");
  },

  async rename(accountId: string, label: string): Promise<void> {
    const { error } = await supabase.rpc("rename_social_account", { p_account_id: accountId, p_label: label });
    if (error) throw new SocialAccountsError(error.message, "RPC_ERROR");
  },

  async getTikTokAuthorizeUrl(): Promise<string> {
    const { data, error } = await supabase.functions.invoke("tiktok-oauth-start", { body: {} });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao iniciar conexão com o TikTok.");
      throw new SocialAccountsError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new SocialAccountsError(data?.message || "Erro ao iniciar conexão com o TikTok.", "UNKNOWN_ERROR");
    }
    return data.authorizeUrl as string;
  },

  async completeTikTokOAuth(code: string, state: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke("tiktok-oauth-callback", {
      body: { code, state },
    });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao concluir a conexão com o TikTok.");
      throw new SocialAccountsError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new SocialAccountsError(data?.message || "Erro ao concluir a conexão com o TikTok.", data?.code || "UNKNOWN_ERROR");
    }
    return data.platformUsername as string;
  },

  async publishToTikTok(accountId: string, videoId: string, start: number, end: number, caption: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke("tiktok-publish", {
      body: { accountId, videoId, start, end, caption },
    });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao publicar no TikTok.");
      throw new SocialAccountsError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new SocialAccountsError(data?.message || "Erro ao publicar no TikTok.", data?.code || "UNKNOWN_ERROR");
    }
    return data.publishId as string;
  },

  async getYoutubeAuthorizeUrl(): Promise<string> {
    const { data, error } = await supabase.functions.invoke("youtube-oauth-start", { body: {} });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao iniciar conexão com o YouTube.");
      throw new SocialAccountsError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new SocialAccountsError(data?.message || "Erro ao iniciar conexão com o YouTube.", "UNKNOWN_ERROR");
    }
    return data.authorizeUrl as string;
  },

  async completeYoutubeOAuth(code: string, state: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke("youtube-oauth-callback", {
      body: { code, state },
    });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao concluir a conexão com o YouTube.");
      throw new SocialAccountsError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new SocialAccountsError(data?.message || "Erro ao concluir a conexão com o YouTube.", data?.code || "UNKNOWN_ERROR");
    }
    return data.platformUsername as string;
  },

  async publishToYoutube(accountId: string, videoId: string, start: number, end: number, caption: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke("youtube-publish", {
      body: { accountId, videoId, start, end, caption },
    });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao publicar no YouTube.");
      throw new SocialAccountsError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new SocialAccountsError(data?.message || "Erro ao publicar no YouTube.", data?.code || "UNKNOWN_ERROR");
    }
    return data.videoId as string;
  },

  async getInstagramAuthorizeUrl(): Promise<string> {
    const { data, error } = await supabase.functions.invoke("instagram-oauth-start", { body: {} });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao iniciar conexão com o Instagram.");
      throw new SocialAccountsError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new SocialAccountsError(data?.message || "Erro ao iniciar conexão com o Instagram.", "UNKNOWN_ERROR");
    }
    return data.authorizeUrl as string;
  },

  async completeInstagramOAuth(code: string, state: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke("instagram-oauth-callback", {
      body: { code, state },
    });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao concluir a conexão com o Instagram.");
      throw new SocialAccountsError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new SocialAccountsError(data?.message || "Erro ao concluir a conexão com o Instagram.", data?.code || "UNKNOWN_ERROR");
    }
    return data.platformUsername as string;
  },

  async publishToInstagram(accountId: string, videoId: string, start: number, end: number, caption: string): Promise<string> {
    const { data, error } = await supabase.functions.invoke("instagram-publish", {
      body: { accountId, videoId, start, end, caption },
    });
    if (error) {
      const message = await readEdgeFunctionErrorMessage(error, "Erro ao publicar no Instagram.");
      throw new SocialAccountsError(message, "FUNCTION_ERROR");
    }
    if (!data?.success) {
      throw new SocialAccountsError(data?.message || "Erro ao publicar no Instagram.", data?.code || "UNKNOWN_ERROR");
    }
    return data.mediaId as string;
  },
};
