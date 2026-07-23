import { useEffect, useRef, useState } from "react";
import { X, Upload, User as UserIcon } from "lucide-react";
import type { User } from "@/lib/types";

export function EditProfileModal({
  user,
  onClose,
  onSave,
}: {
  user: User;
  onClose: () => void;
  onSave: (patch: { name: string; phone: string; avatarUrl?: string }) => void;
}) {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(user.avatarUrl);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Selecione uma imagem válida.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Imagem muito grande (máx. 2MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAvatarUrl(typeof reader.result === "string" ? reader.result : undefined);
      setError(null);
    };
    reader.readAsDataURL(file);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("O nome é obrigatório.");
      return;
    }
    onSave({ name: name.trim(), phone: phone.trim(), avatarUrl });
  };

  const initial = (name || user.name).charAt(0).toUpperCase();

  return (
    <div
      className="modal-overlay active"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content edit-profile-modal" role="dialog" aria-modal="true">
        <button
          type="button"
          className="modal-close"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={18} />
        </button>
        <h2 className="modal-title">Editar perfil</h2>
        <form onSubmit={submit} className="edit-profile-form">
          <div className="edit-profile-avatar-row">
            <div className="edit-profile-avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" />
              ) : (
                <span>{initial}</span>
              )}
            </div>
            <div className="edit-profile-avatar-actions">
              <button
                type="button"
                className="btn-secondary-sm"
                onClick={() => fileRef.current?.click()}
              >
                <Upload size={14} /> Enviar foto
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  className="btn-text-sm"
                  onClick={() => setAvatarUrl(undefined)}
                >
                  Remover
                </button>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                  e.target.value = "";
                }}
              />
            </div>
          </div>

          <label className="form-label">
            <span>Nome</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Seu nome"
              autoFocus
            />
          </label>

          <label className="form-label">
            <span>E-mail</span>
            <input
              type="email"
              value={user.email}
              readOnly
              disabled
              className="form-input-readonly"
            />
          </label>

          <label className="form-label">
            <span>Telefone</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 99999-9999"
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <div className="edit-profile-actions">
            <button type="button" className="btn-secondary-sm" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary-sm">
              <UserIcon size={14} /> Salvar alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
