## Objetivo

Converter o `index.html` "Super Views X" em um app React no template TanStack Start atual, com componentes bem organizados, mantendo:
- mock de campanhas (array em memória),
- autenticação fake via `localStorage` (`super_views_x_users` + `super_views_x_session`),
- visual idêntico (tema dark + lima `#9EFF2E`, fonte Inter, partículas, marquees, modal de auth, sidebar com colapso, dropdown de perfil, modal de detalhes da campanha, telas "Em breve").

Sem Supabase, sem backend, sem Tailwind novo — manter o CSS original (portado para `src/styles.css`) para preservar 100% da aparência.

## Estrutura de rotas

```
src/routes/
  __root.tsx        (mantém shell + adiciona <link> Google Fonts Inter no head)
  index.tsx         (Landing: navbar + hero + marquees + modal auth; redireciona p/ /dashboard se logado)
  dashboard.tsx     (layout protegido: Sidebar + Topbar + <Outlet />; redireciona p/ / se não logado)
  dashboard.index.tsx        (Campanhas — grid + modal de detalhes)
  dashboard.transcricao.tsx  (Em breve)
  dashboard.hashtag.tsx      (Em breve)
  dashboard.top-players.tsx  (Em breve)
  dashboard.templates.tsx    (Em breve)
```

## Componentes

```
src/components/
  background/
    BackgroundFX.tsx          (.bg-animation + .particles)
  landing/
    LandingNavbar.tsx         (logo, links, botões, menu mobile)
    Hero.tsx                  (badge + título + subtítulo)
    Marquee.tsx               (item arrays items1/items2)
  auth/
    AuthModal.tsx             (tabs login/registro, formulários, erros)
  dashboard/
    Sidebar.tsx               (brand, nav items com TanStack Link, upgrade card, colapso)
    SidebarToggle.tsx
    Topbar.tsx                (título dinâmico + ProfileDropdown)
    ProfileDropdown.tsx
    ComingSoon.tsx            (reutilizado pelas 4 telas)
    CampaignCard.tsx
    CampaignGrid.tsx
    CampaignModal.tsx
  ui/
    Icon.tsx                  (wrapper opcional p/ lucide-react)
```

## Estado e lógica

```
src/lib/
  auth.ts          mockLogin, mockRegister, getSession, setSession, clearSession
                   (mesmas chaves: super_views_x_users / super_views_x_session)
  campaigns.ts     fetchCampaigns() retornando o array mock atual
  types.ts         User, Campaign

src/hooks/
  useAuth.ts       hook com user + login/register/logout, sincroniza localStorage
                   e expõe `isAuthenticated`. Reage a evento `storage`.
  useSidebar.ts    estado collapsed/open (com persistência opcional)
```

Guarda de rotas: a rota `dashboard.tsx` chama `useAuth()` no componente e, se não autenticado, usa `<Navigate to="/" />`. A rota `/` faz o inverso quando há sessão. Nada de loaders com auth (rotas são client-only).

## Estilo

- Copiar todo o CSS do `<style>` do HTML para `src/styles.css`, mantendo as variáveis (`--bg-main`, `--primary-lime`, etc.) e classes existentes (`.landing-navbar`, `.sidebar`, `.campaign-card`, `.modal-overlay`, etc.).
- Remover `display:none` inicial de `.dashboard-container` e o controle baseado em `.active`/`style.display` — visibilidade passa a ser controlada por roteamento React.
- Manter `body{font-family:'Inter'...}`. Importar a fonte via `<link>` em `__root.tsx` (não via `@import` no CSS — restrição do Tailwind v4/Lightning CSS).

## Ícones e assets

- Trocar `unpkg/lucide` por `lucide-react` (instalar via `bun add lucide-react`).
- Logo: a referência `logo superviewx.png` não existe; usar um placeholder textual ("Super Views X" em destaque lima) nos slots de logo (navbar landing, modal auth, sidebar brand). Documentar no código que o asset deve ser substituído depois.

## Mocks mantidos

- Campanhas: array literal idêntico em `campaigns.ts`.
- Usuários: persistidos em `localStorage` chave `super_views_x_users`, formato `{ [email]: { name, password, plan } }`.
- Sessão: `localStorage` chave `super_views_x_session` com `{ email, name, plan }`.

## Não incluído

- Sem Supabase / Lovable Cloud.
- Sem hashing de senha (mock 1:1 com o HTML original).
- Sem implementação real das ferramentas "Em breve".
- Logo PNG real (substituível depois).

## Verificação

- Carregar `/` mostra landing idêntica + marquees rolando.
- Registrar e logar redireciona para `/dashboard` com nome/inicial corretos.
- Recarregar mantém sessão (localStorage).
- Sidebar colapsa, navega entre as 5 telas, "Em breve" aparece nas 4.
- Click em card abre modal de detalhes; logout volta para landing.
