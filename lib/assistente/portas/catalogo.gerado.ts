// Arquivo gerado por scripts/gerar-catalogo-de-portas.ts. NAO EDITE.
// Rode pnpm portas:gerar para regenerar apos adicionar/remover rotas.

import type { Metodo, PortaDoCatalogo } from "./tipos";

// Todas as portas do catalogo (inclusive as proibidas, para a regra
// poder recusar por nome).
export const CATALOGO_DE_PORTAS: readonly PortaDoCatalogo[] = [
  {
    id: "admin/audit",
    caminho: "admin/audit",
    metodos: ["GET"],
    parametros: [],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/audit/:entryId",
    caminho: "admin/audit/[entryId]",
    metodos: ["GET"],
    parametros: ["entryId"],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/cobranca/conexao",
    caminho: "admin/cobranca/conexao",
    metodos: ["POST"],
    parametros: [],
    area: "admin",
    resumo: "POST /api/v1/admin/cobranca/conexao — a ÚNICA escritora do provedor e das\n credenciais da cobrança (spec da cobrança do revendedor §7a, §10).",
  },
  {
    id: "admin/cobranca/planos",
    caminho: "admin/cobranca/planos",
    metodos: ["POST"],
    parametros: [],
    area: "admin",
    resumo: "POST /api/v1/admin/cobranca/planos — o dono da instalação cria um plano de\n cobrança (spec da cobrança do revendedor §2.2, §7g).",
  },
  {
    id: "admin/cobranca/planos/:id",
    caminho: "admin/cobranca/planos/[id]",
    metodos: ["PATCH"],
    parametros: ["id"],
    area: "admin",
    resumo: "PATCH /api/v1/admin/cobranca/planos/[id] — editar, marcar como plano do\n cadastro, arquivar e desarquivar (spec da cobrança do revendedor §2.2, §7g).",
  },
  {
    id: "admin/cobranca/regua",
    caminho: "admin/cobranca/regua",
    metodos: ["PATCH"],
    parametros: [],
    area: "admin",
    resumo: "PATCH /api/v1/admin/cobranca/regua — a única escritora de\n `COBRANCA_TOLERANCIA_DIAS` (spec da cobrança do revendedor §7g, §10, D-5).",
  },
  {
    id: "admin/dashboard/kpis",
    caminho: "admin/dashboard/kpis",
    metodos: ["GET"],
    parametros: [],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/impersonate/end",
    caminho: "admin/impersonate/end",
    metodos: ["POST"],
    parametros: [],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/inbox/conversations",
    caminho: "admin/inbox/conversations",
    metodos: ["GET"],
    parametros: [],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/inbox/conversations/:id",
    caminho: "admin/inbox/conversations/[id]",
    metodos: ["GET"],
    parametros: ["id"],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/incidents",
    caminho: "admin/incidents",
    metodos: ["GET"],
    parametros: [],
    area: "admin",
    resumo: "GET /api/v1/admin/incidents (S-11.11)\n  Lists incidents cross-tenant.",
  },
  {
    id: "admin/incidents/:id",
    caminho: "admin/incidents/[id]",
    metodos: ["GET"],
    parametros: ["id"],
    area: "admin",
    resumo: "GET /api/v1/admin/incidents/[id] (S-11.11)\n  Returns incident detail + tenant info + audit trail.",
  },
  {
    id: "admin/incidents/:id/resolve",
    caminho: "admin/incidents/[id]/resolve",
    metodos: ["POST"],
    parametros: ["id"],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/lgpd/requests",
    caminho: "admin/lgpd/requests",
    metodos: ["GET"],
    parametros: [],
    area: "admin",
    resumo: "GET /api/v1/admin/lgpd/requests\n  Cross-tenant list of lgpd_requests — platform admin only.",
  },
  {
    id: "admin/lgpd/requests/:id",
    caminho: "admin/lgpd/requests/[id]",
    metodos: ["GET"],
    parametros: ["id"],
    area: "admin",
    resumo: "GET /api/v1/admin/lgpd/requests/[id]\n  Detail of a single lgpd_request cross-tenant — platform admin only.",
  },
  {
    id: "admin/platform-admins",
    caminho: "admin/platform-admins",
    metodos: ["GET"],
    parametros: [],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/tenants",
    caminho: "admin/tenants",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/tenants/:id",
    caminho: "admin/tenants/[id]",
    metodos: ["GET", "PATCH"],
    parametros: ["id"],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/tenants/:id/agents",
    caminho: "admin/tenants/[id]/agents",
    metodos: ["GET"],
    parametros: ["id"],
    area: "admin",
    resumo: "O agente publicado de um tenant — a única leitura que faltava para a carteira.",
  },
  {
    id: "admin/tenants/:id/assinatura",
    caminho: "admin/tenants/[id]/assinatura",
    metodos: ["POST", "PATCH", "DELETE"],
    parametros: ["id"],
    area: "admin",
    resumo: "/api/v1/admin/tenants/[id]/assinatura — o dono da instalação decide se esta\n empresa paga, e por qual plano (spec da cobrança do revendedor §7g).",
  },
  {
    id: "admin/tenants/:id/assinatura/checkout",
    caminho: "admin/tenants/[id]/assinatura/checkout",
    metodos: ["POST"],
    parametros: ["id"],
    area: "admin",
    resumo: "POST /api/v1/admin/tenants/[id]/assinatura/checkout — \"Gerar link de\n pagamento\" (spec da cobrança do revendedor §7g, D-15).",
  },
  {
    id: "admin/tenants/:id/assinatura/prazo",
    caminho: "admin/tenants/[id]/assinatura/prazo",
    metodos: ["POST"],
    parametros: ["id"],
    area: "admin",
    resumo: "POST /api/v1/admin/tenants/[id]/assinatura/prazo — \"Dar prazo até DD/MM\"\n (spec da cobrança do revendedor §7g, D-6).",
  },
  {
    id: "admin/tenants/:id/delete",
    caminho: "admin/tenants/[id]/delete",
    metodos: ["POST"],
    parametros: ["id"],
    area: "admin",
    resumo: "POST /api/v1/admin/tenants/[id]/delete — exclusão DEFINITIVA de um tenant.",
  },
  {
    id: "admin/tenants/:id/health",
    caminho: "admin/tenants/[id]/health",
    metodos: ["GET"],
    parametros: ["id"],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/tenants/:id/impersonate",
    caminho: "admin/tenants/[id]/impersonate",
    metodos: ["POST"],
    parametros: ["id"],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/tenants/:id/members",
    caminho: "admin/tenants/[id]/members",
    metodos: ["GET"],
    parametros: ["id"],
    area: "admin",
    resumo: "GET /api/v1/admin/tenants/[id]/members — quem pertence ao tenant, com o\n e-mail de LOGIN de cada pessoa.",
  },
  {
    id: "admin/tenants/:id/members/:userId/email",
    caminho: "admin/tenants/[id]/members/[userId]/email",
    metodos: ["PATCH"],
    parametros: ["id", "userId"],
    area: "admin",
    resumo: "PATCH /api/v1/admin/tenants/[id]/members/[userId]/email — o admin da\n plataforma corrige o e-mail de LOGIN de um membro do tenant.",
  },
  {
    id: "admin/tenants/:id/reactivate",
    caminho: "admin/tenants/[id]/reactivate",
    metodos: ["POST"],
    parametros: ["id"],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/tenants/:id/suspend",
    caminho: "admin/tenants/[id]/suspend",
    metodos: ["POST"],
    parametros: ["id"],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/tenants/export",
    caminho: "admin/tenants/export",
    metodos: ["GET"],
    parametros: [],
    area: "admin",
    resumo: "GET /api/v1/admin/tenants/export — o inventário das instalações em CSV\n (issue #2777).",
  },
  {
    id: "admin/usage",
    caminho: "admin/usage",
    metodos: ["GET"],
    parametros: [],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/users",
    caminho: "admin/users",
    metodos: ["GET"],
    parametros: [],
    area: "admin",
    resumo: "",
  },
  {
    id: "admin/users/:id",
    caminho: "admin/users/[id]",
    metodos: ["GET"],
    parametros: ["id"],
    area: "admin",
    resumo: "",
  },
  {
    id: "ads/meta/accounts",
    caminho: "ads/meta/accounts",
    metodos: ["GET"],
    parametros: [],
    area: "ads",
    resumo: "GET /api/v1/ads/meta/accounts — as contas de anúncio que o token alcança.",
  },
  {
    id: "ads/meta/campaigns",
    caminho: "ads/meta/campaigns",
    metodos: ["GET"],
    parametros: [],
    area: "ads",
    resumo: "GET /api/v1/ads/meta/campaigns — a tabela de campanhas do período.",
  },
  {
    id: "agenda/agendamentos",
    caminho: "agenda/agendamentos",
    metodos: ["GET", "POST", "PATCH", "DELETE"],
    parametros: [],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/agendamentos/:id",
    caminho: "agenda/agendamentos/[id]",
    metodos: ["GET"],
    parametros: ["id"],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/agendamentos/:id/google/meet/deliver",
    caminho: "agenda/agendamentos/[id]/google/meet/deliver",
    metodos: ["POST"],
    parametros: ["id"],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/agendamentos/:id/google/meet/resend",
    caminho: "agenda/agendamentos/[id]/google/meet/resend",
    metodos: ["POST"],
    parametros: ["id"],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/agendamentos/:id/google/meet/retry",
    caminho: "agenda/agendamentos/[id]/google/meet/retry",
    metodos: ["POST"],
    parametros: ["id"],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/agendamentos/:id/google/resolver",
    caminho: "agenda/agendamentos/[id]/google/resolver",
    metodos: ["POST"],
    parametros: ["id"],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/agendamentos/:id/google/retry",
    caminho: "agenda/agendamentos/[id]/google/retry",
    metodos: ["POST"],
    parametros: ["id"],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/configuracao",
    caminho: "agenda/configuracao",
    metodos: ["GET", "PATCH"],
    parametros: [],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/enderecos",
    caminho: "agenda/enderecos",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/excecoes",
    caminho: "agenda/excecoes",
    metodos: ["GET", "POST", "DELETE"],
    parametros: [],
    area: "agenda",
    resumo: "BLOQUEAR UM DIA — a porta que faltava para uma tabela que já era respeitada.",
  },
  {
    id: "agenda/google/calendarios",
    caminho: "agenda/google/calendarios",
    metodos: ["GET", "PATCH"],
    parametros: [],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/google/calendarios/atualizar",
    caminho: "agenda/google/calendarios/atualizar",
    metodos: ["POST"],
    parametros: [],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/google/callback",
    caminho: "agenda/google/callback",
    metodos: ["GET"],
    parametros: [],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/google/connect",
    caminho: "agenda/google/connect",
    metodos: ["GET"],
    parametros: [],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/google/desconectar",
    caminho: "agenda/google/desconectar",
    metodos: ["DELETE"],
    parametros: [],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/horarios-livres",
    caminho: "agenda/horarios-livres",
    metodos: ["GET"],
    parametros: [],
    area: "agenda",
    resumo: "GET /api/v1/agenda/horarios-livres — os horários que dá para oferecer.",
  },
  {
    id: "agenda/pessoas",
    caminho: "agenda/pessoas",
    metodos: ["GET"],
    parametros: [],
    area: "agenda",
    resumo: "GET /api/v1/agenda/pessoas — quem tem agenda, para a Agenda listar as pessoas.",
  },
  {
    id: "agenda/tipos",
    caminho: "agenda/tipos",
    metodos: ["GET", "POST", "PATCH", "DELETE"],
    parametros: [],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/tipos/reativar",
    caminho: "agenda/tipos/reativar",
    metodos: ["POST"],
    parametros: [],
    area: "agenda",
    resumo: "",
  },
  {
    id: "agenda/vinculos",
    caminho: "agenda/vinculos",
    metodos: ["GET"],
    parametros: [],
    area: "agenda",
    resumo: "",
  },
  {
    id: "ai/agents",
    caminho: "ai/agents",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/agents/:id",
    caminho: "ai/agents/[id]",
    metodos: ["GET", "PATCH", "DELETE"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/agents/:id/duplicate",
    caminho: "ai/agents/[id]/duplicate",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/agents/:id/pause",
    caminho: "ai/agents/[id]/pause",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/agents/:id/proposals",
    caminho: "ai/agents/[id]/proposals",
    metodos: ["GET"],
    parametros: ["id"],
    area: "ai",
    resumo: "Épico Operação Visível (F3) — GET: propostas do flywheel da org para a tela\n do agente (pendentes e aplicadas; a UI mostra o diff e o botão de aplicar).",
  },
  {
    id: "ai/agents/:id/proposals/:pid/apply",
    caminho: "ai/agents/[id]/proposals/[pid]/apply",
    metodos: ["POST"],
    parametros: ["id", "pid"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/agents/:id/publish",
    caminho: "ai/agents/[id]/publish",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/agents/:id/reconcile",
    caminho: "ai/agents/[id]/reconcile",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/agents/:id/runs",
    caminho: "ai/agents/[id]/runs",
    metodos: ["GET"],
    parametros: ["id"],
    area: "ai",
    resumo: "GET /api/v1/ai/agents/:id/runs (manager+) — as execuções DESTE agente.",
  },
  {
    id: "ai/agents/:id/tool-usage",
    caminho: "ai/agents/[id]/tool-usage",
    metodos: ["GET"],
    parametros: ["id"],
    area: "ai",
    resumo: "GET /api/v1/ai/agents/:id/tool-usage (manager+)\n  O que cada capacidade do agente andou fazendo: quantas vezes foi usada,\n quantas falharam, quantas vieram de teste e quando foi a última vez.",
  },
  {
    id: "ai/agents/:id/versions",
    caminho: "ai/agents/[id]/versions",
    metodos: ["GET", "POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/agents/:id/versions/:vid",
    caminho: "ai/agents/[id]/versions/[vid]",
    metodos: ["GET", "PATCH"],
    parametros: ["id", "vid"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/agents/:id/versions/:vid/test",
    caminho: "ai/agents/[id]/versions/[vid]/test",
    metodos: ["POST"],
    parametros: ["id", "vid"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/agents/assignable",
    caminho: "ai/agents/assignable",
    metodos: ["GET"],
    parametros: [],
    area: "ai",
    resumo: "GET /api/v1/ai/agents/assignable — destinos de atribuição que são AGENTES\n (CRM Vivo Wave 1 / migration 0070): o par de /api/v1/team/assignable, que\n lista os humanos.",
  },
  {
    id: "ai/assistente/auditoria",
    caminho: "ai/assistente/auditoria",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "ai",
    resumo: "GET/POST /api/v1/ai/assistente/auditoria — F3: auditoria da configuração da empresa.",
  },
  {
    id: "ai/assistente/chat",
    caminho: "ai/assistente/chat",
    metodos: ["POST"],
    parametros: [],
    area: "ai",
    resumo: "POST /api/v1/ai/assistente/chat — turno de leitura do assistente interno (F1b).",
  },
  {
    id: "ai/assistente/propostas",
    caminho: "ai/assistente/propostas",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "ai",
    resumo: "GET/POST /api/v1/ai/assistente/propostas — a fila de propostas do assistente\n (GET, T20) e o registro de UMA proposta `pendente` (POST, T19).",
  },
  {
    id: "ai/assistente/propostas/:id/aplicar",
    caminho: "ai/assistente/propostas/[id]/aplicar",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "POST /api/v1/ai/assistente/propostas/[id]/aplicar — o CORAÇÃO da T20 (F2b).",
  },
  {
    id: "ai/assistente/propostas/:id/aprovar",
    caminho: "ai/assistente/propostas/[id]/aprovar",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "POST /api/v1/ai/assistente/propostas/[id]/aprovar — o clique do administrador\n (F2b, T20): `pendente → aprovada`, com carimbo de QUEM e QUANDO decidiu.",
  },
  {
    id: "ai/assistente/propostas/:id/rejeitar",
    caminho: "ai/assistente/propostas/[id]/rejeitar",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "POST /api/v1/ai/assistente/propostas/[id]/rejeitar — o \"não\" do administrador\n (F2b, T20): `pendente → rejeitada`, com carimbo de decisão e o motivo\n opcional (≤1000 caracteres) gravado em `decision_reason` — insumo\n estruturado do laço de retorno (F4), não texto de trilha.",
  },
  {
    id: "ai/assistente/threads",
    caminho: "ai/assistente/threads",
    metodos: ["GET"],
    parametros: [],
    area: "ai",
    resumo: "GET /api/v1/ai/assistente/threads — lista pelo cliente de SESSÃO (vale a RLS).",
  },
  {
    id: "ai/assistente/threads/:id/messages",
    caminho: "ai/assistente/threads/[id]/messages",
    metodos: ["GET"],
    parametros: ["id"],
    area: "ai",
    resumo: "GET /api/v1/ai/assistente/threads/[id]/messages — histórico pelo cliente de\n SESSÃO (vale a RLS).",
  },
  {
    id: "ai/assistente/transcrever",
    caminho: "ai/assistente/transcrever",
    metodos: ["POST"],
    parametros: [],
    area: "ai",
    resumo: "POST /api/v1/ai/assistente/transcrever — o áudio do campo do chat vira texto.",
  },
  {
    id: "ai/automatico-ativo",
    caminho: "ai/automatico-ativo",
    metodos: ["GET"],
    parametros: [],
    area: "ai",
    resumo: "GET /api/v1/ai/automatico-ativo — existe atendimento automático nesta org?\n  ## Por que uma rota só para isto\n  O selo de comando do Inbox dizia \"Automático atendendo\" em toda conversa sem\n dono e sem trava — **sem saber se existe algum automático**.",
  },
  {
    id: "ai/budget",
    caminho: "ai/budget",
    metodos: ["GET", "PATCH"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/cases",
    caminho: "ai/cases",
    metodos: ["GET"],
    parametros: [],
    area: "ai",
    resumo: "GET /api/v1/ai/cases — lista os casos humanos da org (spec 15 §7, Wave 5).",
  },
  {
    id: "ai/cases/:id",
    caminho: "ai/cases/[id]",
    metodos: ["GET"],
    parametros: ["id"],
    area: "ai",
    resumo: "GET /api/v1/ai/cases/:id — detalhe do caso + timeline (spec 15 §7, Wave 5).",
  },
  {
    id: "ai/cases/:id/chat",
    caminho: "ai/cases/[id]/chat",
    metodos: ["GET", "POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "GET/POST /api/v1/ai/cases/:id/chat — a consulta interna da equipe à IA que\n ABRIU o caso (migration 0281).",
  },
  {
    id: "ai/cases/:id/reply",
    caminho: "ai/cases/[id]/reply",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/cases/alerta",
    caminho: "ai/cases/alerta",
    metodos: ["GET", "PUT"],
    parametros: [],
    area: "ai",
    resumo: "GET/PUT /api/v1/ai/cases/alerta — a configuração do aviso de caso no WhatsApp\n da equipe (migration 0292).",
  },
  {
    id: "ai/cases/alerta/teste",
    caminho: "ai/cases/alerta/teste",
    metodos: ["POST"],
    parametros: [],
    area: "ai",
    resumo: "POST /api/v1/ai/cases/alerta/teste — \"enviar aviso de teste\".",
  },
  {
    id: "ai/credentials",
    caminho: "ai/credentials",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/credentials/:id",
    caminho: "ai/credentials/[id]",
    metodos: ["PATCH", "DELETE"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/credentials/:id/revalidate",
    caminho: "ai/credentials/[id]/revalidate",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/credentials/test",
    caminho: "ai/credentials/test",
    metodos: ["POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/evolution",
    caminho: "ai/evolution",
    metodos: ["GET"],
    parametros: [],
    area: "ai",
    resumo: "GET /api/v1/ai/evolution — o Painel de Evolução da IA (Fase 4 do Harness).",
  },
  {
    id: "ai/followup-flows",
    caminho: "ai/followup-flows",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/followup-flows/:id",
    caminho: "ai/followup-flows/[id]",
    metodos: ["GET", "PATCH", "DELETE"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/followup-flows/:id/disable",
    caminho: "ai/followup-flows/[id]/disable",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/followup-flows/:id/duplicate",
    caminho: "ai/followup-flows/[id]/duplicate",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/followup-flows/:id/export",
    caminho: "ai/followup-flows/[id]/export",
    metodos: ["GET"],
    parametros: ["id"],
    area: "ai",
    resumo: "GET /api/v1/ai/followup-flows/:id/export — o fluxo como ARQUIVO (any member).",
  },
  {
    id: "ai/followup-flows/:id/publish",
    caminho: "ai/followup-flows/[id]/publish",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/followup-flows/:id/rollback",
    caminho: "ai/followup-flows/[id]/rollback",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/followup-flows/from-model",
    caminho: "ai/followup-flows/from-model",
    metodos: ["POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/followup-flows/import",
    caminho: "ai/followup-flows/import",
    metodos: ["POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/followup-flows/modelos-aprovados",
    caminho: "ai/followup-flows/modelos-aprovados",
    metodos: ["GET"],
    parametros: [],
    area: "ai",
    resumo: "GET /api/v1/ai/followup-flows/modelos-aprovados — os modelos aprovados do canal\n que um passo de fluxo consegue enviar sozinho (viewer+, como a leitura do fluxo).",
  },
  {
    id: "ai/followups/enrollments",
    caminho: "ai/followups/enrollments",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/followups/enrollments/:id",
    caminho: "ai/followups/enrollments/[id]",
    metodos: ["GET"],
    parametros: ["id"],
    area: "ai",
    resumo: "GET /api/v1/ai/followups/enrollments/:id (any member) — o dossiê de UM\n follow-up: quem é o contato, em que passo está, quando volta a andar, o que\n já aconteceu (a tabela `followup_enrollment_events`, que existe desde a 0054 e\n nenhuma tela lia) e, quando houver, o plano de tempo que o agente decidiu.",
  },
  {
    id: "ai/followups/enrollments/:id/cancel",
    caminho: "ai/followups/enrollments/[id]/cancel",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/followups/enrollments/:id/pause",
    caminho: "ai/followups/enrollments/[id]/pause",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/followups/enrollments/:id/resume",
    caminho: "ai/followups/enrollments/[id]/resume",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/followups/enrollments/:id/skip",
    caminho: "ai/followups/enrollments/[id]/skip",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/followups/enrollments/:id/snooze",
    caminho: "ai/followups/enrollments/[id]/snooze",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/followups/promises/:id/cancel",
    caminho: "ai/followups/promises/[id]/cancel",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/followups/queue",
    caminho: "ai/followups/queue",
    metodos: ["GET"],
    parametros: [],
    area: "ai",
    resumo: "GET /api/v1/ai/followups/queue — fila unificada (any member): UNION de\n   `followup_enrollments` (estado vivo do motor) + `cron_jobs` (promessas\n   `schedule_followup`, kind='at' + job_kind='followup_turn').",
  },
  {
    id: "ai/guardrail-layers",
    caminho: "ai/guardrail-layers",
    metodos: ["GET", "PUT"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/inbox",
    caminho: "ai/inbox",
    metodos: ["GET"],
    parametros: [],
    area: "ai",
    resumo: "Épico Operação Visível (F1) — central de avisos do agente.",
  },
  {
    id: "ai/inbox/:id",
    caminho: "ai/inbox/[id]",
    metodos: ["PATCH"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/inbox/resolve-all",
    caminho: "ai/inbox/resolve-all",
    metodos: ["POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/jev",
    caminho: "ai/jev",
    metodos: ["GET", "PATCH"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/knowledge/busca",
    caminho: "ai/knowledge/busca",
    metodos: ["POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/knowledge/chave",
    caminho: "ai/knowledge/chave",
    metodos: ["GET"],
    parametros: [],
    area: "ai",
    resumo: "GET /api/v1/ai/knowledge/chave — a base de conhecimento consegue indexar?\n  Existe porque a tela de conhecimento prometia \"a indexação começa em\n instantes\" sem nunca perguntar se havia chave para isso.",
  },
  {
    id: "ai/knowledge/provedor",
    caminho: "ai/knowledge/provedor",
    metodos: ["PUT"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/knowledge/reindex-all",
    caminho: "ai/knowledge/reindex-all",
    metodos: ["POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/knowledge/sources",
    caminho: "ai/knowledge/sources",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/knowledge/sources/:id",
    caminho: "ai/knowledge/sources/[id]",
    metodos: ["GET", "PATCH", "DELETE"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/knowledge/sources/:id/reindex",
    caminho: "ai/knowledge/sources/[id]/reindex",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/knowledge/sources/:id/trechos",
    caminho: "ai/knowledge/sources/[id]/trechos",
    metodos: ["GET"],
    parametros: ["id"],
    area: "ai",
    resumo: "GET /api/v1/ai/knowledge/sources/[id]/trechos\n  O que o agente REALMENTE aprendeu deste material.",
  },
  {
    id: "ai/knowledge/sources/upload",
    caminho: "ai/knowledge/sources/upload",
    metodos: ["POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/mapas",
    caminho: "ai/mapas",
    metodos: ["GET", "PUT", "DELETE"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/mapas/testar",
    caminho: "ai/mapas/testar",
    metodos: ["POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/memory",
    caminho: "ai/memory",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/memory/entries",
    caminho: "ai/memory/entries",
    metodos: ["POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/memory/entries/:id",
    caminho: "ai/memory/entries/[id]",
    metodos: ["PATCH"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/memory/versions/:id",
    caminho: "ai/memory/versions/[id]",
    metodos: ["GET"],
    parametros: ["id"],
    area: "ai",
    resumo: "Épico Operação Visível (F1) — GET: conteúdo de uma versão específica da\n memória da org, para o Dialog de histórico da UI (Task 6).",
  },
  {
    id: "ai/operator-metrics",
    caminho: "ai/operator-metrics",
    metodos: ["GET"],
    parametros: [],
    area: "ai",
    resumo: "GET /api/v1/ai/operator-metrics — o papel que organiza o sistema, medido.",
  },
  {
    id: "ai/pacing",
    caminho: "ai/pacing",
    metodos: ["GET", "PUT"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/providers",
    caminho: "ai/providers",
    metodos: ["GET", "PATCH", "PUT"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/providers/:provider/models",
    caminho: "ai/providers/[provider]/models",
    metodos: ["GET"],
    parametros: ["provider"],
    area: "ai",
    resumo: "GET /api/v1/ai/providers/:provider/models\n  Lê do catálogo curado `ai_models` (tabela GLOBAL, RLS read-all).",
  },
  {
    id: "ai/replies/:id",
    caminho: "ai/replies/[id]",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/routers",
    caminho: "ai/routers",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/routers/:id",
    caminho: "ai/routers/[id]",
    metodos: ["GET", "PATCH", "DELETE"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/routers/:id/members",
    caminho: "ai/routers/[id]/members",
    metodos: ["PUT"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/routers/:id/test",
    caminho: "ai/routers/[id]/test",
    metodos: ["POST"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/routing-results",
    caminho: "ai/routing-results",
    metodos: ["GET"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/routing-results/:id",
    caminho: "ai/routing-results/[id]",
    metodos: ["PATCH"],
    parametros: ["id"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/runs",
    caminho: "ai/runs",
    metodos: ["GET"],
    parametros: [],
    area: "ai",
    resumo: "GET /api/v1/ai/runs — as execuções de IA, com o que deu errado.",
  },
  {
    id: "ai/skills",
    caminho: "ai/skills",
    metodos: ["GET"],
    parametros: [],
    area: "ai",
    resumo: "GET /api/v1/ai/skills\n  Skills instaláveis (Fase 2 do épico harness — spec 2026-07-23).",
  },
  {
    id: "ai/skills/:name",
    caminho: "ai/skills/[name]",
    metodos: ["GET", "PUT", "DELETE"],
    parametros: ["name"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/skills/:name/install",
    caminho: "ai/skills/[name]/install",
    metodos: ["POST"],
    parametros: ["name"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/skills/:name/restore",
    caminho: "ai/skills/[name]/restore",
    metodos: ["POST"],
    parametros: ["name"],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/skills/:name/versions",
    caminho: "ai/skills/[name]/versions",
    metodos: ["GET"],
    parametros: ["name"],
    area: "ai",
    resumo: "GET /api/v1/ai/skills/[name]/versions\n  Histórico de versões da skill NESTA organização (Fase 5 do\n PLANO-CONFIG-UI-AGENTE).",
  },
  {
    id: "ai/skills/import",
    caminho: "ai/skills/import",
    metodos: ["POST"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/style-adjustments",
    caminho: "ai/style-adjustments",
    metodos: ["GET", "PUT"],
    parametros: [],
    area: "ai",
    resumo: "",
  },
  {
    id: "ai/usage",
    caminho: "ai/usage",
    metodos: ["GET"],
    parametros: [],
    area: "ai",
    resumo: "GET /api/v1/ai/usage — observability dashboard for AI invocations.",
  },
  {
    id: "anuncios/google/:org",
    caminho: "anuncios/google/[org]",
    metodos: ["GET"],
    parametros: ["org"],
    area: "anuncios",
    resumo: "Captura o identificador Google repassado pelo botão da landing page.",
  },
  {
    id: "anuncios/meta/:org",
    caminho: "anuncios/meta/[org]",
    metodos: ["GET"],
    parametros: ["org"],
    area: "anuncios",
    resumo: "GET /api/v1/anuncios/meta/[org] — o endereço que captura as UTMs e manda a\n pessoa para o WhatsApp com um ref curto no texto.",
  },
  {
    id: "attendants/availability",
    caminho: "attendants/availability",
    metodos: ["GET"],
    parametros: [],
    area: "attendants",
    resumo: "GET /api/v1/attendants/availability — roster de atendimento da org (org-wide).",
  },
  {
    id: "attendants/availability/:user_id",
    caminho: "attendants/availability/[user_id]",
    metodos: ["PATCH"],
    parametros: ["user_id"],
    area: "attendants",
    resumo: "",
  },
  {
    id: "attendants/presence",
    caminho: "attendants/presence",
    metodos: ["POST"],
    parametros: [],
    area: "attendants",
    resumo: "POST /api/v1/attendants/presence — o EMISSOR do sinal de presença.",
  },
  {
    id: "audit",
    caminho: "audit",
    metodos: ["GET"],
    parametros: [],
    area: "audit",
    resumo: "GET /api/v1/audit — list audit log entries for the active organization.",
  },
  {
    id: "audit/export",
    caminho: "audit/export",
    metodos: ["GET"],
    parametros: [],
    area: "audit",
    resumo: "GET /api/v1/audit/export — CSV export of audit entries (up to 10k rows).",
  },
  {
    id: "auth/interface",
    caminho: "auth/interface",
    metodos: ["GET"],
    parametros: [],
    area: "auth",
    resumo: "",
  },
  {
    id: "auth/realtime-token",
    caminho: "auth/realtime-token",
    metodos: ["GET"],
    parametros: [],
    area: "auth",
    resumo: "GET /api/v1/auth/realtime-token — o token que o canal Realtime precisa.",
  },
  {
    id: "auth/support",
    caminho: "auth/support",
    metodos: ["GET"],
    parametros: [],
    area: "auth",
    resumo: "",
  },
  {
    id: "automation-rules",
    caminho: "automation-rules",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "automation-rules",
    resumo: "",
  },
  {
    id: "automation-rules/:id",
    caminho: "automation-rules/[id]",
    metodos: ["PATCH", "DELETE"],
    parametros: ["id"],
    area: "automation-rules",
    resumo: "",
  },
  {
    id: "automation-rules/:id/runs",
    caminho: "automation-rules/[id]/runs",
    metodos: ["GET"],
    parametros: ["id"],
    area: "automation-rules",
    resumo: "GET /api/v1/automation-rules/[id]/runs?limit=50 — histórico de execuções, desc.",
  },
  {
    id: "automation-rules/runs",
    caminho: "automation-rules/runs",
    metodos: ["GET"],
    parametros: [],
    area: "automation-rules",
    resumo: "GET /api/v1/automation-rules/runs?limit=50 — histórico de execuções da ORG\n inteira (cross-rule), desc.",
  },
  {
    id: "automation-rules/runs/:runId/resend",
    caminho: "automation-rules/runs/[runId]/resend",
    metodos: ["POST"],
    parametros: ["runId"],
    area: "automation-rules",
    resumo: "",
  },
  {
    id: "calls",
    caminho: "calls",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "calls",
    resumo: "POST /api/v1/calls\n  Cria a linha em voice_calls (provider='sip') como 'ringing' e origina via\n ARI.",
  },
  {
    id: "campaign-suppressions",
    caminho: "campaign-suppressions",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "campaign-suppressions",
    resumo: "GET  /api/v1/campaign-suppressions — quem está fora de toda campanha.",
  },
  {
    id: "campaign-suppressions/:id",
    caminho: "campaign-suppressions/[id]",
    metodos: ["DELETE"],
    parametros: ["id"],
    area: "campaign-suppressions",
    resumo: "DELETE /api/v1/campaign-suppressions/:id — tira o número da lista de exclusão.",
  },
  {
    id: "campaign-templates",
    caminho: "campaign-templates",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "campaign-templates",
    resumo: "GET  /api/v1/campaign-templates — a copy guardada da organização.",
  },
  {
    id: "campaign-templates/:id",
    caminho: "campaign-templates/[id]",
    metodos: ["PATCH", "DELETE"],
    parametros: ["id"],
    area: "campaign-templates",
    resumo: "PATCH  /api/v1/campaign-templates/:id — reescreve a copy guardada.",
  },
  {
    id: "campaigns",
    caminho: "campaigns",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "campaigns",
    resumo: "GET /api/v1/campaigns — a lista.",
  },
  {
    id: "campaigns/:id",
    caminho: "campaigns/[id]",
    metodos: ["GET", "PATCH"],
    parametros: ["id"],
    area: "campaigns",
    resumo: "GET   /api/v1/campaigns/:id — a campanha, com os números do snapshot.",
  },
  {
    id: "campaigns/:id/:acao",
    caminho: "campaigns/[id]/[acao]",
    metodos: ["POST"],
    parametros: ["id", "acao"],
    area: "campaigns",
    resumo: "POST /api/v1/campaigns/:id/:acao — preparar, iniciar, agendar, pausar,\n retomar, cancelar, duplicar e testar.",
  },
  {
    id: "campaigns/:id/metrics",
    caminho: "campaigns/[id]/metrics",
    metodos: ["GET"],
    parametros: ["id"],
    area: "campaigns",
    resumo: "GET /api/v1/campaigns/:id/metrics — o funil da campanha.",
  },
  {
    id: "campaigns/:id/recipients",
    caminho: "campaigns/[id]/recipients",
    metodos: ["GET"],
    parametros: ["id"],
    area: "campaigns",
    resumo: "GET /api/v1/campaigns/:id/recipients — quem recebeu, quem não, e por quê.",
  },
  {
    id: "campaigns/preview",
    caminho: "campaigns/preview",
    metodos: ["POST"],
    parametros: [],
    area: "campaigns",
    resumo: "POST /api/v1/campaigns/preview — quantos, quem, e quem fica de fora.",
  },
  {
    id: "channel-schedules",
    caminho: "channel-schedules",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "channel-schedules",
    resumo: "/api/v1/channel-schedules — agendar (e listar) a janela de manutenção (#2388).",
  },
  {
    id: "channel-schedules/:id",
    caminho: "channel-schedules/[id]",
    metodos: ["PATCH", "DELETE"],
    parametros: ["id"],
    area: "channel-schedules",
    resumo: "Editar e cancelar uma janela de manutenção (#2388).",
  },
  {
    id: "channel-sessions",
    caminho: "channel-sessions",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "channel-sessions",
    resumo: "",
  },
  {
    id: "channel-sessions/:id",
    caminho: "channel-sessions/[id]",
    metodos: ["GET", "DELETE"],
    parametros: ["id"],
    area: "channel-sessions",
    resumo: "",
  },
  {
    id: "channel-sessions/:id/acervo",
    caminho: "channel-sessions/[id]/acervo",
    metodos: ["GET", "PATCH"],
    parametros: ["id"],
    area: "channel-sessions",
    resumo: "",
  },
  {
    id: "channel-sessions/:id/ai-access",
    caminho: "channel-sessions/[id]/ai-access",
    metodos: ["GET", "PATCH"],
    parametros: ["id"],
    area: "channel-sessions",
    resumo: "",
  },
  {
    id: "channel-sessions/:id/disabled",
    caminho: "channel-sessions/[id]/disabled",
    metodos: ["GET", "PATCH"],
    parametros: ["id"],
    area: "channel-sessions",
    resumo: "",
  },
  {
    id: "channel-sessions/:id/groups",
    caminho: "channel-sessions/[id]/groups",
    metodos: ["GET", "PUT"],
    parametros: ["id"],
    area: "channel-sessions",
    resumo: "GET/PUT /api/v1/channel-sessions/[id]/groups — os grupos do número e a chave de cada um.",
  },
  {
    id: "channel-sessions/:id/name",
    caminho: "channel-sessions/[id]/name",
    metodos: ["PATCH"],
    parametros: ["id"],
    area: "channel-sessions",
    resumo: "",
  },
  {
    id: "channel-sessions/:id/pairing-code",
    caminho: "channel-sessions/[id]/pairing-code",
    metodos: ["POST"],
    parametros: ["id"],
    area: "channel-sessions",
    resumo: "",
  },
  {
    id: "channel-sessions/:id/qr",
    caminho: "channel-sessions/[id]/qr",
    metodos: ["GET"],
    parametros: ["id"],
    area: "channel-sessions",
    resumo: "",
  },
  {
    id: "channel-sessions/:id/reconnect",
    caminho: "channel-sessions/[id]/reconnect",
    metodos: ["POST"],
    parametros: ["id"],
    area: "channel-sessions",
    resumo: "",
  },
  {
    id: "channel-sessions/disabled",
    caminho: "channel-sessions/disabled",
    metodos: ["PATCH"],
    parametros: [],
    area: "channel-sessions",
    resumo: "",
  },
  {
    id: "channels/graph-partner",
    caminho: "channels/graph-partner",
    metodos: ["GET", "POST", "PATCH"],
    parametros: [],
    area: "channels",
    resumo: "",
  },
  {
    id: "channels/graph-partner/templates",
    caminho: "channels/graph-partner/templates",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "channels",
    resumo: "",
  },
  {
    id: "channels/official",
    caminho: "channels/official",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "channels",
    resumo: "",
  },
  {
    id: "channels/official/webhook",
    caminho: "channels/official/webhook",
    metodos: ["POST"],
    parametros: [],
    area: "channels",
    resumo: "",
  },
  {
    id: "channels/partner",
    caminho: "channels/partner",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "channels",
    resumo: "",
  },
  {
    id: "channels/partner/templates",
    caminho: "channels/partner/templates",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "channels",
    resumo: "",
  },
  {
    id: "channels/partner/templates/media",
    caminho: "channels/partner/templates/media",
    metodos: ["POST"],
    parametros: [],
    area: "channels",
    resumo: "",
  },
  {
    id: "channels/social",
    caminho: "channels/social",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "channels",
    resumo: "",
  },
  {
    id: "channels/templates",
    caminho: "channels/templates",
    metodos: ["GET", "POST", "PATCH"],
    parametros: [],
    area: "channels",
    resumo: "",
  },
  {
    id: "cobranca/assinatura/cancelar",
    caminho: "cobranca/assinatura/cancelar",
    metodos: ["POST"],
    parametros: [],
    area: "cobranca",
    resumo: "POST /api/v1/cobranca/assinatura/cancelar — a empresa cancela (spec §7f,\n D-14): o acesso segue até o fim do período pago e não há reembolso\n automático.",
  },
  {
    id: "cobranca/assinatura/checkout",
    caminho: "cobranca/assinatura/checkout",
    metodos: ["POST"],
    parametros: [],
    area: "cobranca",
    resumo: "POST /api/v1/cobranca/assinatura/checkout — o botão \"Assinar\" (spec da\n cobrança do revendedor §7b).",
  },
  {
    id: "cobranca/assinatura/gerenciar",
    caminho: "cobranca/assinatura/gerenciar",
    metodos: ["POST"],
    parametros: [],
    area: "cobranca",
    resumo: "POST /api/v1/cobranca/assinatura/gerenciar — o portal do provedor, onde a\n empresa troca o cartão e vê as faturas (spec §13).",
  },
  {
    id: "cobranca/assinatura/plano",
    caminho: "cobranca/assinatura/plano",
    metodos: ["POST"],
    parametros: [],
    area: "cobranca",
    resumo: "POST /api/v1/cobranca/assinatura/plano — a empresa troca de plano (spec §7e):\n o MESMO caminho do card do dono (`lib/cobranca/troca.ts`).",
  },
  {
    id: "cobranca/assinatura/sincronizar",
    caminho: "cobranca/assinatura/sincronizar",
    metodos: ["POST"],
    parametros: [],
    area: "cobranca",
    resumo: "POST /api/v1/cobranca/assinatura/sincronizar — \"Já paguei\" e a volta do\n checkout (`?voltou=1`), spec §7b.4 e §7d.5.",
  },
  {
    id: "companies",
    caminho: "companies",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "companies",
    resumo: "",
  },
  {
    id: "companies/:id",
    caminho: "companies/[id]",
    metodos: ["GET", "PATCH", "DELETE"],
    parametros: ["id"],
    area: "companies",
    resumo: "",
  },
  {
    id: "companies/:id/enrich",
    caminho: "companies/[id]/enrich",
    metodos: ["POST"],
    parametros: ["id"],
    area: "companies",
    resumo: "",
  },
  {
    id: "companies/lookup",
    caminho: "companies/lookup",
    metodos: ["GET"],
    parametros: [],
    area: "companies",
    resumo: "",
  },
  {
    id: "company-people",
    caminho: "company-people",
    metodos: ["POST"],
    parametros: [],
    area: "company-people",
    resumo: "",
  },
  {
    id: "company-people/:id",
    caminho: "company-people/[id]",
    metodos: ["PATCH"],
    parametros: ["id"],
    area: "company-people",
    resumo: "",
  },
  {
    id: "contact-tags",
    caminho: "contact-tags",
    metodos: ["GET"],
    parametros: [],
    area: "contact-tags",
    resumo: "GET /api/v1/contact-tags — tags em uso nos contatos da org ativa.",
  },
  {
    id: "contacts",
    caminho: "contacts",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "contacts",
    resumo: "",
  },
  {
    id: "contacts/:id",
    caminho: "contacts/[id]",
    metodos: ["GET", "PATCH", "DELETE"],
    parametros: ["id"],
    area: "contacts",
    resumo: "",
  },
  {
    id: "contacts/:id/always-human",
    caminho: "contacts/[id]/always-human",
    metodos: ["POST", "DELETE"],
    parametros: ["id"],
    area: "contacts",
    resumo: "",
  },
  {
    id: "contacts/:id/avatar",
    caminho: "contacts/[id]/avatar",
    metodos: ["GET"],
    parametros: ["id"],
    area: "contacts",
    resumo: "GET /api/v1/contacts/{id}/avatar — serve a foto de perfil do contato.",
  },
  {
    id: "contacts/:id/carteira",
    caminho: "contacts/[id]/carteira",
    metodos: ["GET", "PATCH"],
    parametros: ["id"],
    area: "contacts",
    resumo: "PATCH /api/v1/contacts/[id]/carteira — põe/tira o cliente na carteira de um\n vendedor (issue #2591, regra 1/5).",
  },
  {
    id: "contacts/:id/crm-summary",
    caminho: "contacts/[id]/crm-summary",
    metodos: ["GET"],
    parametros: ["id"],
    area: "contacts",
    resumo: "GET /api/v1/contacts/[id]/crm-summary — o resumo de CRM do painel do inbox.",
  },
  {
    id: "contacts/:id/hierarquia-do-anuncio",
    caminho: "contacts/[id]/hierarquia-do-anuncio",
    metodos: ["GET"],
    parametros: ["id"],
    area: "contacts",
    resumo: "GET /api/v1/contacts/[id]/hierarquia-do-anuncio — o nome da campanha, do\n conjunto e do anúncio de onde este contato veio.",
  },
  {
    id: "contacts/:id/person",
    caminho: "contacts/[id]/person",
    metodos: ["PATCH"],
    parametros: ["id"],
    area: "contacts",
    resumo: "",
  },
  {
    id: "contacts/:id/personal",
    caminho: "contacts/[id]/personal",
    metodos: ["POST", "DELETE"],
    parametros: ["id"],
    area: "contacts",
    resumo: "",
  },
  {
    id: "contacts/:id/proposals",
    caminho: "contacts/[id]/proposals",
    metodos: ["GET"],
    parametros: ["id"],
    area: "contacts",
    resumo: "GET /api/v1/contacts/[id]/proposals — o que a IA ouviu e ainda espera decisão.",
  },
  {
    id: "contacts/:id/proposals/:proposal_id",
    caminho: "contacts/[id]/proposals/[proposal_id]",
    metodos: ["POST"],
    parametros: ["id", "proposal_id"],
    area: "contacts",
    resumo: "",
  },
  {
    id: "contacts/:id/roteiros",
    caminho: "contacts/[id]/roteiros",
    metodos: ["GET"],
    parametros: ["id"],
    area: "contacts",
    resumo: "GET /api/v1/contacts/[id]/roteiros — o que os roteiros de atendimento\n coletaram deste contato, para a ficha e o painel da conversa (qualquer membro).",
  },
  {
    id: "contacts/:id/timeline",
    caminho: "contacts/[id]/timeline",
    metodos: ["GET"],
    parametros: ["id"],
    area: "contacts",
    resumo: "GET /api/v1/contacts/[id]/timeline\n  Returns polymorphic timeline (`crm_lead_activities`) for a contact, merging\n direct `contact_id` activities with activities attached to leads owned by\n this contact.",
  },
  {
    id: "contacts/:id/unblock",
    caminho: "contacts/[id]/unblock",
    metodos: ["POST"],
    parametros: ["id"],
    area: "contacts",
    resumo: "",
  },
  {
    id: "contacts/:id/vinculos",
    caminho: "contacts/[id]/vinculos",
    metodos: ["GET"],
    parametros: ["id"],
    area: "contacts",
    resumo: "GET /api/v1/contacts/[id]/vinculos — o que a exclusão VAI encontrar, sem\n apagar nada (issue #1925).",
  },
  {
    id: "contacts/bulk",
    caminho: "contacts/bulk",
    metodos: ["POST"],
    parametros: [],
    area: "contacts",
    resumo: "POST /api/v1/contacts/bulk — a camada de lote da tela de Contatos (#2484, fatia F3).",
  },
  {
    id: "contacts/duplicates",
    caminho: "contacts/duplicates",
    metodos: ["GET"],
    parametros: [],
    area: "contacts",
    resumo: "GET /api/v1/contacts/duplicates — quem é a MESMA pessoa cadastrada duas vezes.",
  },
  {
    id: "contacts/export",
    caminho: "contacts/export",
    metodos: ["GET"],
    parametros: [],
    area: "contacts",
    resumo: "GET /api/v1/contacts/export — a base de contatos DE VOLTA para quem opera\n (issue #2759).",
  },
  {
    id: "contacts/import",
    caminho: "contacts/import",
    metodos: ["POST"],
    parametros: [],
    area: "contacts",
    resumo: "",
  },
  {
    id: "contacts/merge",
    caminho: "contacts/merge",
    metodos: ["POST"],
    parametros: [],
    area: "contacts",
    resumo: "",
  },
  {
    id: "conversation-tags",
    caminho: "conversation-tags",
    metodos: ["GET"],
    parametros: [],
    area: "conversation-tags",
    resumo: "GET /api/v1/conversation-tags — vocabulário canônico de tags de conversa da\n org ativa (spec 13 §3.3, G3-05).",
  },
  {
    id: "conversations",
    caminho: "conversations",
    metodos: ["GET"],
    parametros: [],
    area: "conversations",
    resumo: "GET /api/v1/conversations — list inbox (handler em ./_handler.ts).",
  },
  {
    id: "conversations/:id",
    caminho: "conversations/[id]",
    metodos: ["GET", "PATCH"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/aviso-de-mensagem",
    caminho: "conversations/[id]/aviso-de-mensagem",
    metodos: ["GET"],
    parametros: ["id"],
    area: "conversations",
    resumo: "GET /api/v1/conversations/[id]/aviso-de-mensagem — \"devo avisar ESTA pessoa\n da mensagem que acabou de chegar nesta conversa?\" → `{ avisar: boolean }`.",
  },
  {
    id: "conversations/:id/claim",
    caminho: "conversations/[id]/claim",
    metodos: ["POST"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/close",
    caminho: "conversations/[id]/close",
    metodos: ["POST"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/draft-reply",
    caminho: "conversations/[id]/draft-reply",
    metodos: ["GET", "POST"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/drafts",
    caminho: "conversations/[id]/drafts",
    metodos: ["POST"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/drafts/consume",
    caminho: "conversations/[id]/drafts/consume",
    metodos: ["POST"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/export",
    caminho: "conversations/[id]/export",
    metodos: ["GET"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/mark-read",
    caminho: "conversations/[id]/mark-read",
    metodos: ["POST"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/media",
    caminho: "conversations/[id]/media",
    metodos: ["POST"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/messages",
    caminho: "conversations/[id]/messages",
    metodos: ["GET"],
    parametros: ["id"],
    area: "conversations",
    resumo: "GET /api/v1/conversations/[id]/messages — histórico de mensagens (handler\n em /app/api/v1/messages/_handler.ts → listMessagesHandler).",
  },
  {
    id: "conversations/:id/notes",
    caminho: "conversations/[id]/notes",
    metodos: ["GET", "POST"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/notes/:noteId",
    caminho: "conversations/[id]/notes/[noteId]",
    metodos: ["DELETE"],
    parametros: ["id", "noteId"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/notes/:noteId/media",
    caminho: "conversations/[id]/notes/[noteId]/media",
    metodos: ["GET"],
    parametros: ["id", "noteId"],
    area: "conversations",
    resumo: "GET /api/v1/conversations/[id]/notes/[noteId]/media — acesso autenticado à\n mídia ANEXADA À NOTA INTERNA (issue #1863, F3).",
  },
  {
    id: "conversations/:id/notes/media",
    caminho: "conversations/[id]/notes/media",
    metodos: ["POST"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/passagens",
    caminho: "conversations/[id]/passagens",
    metodos: ["GET"],
    parametros: ["id"],
    area: "conversations",
    resumo: "GET /api/v1/conversations/[id]/passagens — o que a IA deixou para quem assume.",
  },
  {
    id: "conversations/:id/pause-ai",
    caminho: "conversations/[id]/pause-ai",
    metodos: ["POST"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/reactivate-bot",
    caminho: "conversations/[id]/reactivate-bot",
    metodos: ["POST"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/release",
    caminho: "conversations/[id]/release",
    metodos: ["POST"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/retention",
    caminho: "conversations/[id]/retention",
    metodos: ["GET"],
    parametros: ["id"],
    area: "conversations",
    resumo: "GET /api/v1/conversations/[id]/retention — vetos recentes da cadeia before_send\n para o contato desta conversa (Operação Visível F2-i).",
  },
  {
    id: "conversations/:id/snooze",
    caminho: "conversations/[id]/snooze",
    metodos: ["POST", "DELETE"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/transfer",
    caminho: "conversations/[id]/transfer",
    metodos: ["POST"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/:id/usable-for-rag",
    caminho: "conversations/[id]/usable-for-rag",
    metodos: ["POST"],
    parametros: ["id"],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/bulk",
    caminho: "conversations/bulk",
    metodos: ["POST"],
    parametros: [],
    area: "conversations",
    resumo: "",
  },
  {
    id: "conversations/counts",
    caminho: "conversations/counts",
    metodos: ["GET"],
    parametros: [],
    area: "conversations",
    resumo: "GET /api/v1/conversations/counts — contagens por visão do inbox (G4-02).",
  },
  {
    id: "conversations/open-with-contact",
    caminho: "conversations/open-with-contact",
    metodos: ["POST"],
    parametros: [],
    area: "conversations",
    resumo: "",
  },
  {
    id: "cron/agenda-expira-pendentes",
    caminho: "cron/agenda-expira-pendentes",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "O PEDIDO QUE NINGUÉM DECIDIU LIBERA O HORÁRIO.",
  },
  {
    id: "cron/agenda-google-push",
    caminho: "cron/agenda-google-push",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "",
  },
  {
    id: "cron/agenda-google-refresh",
    caminho: "cron/agenda-google-refresh",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "GET/POST /api/v1/cron/agenda-google-refresh — o anti-morte da agenda conectada.",
  },
  {
    id: "cron/agenda-google-sync",
    caminho: "cron/agenda-google-sync",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "",
  },
  {
    id: "cron/agenda-reminder",
    caminho: "cron/agenda-reminder",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "O LEMBRETE DO COMPROMISSO — o consumidor que faltava.",
  },
  {
    id: "cron/agent-dispatcher",
    caminho: "cron/agent-dispatcher",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "GET/POST /api/v1/cron/agent-dispatcher\n  @deprecated Fase 0 (convergência, spec 2026-07-23): o dispatch nativo\n (S-13.07, Spec 10 §5) foi aposentado — o agent-worker (drain) é o único\n consumidor de `ai_agent.dispatch_requested`.",
  },
  {
    id: "cron/campaign-worker",
    caminho: "cron/campaign-worker",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "GET/POST /api/v1/cron/campaign-worker — uma rodada de campanha.",
  },
  {
    id: "cron/canal-mudo-watcher",
    caminho: "cron/canal-mudo-watcher",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "canal-mudo-watcher — o canal que nasce mudo não fica mudo em silêncio.",
  },
  {
    id: "cron/case-stale-watcher",
    caminho: "cron/case-stale-watcher",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "O CASO QUE NINGUÉM ABRIU VOLTA A PEDIR PASSAGEM.",
  },
  {
    id: "cron/channel-health",
    caminho: "cron/channel-health",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "channel-health — o vigia que PERGUNTA se a conexão está de pé.",
  },
  {
    id: "cron/channel-pause-scheduler",
    caminho: "cron/channel-pause-scheduler",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "channel-pause-scheduler — a janela de manutenção pausa sozinha e RETOMA sozinha.",
  },
  {
    id: "cron/cobranca",
    caminho: "cron/cobranca",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "O CRON DA COBRANÇA DO REVENDEDOR (spec §8): de hora em hora, pelo scheduler.",
  },
  {
    id: "cron/contact-avatars",
    caminho: "cron/contact-avatars",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "contact-avatars — baixa e mantém atualizada a foto de perfil dos contatos.",
  },
  {
    id: "cron/contact-birthdays",
    caminho: "cron/contact-birthdays",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "O ANIVERSÁRIO DO CONTATO — a data que estava guardada e não acionava nada.",
  },
  {
    id: "cron/contact-phones",
    caminho: "cron/contact-phones",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "contact-phones — descobre o telefone por trás da identidade opaca.",
  },
  {
    id: "cron/contact-proposals-watcher",
    caminho: "cron/contact-proposals-watcher",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "Cron — fecha as propostas de dado que ninguém decidiu (spec 17 §4b).",
  },
  {
    id: "cron/data-retention",
    caminho: "cron/data-retention",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "GET/POST /api/v1/cron/data-retention — issue #261.",
  },
  {
    id: "cron/event-log-drain",
    caminho: "cron/event-log-drain",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "GET/POST /api/v1/cron/event-log-drain\n  Cron entry point for the generic event_log drain (Task 2, spec\n webhooks/automação 2026-07-17), scheduled by the `scheduler` service\n (`docker/scheduler/entrypoint.sh`).",
  },
  {
    id: "cron/followup-flow-worker",
    caminho: "cron/followup-flow-worker",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "GET/POST /api/v1/cron/followup-flow-worker — Onda 4 (Task 4.2) + Onda 8\n (Task 8.1, gatilho de silêncio).",
  },
  {
    id: "cron/followup-sem-agente",
    caminho: "cron/followup-sem-agente",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "O FLUXO PUBLICADO QUE NUNCA VAI DISPARAR.",
  },
  {
    id: "cron/handoff-devolucao",
    caminho: "cron/handoff-devolucao",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "GET/POST /api/v1/cron/handoff-devolucao — devolve ao agente de IA a conversa\n que ficou com uma pessoa e passou do prazo sem nenhum sinal dela.",
  },
  {
    id: "cron/kb-conversations-batch",
    caminho: "cron/kb-conversations-batch",
    metodos: ["GET"],
    parametros: [],
    area: "cron",
    resumo: "GET /api/v1/cron/kb-conversations-batch\n  Daily cron entry point for the conversations RAG ingestion (S-06.07).",
  },
  {
    id: "cron/lead-date-field-due",
    caminho: "cron/lead-date-field-due",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "A DATA DO FUNIL AVISA QUANDO FALTAM N DIAS (issue #989) — a varredura.",
  },
  {
    id: "cron/lead-time-triggers",
    caminho: "cron/lead-time-triggers",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "OS DOIS GATILHOS POR TEMPO (issue #1540) — a varredura.",
  },
  {
    id: "cron/lgpd-sla-watcher",
    caminho: "cron/lgpd-sla-watcher",
    metodos: ["GET"],
    parametros: [],
    area: "cron",
    resumo: "GET /api/v1/cron/lgpd-sla-watcher\n  Daily cron (09:00 BRT / 12:00 UTC) — scans active lgpd_requests and fires\n SLA alarms when requests are approaching / past their threshold:\n   - data_request  → alarm if received_at <= now - 5 days  (D+5)\n   - redact / store_redact → alarm if received_at <= now - 10 days (D+10)\n  Auth: `Authorization: Bearer <INTERNAL_CRON_SECRET|INTERNAL_SECRET>` (fail-closed).",
  },
  {
    id: "cron/media-retention",
    caminho: "cron/media-retention",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "GET /api/v1/cron/media-retention\n  A retenção de mídia EXECUTADA (migration 0432).",
  },
  {
    id: "cron/proposal-acceptance-rate",
    caminho: "cron/proposal-acceptance-rate",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "",
  },
  {
    id: "cron/proposal-expiry",
    caminho: "cron/proposal-expiry",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "Cron diário: propostas ENVIADAS cujo valid_until passou sem decisão viram\n VENCIDAS e abrem aviso na Central.",
  },
  {
    id: "cron/proposal-promised-not-created",
    caminho: "cron/proposal-promised-not-created",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "Fecha o sinal que originou a spec inteira: uma promessa de proposta\n (Tarefa 1) vence sem que NENHUMA proposta tenha sido criada para aquele\n negócio depois da promessa.",
  },
  {
    id: "cron/proposta-travada",
    caminho: "cron/proposta-travada",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "GET/POST /api/v1/cron/proposta-travada — D3.",
  },
  {
    id: "cron/prospecting",
    caminho: "cron/prospecting",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "",
  },
  {
    id: "cron/recover-stuck-messages",
    caminho: "cron/recover-stuck-messages",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "GET/POST /api/v1/cron/recover-stuck-messages — issue #129.",
  },
  {
    id: "cron/recurring-entries",
    caminho: "cron/recurring-entries",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "Gera os lançamentos dos moldes recorrentes.",
  },
  {
    id: "cron/risk-watcher",
    caminho: "cron/risk-watcher",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "GET/POST /api/v1/cron/risk-watcher — wave 7, peça 5 (o ciclo).",
  },
  {
    id: "cron/routing-worker",
    caminho: "cron/routing-worker",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "GET/POST /api/v1/cron/routing-worker — G5-02 (AT-03, spec 13 §5).",
  },
  {
    id: "cron/snooze-watcher",
    caminho: "cron/snooze-watcher",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "GET/POST /api/v1/cron/snooze-watcher — Onda 5.3 (snooze por conversa).",
  },
  {
    id: "cron/storage-redaction",
    caminho: "cron/storage-redaction",
    metodos: ["GET"],
    parametros: [],
    area: "cron",
    resumo: "GET /api/v1/cron/storage-redaction\n  Drains the LGPD `storage_redaction_queue` (one batch per call).",
  },
  {
    id: "cron/sync-model-catalog",
    caminho: "cron/sync-model-catalog",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "GET/POST /api/v1/cron/sync-model-catalog — o catálogo que se atualiza sozinho.",
  },
  {
    id: "cron/task-reminder",
    caminho: "cron/task-reminder",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "O LEMBRETE DE PRAZO DA TAREFA (#2529) — a varredura.",
  },
  {
    id: "cron/webhook-log-retention",
    caminho: "cron/webhook-log-retention",
    metodos: ["GET"],
    parametros: [],
    area: "cron",
    resumo: "GET /api/v1/cron/webhook-log-retention\n  Poda o arquivo do corpo cru dos webhooks (`webhook_events_log`).",
  },
  {
    id: "cron/webhook-replay",
    caminho: "cron/webhook-replay",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "cron",
    resumo: "GET/POST /api/v1/cron/webhook-replay — a mensagem que o banco recusou por um\n instante volta a ser tentada.",
  },
  {
    id: "demandas/:id",
    caminho: "demandas/[id]",
    metodos: ["PATCH"],
    parametros: ["id"],
    area: "demandas",
    resumo: "",
  },
  {
    id: "extensions",
    caminho: "extensions",
    metodos: ["GET"],
    parametros: [],
    area: "extensions",
    resumo: "",
  },
  {
    id: "extensions/:id",
    caminho: "extensions/[id]",
    metodos: ["GET"],
    parametros: ["id"],
    area: "extensions",
    resumo: "",
  },
  {
    id: "extensions/:id/configuration",
    caminho: "extensions/[id]/configuration",
    metodos: ["PUT"],
    parametros: ["id"],
    area: "extensions",
    resumo: "",
  },
  {
    id: "extensions/:id/open",
    caminho: "extensions/[id]/open",
    metodos: ["POST"],
    parametros: ["id"],
    area: "extensions",
    resumo: "",
  },
  {
    id: "extensions/:id/remove",
    caminho: "extensions/[id]/remove",
    metodos: ["POST"],
    parametros: ["id"],
    area: "extensions",
    resumo: "",
  },
  {
    id: "extensions/:id/revert",
    caminho: "extensions/[id]/revert",
    metodos: ["POST"],
    parametros: ["id"],
    area: "extensions",
    resumo: "",
  },
  {
    id: "extensions/catalogs",
    caminho: "extensions/catalogs",
    metodos: ["POST"],
    parametros: [],
    area: "extensions",
    resumo: "",
  },
  {
    id: "extensions/install",
    caminho: "extensions/install",
    metodos: ["POST"],
    parametros: [],
    area: "extensions",
    resumo: "",
  },
  {
    id: "extensions/operations/:id",
    caminho: "extensions/operations/[id]",
    metodos: ["GET"],
    parametros: ["id"],
    area: "extensions",
    resumo: "",
  },
  {
    id: "extensions/operations/:id/cancel",
    caminho: "extensions/operations/[id]/cancel",
    metodos: ["POST"],
    parametros: ["id"],
    area: "extensions",
    resumo: "",
  },
  {
    id: "external-db/connections",
    caminho: "external-db/connections",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "external-db",
    resumo: "",
  },
  {
    id: "external-db/connections/:id",
    caminho: "external-db/connections/[id]",
    metodos: ["GET", "PATCH", "DELETE"],
    parametros: ["id"],
    area: "external-db",
    resumo: "",
  },
  {
    id: "external-db/connections/:id/catalog",
    caminho: "external-db/connections/[id]/catalog",
    metodos: ["GET"],
    parametros: ["id"],
    area: "external-db",
    resumo: "GET /api/v1/external-db/connections/:id/catalog (admin)\n  O catálogo COMPLETO do banco de origem, ignorando as fontes liberadas.",
  },
  {
    id: "external-db/connections/:id/schemas",
    caminho: "external-db/connections/[id]/schemas",
    metodos: ["GET"],
    parametros: ["id"],
    area: "external-db",
    resumo: "GET /api/v1/external-db/connections/:id/schemas (qualquer autenticado)\n  Retrato AO VIVO do catálogo: tabelas, views, colunas, chave primária e\n estimativa de linhas.",
  },
  {
    id: "external-db/connections/:id/sources",
    caminho: "external-db/connections/[id]/sources",
    metodos: ["GET", "PUT"],
    parametros: ["id"],
    area: "external-db",
    resumo: "",
  },
  {
    id: "external-db/connections/:id/tables/:schema/:tabela",
    caminho: "external-db/connections/[id]/tables/[schema]/[tabela]",
    metodos: ["GET"],
    parametros: ["id", "schema", "tabela"],
    area: "external-db",
    resumo: "GET /api/v1/external-db/connections/:id/tables/:schema/:tabela\n  Dados paginados de uma tabela/view.",
  },
  {
    id: "external-db/connections/:id/test",
    caminho: "external-db/connections/[id]/test",
    metodos: ["POST"],
    parametros: ["id"],
    area: "external-db",
    resumo: "",
  },
  {
    id: "financeiro/catalogo/:tipo",
    caminho: "financeiro/catalogo/[tipo]",
    metodos: ["GET", "POST", "PATCH", "DELETE"],
    parametros: ["tipo"],
    area: "financeiro",
    resumo: "O catálogo financeiro: contas, formas de pagamento e plano de contas.",
  },
  {
    id: "financeiro/comandas",
    caminho: "financeiro/comandas",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "financeiro",
    resumo: "A COMANDA — abrir e listar.",
  },
  {
    id: "financeiro/comandas/:id",
    caminho: "financeiro/comandas/[id]",
    metodos: ["GET", "PATCH"],
    parametros: ["id"],
    area: "financeiro",
    resumo: "Uma comanda: ler, dar desconto, cancelar.",
  },
  {
    id: "financeiro/comandas/:id/estornar",
    caminho: "financeiro/comandas/[id]/estornar",
    metodos: ["POST"],
    parametros: ["id"],
    area: "financeiro",
    resumo: "ESTORNAR a comanda.",
  },
  {
    id: "financeiro/comandas/:id/finalizar",
    caminho: "financeiro/comandas/[id]/finalizar",
    metodos: ["POST"],
    parametros: ["id"],
    area: "financeiro",
    resumo: "FINALIZAR a comanda — as seis coisas numa transação só.",
  },
  {
    id: "financeiro/comandas/:id/itens",
    caminho: "financeiro/comandas/[id]/itens",
    metodos: ["POST"],
    parametros: ["id"],
    area: "financeiro",
    resumo: "Os itens da comanda.",
  },
  {
    id: "financeiro/comandas/:id/itens/:itemId",
    caminho: "financeiro/comandas/[id]/itens/[itemId]",
    metodos: ["DELETE"],
    parametros: ["id", "itemId"],
    area: "financeiro",
    resumo: "Remover um item da comanda.",
  },
  {
    id: "financeiro/comandas/faturar-lote",
    caminho: "financeiro/comandas/faturar-lote",
    metodos: ["POST"],
    parametros: [],
    area: "financeiro",
    resumo: "FATURAR EM LOTE os atendimentos que ficaram sem comanda.",
  },
  {
    id: "financeiro/comandas/pendentes",
    caminho: "financeiro/comandas/pendentes",
    metodos: ["GET"],
    parametros: [],
    area: "financeiro",
    resumo: "OS ATENDIMENTOS QUE ACONTECERAM E FICARAM SEM COMANDA.",
  },
  {
    id: "financeiro/fidelidade",
    caminho: "financeiro/fidelidade",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "financeiro",
    resumo: "A FIDELIDADE — saldo e extrato de um cliente.",
  },
  {
    id: "financeiro/lancamentos",
    caminho: "financeiro/lancamentos",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "financeiro",
    resumo: "OS LANÇAMENTOS — o dinheiro que não veio de comanda.",
  },
  {
    id: "financeiro/lancamentos/:id",
    caminho: "financeiro/lancamentos/[id]",
    metodos: ["PATCH", "DELETE"],
    parametros: ["id"],
    area: "financeiro",
    resumo: "Um lançamento: pagar, ou apagar enquanto ainda não é dinheiro.",
  },
  {
    id: "health",
    caminho: "health",
    metodos: ["GET"],
    parametros: [],
    area: "health",
    resumo: "GET /api/v1/health — Supabase, Redis e WAHA respondem?\n  ─── Por que cada check diz a CAUSA, e não só \"down\" ─────────────────────────\n A versão anterior devolvia `error: \"fetch failed\"` — a mensagem que o `fetch`\n dá para causas opostas.",
  },
  {
    id: "honorarios/contratos",
    caminho: "honorarios/contratos",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "honorarios",
    resumo: "CONTRATOS DE HONORÁRIOS — o modelo de cobrança do caso (fixo, êxito ou misto).",
  },
  {
    id: "honorarios/contratos/:id/parcelas",
    caminho: "honorarios/contratos/[id]/parcelas",
    metodos: ["GET", "POST"],
    parametros: ["id"],
    area: "honorarios",
    resumo: "PARCELAS de um contrato de honorários — o calendário de pagamento.",
  },
  {
    id: "honorarios/parcelas/:id/pagar",
    caminho: "honorarios/parcelas/[id]/pagar",
    metodos: ["POST"],
    parametros: ["id"],
    area: "honorarios",
    resumo: "Marcar uma parcela de honorários como PAGA.",
  },
  {
    id: "imports",
    caminho: "imports",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "imports",
    resumo: "",
  },
  {
    id: "imports/:id",
    caminho: "imports/[id]",
    metodos: ["GET"],
    parametros: ["id"],
    area: "imports",
    resumo: "",
  },
  {
    id: "integrations/nuvemshop/callback",
    caminho: "integrations/nuvemshop/callback",
    metodos: ["GET"],
    parametros: [],
    area: "integrations",
    resumo: "",
  },
  {
    id: "lead-captures",
    caminho: "lead-captures",
    metodos: ["GET"],
    parametros: [],
    area: "lead-captures",
    resumo: "GET /api/v1/lead-captures — o histórico de leads captados por formulário.",
  },
  {
    id: "leads",
    caminho: "leads",
    metodos: ["POST"],
    parametros: [],
    area: "leads",
    resumo: "",
  },
  {
    id: "leads/:id",
    caminho: "leads/[id]",
    metodos: ["PATCH"],
    parametros: ["id"],
    area: "leads",
    resumo: "",
  },
  {
    id: "leads/:id/clone",
    caminho: "leads/[id]/clone",
    metodos: ["GET", "POST"],
    parametros: ["id"],
    area: "leads",
    resumo: "",
  },
  {
    id: "leads/:id/contatos-relacionados",
    caminho: "leads/[id]/contatos-relacionados",
    metodos: ["GET"],
    parametros: ["id"],
    area: "leads",
    resumo: "GET /api/v1/leads/[id]/contatos-relacionados — a F1 da #1506.",
  },
  {
    id: "leads/:id/conversion/retry",
    caminho: "leads/[id]/conversion/retry",
    metodos: ["POST"],
    parametros: ["id"],
    area: "leads",
    resumo: "",
  },
  {
    id: "leads/:id/lose",
    caminho: "leads/[id]/lose",
    metodos: ["POST"],
    parametros: ["id"],
    area: "leads",
    resumo: "",
  },
  {
    id: "leads/:id/move",
    caminho: "leads/[id]/move",
    metodos: ["POST"],
    parametros: ["id"],
    area: "leads",
    resumo: "",
  },
  {
    id: "leads/:id/next-action",
    caminho: "leads/[id]/next-action",
    metodos: ["POST"],
    parametros: ["id"],
    area: "leads",
    resumo: "",
  },
  {
    id: "leads/:id/reactivation",
    caminho: "leads/[id]/reactivation",
    metodos: ["POST"],
    parametros: ["id"],
    area: "leads",
    resumo: "",
  },
  {
    id: "leads/:id/retomar",
    caminho: "leads/[id]/retomar",
    metodos: ["POST"],
    parametros: ["id"],
    area: "leads",
    resumo: "",
  },
  {
    id: "leads/:id/timeline",
    caminho: "leads/[id]/timeline",
    metodos: ["GET"],
    parametros: ["id"],
    area: "leads",
    resumo: "GET /api/v1/leads/[id]/timeline\n  A timeline do NEGÓCIO — irmã da timeline do CONTATO, e não a mesma coisa.",
  },
  {
    id: "leads/:id/win",
    caminho: "leads/[id]/win",
    metodos: ["POST"],
    parametros: ["id"],
    area: "leads",
    resumo: "",
  },
  {
    id: "leads/at-risk",
    caminho: "leads/at-risk",
    metodos: ["GET"],
    parametros: [],
    area: "leads",
    resumo: "Radar de Risco (desilhamento C1 — doutrina do sistema vivo).",
  },
  {
    id: "leads/bulk",
    caminho: "leads/bulk",
    metodos: ["POST"],
    parametros: [],
    area: "leads",
    resumo: "",
  },
  {
    id: "leads/import",
    caminho: "leads/import",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "leads",
    resumo: "",
  },
  {
    id: "leads/proposals",
    caminho: "leads/proposals",
    metodos: ["GET"],
    parametros: [],
    area: "leads",
    resumo: "GET /api/v1/leads/proposals — as próximas ações da IA, em lista.",
  },
  {
    id: "leads/reactivations",
    caminho: "leads/reactivations",
    metodos: ["GET"],
    parametros: [],
    area: "leads",
    resumo: "GET /api/v1/leads/reactivations — as propostas de retomada VIVAS da org.",
  },
  {
    id: "lgpd/anonymize",
    caminho: "lgpd/anonymize",
    metodos: ["POST"],
    parametros: [],
    area: "lgpd",
    resumo: "",
  },
  {
    id: "lgpd/requests",
    caminho: "lgpd/requests",
    metodos: ["GET"],
    parametros: [],
    area: "lgpd",
    resumo: "GET /api/v1/lgpd/requests\n  Lista paginada de lgpd_requests para o tenant ativo.",
  },
  {
    id: "lgpd/requests/:id",
    caminho: "lgpd/requests/[id]",
    metodos: ["GET"],
    parametros: ["id"],
    area: "lgpd",
    resumo: "GET /api/v1/lgpd/requests/[id]\n  Detail of a single lgpd_request + audit trail entries for that request.",
  },
  {
    id: "lgpd/requests/:id/approve",
    caminho: "lgpd/requests/[id]/approve",
    metodos: ["POST"],
    parametros: ["id"],
    area: "lgpd",
    resumo: "",
  },
  {
    id: "lgpd/requests/:id/preview",
    caminho: "lgpd/requests/[id]/preview",
    metodos: ["GET"],
    parametros: ["id"],
    area: "lgpd",
    resumo: "GET /api/v1/lgpd/requests/[id]/preview\n  Dry-run preview: returns COUNTS + SAMPLE (10 rows per category) of the data\n that would be exported or redacted for this request.",
  },
  {
    id: "marca/logo",
    caminho: "marca/logo",
    metodos: ["POST", "DELETE"],
    parametros: [],
    area: "marca",
    resumo: "",
  },
  {
    id: "mcp/tools",
    caminho: "mcp/tools",
    metodos: ["GET"],
    parametros: [],
    area: "mcp",
    resumo: "GET /api/v1/mcp/tools\n  Catalogo de tools MCP serializado para a UI consumir (Spec 11 + EPIC-13\n S-13.03 AC).",
  },
  {
    id: "message-templates",
    caminho: "message-templates",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "message-templates",
    resumo: "",
  },
  {
    id: "message-templates/:id",
    caminho: "message-templates/[id]",
    metodos: ["PATCH", "DELETE"],
    parametros: ["id"],
    area: "message-templates",
    resumo: "",
  },
  {
    id: "message-templates/:id/midias",
    caminho: "message-templates/[id]/midias",
    metodos: ["POST"],
    parametros: ["id"],
    area: "message-templates",
    resumo: "",
  },
  {
    id: "message-templates/:id/midias/:indice",
    caminho: "message-templates/[id]/midias/[indice]",
    metodos: ["GET"],
    parametros: ["id", "indice"],
    area: "message-templates",
    resumo: "GET /api/v1/message-templates/:id/midias/:indice — devolve OS BYTES de uma\n imagem do template (#2526).",
  },
  {
    id: "messages",
    caminho: "messages",
    metodos: ["POST"],
    parametros: [],
    area: "messages",
    resumo: "",
  },
  {
    id: "messages/:id",
    caminho: "messages/[id]",
    metodos: ["PATCH", "DELETE"],
    parametros: ["id"],
    area: "messages",
    resumo: "Edição e revogação de mensagens de texto enviadas pelo próprio atendente.",
  },
  {
    id: "messages/:id/hide",
    caminho: "messages/[id]/hide",
    metodos: ["POST", "DELETE"],
    parametros: ["id"],
    area: "messages",
    resumo: "Ocultar uma mensagem recebida apenas no CRM, sem prometer exclusão no WhatsApp do cliente.",
  },
  {
    id: "messages/:id/media",
    caminho: "messages/[id]/media",
    metodos: ["GET"],
    parametros: ["id"],
    area: "messages",
    resumo: "",
  },
  {
    id: "metrics/atrito",
    caminho: "metrics/atrito",
    metodos: ["GET", "PATCH"],
    parametros: [],
    area: "metrics",
    resumo: "",
  },
  {
    id: "metrics/attendants",
    caminho: "metrics/attendants",
    metodos: ["GET"],
    parametros: [],
    area: "metrics",
    resumo: "GET /api/v1/metrics/attendants — métricas por responsável (spec 13 §6).",
  },
  {
    id: "metrics/channels",
    caminho: "metrics/channels",
    metodos: ["GET"],
    parametros: [],
    area: "metrics",
    resumo: "GET /api/v1/metrics/channels — o RELATÓRIO POR CANAL (issue #2390).",
  },
  {
    id: "metrics/funil",
    caminho: "metrics/funil",
    metodos: ["GET"],
    parametros: [],
    area: "metrics",
    resumo: "GET /api/v1/metrics/funil — análise do funil (issue #1750).",
  },
  {
    id: "metrics/lost",
    caminho: "metrics/lost",
    metodos: ["GET"],
    parametros: [],
    area: "metrics",
    resumo: "GET /api/v1/metrics/lost — relatório \"Perdas\" (issue #1537).",
  },
  {
    id: "modulos",
    caminho: "modulos",
    metodos: ["GET"],
    parametros: [],
    area: "modulos",
    resumo: "",
  },
  {
    id: "modulos/:modulo/:objeto",
    caminho: "modulos/[modulo]/[objeto]",
    metodos: ["GET"],
    parametros: ["modulo", "objeto"],
    area: "modulos",
    resumo: "",
  },
  {
    id: "modulos/instalar",
    caminho: "modulos/instalar",
    metodos: ["POST"],
    parametros: [],
    area: "modulos",
    resumo: "",
  },
  {
    id: "notifications/push",
    caminho: "notifications/push",
    metodos: ["GET", "PUT", "DELETE"],
    parametros: [],
    area: "notifications",
    resumo: "",
  },
  {
    id: "onboarding/whatsapp/qr",
    caminho: "onboarding/whatsapp/qr",
    metodos: ["GET"],
    parametros: [],
    area: "onboarding",
    resumo: "",
  },
  {
    id: "onboarding/whatsapp/session",
    caminho: "onboarding/whatsapp/session",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "onboarding",
    resumo: "",
  },
  {
    id: "people",
    caminho: "people",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "people",
    resumo: "",
  },
  {
    id: "people/:id",
    caminho: "people/[id]",
    metodos: ["GET", "PATCH"],
    parametros: ["id"],
    area: "people",
    resumo: "",
  },
  {
    id: "phone-numbers",
    caminho: "phone-numbers",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "phone-numbers",
    resumo: "GET/POST /api/v1/phone-numbers — números/DID de voz da org ativa.",
  },
  {
    id: "phone-numbers/:id",
    caminho: "phone-numbers/[id]",
    metodos: ["PATCH"],
    parametros: ["id"],
    area: "phone-numbers",
    resumo: "PATCH /api/v1/phone-numbers/[id] — edita um número já cadastrado.",
  },
  {
    id: "pipelines",
    caminho: "pipelines",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "pipelines",
    resumo: "",
  },
  {
    id: "pipelines/:id",
    caminho: "pipelines/[id]",
    metodos: ["PATCH", "DELETE"],
    parametros: ["id"],
    area: "pipelines",
    resumo: "",
  },
  {
    id: "pipelines/:id/agent-mapping",
    caminho: "pipelines/[id]/agent-mapping",
    metodos: ["GET", "PUT"],
    parametros: ["id"],
    area: "pipelines",
    resumo: "",
  },
  {
    id: "pipelines/:id/board",
    caminho: "pipelines/[id]/board",
    metodos: ["GET"],
    parametros: ["id"],
    area: "pipelines",
    resumo: "GET /api/v1/pipelines/[id]/board\n  Returns the full board snapshot for the Kanban: pipeline metadata + active\n stages (ordered by position) + open leads (excluding archived).",
  },
  {
    id: "pipelines/:id/forecast",
    caminho: "pipelines/[id]/forecast",
    metodos: ["GET"],
    parametros: ["id"],
    area: "pipelines",
    resumo: "GET /api/v1/pipelines/[id]/forecast — previsão ponderada de UM funil (issue #1535).",
  },
  {
    id: "pipelines/:id/stages",
    caminho: "pipelines/[id]/stages",
    metodos: ["GET", "POST"],
    parametros: ["id"],
    area: "pipelines",
    resumo: "",
  },
  {
    id: "pipelines/:id/stages/:stageId",
    caminho: "pipelines/[id]/stages/[stageId]",
    metodos: ["PATCH", "DELETE"],
    parametros: ["id", "stageId"],
    area: "pipelines",
    resumo: "",
  },
  {
    id: "pipelines/:id/stages/win-rates",
    caminho: "pipelines/[id]/stages/win-rates",
    metodos: ["GET"],
    parametros: ["id"],
    area: "pipelines",
    resumo: "",
  },
  {
    id: "pipelines/default",
    caminho: "pipelines/default",
    metodos: ["GET"],
    parametros: [],
    area: "pipelines",
    resumo: "GET /api/v1/pipelines/default — pipeline padrão da org ativa (o primeiro\n não-arquivado, se nenhum estiver marcado `is_default`), com estágios.",
  },
  {
    id: "plataformas-de-anuncio/google/callback",
    caminho: "plataformas-de-anuncio/google/callback",
    metodos: ["GET"],
    parametros: [],
    area: "plataformas-de-anuncio",
    resumo: "GET /api/v1/plataformas-de-anuncio/google/callback — a volta do\n consentimento do Google Ads.",
  },
  {
    id: "plataformas-de-anuncio/google/connect",
    caminho: "plataformas-de-anuncio/google/connect",
    metodos: ["GET"],
    parametros: [],
    area: "plataformas-de-anuncio",
    resumo: "GET /api/v1/plataformas-de-anuncio/google/connect — começa a conexão da\n organização com o Google Ads.",
  },
  {
    id: "products",
    caminho: "products",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "products",
    resumo: "",
  },
  {
    id: "products/:id",
    caminho: "products/[id]",
    metodos: ["PATCH", "DELETE"],
    parametros: ["id"],
    area: "products",
    resumo: "",
  },
  {
    id: "products/:id/fotos",
    caminho: "products/[id]/fotos",
    metodos: ["POST", "PUT"],
    parametros: ["id"],
    area: "products",
    resumo: "",
  },
  {
    id: "products/import",
    caminho: "products/import",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "products",
    resumo: "",
  },
  {
    id: "proposals",
    caminho: "proposals",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "proposals",
    resumo: "GET  /api/v1/proposals — lista as propostas da organização ativa.",
  },
  {
    id: "proposals/:id",
    caminho: "proposals/[id]",
    metodos: ["GET", "PATCH", "DELETE"],
    parametros: ["id"],
    area: "proposals",
    resumo: "",
  },
  {
    id: "proposals/:id/assistant",
    caminho: "proposals/[id]/assistant",
    metodos: ["POST"],
    parametros: ["id"],
    area: "proposals",
    resumo: "",
  },
  {
    id: "proposals/:id/assistant/apply",
    caminho: "proposals/[id]/assistant/apply",
    metodos: ["POST"],
    parametros: ["id"],
    area: "proposals",
    resumo: "",
  },
  {
    id: "proposals/:id/assistant/disponibilidade",
    caminho: "proposals/[id]/assistant/disponibilidade",
    metodos: ["GET"],
    parametros: ["id"],
    area: "proposals",
    resumo: "",
  },
  {
    id: "proposals/:id/decide",
    caminho: "proposals/[id]/decide",
    metodos: ["POST"],
    parametros: ["id"],
    area: "proposals",
    resumo: "",
  },
  {
    id: "proposals/:id/documento",
    caminho: "proposals/[id]/documento",
    metodos: ["GET", "PATCH"],
    parametros: ["id"],
    area: "proposals",
    resumo: "",
  },
  {
    id: "proposals/:id/modelo",
    caminho: "proposals/[id]/modelo",
    metodos: ["PATCH"],
    parametros: ["id"],
    area: "proposals",
    resumo: "",
  },
  {
    id: "proposals/:id/preencher-com-conversa",
    caminho: "proposals/[id]/preencher-com-conversa",
    metodos: ["POST"],
    parametros: ["id"],
    area: "proposals",
    resumo: "",
  },
  {
    id: "proposals/:id/previa",
    caminho: "proposals/[id]/previa",
    metodos: ["GET"],
    parametros: ["id"],
    area: "proposals",
    resumo: "",
  },
  {
    id: "proposals/:id/revise",
    caminho: "proposals/[id]/revise",
    metodos: ["POST"],
    parametros: ["id"],
    area: "proposals",
    resumo: "POST /api/v1/proposals/[id]/revise — D4.",
  },
  {
    id: "proposals/:id/send",
    caminho: "proposals/[id]/send",
    metodos: ["POST"],
    parametros: ["id"],
    area: "proposals",
    resumo: "",
  },
  {
    id: "prospecting",
    caminho: "prospecting",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "prospecting",
    resumo: "",
  },
  {
    id: "prospecting/agents",
    caminho: "prospecting/agents",
    metodos: ["POST"],
    parametros: [],
    area: "prospecting",
    resumo: "",
  },
  {
    id: "prospecting/agents/chat",
    caminho: "prospecting/agents/chat",
    metodos: ["POST"],
    parametros: [],
    area: "prospecting",
    resumo: "",
  },
  {
    id: "prospecting/agents/prepare",
    caminho: "prospecting/agents/prepare",
    metodos: ["POST"],
    parametros: [],
    area: "prospecting",
    resumo: "",
  },
  {
    id: "prospecting/agents/session",
    caminho: "prospecting/agents/session",
    metodos: ["GET", "PATCH"],
    parametros: [],
    area: "prospecting",
    resumo: "",
  },
  {
    id: "rastreio/:id",
    caminho: "rastreio/[id]",
    metodos: ["GET"],
    parametros: ["id"],
    area: "rastreio",
    resumo: "",
  },
  {
    id: "reports/activities",
    caminho: "reports/activities",
    metodos: ["GET"],
    parametros: [],
    area: "reports",
    resumo: "GET /api/v1/reports/activities — o que aconteceu na operação num período.",
  },
  {
    id: "reports/financeiro",
    caminho: "reports/financeiro",
    metodos: ["GET"],
    parametros: [],
    area: "reports",
    resumo: "O relatório do faturamento.",
  },
  {
    id: "reports/tags",
    caminho: "reports/tags",
    metodos: ["GET"],
    parametros: [],
    area: "reports",
    resumo: "GET /api/v1/reports/tags — o RELATÓRIO POR ETIQUETA (fatia F1 da #1833):\n qual assunto ocupou a operação neste período, e quanto tempo ele esperou.",
  },
  {
    id: "settings/api-tokens",
    caminho: "settings/api-tokens",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "settings",
    resumo: "",
  },
  {
    id: "settings/api-tokens/:id/revoke",
    caminho: "settings/api-tokens/[id]/revoke",
    metodos: ["POST"],
    parametros: ["id"],
    area: "settings",
    resumo: "",
  },
  {
    id: "settings/art15",
    caminho: "settings/art15",
    metodos: ["PATCH"],
    parametros: [],
    area: "settings",
    resumo: "PATCH /api/v1/settings/art15 — as alíneas a), c) e d) do art.",
  },
  {
    id: "settings/assinatura",
    caminho: "settings/assinatura",
    metodos: ["GET", "PATCH"],
    parametros: [],
    area: "settings",
    resumo: "GET   /api/v1/settings/assinatura — a assinatura do emissor (#2066).",
  },
  {
    id: "settings/campanhas",
    caminho: "settings/campanhas",
    metodos: ["GET", "PATCH"],
    parametros: [],
    area: "settings",
    resumo: "GET   /api/v1/settings/campanhas — os padrões de campanha da organização.",
  },
  {
    id: "settings/proposal-templates",
    caminho: "settings/proposal-templates",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "settings",
    resumo: "",
  },
  {
    id: "settings/proposal-templates/:slug",
    caminho: "settings/proposal-templates/[slug]",
    metodos: ["GET", "PATCH", "DELETE"],
    parametros: ["slug"],
    area: "settings",
    resumo: "",
  },
  {
    id: "settings/proposal-templates/importar",
    caminho: "settings/proposal-templates/importar",
    metodos: ["POST"],
    parametros: [],
    area: "settings",
    resumo: "",
  },
  {
    id: "settings/proposals",
    caminho: "settings/proposals",
    metodos: ["GET", "PATCH"],
    parametros: [],
    area: "settings",
    resumo: "",
  },
  {
    id: "settings/routing",
    caminho: "settings/routing",
    metodos: ["GET", "PATCH"],
    parametros: [],
    area: "settings",
    resumo: "",
  },
  {
    id: "settings/routing/channels",
    caminho: "settings/routing/channels",
    metodos: ["GET", "PATCH"],
    parametros: [],
    area: "settings",
    resumo: "",
  },
  {
    id: "settings/sons",
    caminho: "settings/sons",
    metodos: ["GET", "POST", "DELETE"],
    parametros: [],
    area: "settings",
    resumo: "",
  },
  {
    id: "settings/task-plans",
    caminho: "settings/task-plans",
    metodos: ["GET", "PATCH"],
    parametros: [],
    area: "settings",
    resumo: "GET   /api/v1/settings/task-plans — os planos de tarefa da organização.",
  },
  {
    id: "system/agent",
    caminho: "system/agent",
    metodos: ["POST"],
    parametros: [],
    area: "system",
    resumo: "POST /api/v1/system/agent — endpoint ÚNICO do agente do host.",
  },
  {
    id: "system/instalacao",
    caminho: "system/instalacao",
    metodos: ["GET"],
    parametros: [],
    area: "system",
    resumo: "O RETRATO DA INSTALAÇÃO — o que já veio pronto e o que falta.",
  },
  {
    id: "system/relogio/tick",
    caminho: "system/relogio/tick",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "system",
    resumo: "",
  },
  {
    id: "system/update",
    caminho: "system/update",
    metodos: ["POST"],
    parametros: [],
    area: "system",
    resumo: "",
  },
  {
    id: "system/version",
    caminho: "system/version",
    metodos: ["GET"],
    parametros: [],
    area: "system",
    resumo: "GET /api/v1/system/version — estado da atualização para a tela.",
  },
  {
    id: "tags/cores",
    caminho: "tags/cores",
    metodos: ["GET"],
    parametros: [],
    area: "tags",
    resumo: "GET /api/v1/tags/cores — as cores das etiquetas da organização ativa\n (issue #1271, fatia S6 da #852).",
  },
  {
    id: "tags/vocabulario",
    caminho: "tags/vocabulario",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "tags",
    resumo: "GET/POST /api/v1/tags/vocabulario — o vocabulário de etiquetas da organização\n ativa, e as operações que faltavam nele (issue #852, fatia S4; cor: #1271, S6).",
  },
  {
    id: "tasks",
    caminho: "tasks",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "tasks",
    resumo: "",
  },
  {
    id: "tasks/:id",
    caminho: "tasks/[id]",
    metodos: ["PATCH", "DELETE"],
    parametros: ["id"],
    area: "tasks",
    resumo: "",
  },
  {
    id: "team",
    caminho: "team",
    metodos: ["GET"],
    parametros: [],
    area: "team",
    resumo: "",
  },
  {
    id: "team/:user_id",
    caminho: "team/[user_id]",
    metodos: ["PATCH"],
    parametros: ["user_id"],
    area: "team",
    resumo: "",
  },
  {
    id: "team/:user_id/interface",
    caminho: "team/[user_id]/interface",
    metodos: ["PATCH"],
    parametros: ["user_id"],
    area: "team",
    resumo: "",
  },
  {
    id: "team/:user_id/reactivate",
    caminho: "team/[user_id]/reactivate",
    metodos: ["POST"],
    parametros: ["user_id"],
    area: "team",
    resumo: "",
  },
  {
    id: "team/:user_id/revoke",
    caminho: "team/[user_id]/revoke",
    metodos: ["POST"],
    parametros: ["user_id"],
    area: "team",
    resumo: "",
  },
  {
    id: "team/:user_id/role",
    caminho: "team/[user_id]/role",
    metodos: ["PATCH"],
    parametros: ["user_id"],
    area: "team",
    resumo: "",
  },
  {
    id: "team/assignable",
    caminho: "team/assignable",
    metodos: ["GET"],
    parametros: [],
    area: "team",
    resumo: "GET /api/v1/team/assignable — destinos válidos de transferência de conversa\n (G3-01, ReassignDialog): membros ativos agent+ da org ativa.",
  },
  {
    id: "team/invite",
    caminho: "team/invite",
    metodos: ["POST"],
    parametros: [],
    area: "team",
    resumo: "",
  },
  {
    id: "team/invites",
    caminho: "team/invites",
    metodos: ["GET"],
    parametros: [],
    area: "team",
    resumo: "GET /api/v1/team/invites — convites da organização ativa (migration 0238).",
  },
  {
    id: "team/invites/:id/resend",
    caminho: "team/invites/[id]/resend",
    metodos: ["POST"],
    parametros: ["id"],
    area: "team",
    resumo: "POST /api/v1/team/invites/[id]/resend — reenvia um convite pendente.",
  },
  {
    id: "team/invites/:id/revoke",
    caminho: "team/invites/[id]/revoke",
    metodos: ["POST"],
    parametros: ["id"],
    area: "team",
    resumo: "POST /api/v1/team/invites/[id]/revoke — cancela um convite pendente.",
  },
  {
    id: "tenants/provision",
    caminho: "tenants/provision",
    metodos: ["POST"],
    parametros: [],
    area: "tenants",
    resumo: "POST /api/v1/tenants/provision — um sistema externo cria (ou reencontra,\n idempotente por integração + id externo) uma organização e recebe uma chave\n de API `dsk_…` para operá-la.",
  },
  {
    id: "voice/calls",
    caminho: "voice/calls",
    metodos: ["POST"],
    parametros: [],
    area: "voice",
    resumo: "POST /api/v1/voice/calls — inicia chamada de voz outbound (§5.1 da spec).",
  },
  {
    id: "voice/calls/:id",
    caminho: "voice/calls/[id]",
    metodos: ["DELETE"],
    parametros: ["id"],
    area: "voice",
    resumo: "DELETE /api/v1/voice/calls/[id] — encerra uma chamada ativa (§5.3).",
  },
  {
    id: "voice/calls/:id/accept",
    caminho: "voice/calls/[id]/accept",
    metodos: ["POST"],
    parametros: ["id"],
    area: "voice",
    resumo: "POST /api/v1/voice/calls/[id]/accept — atende uma chamada recebida (§5.2).",
  },
  {
    id: "voice/calls/:id/reject",
    caminho: "voice/calls/[id]/reject",
    metodos: ["POST"],
    parametros: ["id"],
    area: "voice",
    resumo: "POST /api/v1/voice/calls/[id]/reject — recusa uma chamada recebida (§5.2).",
  },
  {
    id: "voice/calls/:id/webrtc",
    caminho: "voice/calls/[id]/webrtc",
    metodos: ["POST"],
    parametros: ["id"],
    area: "voice",
    resumo: "POST /api/v1/voice/calls/[id]/webrtc — relay puro do SDP entre o navegador\n e o WaCalls (§4.1 da spec).",
  },
  {
    id: "voice/calls/history",
    caminho: "voice/calls/history",
    metodos: ["GET"],
    parametros: [],
    area: "voice",
    resumo: "GET /api/v1/voice/calls/history — histórico de chamadas da organização.",
  },
  {
    id: "voice/events",
    caminho: "voice/events",
    metodos: ["GET"],
    parametros: [],
    area: "voice",
    resumo: "GET /api/v1/voice/events — relay SSE do pareamento de chamada de voz pro\n navegador (spec §4.2/§5.1).",
  },
  {
    id: "voice/opt-in",
    caminho: "voice/opt-in",
    metodos: ["GET", "PUT"],
    parametros: [],
    area: "voice",
    resumo: "GET/PUT /api/v1/voice/opt-in — a chamada de voz desta organização está ligada?\n  ═══ O QUE ESTA ROTA LIGA, E POR QUE ELA EXISTE ═══\n  A chamada de voz (spec 18) vincula um SEGUNDO APARELHO ao mesmo número de\n WhatsApp que já atende, por um caminho que não é o oficial.",
  },
  {
    id: "voice/sessions",
    caminho: "voice/sessions",
    metodos: ["DELETE"],
    parametros: [],
    area: "voice",
    resumo: "DELETE /api/v1/voice/sessions — desconecta a chamada de voz desta organização.",
  },
  {
    id: "voice/sessions/pair",
    caminho: "voice/sessions/pair",
    metodos: ["POST"],
    parametros: [],
    area: "voice",
    resumo: "POST /api/v1/voice/sessions/pair — inicia (ou reinicia) o pareamento de\n chamada de voz WhatsApp da organização.",
  },
  {
    id: "voice/sessions/status",
    caminho: "voice/sessions/status",
    metodos: ["GET"],
    parametros: [],
    area: "voice",
    resumo: "GET /api/v1/voice/sessions/status — estado do pareamento de chamada de voz\n da organização ativa.",
  },
  {
    id: "voip/trunk",
    caminho: "voip/trunk",
    metodos: ["GET", "PUT"],
    parametros: [],
    area: "voip",
    resumo: "GET /api/v1/voip/trunk — configuração do trunk SIP da org ativa (manager+),\n                           via view segura (nunca expõe a senha cifrada).",
  },
  {
    id: "webhook-sources",
    caminho: "webhook-sources",
    metodos: ["GET", "POST"],
    parametros: [],
    area: "webhook-sources",
    resumo: "",
  },
  {
    id: "webhook-sources/:id",
    caminho: "webhook-sources/[id]",
    metodos: ["PATCH", "DELETE"],
    parametros: ["id"],
    area: "webhook-sources",
    resumo: "",
  },
  {
    id: "webhook-sources/:id/events",
    caminho: "webhook-sources/[id]/events",
    metodos: ["GET"],
    parametros: ["id"],
    area: "webhook-sources",
    resumo: "GET /api/v1/webhook-sources/[id]/events — feed de recebimentos da fonte\n (últimos 20), pra UI mostrar \"chegou / não chegou\" em tempo quase real\n depois do botão \"Enviar lead de teste\".",
  },
  {
    id: "webhooks/channel/:token",
    caminho: "webhooks/channel/[token]",
    metodos: ["POST"],
    parametros: ["token"],
    area: "webhooks",
    resumo: "POST /api/v1/webhooks/channel/[token] — entrada por token, para qualquer canal.",
  },
  {
    id: "webhooks/cobranca/:provedor",
    caminho: "webhooks/cobranca/[provedor]",
    metodos: ["POST"],
    parametros: ["provedor"],
    area: "webhooks",
    resumo: "POST /api/v1/webhooks/cobranca/[provedor] — o aviso do provedor de pagamento\n (spec da cobrança do revendedor §7c, §2.4).",
  },
  {
    id: "webhooks/in/:token",
    caminho: "webhooks/in/[token]",
    metodos: ["POST"],
    parametros: ["token"],
    area: "webhooks",
    resumo: "POST /api/v1/webhooks/in/[token] — captação pública de leads.",
  },
  {
    id: "webhooks/meta/:token",
    caminho: "webhooks/meta/[token]",
    metodos: ["GET", "POST"],
    parametros: ["token"],
    area: "webhooks",
    resumo: "GET|POST /api/v1/webhooks/meta/[token] — webhook da WhatsApp Cloud API.",
  },
  {
    id: "webhooks/nuvemshop/:event",
    caminho: "webhooks/nuvemshop/[event]",
    metodos: ["POST"],
    parametros: ["event"],
    area: "webhooks",
    resumo: "POST /api/v1/webhooks/nuvemshop/[event]\n  Catch-all receiver for the 8 mandatory Nuvemshop webhooks.",
  },
  {
    id: "webhooks/nuvemshop/customer-data-request",
    caminho: "webhooks/nuvemshop/customer-data-request",
    metodos: ["POST"],
    parametros: [],
    area: "webhooks",
    resumo: "POST /api/v1/webhooks/nuvemshop/customer-data-request\n  Receives Nuvemshop `customer/data_request` LGPD webhook.",
  },
  {
    id: "webhooks/nuvemshop/customer-redact",
    caminho: "webhooks/nuvemshop/customer-redact",
    metodos: ["POST"],
    parametros: [],
    area: "webhooks",
    resumo: "POST /api/v1/webhooks/nuvemshop/customer-redact\n  Receives Nuvemshop `customer/redact` LGPD webhook.",
  },
  {
    id: "webhooks/nuvemshop/store-redact",
    caminho: "webhooks/nuvemshop/store-redact",
    metodos: ["POST"],
    parametros: [],
    area: "webhooks",
    resumo: "POST /api/v1/webhooks/nuvemshop/store-redact\n  Receives Nuvemshop `store/redact` LGPD webhook — the \"nuclear\" webhook\n emitted when a merchant uninstalls the app.",
  },
  {
    id: "webhooks/waha",
    caminho: "webhooks/waha",
    metodos: ["POST"],
    parametros: [],
    area: "webhooks",
    resumo: "POST /api/v1/webhooks/waha — global webhook receiver (no path token).",
  },
  {
    id: "webhooks/waha/:token",
    caminho: "webhooks/waha/[token]",
    metodos: ["POST"],
    parametros: ["token"],
    area: "webhooks",
    resumo: "POST /api/v1/webhooks/waha/[token]\n  Rota per-tenant canônica de produção: cada channel_session tem um\n webhook_path_token único url-safe.",
  },
] as const;

// Carregadores de leitura permitida (GET e nao proibido).
// O bundler nao aceita import com caminho variavel, entao cada um e um
// import() de caminho literal, no padrao de proposta-comum.ts.
export const CARREGADORES: Record<string, () => Promise<Record<string, unknown>>> = {
  "ads/meta/accounts": async () => {
    const mod = await import("@/app/api/v1/ads/meta/accounts/route");
    return { GET: mod.GET };
  },
  "ads/meta/campaigns": async () => {
    const mod = await import("@/app/api/v1/ads/meta/campaigns/route");
    return { GET: mod.GET };
  },
  "agenda/agendamentos": async () => {
    const mod = await import("@/app/api/v1/agenda/agendamentos/route");
    return { GET: mod.GET };
  },
  "agenda/agendamentos/:id": async () => {
    const mod = await import("@/app/api/v1/agenda/agendamentos/[id]/route");
    return { GET: mod.GET };
  },
  "agenda/configuracao": async () => {
    const mod = await import("@/app/api/v1/agenda/configuracao/route");
    return { GET: mod.GET };
  },
  "agenda/enderecos": async () => {
    const mod = await import("@/app/api/v1/agenda/enderecos/route");
    return { GET: mod.GET };
  },
  "agenda/excecoes": async () => {
    const mod = await import("@/app/api/v1/agenda/excecoes/route");
    return { GET: mod.GET };
  },
  "agenda/google/calendarios": async () => {
    const mod = await import("@/app/api/v1/agenda/google/calendarios/route");
    return { GET: mod.GET };
  },
  "agenda/google/callback": async () => {
    const mod = await import("@/app/api/v1/agenda/google/callback/route");
    return { GET: mod.GET };
  },
  "agenda/google/connect": async () => {
    const mod = await import("@/app/api/v1/agenda/google/connect/route");
    return { GET: mod.GET };
  },
  "agenda/horarios-livres": async () => {
    const mod = await import("@/app/api/v1/agenda/horarios-livres/route");
    return { GET: mod.GET };
  },
  "agenda/pessoas": async () => {
    const mod = await import("@/app/api/v1/agenda/pessoas/route");
    return { GET: mod.GET };
  },
  "agenda/tipos": async () => {
    const mod = await import("@/app/api/v1/agenda/tipos/route");
    return { GET: mod.GET };
  },
  "agenda/vinculos": async () => {
    const mod = await import("@/app/api/v1/agenda/vinculos/route");
    return { GET: mod.GET };
  },
  "ai/agents": async () => {
    const mod = await import("@/app/api/v1/ai/agents/route");
    return { GET: mod.GET };
  },
  "ai/agents/:id": async () => {
    const mod = await import("@/app/api/v1/ai/agents/[id]/route");
    return { GET: mod.GET };
  },
  "ai/agents/:id/proposals": async () => {
    const mod = await import("@/app/api/v1/ai/agents/[id]/proposals/route");
    return { GET: mod.GET };
  },
  "ai/agents/:id/runs": async () => {
    const mod = await import("@/app/api/v1/ai/agents/[id]/runs/route");
    return { GET: mod.GET };
  },
  "ai/agents/:id/tool-usage": async () => {
    const mod = await import("@/app/api/v1/ai/agents/[id]/tool-usage/route");
    return { GET: mod.GET };
  },
  "ai/agents/:id/versions": async () => {
    const mod = await import("@/app/api/v1/ai/agents/[id]/versions/route");
    return { GET: mod.GET };
  },
  "ai/agents/:id/versions/:vid": async () => {
    const mod = await import("@/app/api/v1/ai/agents/[id]/versions/[vid]/route");
    return { GET: mod.GET };
  },
  "ai/agents/assignable": async () => {
    const mod = await import("@/app/api/v1/ai/agents/assignable/route");
    return { GET: mod.GET };
  },
  "ai/assistente/auditoria": async () => {
    const mod = await import("@/app/api/v1/ai/assistente/auditoria/route");
    return { GET: mod.GET };
  },
  "ai/assistente/propostas": async () => {
    const mod = await import("@/app/api/v1/ai/assistente/propostas/route");
    return { GET: mod.GET };
  },
  "ai/assistente/threads": async () => {
    const mod = await import("@/app/api/v1/ai/assistente/threads/route");
    return { GET: mod.GET };
  },
  "ai/assistente/threads/:id/messages": async () => {
    const mod = await import("@/app/api/v1/ai/assistente/threads/[id]/messages/route");
    return { GET: mod.GET };
  },
  "ai/automatico-ativo": async () => {
    const mod = await import("@/app/api/v1/ai/automatico-ativo/route");
    return { GET: mod.GET };
  },
  "ai/budget": async () => {
    const mod = await import("@/app/api/v1/ai/budget/route");
    return { GET: mod.GET };
  },
  "ai/cases": async () => {
    const mod = await import("@/app/api/v1/ai/cases/route");
    return { GET: mod.GET };
  },
  "ai/cases/:id": async () => {
    const mod = await import("@/app/api/v1/ai/cases/[id]/route");
    return { GET: mod.GET };
  },
  "ai/cases/:id/chat": async () => {
    const mod = await import("@/app/api/v1/ai/cases/[id]/chat/route");
    return { GET: mod.GET };
  },
  "ai/cases/alerta": async () => {
    const mod = await import("@/app/api/v1/ai/cases/alerta/route");
    return { GET: mod.GET };
  },
  "ai/credentials": async () => {
    const mod = await import("@/app/api/v1/ai/credentials/route");
    return { GET: mod.GET };
  },
  "ai/evolution": async () => {
    const mod = await import("@/app/api/v1/ai/evolution/route");
    return { GET: mod.GET };
  },
  "ai/followup-flows": async () => {
    const mod = await import("@/app/api/v1/ai/followup-flows/route");
    return { GET: mod.GET };
  },
  "ai/followup-flows/:id": async () => {
    const mod = await import("@/app/api/v1/ai/followup-flows/[id]/route");
    return { GET: mod.GET };
  },
  "ai/followup-flows/:id/export": async () => {
    const mod = await import("@/app/api/v1/ai/followup-flows/[id]/export/route");
    return { GET: mod.GET };
  },
  "ai/followup-flows/modelos-aprovados": async () => {
    const mod = await import("@/app/api/v1/ai/followup-flows/modelos-aprovados/route");
    return { GET: mod.GET };
  },
  "ai/followups/enrollments": async () => {
    const mod = await import("@/app/api/v1/ai/followups/enrollments/route");
    return { GET: mod.GET };
  },
  "ai/followups/enrollments/:id": async () => {
    const mod = await import("@/app/api/v1/ai/followups/enrollments/[id]/route");
    return { GET: mod.GET };
  },
  "ai/followups/queue": async () => {
    const mod = await import("@/app/api/v1/ai/followups/queue/route");
    return { GET: mod.GET };
  },
  "ai/guardrail-layers": async () => {
    const mod = await import("@/app/api/v1/ai/guardrail-layers/route");
    return { GET: mod.GET };
  },
  "ai/inbox": async () => {
    const mod = await import("@/app/api/v1/ai/inbox/route");
    return { GET: mod.GET };
  },
  "ai/jev": async () => {
    const mod = await import("@/app/api/v1/ai/jev/route");
    return { GET: mod.GET };
  },
  "ai/knowledge/chave": async () => {
    const mod = await import("@/app/api/v1/ai/knowledge/chave/route");
    return { GET: mod.GET };
  },
  "ai/knowledge/sources": async () => {
    const mod = await import("@/app/api/v1/ai/knowledge/sources/route");
    return { GET: mod.GET };
  },
  "ai/knowledge/sources/:id": async () => {
    const mod = await import("@/app/api/v1/ai/knowledge/sources/[id]/route");
    return { GET: mod.GET };
  },
  "ai/knowledge/sources/:id/trechos": async () => {
    const mod = await import("@/app/api/v1/ai/knowledge/sources/[id]/trechos/route");
    return { GET: mod.GET };
  },
  "ai/mapas": async () => {
    const mod = await import("@/app/api/v1/ai/mapas/route");
    return { GET: mod.GET };
  },
  "ai/memory": async () => {
    const mod = await import("@/app/api/v1/ai/memory/route");
    return { GET: mod.GET };
  },
  "ai/memory/versions/:id": async () => {
    const mod = await import("@/app/api/v1/ai/memory/versions/[id]/route");
    return { GET: mod.GET };
  },
  "ai/operator-metrics": async () => {
    const mod = await import("@/app/api/v1/ai/operator-metrics/route");
    return { GET: mod.GET };
  },
  "ai/pacing": async () => {
    const mod = await import("@/app/api/v1/ai/pacing/route");
    return { GET: mod.GET };
  },
  "ai/providers": async () => {
    const mod = await import("@/app/api/v1/ai/providers/route");
    return { GET: mod.GET };
  },
  "ai/providers/:provider/models": async () => {
    const mod = await import("@/app/api/v1/ai/providers/[provider]/models/route");
    return { GET: mod.GET };
  },
  "ai/routers": async () => {
    const mod = await import("@/app/api/v1/ai/routers/route");
    return { GET: mod.GET };
  },
  "ai/routers/:id": async () => {
    const mod = await import("@/app/api/v1/ai/routers/[id]/route");
    return { GET: mod.GET };
  },
  "ai/routing-results": async () => {
    const mod = await import("@/app/api/v1/ai/routing-results/route");
    return { GET: mod.GET };
  },
  "ai/runs": async () => {
    const mod = await import("@/app/api/v1/ai/runs/route");
    return { GET: mod.GET };
  },
  "ai/skills": async () => {
    const mod = await import("@/app/api/v1/ai/skills/route");
    return { GET: mod.GET };
  },
  "ai/skills/:name": async () => {
    const mod = await import("@/app/api/v1/ai/skills/[name]/route");
    return { GET: mod.GET };
  },
  "ai/skills/:name/versions": async () => {
    const mod = await import("@/app/api/v1/ai/skills/[name]/versions/route");
    return { GET: mod.GET };
  },
  "ai/style-adjustments": async () => {
    const mod = await import("@/app/api/v1/ai/style-adjustments/route");
    return { GET: mod.GET };
  },
  "ai/usage": async () => {
    const mod = await import("@/app/api/v1/ai/usage/route");
    return { GET: mod.GET };
  },
  "anuncios/google/:org": async () => {
    const mod = await import("@/app/api/v1/anuncios/google/[org]/route");
    return { GET: mod.GET };
  },
  "anuncios/meta/:org": async () => {
    const mod = await import("@/app/api/v1/anuncios/meta/[org]/route");
    return { GET: mod.GET };
  },
  "attendants/availability": async () => {
    const mod = await import("@/app/api/v1/attendants/availability/route");
    return { GET: mod.GET };
  },
  "audit": async () => {
    const mod = await import("@/app/api/v1/audit/route");
    return { GET: mod.GET };
  },
  "audit/export": async () => {
    const mod = await import("@/app/api/v1/audit/export/route");
    return { GET: mod.GET };
  },
  "automation-rules": async () => {
    const mod = await import("@/app/api/v1/automation-rules/route");
    return { GET: mod.GET };
  },
  "automation-rules/:id/runs": async () => {
    const mod = await import("@/app/api/v1/automation-rules/[id]/runs/route");
    return { GET: mod.GET };
  },
  "automation-rules/runs": async () => {
    const mod = await import("@/app/api/v1/automation-rules/runs/route");
    return { GET: mod.GET };
  },
  "calls": async () => {
    const mod = await import("@/app/api/v1/calls/route");
    return { GET: mod.GET };
  },
  "campaign-suppressions": async () => {
    const mod = await import("@/app/api/v1/campaign-suppressions/route");
    return { GET: mod.GET };
  },
  "campaign-templates": async () => {
    const mod = await import("@/app/api/v1/campaign-templates/route");
    return { GET: mod.GET };
  },
  "campaigns": async () => {
    const mod = await import("@/app/api/v1/campaigns/route");
    return { GET: mod.GET };
  },
  "channel-schedules": async () => {
    const mod = await import("@/app/api/v1/channel-schedules/route");
    return { GET: mod.GET };
  },
  "channel-sessions": async () => {
    const mod = await import("@/app/api/v1/channel-sessions/route");
    return { GET: mod.GET };
  },
  "channel-sessions/:id": async () => {
    const mod = await import("@/app/api/v1/channel-sessions/[id]/route");
    return { GET: mod.GET };
  },
  "channel-sessions/:id/acervo": async () => {
    const mod = await import("@/app/api/v1/channel-sessions/[id]/acervo/route");
    return { GET: mod.GET };
  },
  "channel-sessions/:id/ai-access": async () => {
    const mod = await import("@/app/api/v1/channel-sessions/[id]/ai-access/route");
    return { GET: mod.GET };
  },
  "channel-sessions/:id/disabled": async () => {
    const mod = await import("@/app/api/v1/channel-sessions/[id]/disabled/route");
    return { GET: mod.GET };
  },
  "channel-sessions/:id/groups": async () => {
    const mod = await import("@/app/api/v1/channel-sessions/[id]/groups/route");
    return { GET: mod.GET };
  },
  "channel-sessions/:id/qr": async () => {
    const mod = await import("@/app/api/v1/channel-sessions/[id]/qr/route");
    return { GET: mod.GET };
  },
  "channels/graph-partner": async () => {
    const mod = await import("@/app/api/v1/channels/graph-partner/route");
    return { GET: mod.GET };
  },
  "channels/graph-partner/templates": async () => {
    const mod = await import("@/app/api/v1/channels/graph-partner/templates/route");
    return { GET: mod.GET };
  },
  "channels/official": async () => {
    const mod = await import("@/app/api/v1/channels/official/route");
    return { GET: mod.GET };
  },
  "channels/partner": async () => {
    const mod = await import("@/app/api/v1/channels/partner/route");
    return { GET: mod.GET };
  },
  "channels/partner/templates": async () => {
    const mod = await import("@/app/api/v1/channels/partner/templates/route");
    return { GET: mod.GET };
  },
  "channels/social": async () => {
    const mod = await import("@/app/api/v1/channels/social/route");
    return { GET: mod.GET };
  },
  "channels/templates": async () => {
    const mod = await import("@/app/api/v1/channels/templates/route");
    return { GET: mod.GET };
  },
  "companies": async () => {
    const mod = await import("@/app/api/v1/companies/route");
    return { GET: mod.GET };
  },
  "companies/:id": async () => {
    const mod = await import("@/app/api/v1/companies/[id]/route");
    return { GET: mod.GET };
  },
  "companies/lookup": async () => {
    const mod = await import("@/app/api/v1/companies/lookup/route");
    return { GET: mod.GET };
  },
  "contact-tags": async () => {
    const mod = await import("@/app/api/v1/contact-tags/route");
    return { GET: mod.GET };
  },
  "contacts": async () => {
    const mod = await import("@/app/api/v1/contacts/route");
    return { GET: mod.GET };
  },
  "contacts/:id": async () => {
    const mod = await import("@/app/api/v1/contacts/[id]/route");
    return { GET: mod.GET };
  },
  "contacts/:id/avatar": async () => {
    const mod = await import("@/app/api/v1/contacts/[id]/avatar/route");
    return { GET: mod.GET };
  },
  "contacts/:id/carteira": async () => {
    const mod = await import("@/app/api/v1/contacts/[id]/carteira/route");
    return { GET: mod.GET };
  },
  "contacts/:id/crm-summary": async () => {
    const mod = await import("@/app/api/v1/contacts/[id]/crm-summary/route");
    return { GET: mod.GET };
  },
  "contacts/:id/hierarquia-do-anuncio": async () => {
    const mod = await import("@/app/api/v1/contacts/[id]/hierarquia-do-anuncio/route");
    return { GET: mod.GET };
  },
  "contacts/:id/proposals": async () => {
    const mod = await import("@/app/api/v1/contacts/[id]/proposals/route");
    return { GET: mod.GET };
  },
  "contacts/:id/roteiros": async () => {
    const mod = await import("@/app/api/v1/contacts/[id]/roteiros/route");
    return { GET: mod.GET };
  },
  "contacts/:id/timeline": async () => {
    const mod = await import("@/app/api/v1/contacts/[id]/timeline/route");
    return { GET: mod.GET };
  },
  "contacts/:id/vinculos": async () => {
    const mod = await import("@/app/api/v1/contacts/[id]/vinculos/route");
    return { GET: mod.GET };
  },
  "contacts/duplicates": async () => {
    const mod = await import("@/app/api/v1/contacts/duplicates/route");
    return { GET: mod.GET };
  },
  "contacts/export": async () => {
    const mod = await import("@/app/api/v1/contacts/export/route");
    return { GET: mod.GET };
  },
  "conversation-tags": async () => {
    const mod = await import("@/app/api/v1/conversation-tags/route");
    return { GET: mod.GET };
  },
  "conversations": async () => {
    const mod = await import("@/app/api/v1/conversations/route");
    return { GET: mod.GET };
  },
  "conversations/:id": async () => {
    const mod = await import("@/app/api/v1/conversations/[id]/route");
    return { GET: mod.GET };
  },
  "conversations/:id/aviso-de-mensagem": async () => {
    const mod = await import("@/app/api/v1/conversations/[id]/aviso-de-mensagem/route");
    return { GET: mod.GET };
  },
  "conversations/:id/draft-reply": async () => {
    const mod = await import("@/app/api/v1/conversations/[id]/draft-reply/route");
    return { GET: mod.GET };
  },
  "conversations/:id/export": async () => {
    const mod = await import("@/app/api/v1/conversations/[id]/export/route");
    return { GET: mod.GET };
  },
  "conversations/:id/messages": async () => {
    const mod = await import("@/app/api/v1/conversations/[id]/messages/route");
    return { GET: mod.GET };
  },
  "conversations/:id/notes": async () => {
    const mod = await import("@/app/api/v1/conversations/[id]/notes/route");
    return { GET: mod.GET };
  },
  "conversations/:id/notes/:noteId/media": async () => {
    const mod = await import("@/app/api/v1/conversations/[id]/notes/[noteId]/media/route");
    return { GET: mod.GET };
  },
  "conversations/:id/passagens": async () => {
    const mod = await import("@/app/api/v1/conversations/[id]/passagens/route");
    return { GET: mod.GET };
  },
  "conversations/:id/retention": async () => {
    const mod = await import("@/app/api/v1/conversations/[id]/retention/route");
    return { GET: mod.GET };
  },
  "conversations/counts": async () => {
    const mod = await import("@/app/api/v1/conversations/counts/route");
    return { GET: mod.GET };
  },
  "extensions": async () => {
    const mod = await import("@/app/api/v1/extensions/route");
    return { GET: mod.GET };
  },
  "external-db/connections": async () => {
    const mod = await import("@/app/api/v1/external-db/connections/route");
    return { GET: mod.GET };
  },
  "external-db/connections/:id": async () => {
    const mod = await import("@/app/api/v1/external-db/connections/[id]/route");
    return { GET: mod.GET };
  },
  "external-db/connections/:id/catalog": async () => {
    const mod = await import("@/app/api/v1/external-db/connections/[id]/catalog/route");
    return { GET: mod.GET };
  },
  "external-db/connections/:id/schemas": async () => {
    const mod = await import("@/app/api/v1/external-db/connections/[id]/schemas/route");
    return { GET: mod.GET };
  },
  "external-db/connections/:id/sources": async () => {
    const mod = await import("@/app/api/v1/external-db/connections/[id]/sources/route");
    return { GET: mod.GET };
  },
  "external-db/connections/:id/tables/:schema/:tabela": async () => {
    const mod = await import("@/app/api/v1/external-db/connections/[id]/tables/[schema]/[tabela]/route");
    return { GET: mod.GET };
  },
  "financeiro/catalogo/:tipo": async () => {
    const mod = await import("@/app/api/v1/financeiro/catalogo/[tipo]/route");
    return { GET: mod.GET };
  },
  "financeiro/comandas": async () => {
    const mod = await import("@/app/api/v1/financeiro/comandas/route");
    return { GET: mod.GET };
  },
  "financeiro/comandas/:id": async () => {
    const mod = await import("@/app/api/v1/financeiro/comandas/[id]/route");
    return { GET: mod.GET };
  },
  "financeiro/comandas/pendentes": async () => {
    const mod = await import("@/app/api/v1/financeiro/comandas/pendentes/route");
    return { GET: mod.GET };
  },
  "financeiro/fidelidade": async () => {
    const mod = await import("@/app/api/v1/financeiro/fidelidade/route");
    return { GET: mod.GET };
  },
  "financeiro/lancamentos": async () => {
    const mod = await import("@/app/api/v1/financeiro/lancamentos/route");
    return { GET: mod.GET };
  },
  "health": async () => {
    const mod = await import("@/app/api/v1/health/route");
    return { GET: mod.GET };
  },
  "honorarios/contratos": async () => {
    const mod = await import("@/app/api/v1/honorarios/contratos/route");
    return { GET: mod.GET };
  },
  "honorarios/contratos/:id/parcelas": async () => {
    const mod = await import("@/app/api/v1/honorarios/contratos/[id]/parcelas/route");
    return { GET: mod.GET };
  },
  "imports": async () => {
    const mod = await import("@/app/api/v1/imports/route");
    return { GET: mod.GET };
  },
  "imports/:id": async () => {
    const mod = await import("@/app/api/v1/imports/[id]/route");
    return { GET: mod.GET };
  },
  "integrations/nuvemshop/callback": async () => {
    const mod = await import("@/app/api/v1/integrations/nuvemshop/callback/route");
    return { GET: mod.GET };
  },
  "lead-captures": async () => {
    const mod = await import("@/app/api/v1/lead-captures/route");
    return { GET: mod.GET };
  },
  "leads/:id/clone": async () => {
    const mod = await import("@/app/api/v1/leads/[id]/clone/route");
    return { GET: mod.GET };
  },
  "leads/:id/contatos-relacionados": async () => {
    const mod = await import("@/app/api/v1/leads/[id]/contatos-relacionados/route");
    return { GET: mod.GET };
  },
  "leads/:id/timeline": async () => {
    const mod = await import("@/app/api/v1/leads/[id]/timeline/route");
    return { GET: mod.GET };
  },
  "leads/at-risk": async () => {
    const mod = await import("@/app/api/v1/leads/at-risk/route");
    return { GET: mod.GET };
  },
  "leads/import": async () => {
    const mod = await import("@/app/api/v1/leads/import/route");
    return { GET: mod.GET };
  },
  "leads/proposals": async () => {
    const mod = await import("@/app/api/v1/leads/proposals/route");
    return { GET: mod.GET };
  },
  "leads/reactivations": async () => {
    const mod = await import("@/app/api/v1/leads/reactivations/route");
    return { GET: mod.GET };
  },
  "message-templates": async () => {
    const mod = await import("@/app/api/v1/message-templates/route");
    return { GET: mod.GET };
  },
  "message-templates/:id/midias/:indice": async () => {
    const mod = await import("@/app/api/v1/message-templates/[id]/midias/[indice]/route");
    return { GET: mod.GET };
  },
  "metrics/atrito": async () => {
    const mod = await import("@/app/api/v1/metrics/atrito/route");
    return { GET: mod.GET };
  },
  "metrics/attendants": async () => {
    const mod = await import("@/app/api/v1/metrics/attendants/route");
    return { GET: mod.GET };
  },
  "metrics/channels": async () => {
    const mod = await import("@/app/api/v1/metrics/channels/route");
    return { GET: mod.GET };
  },
  "metrics/funil": async () => {
    const mod = await import("@/app/api/v1/metrics/funil/route");
    return { GET: mod.GET };
  },
  "metrics/lost": async () => {
    const mod = await import("@/app/api/v1/metrics/lost/route");
    return { GET: mod.GET };
  },
  "modulos": async () => {
    const mod = await import("@/app/api/v1/modulos/route");
    return { GET: mod.GET };
  },
  "modulos/:modulo/:objeto": async () => {
    const mod = await import("@/app/api/v1/modulos/[modulo]/[objeto]/route");
    return { GET: mod.GET };
  },
  "notifications/push": async () => {
    const mod = await import("@/app/api/v1/notifications/push/route");
    return { GET: mod.GET };
  },
  "people": async () => {
    const mod = await import("@/app/api/v1/people/route");
    return { GET: mod.GET };
  },
  "people/:id": async () => {
    const mod = await import("@/app/api/v1/people/[id]/route");
    return { GET: mod.GET };
  },
  "phone-numbers": async () => {
    const mod = await import("@/app/api/v1/phone-numbers/route");
    return { GET: mod.GET };
  },
  "pipelines": async () => {
    const mod = await import("@/app/api/v1/pipelines/route");
    return { GET: mod.GET };
  },
  "pipelines/:id/agent-mapping": async () => {
    const mod = await import("@/app/api/v1/pipelines/[id]/agent-mapping/route");
    return { GET: mod.GET };
  },
  "pipelines/:id/board": async () => {
    const mod = await import("@/app/api/v1/pipelines/[id]/board/route");
    return { GET: mod.GET };
  },
  "pipelines/:id/forecast": async () => {
    const mod = await import("@/app/api/v1/pipelines/[id]/forecast/route");
    return { GET: mod.GET };
  },
  "pipelines/:id/stages": async () => {
    const mod = await import("@/app/api/v1/pipelines/[id]/stages/route");
    return { GET: mod.GET };
  },
  "pipelines/:id/stages/win-rates": async () => {
    const mod = await import("@/app/api/v1/pipelines/[id]/stages/win-rates/route");
    return { GET: mod.GET };
  },
  "pipelines/default": async () => {
    const mod = await import("@/app/api/v1/pipelines/default/route");
    return { GET: mod.GET };
  },
  "plataformas-de-anuncio/google/callback": async () => {
    const mod = await import("@/app/api/v1/plataformas-de-anuncio/google/callback/route");
    return { GET: mod.GET };
  },
  "plataformas-de-anuncio/google/connect": async () => {
    const mod = await import("@/app/api/v1/plataformas-de-anuncio/google/connect/route");
    return { GET: mod.GET };
  },
  "products": async () => {
    const mod = await import("@/app/api/v1/products/route");
    return { GET: mod.GET };
  },
  "products/import": async () => {
    const mod = await import("@/app/api/v1/products/import/route");
    return { GET: mod.GET };
  },
  "proposals": async () => {
    const mod = await import("@/app/api/v1/proposals/route");
    return { GET: mod.GET };
  },
  "proposals/:id": async () => {
    const mod = await import("@/app/api/v1/proposals/[id]/route");
    return { GET: mod.GET };
  },
  "proposals/:id/assistant/disponibilidade": async () => {
    const mod = await import("@/app/api/v1/proposals/[id]/assistant/disponibilidade/route");
    return { GET: mod.GET };
  },
  "proposals/:id/documento": async () => {
    const mod = await import("@/app/api/v1/proposals/[id]/documento/route");
    return { GET: mod.GET };
  },
  "proposals/:id/previa": async () => {
    const mod = await import("@/app/api/v1/proposals/[id]/previa/route");
    return { GET: mod.GET };
  },
  "prospecting": async () => {
    const mod = await import("@/app/api/v1/prospecting/route");
    return { GET: mod.GET };
  },
  "prospecting/agents/session": async () => {
    const mod = await import("@/app/api/v1/prospecting/agents/session/route");
    return { GET: mod.GET };
  },
  "rastreio/:id": async () => {
    const mod = await import("@/app/api/v1/rastreio/[id]/route");
    return { GET: mod.GET };
  },
  "reports/activities": async () => {
    const mod = await import("@/app/api/v1/reports/activities/route");
    return { GET: mod.GET };
  },
  "reports/financeiro": async () => {
    const mod = await import("@/app/api/v1/reports/financeiro/route");
    return { GET: mod.GET };
  },
  "reports/tags": async () => {
    const mod = await import("@/app/api/v1/reports/tags/route");
    return { GET: mod.GET };
  },
  "settings/api-tokens": async () => {
    const mod = await import("@/app/api/v1/settings/api-tokens/route");
    return { GET: mod.GET };
  },
  "settings/assinatura": async () => {
    const mod = await import("@/app/api/v1/settings/assinatura/route");
    return { GET: mod.GET };
  },
  "settings/campanhas": async () => {
    const mod = await import("@/app/api/v1/settings/campanhas/route");
    return { GET: mod.GET };
  },
  "settings/proposal-templates": async () => {
    const mod = await import("@/app/api/v1/settings/proposal-templates/route");
    return { GET: mod.GET };
  },
  "settings/proposal-templates/:slug": async () => {
    const mod = await import("@/app/api/v1/settings/proposal-templates/[slug]/route");
    return { GET: mod.GET };
  },
  "settings/proposals": async () => {
    const mod = await import("@/app/api/v1/settings/proposals/route");
    return { GET: mod.GET };
  },
  "settings/routing": async () => {
    const mod = await import("@/app/api/v1/settings/routing/route");
    return { GET: mod.GET };
  },
  "settings/routing/channels": async () => {
    const mod = await import("@/app/api/v1/settings/routing/channels/route");
    return { GET: mod.GET };
  },
  "settings/sons": async () => {
    const mod = await import("@/app/api/v1/settings/sons/route");
    return { GET: mod.GET };
  },
  "settings/task-plans": async () => {
    const mod = await import("@/app/api/v1/settings/task-plans/route");
    return { GET: mod.GET };
  },
  "tags/cores": async () => {
    const mod = await import("@/app/api/v1/tags/cores/route");
    return { GET: mod.GET };
  },
  "tags/vocabulario": async () => {
    const mod = await import("@/app/api/v1/tags/vocabulario/route");
    return { GET: mod.GET };
  },
  "tasks": async () => {
    const mod = await import("@/app/api/v1/tasks/route");
    return { GET: mod.GET };
  },
  "team": async () => {
    const mod = await import("@/app/api/v1/team/route");
    return { GET: mod.GET };
  },
  "voice/calls/history": async () => {
    const mod = await import("@/app/api/v1/voice/calls/history/route");
    return { GET: mod.GET };
  },
  "voice/events": async () => {
    const mod = await import("@/app/api/v1/voice/events/route");
    return { GET: mod.GET };
  },
  "voice/opt-in": async () => {
    const mod = await import("@/app/api/v1/voice/opt-in/route");
    return { GET: mod.GET };
  },
  "voice/sessions/status": async () => {
    const mod = await import("@/app/api/v1/voice/sessions/status/route");
    return { GET: mod.GET };
  },
  "voip/trunk": async () => {
    const mod = await import("@/app/api/v1/voip/trunk/route");
    return { GET: mod.GET };
  },
  "webhook-sources": async () => {
    const mod = await import("@/app/api/v1/webhook-sources/route");
    return { GET: mod.GET };
  },
};

