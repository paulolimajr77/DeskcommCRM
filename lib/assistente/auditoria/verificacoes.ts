/**
 * O CATÁLOGO DE VERIFICAÇÕES DA AUDITORIA DO TENANT (F3).
 *
 * Cada entrada tem:
 *  - id: código curto e estável (nunca renomear — vira linha de auditoria)
 *  - título: o que falta, em português, para a tela
 *  - depende_de: ids de outras verificações (dependência explícita; se uma
 *    dela não está `preenchido`, esta vira `preciso_confirmar` com
 *    "falta <dependência> para ativar")
 *  - ler: função PURO que recebe os dados brutos já lidos das rotas `/api/v1`
 *    (pelo chamador, com a sessão da pessoa — nunca service role, nunca SQL
 *    direto) e devolve o estado + o porquê + os dados úteis para a tela
 *  - onde_resolver: rota da tela onde o humano resolve (medida no
 *    `lib/navigation/catalogo.ts`, sem inventar)
 *  - ferramenta: quando `posso_completar`, qual ferramenta `propor_*`/
 *    rascunho da F2 resolve (ou null quando não há — ex.: critico sem tool,
 *    que vira PRECISO CONFIRMAR)
 *
 * NÃO há fetch aqui: é puro. O mesmo catálogo serve à tela, à ferramenta
 * `auditar_empresa` e aos testes puros.
 *
 * Estados:
 *  - preenchido: já está pronto
 *  - posso_completar: a organização pode completar (via proposta/rascunho F2)
 *  - preciso_confirmar: falta algo crítico sem tool (credencial, canal) ou
 *    uma dependência não está pronta — o humano decide
 *  - nao_se_aplica: não se aplica a esta instalação
 */

import type { Tradutor } from "@/lib/assistente/propostas/tradutor";

/** O estado de uma verificação. */
export type EstadoVerificacao =
  | "preenchido"
  | "posso_completar"
  | "preciso_confirmar"
  | "nao_se_aplica";

/** Os dados crus de cada leitura, já vindos das rotas `/api/v1`. */
export interface LeituraDeVerificacao {
  /** GET /api/v1/ai/providers — credenciais da org. */
  provedoresIA: Array<{
    id: string;
    provider: string;
    label: string;
    validated_at: string | null;
    is_active: boolean;
  }>;
  /**
   * GET /api/v1/ai/providers — `instalacaoTemChave`. A instalação pode trazer
   * uma chave de IA própria (a que o self-host já instalou): quando ela existe,
   * o agente publicado tem chave utilizável mesmo sem credencial cadastrada.
   */
  instalacaoTemChave: boolean;
  /** GET /api/v1/channel-sessions — sessões de canal (WhatsApp). */
  canaisWhatsApp: Array<{
    id: string;
    status: string;
    numero: string;
  }>;
  /** GET /api/v1/pipelines — funis (sem etapas). */
  funis: Array<{ id: string; name: string }>;
  /** GET /api/v1/pipelines/[id]/stages — etapas de UM funil. */
  etapasDoFunil: Array<{ id: string; name: string; pipeline_id: string }>;
  /** GET /api/v1/ai/agents — agentes. */
  agentes: Array<{
    id: string;
    name: string;
    is_active: boolean;
    paused_at: string | null;
    archived_at: string | null;
    published_version_id: string | null;
    versao_publicada?: {
      provider: string;
      model: string;
      credential_id: string | null;
    } | null;
  }>;
  /** GET /api/v1/ai/routers — roteadores. */
  roteadores: Array<{
    id: string;
    name: string;
    is_active: boolean;
    channel_session_id: string | null;
    fallback_agent_id: string | null;
  }>;
  /** GET /api/v1/ai/knowledge/sources — fontes de conhecimento. */
  fontesConhecimento: Array<{
    id: string;
    name: string;
    source_type: string;
  }>;
  /** GET /api/v1/ai/followup-flows — pointers de follow-up (relógio). */
  followups: Array<{ id: string; name: string; status: string }>;
}

export interface ItemDaAuditoria {
  id: string;
  titulo: string;
  estado: EstadoVerificacao;
  /** Por que está neste estado (para a tela explicar à pessoa). */
  por_que: string;
  /** Dados úteis para a tela (ex.: nomes, contagens). Nunca texto livre do
   * cliente — só rótulos e IDs já lidos das rotas. */
  dados: Record<string, unknown>;
  /** Onde o humano resolve (rota da tela, medida no catalogo.ts). */
  onde_resolver: string;
  /** Quando `posso_completar`: qual ferramenta F2 resolve. Null quando não
   * há (crítico sem tool, ou dependência não pronta). */
  ferramenta: string | null;
  /** Os ids das verificações das quais esta depende. */
  depende_de: string[];
}

/** O resultado puro do cálculo: os itens e a contagem de pendências. */
export interface ResultadoDaAuditoria {
  itens: ItemDaAuditoria[];
  /** Tudo que não é `preenchido` nem `nao_se_aplica`. */
  pendencias: number;
}

/**
 * Lê UMA verificação a partir dos dados crus já lidos. Puro de propósito:
 * não fetch, não banco, não Next — recebe os dados e devolve o estado.
 */
export function lerVerificacao(
  t: Tradutor,
  id: string,
  leitura: LeituraDeVerificacao,
  estadosJahCalculados: Map<string, EstadoVerificacao>,
): ItemDaAuditoria {
  switch (id) {
    case "credencial_ia":
      return lerCredencialIA(t, leitura);
    case "canal_whatsapp":
      return lerCanalWhatsApp(t, leitura);
    case "funil_etapas":
      return lerFunilEtapas(t, leitura);
    case "agente_publicado":
      return lerAgentePublicado(t, leitura);
    case "roteador":
      return lerRoteador(t, leitura, estadosJahCalculados);
    case "conhecimento":
      return lerConhecimento(t, leitura);
    case "followup_instalado":
      return lerFollowupInstalado(t, leitura);
    case "horario_atendimento":
      return lerHorarioAtendimento(t, leitura);
    default:
      return {
        id,
        titulo: id,
        estado: "nao_se_aplica",
        por_que: t("Verificação não reconhecida."),
        dados: {},
        onde_resolver: "",
        ferramenta: null,
        depende_de: [],
      };
  }
}

/** Catálogo completo: id → ordem de exibição. A ordem importa para a tela. */
export const ORDEM_DAS_VERIFICACOES: readonly string[] = [
  "credencial_ia",
  "canal_whatsapp",
  "funil_etapas",
  "agente_publicado",
  "roteador",
  "conhecimento",
  "followup_instalado",
  "horario_atendimento",
];

/** Todas as verificações do catálogo, na ordem de exibição. */
export function todasAsVerificacoes(): readonly string[] {
  return ORDEM_DAS_VERIFICACOES;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. credencial_ia — crítica, sem tool
// ─────────────────────────────────────────────────────────────────────────────

function lerCredencialIA(t: Tradutor, leitura: LeituraDeVerificacao): ItemDaAuditoria {
  const temValida = leitura.provedoresIA.some(
    (c) => c.validated_at !== null && c.validated_at !== undefined && c.is_active !== false,
  );
  // A instalação pode trazer a chave de IA (self-host): com ela, a IA responde
  // e a verificação está pronta — o aviso "cadastre uma chave" seria falso.
  if (temValida || leitura.instalacaoTemChave === true) {
    return {
      id: "credencial_ia",
      titulo: t("Credencial de IA validada"),
      estado: "preenchido",
      por_que: temValida
        ? t("Há uma chave de provedor validada e ativa nesta organização.")
        : t("A instalação tem uma chave de IA própria, e o atendimento usa essa chave."),
      dados: {
        quantidade: leitura.provedoresIA.length,
        da_instalacao: temValida ? false : true,
      },
      onde_resolver: "/app/ai/providers",
      ferramenta: null,
      depende_de: [],
    };
  }
  return {
    id: "credencial_ia",
    titulo: t("Credencial de IA validada"),
    estado: "preciso_confirmar",
    por_que: t(
      "Não há chave de provedor validada nesta organização. A IA não responde até alguém cadastrar uma chave em Credenciais.",
    ),
    dados: { quantidade: leitura.provedoresIA.length },
    onde_resolver: "/app/ai/providers",
    ferramenta: null,
    depende_de: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. canal_whatsapp — crítica, sem tool
// ─────────────────────────────────────────────────────────────────────────────

function lerCanalWhatsApp(t: Tradutor, leitura: LeituraDeVerificacao): ItemDaAuditoria {
  const temWorking = leitura.canaisWhatsApp.some((c) => c.status === "WORKING");
  if (temWorking) {
    return {
      id: "canal_whatsapp",
      titulo: t("Canal do WhatsApp conectado"),
      estado: "preenchido",
      por_que: t("Há um número de WhatsApp conectado e em funcionamento."),
      dados: { quantidade: leitura.canaisWhatsApp.length },
      onde_resolver: "/app/connections",
      ferramenta: null,
      depende_de: [],
    };
  }
  return {
    id: "canal_whatsapp",
    titulo: t("Canal do WhatsApp conectado"),
    estado: "preciso_confirmar",
    por_que: t(
      "Não há um canal do WhatsApp conectado e em funcionamento. O assistente não responde clientes até alguém conectar o número em Conexões.",
    ),
    dados: { quantidade: leitura.canaisWhatsApp.length },
    onde_resolver: "/app/connections",
    ferramenta: null,
    depende_de: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. funil_etapas — posso_completar
// ─────────────────────────────────────────────────────────────────────────────

function lerFunilEtapas(t: Tradutor, leitura: LeituraDeVerificacao): ItemDaAuditoria {
  const funilComEtapas = leitura.funis.some((f) =>
    leitura.etapasDoFunil.some((e) => e.pipeline_id === f.id),
  );
  if (funilComEtapas) {
    return {
      id: "funil_etapas",
      titulo: t("Funil com etapas"),
      estado: "preenchido",
      por_que: t("Há um funil com pelo menos uma etapa cadastrada."),
      dados: {
        funis: leitura.funis.length,
        etapas: leitura.etapasDoFunil.length,
      },
      onde_resolver: "/app/settings/tenant/pipelines",
      ferramenta: null,
      depende_de: [],
    };
  }
  // Não há funil com etapas. Se não há funil nenhum → criar_funil. Se há funil sem etapa → criar_etapa.
  const semFunil = leitura.funis.length === 0;
  return {
    id: "funil_etapas",
    titulo: t("Funil com etapas"),
    estado: "posso_completar",
    por_que:
      semFunil
        ? t("Não há funil cadastrado. Crie um funil para organizar os negócios.")
        : t("Há um funil, mas ainda não tem etapas. Adicione a primeira etapa."),
    dados: {
      funis: leitura.funis.length,
      etapas: leitura.etapasDoFunil.length,
    },
    onde_resolver: "/app/settings/tenant/pipelines",
    ferramenta: semFunil ? "criar_funil" : "criar_etapa",
    depende_de: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. agente_publicado — posso_completar (publicar é do humano)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O agente tem CHAVE UTILIZÁVEL? Publicar sem chave é agente que não responde:
 *  - vale a chave da INSTALAÇÃO (`instalacaoTemChave`), que cobre todo provedor; ou
 *  - vale uma credencial VALIDADA e ATIVA do MESMO provedor da versão publicada.
 *
 * A versão publicada vem do join `ai_agent_versions!fk(provider, model)`, que não
 * traz `credential_id` — por isso a comparação é por provedor.
 */
function temChaveUtilizavel(
  leitura: LeituraDeVerificacao,
  agente: LeituraDeVerificacao["agentes"][number],
): boolean {
  if (leitura.instalacaoTemChave === true) return true;
  const provider = agente.versao_publicada?.provider ?? "";
  if (provider === "") return false;
  return leitura.provedoresIA.some(
    (c) => c.provider === provider && c.validated_at !== null && c.validated_at !== undefined && c.is_active !== false,
  );
}

function lerAgentePublicado(t: Tradutor, leitura: LeituraDeVerificacao): ItemDaAuditoria {
  const publicado = leitura.agentes.find(
    (a) =>
      a.published_version_id !== null &&
      a.published_version_id !== undefined &&
      a.is_active === true &&
      a.archived_at === null,
  );
  if (publicado !== undefined) {
    const provider = publicado.versao_publicada?.provider ?? "";
    if (temChaveUtilizavel(leitura, publicado)) {
      return {
        id: "agente_publicado",
        titulo: t("Agente publicado e ativo"),
        estado: "preenchido",
        por_que: t("Há um agente de IA publicado e ativo, com chave de IA utilizável nesta organização."),
        dados: { quantidade: leitura.agentes.length, provedor: provider },
        onde_resolver: "/app/ai/agents",
        ferramenta: null,
        depende_de: [],
      };
    }
    // Publicado, mas sem chave: é agente que não responde. O humano decide.
    return {
      id: "agente_publicado",
      titulo: t("Agente publicado e ativo"),
      estado: "preciso_confirmar",
      por_que:
        provider === ""
          ? t(
              "Há um agente publicado, mas ele não chegou com provedor definido e não há chave de IA validada. Cadastre uma chave para a IA responder.",
            )
          : t(
              "Há um agente publicado com o provedor {provedor}, mas não há chave validada desse provedor (nem a chave da instalação). A IA não responde até alguém cadastrar a chave.",
            ).replace("{provedor}", provider),
      dados: { quantidade: leitura.agentes.length, provedor: provider },
      onde_resolver: "/app/ai/providers",
      ferramenta: null,
      depende_de: ["credencial_ia"],
    };
  }
  const temRascunho = leitura.agentes.some((a) => a.published_version_id === null && a.archived_at === null);
  return {
    id: "agente_publicado",
    titulo: t("Agente publicado e ativo"),
    estado: "posso_completar",
    por_que:
      temRascunho
        ? t("Há um agente em rascunho, mas ainda não foi publicado. Publicar é clique do administrador na tela do agente.")
        : t("Não há agente de IA cadastrado. Crie um rascunho para começar."),
    dados: { quantidade: leitura.agentes.length },
    onde_resolver: "/app/ai/agents",
    ferramenta: "criar_rascunho_de_agente",
    depende_de: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. roteador — posso_completar, depende de canal_whatsapp e agente_publicado
// ─────────────────────────────────────────────────────────────────────────────

function lerRoteador(
  t: Tradutor,
  leitura: LeituraDeVerificacao,
  estados: Map<string, EstadoVerificacao>,
): ItemDaAuditoria {
  const estadoCanal = estados.get("canal_whatsapp");
  const estadoAgente = estados.get("agente_publicado");
  // Se qualquer dependência não está preenchida (incluindo ainda não calculada),
  // não dá para criar o roteador.
  if (estadoCanal !== "preenchido" || estadoAgente !== "preenchido") {
    const faltando = [];
    if (estadoCanal !== "preenchido") faltando.push(t("canal do WhatsApp"));
    if (estadoAgente !== "preenchido") faltando.push(t("agente publicado"));
    return {
      id: "roteador",
      titulo: t("Roteador do canal"),
      estado: "preciso_confirmar",
      por_que: t("Não dá criar o roteador enquanto faltar {faltando}.").replace("{faltando}", faltando.join(" e ")),
      dados: { quantidade: leitura.roteadores.length },
      onde_resolver: "/app/ai/routers",
      ferramenta: null,
      depende_de: ["canal_whatsapp", "agente_publicado"],
    };
  }
  const temAtivo = leitura.roteadores.some((r) => r.is_active === true && r.channel_session_id !== null);
  if (temAtivo) {
    return {
      id: "roteador",
      titulo: t("Roteador do canal"),
      estado: "preenchido",
      por_que: t("O número do WhatsApp já tem um roteador ativo."),
      dados: { quantidade: leitura.roteadores.length },
      onde_resolver: "/app/ai/routers",
      ferramenta: null,
      depende_de: ["canal_whatsapp", "agente_publicado"],
    };
  }
  return {
    id: "roteador",
    titulo: t("Roteador do canal"),
    estado: "posso_completar",
    por_que: t("Não há um roteador ativo para o número de WhatsApp. Crie um para começar a atender."),
    dados: { quantidade: leitura.roteadores.length },
    onde_resolver: "/app/ai/routers",
    ferramenta: "propor_roteador",
    depende_de: ["canal_whatsapp", "agente_publicado"],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. conhecimento — posso_completar
// ─────────────────────────────────────────────────────────────────────────────

function lerConhecimento(t: Tradutor, leitura: LeituraDeVerificacao): ItemDaAuditoria {
  const temFAQOuTexto = leitura.fontesConhecimento.some(
    (f) => f.source_type === "faq" || f.source_type === "documento",
  );
  if (temFAQOuTexto) {
    return {
      id: "conhecimento",
      titulo: t("Conhecimento (FAQ ou texto)"),
      estado: "preenchido",
      por_que: t("Há uma fonte de conhecimento cadastrada (FAQ ou documento)."),
      dados: { quantidade: leitura.fontesConhecimento.length },
      onde_resolver: "/app/ai/knowledge/sources",
      ferramenta: null,
      depende_de: [],
    };
  }
  return {
    id: "conhecimento",
    titulo: t("Conhecimento (FAQ ou texto)"),
    estado: "posso_completar",
    por_que: t("Não há fonte de conhecimento cadastrada. Proponha uma FAQ ou um documento."),
    dados: { quantidade: leitura.fontesConhecimento.length },
    onde_resolver: "/app/ai/knowledge/sources",
    ferramenta: "propor_conhecimento",
    depende_de: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. followup_instalado — posso_completar
// ─────────────────────────────────────────────────────────────────────────────

function lerFollowupInstalado(t: Tradutor, leitura: LeituraDeVerificacao): ItemDaAuditoria {
  const temAtivo = leitura.followups.some((f) => f.status === "ativo" || f.status === "active");
  if (temAtivo) {
    return {
      id: "followup_instalado",
      titulo: t("Follow-up instalado"),
      estado: "preenchido",
      por_que: t("Há um fluxo de follow-up instalado nesta organização."),
      dados: { quantidade: leitura.followups.length },
      onde_resolver: "/app/ai/followups",
      ferramenta: null,
      depende_de: [],
    };
  }
  return {
    id: "followup_instalado",
    titulo: t("Follow-up instalado"),
    estado: "posso_completar",
    por_que: t("Não há follow-up instalado. Instale um modelo de follow-up para começar."),
    dados: { quantidade: leitura.followups.length },
    onde_resolver: "/app/ai/followups",
    ferramenta: "instalar_modelo_de_followup",
    depende_de: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. horario_atendimento — posso_completar se houver leitura, senão nao_se_aplica
// ─────────────────────────────────────────────────────────────────────────────

function lerHorarioAtendimento(t: Tradutor, _leitura: LeituraDeVerificacao): ItemDaAuditoria {
  return {
    id: "horario_atendimento",
    titulo: t("Horário de atendimento"),
    estado: "nao_se_aplica",
    por_que: t("Esta instalação não tem leitura de horário de atendimento configurável."),
    dados: {},
    onde_resolver: "",
    ferramenta: null,
    depende_de: [],
  };
}
