export type UserRole = "admin" | "user";

export interface Plan {
  id: string;
  name: string;
  slug: string;
  description?: string;
  monthly_credits: number;
  max_daily_uploads: number;
  has_ai: boolean;
  has_templates: boolean;
  has_campaigns: boolean;
  has_spy_tool: boolean;
  has_transcription: boolean;
  active: boolean;
}

export interface User {
  email: string;
  name: string;
  plan: string;
  role: UserRole;
  phone?: string;
  avatarUrl?: string;
  
  plan_id?: string;
  credits?: number;
  status?: string;
  is_admin?: boolean;
  last_credit_reset?: string;
  
  planDetails?: Plan;
}

export interface StoredUser {
  name: string;
  password: string;
  plan: string;
  role: UserRole;
  phone?: string;
  avatarUrl?: string;
}

export type CampaignStatus = "Ativa" | "Pausada" | "Encerrada";

export interface Campaign {
  id: string;
  name: string;
  sub: string;
  format: string;
  platforms: string[];
  budget: string;
  promoter: string;
  status: string;
  description: string;
  signupLink: string;
  /**
   * Capa da campanha em base64/data URL (mock).
   * Quando integrar com backend, substituir por URL pública do Storage (ex.: Supabase Storage).
   */
  coverImage?: string;
}
