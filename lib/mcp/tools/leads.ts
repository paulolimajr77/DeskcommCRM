/**
 * MCP tools sobre /api/v1/leads (Spec 11 §3.1, §3.2).
 *
 *  Read:
 *   - crm_list_leads
 *   - crm_get_lead
 *  Write:
 *   - crm_create_lead
 *   - crm_update_lead
 *   - crm_move_lead_stage  (sem mirror REST direto; reusa moveLeadHandler)
 *
 * Write tools exigem role>=manager + scope mcp:write (gate no server core).
 */
import { z } from "zod";

import {
  listLeadsHandler,
  getLeadHandler,
  createLeadHandler,
  updateLeadHandler,
  moveLeadHandler,
} from "@/app/api/v1/leads/_handler";
import { createLeadSchema, updateLeadSchema } from "@/lib/schemas/leads";
import { resolveUserNames } from "./_users";
import type { McpContext, McpToolDefinition } from "../types";
import { camposDoFunil } from "@/lib/leads/campos-do-funil";
import {
  avaliarPropostaDeCampo,
  tituloDaProposta,
  corpoDaProposta,
  TETO_DE_CAMPOS_POR_FUNIL,
} from "@/lib/leads/proposta-de-campo-novo";

/**
 * Enriquece rows de lead com os campos de governança aditivos (G6-03):
 * `owner_user_name` (só o nome — LGPD) e `stage` ({ id, name }, o label legível
 * que o get_lead_context compõe). owner_user_id, stage_id, status e tags[] já
 * vêm na row (`select *`); nada existente muda. Dedupe de owners e stages —
 * sem N+1 numa listagem.
 */
async function enrichLeads(
  ctx: McpContext,
  leads: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  if (leads.length === 0) return leads;

  const names = await resolveUserNames(
    ctx.supabase,
    leads.map((l) => l.owner_user_id as string | null),
  );

  const stageIds = [
    ...new Set(leads.map((l) => l.stage_id).filter((id): id is string => Boolean(id))),
  ];
  const stageById = new Map<string, { id: string; name: string }>();
  if (stageIds.length > 0) {
    const { data } = await ctx.supabase
      .from("crm_stages")
      .select("id, name")
      .eq("organization_id", ctx.organizationId)
      .in("id", stageIds);
    for (const s of (data ?? []) as Array<{ id: string; name: string }>) {
      stageById.set(s.id, { id: s.id, name: s.name });
    }
  }

  return leads.map((l) => ({
    ...l,
    owner_user_name: l.owner_user_id
      ? (names.get(l.owner_user_id as string) ?? null)
      : null,
    stage: l.stage_id ? (stageById.get(l.stage_id as string) ?? null) : null,
  }));
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

const listInputShape = {
  pipeline_id: z.string().uuid().optional(),
  stage_id: z.string().uuid().optional(),
  status: z.enum(["open", "won", "lost"]).optional(),
  owner_user_id: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
};

export const crmListLeads: McpToolDefinition<typeof listInputShape> = {
  name: "crm_list_leads",
  description:
    "Lista leads do CRM filtrando por pipeline, stage, status e owner. Cursor base64 para paginação. " +
    "Governança por lead: owner_user_id + owner_user_name (só o nome do dono, sem email/telefone), stage ({ id, name } legível além do stage_id) e tags[].",
  inputSchema: listInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const result = await listLeadsHandler(
      ctx.supabase,
      {
        organization_id: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      {
        pipeline_id: input.pipeline_id,
        stage_id: input.stage_id,
        status: input.status,
        owner_user_id: input.owner_user_id,
        limit: input.limit,
        cursor: input.cursor,
      },
    );
    return {
      leads: await enrichLeads(ctx, result.leads),
      cursor: result.cursor,
      has_more: result.has_more,
    };
  },
};

// ---------------------------------------------------------------------------
// get
// ---------------------------------------------------------------------------

const getInputShape = {
  lead_id: z.string().uuid(),
};

export const crmGetLead: McpToolDefinition<typeof getInputShape> = {
  name: "crm_get_lead",
  description:
    "Retorna um lead pelo UUID. Inclui pipeline_id, stage_id, status, owner. " +
    "Governança: owner_user_id + owner_user_name (só o nome, sem email/telefone), stage ({ id, name } legível) e tags[].",
  inputSchema: getInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const lead = await getLeadHandler(
      ctx.supabase,
      {
        organization_id: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      input.lead_id,
    );
    if ((lead as { organization_id?: string }).organization_id !== ctx.organizationId) {
      // Defesa em profundidade — service-role bypassa RLS.
      throw new Error("not_found");
    }
    const [enriched] = await enrichLeads(ctx, [lead]);
    return { lead: enriched };
  },
};

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

const createInputShape = {
  pipeline_id: z.string().uuid(),
  stage_id: z.string().uuid(),
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  contact_id: z.string().uuid().optional(),
  value_cents: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  owner_user_id: z.string().uuid().optional(),
  /** 0070: o agente pode nascer dono do negócio que ele mesmo abriu. */
  owner_agent_id: z.string().uuid().optional(),
  expected_close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().optional(),
};

export const crmCreateLead: McpToolDefinition<typeof createInputShape> = {
  name: "crm_create_lead",
  description:
    "Cria um lead no pipeline informado. Use após qualificar um contato. Position é gerenciado pelo servidor.",
  inputSchema: createInputShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const parsed = createLeadSchema.parse({
      pipeline_id: input.pipeline_id,
      stage_id: input.stage_id,
      title: input.title,
      description: input.description ?? null,
      contact_id: input.contact_id ?? null,
      value_cents: input.value_cents ?? null,
      currency: input.currency ?? "BRL",
      owner_user_id: input.owner_user_id ?? null,
      owner_agent_id: input.owner_agent_id ?? null,
      expected_close_date: input.expected_close_date ?? null,
      tags: input.tags ?? [],
      source: input.source ?? "ai_agent",
    });
    const lead = await createLeadHandler(
      ctx.supabase,
      {
        organization_id: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      parsed,
    );
    return { lead };
  },
};

// ---------------------------------------------------------------------------
// update
// ---------------------------------------------------------------------------

const updateInputShape = {
  lead_id: z.string().uuid(),
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).optional(),
  contact_id: z.string().uuid().optional(),
  value_cents: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).optional(),
  owner_user_id: z.string().uuid().optional(),
  /** 0070: transferir o negócio para (ou de) um agente — passa pelo mesmo helper. */
  owner_agent_id: z.string().uuid().optional(),
  expected_close_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  tags: z.array(z.string()).optional(),
  /**
   * Os campos que o DONO declarou em `pipeline.settings.fields`.
   *
   * Faltava aqui, e só aqui: `updateLeadSchema` já aceita a chave, o
   * `updateLeadHandler` já faz o merge com o que existe, e a mudança já vira
   * atividade na linha do tempo ("os campos personalizados"). Como o handler
   * monta `{...rest}` a partir DESTE shape, e `z.object` descarta chave que não
   * declarou, o valor morria antes de chegar ao schema que o aceitaria.
   *
   * Efeito da ausência: o produto deixa criar até 50 campos por funil, desenha
   * todos na ficha do lead — e nenhum agente conseguia preencher um. Quem
   * modelou o funil no vocabulário do próprio nicho recebia a IA como leitora,
   * nunca como escrivã.
   */
  custom_fields: z.record(z.string(), z.unknown()).optional(),
};

export const crmUpdateLead: McpToolDefinition<typeof updateInputShape> = {
  name: "crm_update_lead",
  description:
    "Atualiza campos editáveis de um lead. Stage transitions são via crm_move_lead_stage; status é gerenciado por triggers.",
  inputSchema: updateInputShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const { lead_id, ...rest } = input;
    const parsed = updateLeadSchema.parse(rest);
    const lead = await updateLeadHandler(
      ctx.supabase,
      {
        organization_id: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      lead_id,
      parsed,
    );
    return { lead };
  },
};

// ---------------------------------------------------------------------------
// move stage
// ---------------------------------------------------------------------------

const moveInputShape = {
  lead_id: z.string().uuid(),
  to_stage_id: z.string().uuid(),
  position_in_stage: z.number().finite().optional(),
  reason: z.string().max(500).optional(),
};

export const crmMoveLeadStage: McpToolDefinition<typeof moveInputShape> = {
  name: "crm_move_lead_stage",
  description:
    "Move um lead para outro stage dentro do MESMO pipeline. Cross-pipeline é proibido (use clone). Audit registra from/to stage e reason.",
  inputSchema: moveInputShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const lead = await moveLeadHandler(
      ctx.supabase,
      {
        organization_id: ctx.organizationId,
        actor: ctx.actor,
        requestId: ctx.requestId,
      },
      input.lead_id,
      {
        to_stage_id: input.to_stage_id,
        position_in_stage: input.position_in_stage,
        reason: input.reason,
      },
    );
    return { lead };
  },
};

// ---------------------------------------------------------------------------
// O AGENTE PROPÕE UM CAMPO QUE A EMPRESA AINDA NÃO DECLAROU (migration 0271)
// ---------------------------------------------------------------------------

const propostaDeCampoShape = {
  pipeline_id: z.string().uuid().describe("O funil onde o campo faria sentido."),
  key: z
    .string()
    .min(2)
    .max(40)
    .describe("Identificador em minúsculas, com sublinhado: origem_do_lead."),
  label: z.string().min(1).max(80).describe("O nome que a equipe veria na tela: Origem do lead."),
  trecho: z
    .string()
    .max(500)
    .optional()
    .describe("O que o cliente escreveu, para quem for decidir poder conferir."),
};

/**
 * PROPOR NÃO É CRIAR, e a diferença é o produto inteiro.
 *
 * Criar campo muda a tela de TODOS os leads daquele funil, para sempre. É
 * decisão de quem administra a empresa — nunca de um turno de conversa. Esta
 * ferramenta só abre um aviso na Central; quem cria é uma pessoa, em
 * Configurações › Funis.
 *
 * ## Por que na Central e não numa tabela de proposta
 *
 * Tudo o que ela precisa já existe ali: fila de decisão humana, quem resolveu,
 * e uma tela que as pessoas abrem todo dia. Uma tabela irmã duplicaria worker
 * de vencimento, RLS e tela — e as duas divergiriam no primeiro conserto feito
 * de um lado só. Mesmo argumento que a 0270 fez para a proposta de VALOR.
 *
 * ## A idempotência é do BANCO, não do modelo
 *
 * O agente vai propor o mesmo campo a cada turno em que o assunto voltar. O
 * `where not exists` é quem barra — `select` antes de `insert` no aplicativo
 * seria check-then-act, e dois turnos concorrentes passariam pela janela.
 */
export const crmProposeLeadField: McpToolDefinition<typeof propostaDeCampoShape> = {
  name: "crm_propose_lead_field",
  description:
    "Sugere à equipe um campo de cadastro que este funil ainda não tem, quando o cliente disse algo " +
    "importante que não cabe em nenhum campo existente. NADA é criado por conta desta chamada: abre " +
    "um aviso para uma pessoa decidir. NUNCA diga ao cliente que criou ou vai criar um campo — a " +
    "proposta pode ser recusada. Recusa se o campo já existe (em qualquer grafia), se o funil está " +
    "no teto de campos, ou se a chave não é um identificador válido.",
  inputSchema: propostaDeCampoShape,
  category: "write",
  // ⛔ `ai_operator`, e não `agent` — a cerca `capacidade-alcancavel-pelo-agente`
  // reprovou, com razão. A regra dela: escrita que NÃO é trabalho de atendente
  // exige o piso `ai_operator`. Sugerir mudança de configuração não é trabalho
  // de atendente; é o agente opinando sobre a casa.
  //
  // Não é afrouxamento: `ai_operator` vive só no escopo do token efêmero e
  // NUNCA em `user_organizations`, então nenhuma PESSOA o alcança. O que muda é
  // o agente passar a alcançar, deliberadamente — que é o ponto desta tool.
  requiresRole: "ai_operator",
  requiresScope: "mcp:write",
  handler: async (input, ctx: McpContext) => {
    const { data: funil } = await ctx.supabase
      .from("crm_pipelines")
      .select("id, name, settings")
      .eq("organization_id", ctx.organizationId)
      .eq("id", input.pipeline_id)
      .maybeSingle();
    if (!funil) {
      return { proposta_criada: false, motivo: "funil_nao_encontrado" };
    }

    const existentes = camposDoFunil((funil as { settings?: Record<string, unknown> }).settings);
    const decisao = avaliarPropostaDeCampo({ key: input.key, label: input.label }, existentes);
    if (!decisao.propor) {
      // Mensagens para o MODELO decidir o que fazer em seguida. Nenhuma delas é
      // para repetir ao cliente: falam do fluxo interno, não do atendimento.
      const explicacao: Record<string, string> = {
        ja_existe: "esse campo já existe neste funil — use-o em vez de propor outro.",
        funil_no_teto:
          `este funil já está no limite de ${TETO_DE_CAMPOS_POR_FUNIL} campos; não proponha mais.`,
        chave_invalida:
          "a chave precisa ser um identificador: minúsculas, dígitos e sublinhado, começando por letra.",
        rotulo_vazio: "o campo precisa de um nome legível para quem for decidir.",
      };
      return { proposta_criada: false, motivo: decisao.motivo, mensagem: explicacao[decisao.motivo] };
    }

    // ⛔ GRAVA O AVISO, e não um evento. Evento sem consumidor é o
    // anti-pattern nº 3 da doutrina deste repositório: emite e ninguém escuta.
    // A Central JÁ é a tela de decisão humana, e é ela que precisa saber.
    //
    // A IDEMPOTÊNCIA É DO BANCO: o agente vai propor o mesmo campo a cada turno
    // ⛔ O TÍTULO É A CHAVE DA IDEMPOTÊNCIA, e por isso não carrega o trecho.
    //
    // A primeira versão punha a frase do cliente no título. Mas o trecho vem do
    // MODELO: muda uma vírgula, muda o título, nasce aviso novo a cada turno, e
    // a Central enche de cópias do mesmo pedido. A evidência foi para o CORPO,
    // que não entra na comparação. Achado revisando o diff.
    //
    // `ref_id` é o FUNIL, e a chave inclui o título: duas propostas de campos
    // DIFERENTES no mesmo funil são decisões diferentes e devem conviver.
    const titulo = tituloDaProposta(decisao.label);
    const { data: criadoId, error } = await ctx.supabase.rpc("fn_inbox_item_unico", {
      p_org: ctx.organizationId,
      p_kind: "lead_field_proposed",
      p_severity: "info",
      p_title: titulo,
      p_body: corpoDaProposta({
        key: decisao.key,
        label: decisao.label,
        funil: (funil as { name?: string }).name ?? null,
        trecho: input.trecho ?? null,
      }),
      p_ref_kind: "pipeline",
      p_ref_id: input.pipeline_id,
    });
    if (error) {
      return { proposta_criada: false, motivo: "erro", mensagem: "não consegui registrar agora." };
    }
    // ⛔ `error` NULO NÃO É "CRIEI". A função devolve `null` quando o aviso já
    // estava aberto — e dizer `true` ali faria o modelo acreditar que avisou a
    // equipe quando ninguém foi avisado. O motivo separado (`ja_proposto`) é o
    // que impede ele de tentar de novo no turno seguinte.
    if (!criadoId) {
      return {
        proposta_criada: false,
        motivo: "ja_proposto",
        mensagem: "já existe um aviso aberto sugerindo esse campo — não proponha de novo.",
      };
    }
    return {
      proposta_criada: true,
      key: decisao.key,
      label: decisao.label,
      mensagem: "a equipe foi avisada; siga a conversa e não mencione isto ao cliente.",
    };
  },
};
