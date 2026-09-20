import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [{ title: "Política de Privacidade — Super Views X" }],
  }),
  component: PrivacidadePage,
});

function PrivacidadePage() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 80px", lineHeight: 1.7 }}>
      <Link to="/" style={{ color: "var(--primary-lime)", fontSize: ".85rem", textDecoration: "none" }}>
        ← Voltar
      </Link>
      <h1 style={{ fontSize: "2rem", fontWeight: 800, margin: "16px 0 8px" }}>Política de Privacidade</h1>
      <p style={{ color: "var(--text-muted)", fontSize: ".85rem", marginBottom: 32 }}>
        Última atualização: {new Date().toLocaleDateString("pt-BR")}
      </p>

      <p>
        Esta Política de Privacidade explica como o Super Views X ("Plataforma") coleta, usa e protege as
        informações dos usuários.
      </p>

      <h2 style={{ marginTop: 32, fontSize: "1.25rem", fontWeight: 700 }}>1. Dados que coletamos</h2>
      <p>
        Coletamos dados de cadastro (nome, e-mail), dados de uso da Plataforma, vídeos e links enviados para
        processamento, e, quando você opta por conectar uma conta de rede social (ex.: TikTok), os tokens de
        acesso necessários para publicar ou agendar conteúdo em seu nome, além de informações públicas do perfil
        conectado (como nome de usuário).
      </p>

      <h2 style={{ marginTop: 32, fontSize: "1.25rem", fontWeight: 700 }}>2. Como usamos os dados</h2>
      <p>
        Usamos os dados para operar e melhorar o Serviço, processar seus vídeos e transcrições, gerar sugestões de
        cortes com inteligência artificial, e — apenas quando autorizado por você — publicar ou agendar conteúdo nas
        redes sociais conectadas. Não vendemos seus dados pessoais a terceiros.
      </p>

      <h2 style={{ marginTop: 32, fontSize: "1.25rem", fontWeight: 700 }}>3. Tokens de acesso a redes sociais</h2>
      <p>
        Os tokens de autorização (access tokens) de contas de redes sociais conectadas são armazenados de forma
        restrita, acessíveis apenas pelos sistemas internos da Plataforma responsáveis por publicar conteúdo em seu
        nome — nunca são expostos diretamente à interface do usuário. Você pode revogar essa conexão a qualquer
        momento na Plataforma ou diretamente nas configurações da rede social.
      </p>

      <h2 style={{ marginTop: 32, fontSize: "1.25rem", fontWeight: 700 }}>4. Compartilhamento com terceiros</h2>
      <p>
        Compartilhamos dados apenas com provedores necessários para operar o Serviço (ex.: hospedagem, banco de
        dados, processamento de pagamento, e as próprias plataformas de redes sociais quando você autoriza uma
        publicação), e apenas na medida necessária para prestar o Serviço.
      </p>

      <h2 style={{ marginTop: 32, fontSize: "1.25rem", fontWeight: 700 }}>5. Retenção e exclusão</h2>
      <p>
        Mantemos seus dados enquanto sua conta estiver ativa ou conforme necessário para cumprir obrigações legais.
        Você pode solicitar a exclusão da sua conta e dos dados associados a qualquer momento através do suporte.
      </p>

      <h2 style={{ marginTop: 32, fontSize: "1.25rem", fontWeight: 700 }}>6. Segurança</h2>
      <p>
        Adotamos medidas técnicas razoáveis para proteger seus dados contra acesso não autorizado, mas nenhum
        sistema é completamente livre de risco.
      </p>

      <h2 style={{ marginTop: 32, fontSize: "1.25rem", fontWeight: 700 }}>7. Contato</h2>
      <p>
        Dúvidas sobre esta Política podem ser enviadas para o suporte do Super Views X através dos canais indicados
        na Plataforma.
      </p>

      <p style={{ marginTop: 40, fontSize: ".8rem", color: "var(--text-muted)" }}>
        Consulte também nossos{" "}
        <Link to="/termos" style={{ color: "var(--primary-lime)" }}>
          Termos de Serviço
        </Link>
        .
      </p>
    </div>
  );
}
