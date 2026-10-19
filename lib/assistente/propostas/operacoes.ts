/**
 * O MAPA (tipo, operação) → DESTINO, escrito no código (F2b, T19).
 *
 * A proposta NUNCA guarda caminho de rota, método HTTP nem URL: o `payload` só
 * diz `{ operacao, <ids alvo>, corpo }`, e é este arquivo que diz, no momento de
 * aplicar (T20), QUAL handler existente recebe aquele corpo. Dado vindo do
 * modelo, da tela ou de um cliente de API não escolhe para onde a escrita vai.
 *
 * `{router_id}`, `{entry_id}`, `{pipeline_id}` e `{stage_id}` são marcadores
 * que a T20 troca pelo id que está NO payload (já validado como uuid) — a rota
 * em si é constante.
 *
 * Duas colunas além do destino:
 *  - `papelMinimoDaRota`: o papel que o handler existente exige. Todas as
 *    propostas são aplicadas por `admin` (spec §7b); a coluna existe para o
 *    teste provar que nenhum destino exige MAIS do que o administrador tem.
 *  - `metodo`: `PUT` aparece em duas operações, e `chamarRotaPorDentro` só fala
 *    GET/POST/PATCH hoje — a T20 precisa acrescentar o `PUT` lá.
 *
 * O risco (`seguro`/`atencao`) é decidido por TIPO, aqui, pelo código — nunca
 * pelo modelo.
 */
import type { RiscoDaProposta, TipoDeProposta } from "./tipos";

export interface DestinoDaOperacao {
  metodo: "POST" | "PATCH" | "PUT";
  /** Rota do handler existente, com marcadores `{id}` a trocar. */
  rota: string;
  papelMinimoDaRota: "manager" | "admin";
  /** O que acontece, em uma frase, para a tela e para o teste. */
  descricao: string;
}

export const DESTINO_DAS_OPERACOES: Readonly<
  Record<TipoDeProposta, Readonly<Record<string, DestinoDaOperacao>>>
> = {
  roteador: {
    criar: {
      metodo: "POST",
      rota: "/api/v1/ai/routers",
      papelMinimoDaRota: "admin",
      descricao: "Cria o roteador de um número de WhatsApp (nasce ativo).",
    },
    alterar: {
      metodo: "PATCH",
      rota: "/api/v1/ai/routers/{router_id}",
      papelMinimoDaRota: "admin",
      descricao: "Muda o nome e/ou o agente de reserva de um roteador.",
    },
    membros: {
      metodo: "PUT",
      rota: "/api/v1/ai/routers/{router_id}/members",
      papelMinimoDaRota: "admin",
      descricao: "Substitui a lista inteira de intenções do roteador.",
    },
  },
  conhecimento: {
    criar: {
      metodo: "POST",
      rota: "/api/v1/ai/knowledge/sources",
      papelMinimoDaRota: "manager",
      descricao: "Cadastra uma fonte de conhecimento escrita na conversa (FAQ ou texto).",
    },
  },
  memoria: {
    criar: {
      metodo: "POST",
      rota: "/api/v1/ai/memory/entries",
      papelMinimoDaRota: "manager",
      descricao: "Cria uma entrada manual na memória da empresa.",
    },
    arquivar: {
      metodo: "PATCH",
      rota: "/api/v1/ai/memory/entries/{entry_id}",
      papelMinimoDaRota: "manager",
      descricao: "Arquiva uma entrada da memória da empresa.",
    },
  },
  modelo_auxiliares: {
    definir_ponto: {
      metodo: "PUT",
      rota: "/api/v1/ai/providers",
      papelMinimoDaRota: "admin",
      descricao: "Escolhe provedor e modelo de um ponto de IA da empresa.",
    },
    definir_padrao: {
      metodo: "PATCH",
      rota: "/api/v1/ai/providers",
      papelMinimoDaRota: "admin",
      descricao: "Troca o modelo padrão da empresa (vale para todo ponto sem escolha própria).",
    },
  },
  funil: {
    criar_funil: {
      metodo: "POST",
      rota: "/api/v1/pipelines",
      papelMinimoDaRota: "manager",
      descricao: "Cria um funil com as etapas iniciais padrão.",
    },
    criar_etapa: {
      metodo: "POST",
      rota: "/api/v1/pipelines/{pipeline_id}/stages",
      papelMinimoDaRota: "manager",
      descricao: "Cria uma etapa no fim de um funil.",
    },
    alterar_etapa: {
      metodo: "PATCH",
      rota: "/api/v1/pipelines/{pipeline_id}/stages/{stage_id}",
      papelMinimoDaRota: "manager",
      descricao: "Renomeia ou reposiciona uma etapa de um funil.",
    },
  },
  acao: {},
};

/** Risco por TIPO — decidido pelo código; `critico` não existe (não há ferramenta de proposta para ele). */
export const RISCO_POR_TIPO: Readonly<Record<TipoDeProposta, RiscoDaProposta>> = {
  roteador: "atencao",
  conhecimento: "seguro",
  memoria: "seguro",
  modelo_auxiliares: "atencao",
  funil: "atencao",
  acao: "atencao",
};

export function riscoDoTipo(tipo: TipoDeProposta): RiscoDaProposta {
  return RISCO_POR_TIPO[tipo];
}

/** O destino de uma (tipo, operação), ou `null` se a combinação não existe. */
export function destinoDaOperacao(tipo: TipoDeProposta, operacao: string): DestinoDaOperacao | null {
  const porTipo = DESTINO_DAS_OPERACOES[tipo];
  return Object.hasOwn(porTipo, operacao) ? (porTipo[operacao] ?? null) : null;
}
