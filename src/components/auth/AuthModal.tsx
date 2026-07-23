import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";

type Tab = "login" | "register";

export function AuthModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<Tab>("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regError, setRegError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setTab("login");
      setLoginError("");
      setRegError("");
    }
  }, [open]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError("Preencha todos os campos.");
      return;
    }
    try {
      setIsLoading(true);
      setLoginError("");
      await login(loginEmail.trim(), loginPassword.trim());
      onSuccess();
    } catch (err: any) {
      if (err.message === "Invalid login credentials") {
        setLoginError("E-mail ou senha incorretos.");
      } else {
        setLoginError(err.message || "Erro ao fazer login.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) {
      setRegError("Preencha todos os campos.");
      return;
    }
    try {
      setIsLoading(true);
      setRegError("");
      await register(regName.trim(), regEmail.trim(), regPassword.trim());
      onSuccess();
    } catch (err: any) {
      if (err.message === "User already registered") {
        setRegError("Este e-mail já está cadastrado.");
      } else {
        setRegError(err.message || "Erro ao criar conta.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className={`modal-overlay${open ? " active" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box">
        <div className="modal-header">
          <img src="/logo.png" alt="Super Views X" className="logo-img" />
          <button className="modal-close" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>
        <div className="auth-tabs">
          <button
            className={`auth-tab${tab === "login" ? " active" : ""}`}
            onClick={() => setTab("login")}
            type="button"
          >
            Entrar
          </button>
          <button
            className={`auth-tab${tab === "register" ? " active" : ""}`}
            onClick={() => setTab("register")}
            type="button"
          >
            Criar conta
          </button>
        </div>

        {tab === "login" ? (
          <form className="auth-form" onSubmit={handleLogin}>
            <div className="form-group">
              <label>E-mail</label>
              <input
                type="email"
                placeholder="seu@email.com"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Senha</label>
              <input
                type="password"
                placeholder="••••••••"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-submit" disabled={isLoading}>
              {isLoading ? "Entrando..." : "Entrar"}
            </button>
            <div className="auth-error">{loginError}</div>
          </form>
        ) : (
          <form className="auth-form" onSubmit={handleRegister}>
            <div className="form-group">
              <label>Nome</label>
              <input
                type="text"
                placeholder="Seu nome"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>E-mail</label>
              <input
                type="email"
                placeholder="seu@email.com"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                required
              />
            </div>
            <div className="form-group">
              <label>Senha</label>
              <input
                type="password"
                placeholder="••••••••"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-submit" disabled={isLoading}>
              {isLoading ? "Criando..." : "Criar conta gratuita"}
            </button>
            <div className="auth-error">{regError}</div>
          </form>
        )}
      </div>
    </div>
  );
}
