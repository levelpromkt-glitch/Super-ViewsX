import type { User } from "@/lib/types";

/**
 * Usuário mockado temporário.
 *
 * - Use role: "admin" para mostrar/acessar o painel admin.
 * - Use role: "user" para simular usuário comum (sem acesso ao painel admin).
 *
 * Para forçar um usuário durante o desenvolvimento, defina OVERRIDE_USER abaixo.
 * Se OVERRIDE_USER for null, o app usa a sessão real do localStorage (login normal).
 *
 * Quando integrar com Supabase/backend:
 *   - Remover este arquivo (ou manter só como fallback de dev).
 *   - Substituir por sessão real + role vindo do banco (tabela user_roles).
 */

// ---- Usuário admin de teste ----
export const adminUser: User = {
  email: "admin@supervistas.com",
  name: "Administrador",
  plan: "Pro",
  role: "admin",
};

// ---- Usuário comum de teste ----
export const commonUser: User = {
  email: "user@supervistas.com",
  name: "Usuário Comum",
  plan: "Free",
  role: "user",
};

/**
 * Senha do admin mockado (apenas para login local).
 * Trocar por autenticação real no futuro.
 */
export const ADMIN_PASSWORD = "SuperVistas@2026";

/**
 * Para testar rapidamente sem passar pelo login:
 *   - Defina OVERRIDE_USER = adminUser para simular admin.
 *   - Defina OVERRIDE_USER = commonUser para simular usuário comum.
 *   - Deixe como null para usar o fluxo normal de login.
 */
export const OVERRIDE_USER: User | null = null;
