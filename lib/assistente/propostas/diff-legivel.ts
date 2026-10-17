/**
 * O "ANTES / DEPOIS" LEGÍVEL de uma proposta (F2b, T21).
 *
 * FORMATADOR PURO: sem fetch, sem banco, sem React — recebe o tradutor
 * (`t`) injetado e os dados que o GET da fila já devolve (`antes` + `payload`)
 * e devolve linhas `de → para` em frases prontas para a tela. Nada de JSON
 * cru: cada (tipo, operação) tem um formatador próprio, e o teste de cobertura
 * (`diff-legivel.test.ts`) reprova operação nova sem formatador — o mesmo
 * padrão do mapa de destinos (`operacoes.ts`).
 *
 * O "valor atual" vem do `antes` da proposta, que as ferramentas `propor_*`
 * gravaram no momento da proposta LENDO a rota de leitura correspondente por
 * dentro (`proposta-comum.ts`: "o texto de terceiros é DADO: vai para o
 * `antes`"). A tela não repete o GET por card: o retrato é o que o schema da
 * 0690 documenta para este fim. Onde não há `antes` (criação), só o "vai criar".
 *
 * Os avisos carregam as notas da T20 que a tela precisa dizer ANTES do clique:
 * roteador nasce ativo; `membros` substitui a lista inteira; credencial do
 * ponto é preservada; fonte de conhecimento nasce pronta.
 */
import type { Tradutor } from "./tradutor";

export interface LinhaDoDiff {
  /** O rótulo do campo, já traduzido. */
  rotulo: string;
  /** O valor atual (`null` quando a operação cria algo que não existia). */
  de: string | null;
  /** O valor proposto. */
  para: string | null;
}

export interface DiffLegivel {
  linhas: LinhaDoDiff[];
  /** Os avisos que o cartão mostra ANTES do clique (notas da T20). */
  avisos: string[];
}

type Registro = Record<string, unknown> | null;

function registro(valor: unknown): Registro {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

/** Texto seguro para a tela: `String()` + teto de caracteres (dado, não interface). */
function texto(valor: unknown, teto = 160): string {
  if (valor === null || valor === undefined) return "";
  const bruto = typeof valor === "string" ? valor : String(valor);
  const limpo = bruto.trim();
  return limpo.length > teto ? `${limpo.slice(0, teto)}…` : limpo;
}

function listaDeNomes(valor: unknown, campo: string, teto = 200): string {
  if (!Array.isArray(valor)) return "";
  const nomes = valor
    .map((item) => (registro(item) !== null ? texto(registro(item)?.[campo], teto) : texto(item, teto)))
    .filter((n) => n !== "");
  return nomes.join(", ");
}

/** O corpo da proposta validado (o que o aplicar mandaria ao destino). */
function corpoDa(payload: unknown): Registro {
  return registro(registro(payload)?.corpo);
}

type Formatador = (t: Tradutor, antes: Registro, payload: Registro) => DiffLegivel;

const FORMATADORES: Readonly<Record<string, Formatador>> = {
  // ─── roteador ─────────────────────────────────────────────────────────────
  "roteador:criar": (t, _antes, payload) => {
    const corpo = corpoDa(payload);
    const linhas = [{ rotulo: t("Nome do roteador"), de: null, para: texto(corpo?.name) }];
    if (corpo?.fallback_agent_id !== undefined && corpo?.fallback_agent_id !== null) {
      linhas.push({ rotulo: t("Agente de reserva"), de: null, para: texto(corpo.fallback_agent_id) });
    }
    // Nota da T20: o POST de roteadores não tem rascunho — o cartão DIZ isso antes do clique.
    return { linhas, avisos: [t("O roteador nasce ativo neste número de WhatsApp: ao aplicar, ele começa a rotear conversas.")] };
  },
  "roteador:alterar": (t, antes, payload) => {
    const corpo = corpoDa(payload);
    const linhas: LinhaDoDiff[] = [];
    if (corpo?.name !== undefined) {
      linhas.push({ rotulo: t("Nome do roteador"), de: texto(antes?.nome) || null, para: texto(corpo.name) });
    }
    if ("fallback_agent_id" in (corpo ?? {})) {
      const novo = corpo?.fallback_agent_id;
      linhas.push({
        rotulo: t("Agente de reserva"),
        de: texto(antes?.agente_de_reserva_id) || t("nenhum"),
        para: novo === null ? t("nenhum") : texto(novo),
      });
    }
    return { linhas, avisos: [] };
  },
  "roteador:membros": (t, antes, payload) => {
    const corpo = corpoDa(payload);
    const de = listaDeNomes(antes?.intencoes, "nome");
    const para = Array.isArray(corpo?.members)
      ? corpo.members.map((m) => texto(registro(m)?.intent_name, 60)).filter((n) => n !== "").join(", ")
      : "";
    return {
      linhas: [
        {
          rotulo: t("Intenções do roteador"),
          de: de === "" ? t("nenhuma") : de,
          para: para === "" ? t("nenhuma") : para,
        },
      ],
      // Nota da T19/T20: a rota SUBSTITUI a lista inteira — o antes/depois mostra as duas listas completas.
      avisos: [t("A lista nova substitui TODA a lista de intenções do roteador — confira as duas listas antes de aprovar.")],
    };
  },

  // ─── conhecimento ─────────────────────────────────────────────────────────
  "conhecimento:criar": (t, _antes, payload) => {
    const corpo = corpoDa(payload);
    const linhas: LinhaDoDiff[] = [
      {
        rotulo: t("Tipo de material"),
        de: null,
        para: corpo?.source_type === "faq" ? t("Perguntas frequentes (FAQ)") : t("Documento de texto"),
      },
      { rotulo: t("Nome"), de: null, para: texto(corpo?.name) },
    ];
    if (corpo?.source_type === "faq" && Array.isArray(corpo?.items)) {
      const n = corpo.items.length;
      linhas.push({
        rotulo: t("Perguntas e respostas"),
        de: null,
        para: `${n} ${t(n === 1 ? "pergunta com resposta" : "perguntas com resposta")}`,
      });
    }
    if (corpo?.source_type === "documento") {
      linhas.push({ rotulo: t("Texto"), de: null, para: texto(corpo.markdown_blob, 200) });
    }
    return {
      linhas,
      avisos: [t("O material nasce pronto para os agentes consultarem, assim que aplicado.")],
    };
  },

  // ─── memória ──────────────────────────────────────────────────────────────
  "memoria:criar": (t, _antes, payload) => {
    const corpo = corpoDa(payload);
    return {
      linhas: [
        { rotulo: t("Título"), de: null, para: texto(corpo?.title) },
        { rotulo: t("Conteúdo"), de: null, para: texto(corpo?.body, 200) },
      ],
      avisos: [],
    };
  },
  "memoria:arquivar": (t, antes, _payload) => {
    return {
      linhas: [
        { rotulo: t("Entrada da memória"), de: null, para: texto(antes?.titulo) },
        { rotulo: t("Estado"), de: t("ativa"), para: t("arquivada — sai do que os agentes consultam") },
      ],
      avisos: [],
    };
  },

  // ─── modelo dos auxiliares ────────────────────────────────────────────────
  "modelo_auxiliares:definir_ponto": (t, antes, payload) => {
    const corpo = corpoDa(payload);
    return {
      linhas: [
        { rotulo: t("Ponto de IA"), de: null, para: texto(antes?.ponto) || texto(corpo?.purpose) },
        { rotulo: t("Provedor"), de: texto(antes?.provedor) || null, para: texto(corpo?.provider) },
        { rotulo: t("Modelo"), de: texto(antes?.modelo) || null, para: texto(corpo?.model_id) },
      ],
      // Nota da T20: o aplicar PRESERVA a credencial que o binding do ponto já tinha.
      avisos: [t("A credencial (chave) que o ponto já usa é preservada — a proposta nunca escolhe credencial.")],
    };
  },
  "modelo_auxiliares:definir_padrao": (t, antes, payload) => {
    const corpo = corpoDa(payload);
    return {
      linhas: [
        { rotulo: t("Provedor"), de: texto(antes?.provedor) || null, para: texto(corpo?.provider) },
        { rotulo: t("Modelo padrão"), de: texto(antes?.modelo) || null, para: texto(corpo?.default_model) },
      ],
      avisos: [t("Vale para todo ponto que não tem escolha própria — pode mudar vários pontos de uma vez.")],
    };
  },

  // ─── funil ────────────────────────────────────────────────────────────────
  "funil:criar_funil": (t, _antes, payload) => {
    const corpo = corpoDa(payload);
    const linhas: LinhaDoDiff[] = [{ rotulo: t("Nome do funil"), de: null, para: texto(corpo?.name) }];
    if (corpo?.description !== undefined && corpo?.description !== null && texto(corpo.description) !== "") {
      linhas.push({ rotulo: t("Descrição"), de: null, para: texto(corpo.description) });
    }
    return { linhas, avisos: [] };
  },
  "funil:criar_etapa": (t, antes, payload) => {
    const corpo = corpoDa(payload);
    return {
      linhas: [
        { rotulo: t("Funil"), de: null, para: texto(antes?.funil) },
        { rotulo: t("Nova etapa"), de: null, para: texto(corpo?.name) },
      ],
      avisos: [],
    };
  },
  "funil:alterar_etapa": (t, antes, payload) => {
    const corpo = corpoDa(payload);
    const linhas: LinhaDoDiff[] = [];
    if (corpo?.name !== undefined) {
      linhas.push({ rotulo: t("Nome da etapa"), de: texto(antes?.etapa) || null, para: texto(corpo.name) });
    }
    if ("depois_de" in (corpo ?? {})) {
      const posicao = typeof antes?.posicao === "number" ? String(antes.posicao) : null;
      linhas.push({
        rotulo: t("Posição no funil"),
        de: posicao === null ? null : `${t("posição")} ${posicao}`,
        para: corpo?.depois_de === null ? t("primeira do funil") : t("depois de outra etapa"),
      });
    }
    return { linhas, avisos: [] };
  },
};

/**
 * O diff legível de UMA proposta. `kind`/`operacao` sem formatador (só é
 * possível se o mapa de destinos e este registro divergirem) devolve a linha
 * genérica — e o teste de cobertura reprova a divergência, não a tela.
 */
export function diffLegivel(
  t: Tradutor,
  proposta: { kind: string; operacao: string | null; antes: unknown; payload: unknown },
): DiffLegivel {
  const chave = `${proposta.kind}:${proposta.operacao ?? ""}`;
  const formatador = FORMATADORES[chave];
  if (formatador === undefined) {
    return { linhas: [], avisos: [] };
  }
  return formatador(t, registro(proposta.antes), registro(proposta.payload));
}

/** Quantos formatadores existem — o teste de cobertura compara com o mapa de destinos. */
export function QUANTIDADE_DE_FORMATADORES(): number {
  return Object.keys(FORMATADORES).length;
}

/** Há formatador para esta (tipo, operação)? O teste de cobertura compara com o mapa. */
export function temFormatador(kind: string, operacao: string | null): boolean {
  return Object.hasOwn(FORMATADORES, `${kind}:${operacao ?? ""}`);
}
