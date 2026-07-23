import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { User, UserRole } from "@/lib/types";
import { OVERRIDE_USER } from "@/config/mockUser";

// Função para buscar o perfil na tabela `profiles`
const fetchProfile = async (sessionUser: any): Promise<User | null> => {
  if (!sessionUser) return null;
  
  const { data, error } = await supabase
    .from('profiles')
    .select('*, plans(*)')
    .eq('id', sessionUser.id)
    .single();
    
  if (error || !data) {
    console.error("Erro ao buscar perfil (usando fallback):", error?.message);
    const meta = sessionUser.user_metadata || {};
    return {
      email: sessionUser.email || "",
      name: meta.name || "Criador",
      plan: meta.plan || "Free",
      role: (meta.role as UserRole) || "user",
      phone: meta.phone,
      avatarUrl: meta.avatarUrl,
    };
  }
  
  return {
    email: data.email,
    name: data.name || "Criador",
    plan: data.plan || "Free",
    role: (data.role as UserRole) || "user",
    phone: data.phone,
    avatarUrl: data.avatar_url,
    plan_id: data.plan_id,
    credits: data.credits,
    status: data.status,
    is_admin: data.is_admin,
    last_credit_reset: data.last_credit_reset,
    planDetails: data.plans,
  };
};

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (OVERRIDE_USER) {
      setUser(OVERRIDE_USER);
      setReady(true);
      return;
    }

    // Pega a sessão inicial
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(await fetchProfile(session?.user));
      setReady(true);
    });

    // Escuta mudanças (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(await fetchProfile(session?.user));
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
    return await fetchProfile(data.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name,
          plan: "Free",
          role: "user",
        },
      },
    });
    if (error) throw error;
    // Tenta esperar um pouco para dar tempo do trigger rodar (100ms)
    await new Promise(r => setTimeout(r, 100));
    return await fetchProfile(data.user);
  }, []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const updateProfile = useCallback(
    async (patch: { name?: string; phone?: string; avatarUrl?: string }) => {
      if (!user) return null;
      
      const { data: authData } = await supabase.auth.getUser();
      if (!authData.user) return null;

      const { data, error } = await supabase
        .from('profiles')
        .update({
          name: patch.name !== undefined ? patch.name : user.name,
          phone: patch.phone !== undefined ? patch.phone : user.phone,
          avatar_url: patch.avatarUrl !== undefined ? patch.avatarUrl : user.avatarUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', authData.user.id)
        .select('*, plans(*)')
        .single();
      
      if (error) {
        console.error("Error updating profile:", error.message);
        return null;
      }
      
      const updatedUser: User = {
        email: data.email,
        name: data.name || "Criador",
        plan: data.plan || "Free",
        role: (data.role as UserRole) || "user",
        phone: data.phone,
        avatarUrl: data.avatar_url,
        plan_id: data.plan_id,
        credits: data.credits,
        status: data.status,
        is_admin: data.is_admin,
        last_credit_reset: data.last_credit_reset,
        planDetails: data.plans,
      };
      
      setUser(updatedUser);
      return updatedUser;
    },
    [user]
  );

  return {
    user,
    ready,
    isAuthenticated: !!user,
    isAdmin: user?.role === "admin",
    login,
    register,
    logout,
    updateProfile,
  };
}
