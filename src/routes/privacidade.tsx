import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [{ title: "Política de Privacidade — Super Views X" }],
  }),
  component: PrivacidadePage,
});

const UPDATED_AT = "5 de outubro de 2026";

const h2 = { marginTop: 32, fontSize: "1.25rem", fontWeight: 700 } as const;
const h3 = { marginTop: 20, fontSize: "1.05rem", fontWeight: 700 } as const;
const link = { color: "var(--primary-lime)" } as const;

function PrivacidadePage() {
  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: "48px 24px 80px", lineHeight: 1.7 }}>
      <Link to="/" style={{ color: "var(--primary-lime)", fontSize: ".85rem", textDecoration: "none" }}>
        ← Voltar
      </Link>
      <h1 style={{ fontSize: "2rem", fontWeight: 800, margin: "16px 0 8px" }}>Política de Privacidade</h1>
      <p style={{ color: "var(--text-muted)", fontSize: ".85rem", marginBottom: 32 }}>Última atualização: {UPDATED_AT}</p>

      <p>
        Esta Política de Privacidade explica como o Super Views X ("Plataforma", disponível em superviewsx.com.br)
        coleta, usa, armazena e protege as informações dos usuários, incluindo as informações recebidas das redes
        sociais que você conecta (YouTube/Google, TikTok e Instagram).
      </p>

      <h2 style={h2}>1. Dados que coletamos</h2>
      <ul>
        <li>Dados de cadastro: nome e e-mail.</li>
        <li>Dados de uso da Plataforma e de pagamento (processados por provedor de pagamento terceirizado).</li>
        <li>Vídeos, links e transcrições que você envia para processamento.</li>
        <li>
          Conteúdo dos posts que você cria na Plataforma: legendas, títulos, descrições, opções de publicação, data de
          agendamento e as contas escolhidas.
        </li>
        <li>
          Dados das contas de redes sociais que você conecta, descritos na seção 3. A conexão é sempre uma ação sua e
          voluntária.
        </li>
      </ul>

      <h2 style={h2}>2. Como usamos os dados</h2>
      <p>
        Usamos os dados para operar e melhorar o Serviço, processar seus vídeos e transcrições, gerar sugestões de
        cortes com inteligência artificial e — apenas quando você solicita — publicar ou agendar conteúdo nas contas
        conectadas e exibir o desempenho dessas contas. Não vendemos seus dados pessoais, não os usamos para
        publicidade e não os transferimos a terceiros para fins que não sejam a prestação do Serviço.
      </p>

      <h2 style={h2}>3. Dados recebidos das redes sociais conectadas</h2>
      <p>
        Só acessamos uma conta depois que você a autoriza na própria rede social, e apenas com as permissões listadas
        abaixo. Usamos essas informações exclusivamente para as finalidades descritas aqui.
      </p>

      <h3 style={h3}>3.1 YouTube e Google</h3>
      <p>
        O Super Views X usa os serviços de API do YouTube. Ao conectar seu canal, você concorda também com os{" "}
        <a href="https://www.youtube.com/t/terms" target="_blank" rel="noopener noreferrer" style={link}>
          Termos de Serviço do YouTube
        </a>{" "}
        e com a{" "}
        <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" style={link}>
          Política de Privacidade do Google
        </a>
        .
      </p>
      <ul>
        <li>
          <strong>youtube.upload</strong>: enviar vídeos ao seu canal quando você pede (publicação imediata ou
          agendada), com o título, a descrição e a visibilidade que você escolheu.
        </li>
        <li>
          <strong>youtube.readonly</strong>: identificar o canal conectado (identificador e nome) e ler as
          estatísticas públicas dos seus vídeos (como visualizações) para montar o painel de Desempenho.
        </li>
      </ul>
      <p>
        O uso e a transferência, para qualquer outro app, de informações recebidas das APIs do Google seguirão a{" "}
        <a
          href="https://developers.google.com/terms/api-services-user-data-policy"
          target="_blank"
          rel="noopener noreferrer"
          style={link}
        >
          Política de Dados do Usuário dos Serviços de API do Google
        </a>
        , incluindo os requisitos de Uso Limitado. Você pode revogar o acesso do Super Views X a qualquer momento em{" "}
        <a href="https://security.google.com/settings/security/permissions" target="_blank" rel="noopener noreferrer" style={link}>
          security.google.com/settings/security/permissions
        </a>
        .
      </p>

      <h3 style={h3}>3.2 TikTok</h3>
      <ul>
        <li>
          <strong>user.info.basic</strong>: identificar a conta conectada (identificador e nome de usuário).
        </li>
        <li>
          <strong>video.publish</strong>: publicar vídeos na sua conta quando você pede, com a legenda e as opções de
          privacidade e interação que você escolheu.
        </li>
        <li>
          <strong>video.list</strong>: ler a lista e as métricas dos seus vídeos (como visualizações) para o painel
          de Desempenho.
        </li>
      </ul>
      <p>
        Você pode revogar o acesso nas configurações de segurança e permissões de apps da sua conta do TikTok.
      </p>

      <h3 style={h3}>3.3 Instagram (Meta)</h3>
      <ul>
        <li>
          <strong>instagram_business_basic</strong>: identificar a conta profissional conectada.
        </li>
        <li>
          <strong>instagram_business_content_publish</strong>: publicar Reels na sua conta quando você pede, com a
          legenda e as marcações que você definiu.
        </li>
        <li>
          <strong>instagram_business_manage_insights</strong>: ler métricas dos seus posts para o painel de
          Desempenho.
        </li>
      </ul>
      <p>Você pode revogar o acesso em Configurações do Instagram, na área de apps e sites.</p>

      <h2 style={h2}>4. Tokens de acesso</h2>
      <p>
        Os tokens de autorização das contas conectadas ficam armazenados em nosso banco de dados com acesso restrito
        aos sistemas internos responsáveis por publicar e sincronizar o desempenho; nunca são exibidos na interface
        nem enviados ao seu navegador. Podemos renovar os tokens automaticamente enquanto a conexão estiver ativa.
      </p>

      <h2 style={h2}>5. Compartilhamento com terceiros</h2>
      <p>
        Compartilhamos dados apenas com provedores necessários para operar o Serviço (hospedagem, banco de dados,
        armazenamento de arquivos, processamento de vídeo e de transcrição, inteligência artificial e processamento de
        pagamento) e com as próprias redes sociais, quando você autoriza uma publicação, e apenas na medida
        necessária para prestar o Serviço.
      </p>

      <h2 style={h2}>6. Retenção e exclusão</h2>
      <ul>
        <li>
          <strong>Desconectar uma conta</strong> (em Configurações &gt; Contas conectadas) apaga imediatamente os
          tokens de acesso dessa conta e as métricas de desempenho que guardamos dela. Posts já criados continuam no
          seu histórico, sem vínculo com a conta removida.
        </li>
        <li>
          <strong>Excluir sua conta e seus dados</strong>: você pode solicitar a exclusão completa a qualquer momento
          pelo contato indicado abaixo. Removeremos seus dados, vídeos enviados e conexões, exceto o que formos
          obrigados a manter por lei.
        </li>
        <li>
          As métricas das redes sociais são atualizadas periodicamente enquanto a conta estiver conectada, e deixam de
          ser guardadas quando você desconecta ou revoga o acesso.
        </li>
        <li>Vídeos enviados para publicação ou edição ficam armazenados enquanto sua conta existir, ou até você solicitar a exclusão.</li>
      </ul>

      <h2 style={h2}>7. Seus direitos</h2>
      <p>
        Conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você pode solicitar acesso, correção,
        portabilidade e exclusão dos seus dados, e revogar consentimentos, a qualquer momento.
      </p>

      <h2 style={h2}>8. Segurança</h2>
      <p>
        Adotamos medidas técnicas razoáveis para proteger seus dados contra acesso não autorizado, mas nenhum sistema
        é completamente livre de risco.
      </p>

      <h2 style={h2}>9. Contato</h2>
      <p>
        Dúvidas sobre esta Política, pedidos de exclusão de dados e exercício de direitos podem ser enviados ao
        suporte do Super Views X através dos canais indicados na Plataforma.
      </p>

      <p style={{ marginTop: 40, fontSize: ".8rem", color: "var(--text-muted)" }}>
        Consulte também nossos{" "}
        <Link to="/termos" style={link}>
          Termos de Serviço
        </Link>
        .
      </p>
    </div>
  );
}
