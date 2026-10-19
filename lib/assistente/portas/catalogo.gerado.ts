// Arquivo gerado por scripts/gerar-catalogo-de-portas.ts. NAO EDITE.
// Rode pnpm portas:gerar para regenerar apos adicionar/remover rotas.

import type { Metodo, PortaDoCatalogo } from "./tipos";

// Todas as portas do catalogo (apenas as nao proibidas).
export const CATALOGO_DE_PORTAS: readonly PortaDoCatalogo[] = [
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
    id: "demandas/:id",
    caminho: "demandas/[id]",
    metodos: ["PATCH"],
    parametros: ["id"],
    area: "demandas",
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
    id: "marca/logo",
    caminho: "marca/logo",
    metodos: ["POST", "DELETE"],
    parametros: [],
    area: "marca",
    resumo: "",
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
  "campaigns/:id": async () => {
    const mod = await import("@/app/api/v1/campaigns/[id]/route");
    return { GET: mod.GET };
  },
  "campaigns/:id/metrics": async () => {
    const mod = await import("@/app/api/v1/campaigns/[id]/metrics/route");
    return { GET: mod.GET };
  },
  "campaigns/:id/recipients": async () => {
    const mod = await import("@/app/api/v1/campaigns/[id]/recipients/route");
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
  "team/assignable": async () => {
    const mod = await import("@/app/api/v1/team/assignable/route");
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
};

// Carregadores de escrita permitida (apenas ESCRITA_PERMITIDA).
// O bundler nao aceita import com caminho variavel, entao cada um e um
// import() de caminho literal, no padrao de proposta-comum.ts.
export const CARREGADORES_DE_ESCRITA: Record<string, () => Promise<Record<string, unknown>>> = {
  "ai/agents": async () => {
    const mod = await import("@/app/api/v1/ai/agents/route");
    return {
      POST: mod.POST,
    };
  },
  "ai/agents/:id": async () => {
    const mod = await import("@/app/api/v1/ai/agents/[id]/route");
    return {
      PATCH: mod.PATCH,
    };
  },
  "ai/routers": async () => {
    const mod = await import("@/app/api/v1/ai/routers/route");
    return {
      POST: mod.POST,
    };
  },
  "ai/routers/:id": async () => {
    const mod = await import("@/app/api/v1/ai/routers/[id]/route");
    return {
      PATCH: mod.PATCH,
    };
  },
  "ai/memory": async () => {
    const mod = await import("@/app/api/v1/ai/memory/route");
    return {
      POST: mod.POST,
    };
  },
  "ai/knowledge/sources": async () => {
    const mod = await import("@/app/api/v1/ai/knowledge/sources/route");
    return {
      POST: mod.POST,
    };
  },
  "ai/knowledge/sources/:id": async () => {
    const mod = await import("@/app/api/v1/ai/knowledge/sources/[id]/route");
    return {
      PATCH: mod.PATCH,
    };
  },
  "pipelines": async () => {
    const mod = await import("@/app/api/v1/pipelines/route");
    return {
      POST: mod.POST,
    };
  },
  "pipelines/:id": async () => {
    const mod = await import("@/app/api/v1/pipelines/[id]/route");
    return {
      PATCH: mod.PATCH,
    };
  },
  "pipelines/:id/stages": async () => {
    const mod = await import("@/app/api/v1/pipelines/[id]/stages/route");
    return {
      POST: mod.POST,
    };
  },
  "pipelines/:id/stages/:stageId": async () => {
    const mod = await import("@/app/api/v1/pipelines/[id]/stages/[stageId]/route");
    return {
      PATCH: mod.PATCH,
    };
  },
  "tags/vocabulario": async () => {
    const mod = await import("@/app/api/v1/tags/vocabulario/route");
    return {
      POST: mod.POST,
    };
  },
  "contacts/:id": async () => {
    const mod = await import("@/app/api/v1/contacts/[id]/route");
    return {
      PATCH: mod.PATCH,
    };
  },
  "contacts/:id/personal": async () => {
    const mod = await import("@/app/api/v1/contacts/[id]/personal/route");
    return {
      POST: mod.POST,
    };
  },
  "leads": async () => {
    const mod = await import("@/app/api/v1/leads/route");
    return {
      POST: mod.POST,
    };
  },
  "leads/:id": async () => {
    const mod = await import("@/app/api/v1/leads/[id]/route");
    return {
      PATCH: mod.PATCH,
    };
  },
  "leads/:id/move": async () => {
    const mod = await import("@/app/api/v1/leads/[id]/move/route");
    return {
      POST: mod.POST,
    };
  },
  "ai/followup-flows": async () => {
    const mod = await import("@/app/api/v1/ai/followup-flows/route");
    return {
      POST: mod.POST,
    };
  },
  "ai/followup-flows/:id": async () => {
    const mod = await import("@/app/api/v1/ai/followup-flows/[id]/route");
    return {
      PATCH: mod.PATCH,
    };
  },
  "tasks": async () => {
    const mod = await import("@/app/api/v1/tasks/route");
    return {
      POST: mod.POST,
    };
  },
  "tasks/:id": async () => {
    const mod = await import("@/app/api/v1/tasks/[id]/route");
    return {
      PATCH: mod.PATCH,
    };
  },
  "agenda/agendamentos": async () => {
    const mod = await import("@/app/api/v1/agenda/agendamentos/route");
    return {
      POST: mod.POST,
      PATCH: mod.PATCH,
    };
  },
  "agenda/configuracao": async () => {
    const mod = await import("@/app/api/v1/agenda/configuracao/route");
    return {
      PATCH: mod.PATCH,
    };
  },
  "campaign-templates": async () => {
    const mod = await import("@/app/api/v1/campaign-templates/route");
    return {
      POST: mod.POST,
    };
  },
  "campaign-templates/:id": async () => {
    const mod = await import("@/app/api/v1/campaign-templates/[id]/route");
    return {
      PATCH: mod.PATCH,
    };
  },
};

