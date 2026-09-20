import { supabase } from "@/lib/supabase";
import { readEdgeFunctionErrorMessage } from "@/lib/edgeFunctionError";

export type SocialPlatform = "tiktok" | "youtube" | "instagram";

export type ConnectedAccount = {
  platform: SocialPlatform;
  platform_username: string | null;
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

  async disconnect(platform: SocialPlatform): Promise<void> {
    const { error } = await supabase.rpc("disconnect_social_account", { p_platform: platform });
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
};
