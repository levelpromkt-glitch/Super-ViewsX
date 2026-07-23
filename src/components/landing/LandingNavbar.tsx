export function LandingNavbar({ onOpenAuth }: { onOpenAuth: () => void }) {
  return (
    <header className="landing-navbar">
      <a href="#" className="logo-area" onClick={(e) => e.preventDefault()}>
        <img src="/logo.png" alt="Super Views X" className="logo-img" />
      </a>
      <div className="actions">
        <button className="btn-outline" onClick={onOpenAuth}>Entrar</button>
        <button className="btn-primary-nav" onClick={onOpenAuth}>Começar Grátis</button>
      </div>
    </header>
  );
}
