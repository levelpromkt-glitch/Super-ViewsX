import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [{ title: "Termos de Serviço — Super Views X" }],
  }),
  component: TermosPage,
});

function TermosPage() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 80px", lineHeight: 1.7 }}>
      <Link to="/" style={{ color: "var(--primary-lime)", fontSize: ".85rem", textDecoration: "none" }}>
        ← Voltar
      </Link>
      <h1 style={{ fontSize: "2rem", fontWeight: 800, margin: "16px 0 8px" }}>Termos de Serviço</h1>
      <p style={{ color: "var(--text-muted)", fontSize: ".85rem", marginBottom: 32 }}>
        Última atualização: {new Date().toLocaleDateString("pt-BR")}
      </p>

      <p>
        Estes Termos de Serviço ("Termos") regulam o uso da plataforma Super Views X ("Plataforma", "Serviço"),
        disponibilizada em superviewsx.com.br. Ao criar uma conta ou usar o Serviço, você concorda com estes Termos.
      </p>

      <h2 style={{ marginTop: 32, fontSize: "1.25rem", fontWeight: 700 }}>1. O que é o Serviço</h2>
      <p>
        O Super Views X é uma ferramenta que usa inteligência artificial para analisar vídeos e ajudar criadores de
        conteúdo a identificar, cortar e preparar trechos com potencial de viralização para publicação em redes
        sociais de terceiros (como TikTok, YouTube e Instagram), incluindo, quando o usuário conectar suas contas,
        a publicação e o agendamento de posts diretamente nessas plataformas em nome do usuário.
      </p>

      <h2 style={{ marginTop: 32, fontSize: "1.25rem", fontWeight: 700 }}>2. Conta e conexões com redes sociais</h2>
      <p>
        Ao conectar uma conta de rede social (ex.: TikTok) ao Super Views X, você autoriza a Plataforma a publicar,
        agendar e gerenciar conteúdo em seu nome, dentro do escopo de permissões concedido durante a autorização.
        Você pode revogar esse acesso a qualquer momento, tanto pela Plataforma quanto diretamente nas configurações
        da rede social conectada. Você é o único responsável pelo conteúdo publicado através da sua conta.
      </p>

      <h2 style={{ marginTop: 32, fontSize: "1.25rem", fontWeight: 700 }}>3. Responsabilidade sobre o conteúdo</h2>
      <p>
        Você é responsável por garantir que possui os direitos necessários sobre os vídeos que envia ou processa na
        Plataforma, e por cumprir os termos de uso e diretrizes de conteúdo de cada rede social em que publicar. O
        Super Views X não se responsabiliza por violações de direitos autorais, marcas ou diretrizes de terceiros
        cometidas pelo usuário.
      </p>

      <h2 style={{ marginTop: 32, fontSize: "1.25rem", fontWeight: 700 }}>4. Uso aceitável</h2>
      <p>
        Você concorda em não usar o Serviço para fins ilegais, para violar direitos de terceiros, para distribuir
        conteúdo enganoso, ou para tentar contornar limites técnicos ou de segurança da Plataforma ou das redes
        sociais integradas.
      </p>

      <h2 style={{ marginTop: 32, fontSize: "1.25rem", fontWeight: 700 }}>5. Planos, créditos e pagamentos</h2>
      <p>
        Alguns recursos da Plataforma podem exigir uma assinatura paga ou consumo de créditos, conforme descrito nas
        páginas de planos do Serviço. Os valores e condições vigentes são sempre os exibidos no momento da
        contratação.
      </p>

      <h2 style={{ marginTop: 32, fontSize: "1.25rem", fontWeight: 700 }}>6. Disponibilidade e alterações</h2>
      <p>
        O Serviço é fornecido "como está". Podemos alterar, suspender ou descontinuar funcionalidades a qualquer
        momento, e podemos atualizar estes Termos periodicamente. O uso continuado da Plataforma após uma alteração
        implica aceitação dos novos Termos.
      </p>

      <h2 style={{ marginTop: 32, fontSize: "1.25rem", fontWeight: 700 }}>7. Contato</h2>
      <p>
        Dúvidas sobre estes Termos podem ser enviadas para o suporte do Super Views X através dos canais indicados na
        Plataforma.
      </p>

      <p style={{ marginTop: 40, fontSize: ".8rem", color: "var(--text-muted)" }}>
        Consulte também nossa{" "}
        <Link to="/privacidade" style={{ color: "var(--primary-lime)" }}>
          Política de Privacidade
        </Link>
        .
      </p>
    </div>
  );
}
