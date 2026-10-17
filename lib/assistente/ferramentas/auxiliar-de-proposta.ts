/**
 * Peças compartilhadas pelos testes das ferramentas `propor_*` (T19) — nenhum
 * código de produção importa este arquivo.
 *
 * `ligarFontes` troca TODAS as fontes de leitura e a rota de propostas por
 * dublês e devolve o registro do que foi chamado (método e caminho; no POST de
 * propostas, também o corpo). Cada teste de ferramenta ainda confere o registro
 * de `chamarRotaPorDentro` (vi.mock no próprio arquivo), que pega até a chamada
 * a um handler que o dublê não conhece.
 */
import type { HandlerDeRota } from "@/lib/assistente/metricas/chamar-rota";

import { sobreporFontesDeProposta } from "./proposta-comum";

export const ID_DA_PROPOSTA = "99999999-9999-4999-8999-999999999999";
export const THREAD = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const TURNO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const AGENTE_A = "11111111-1111-4111-8111-111111111111";
export const AGENTE_B = "12121212-1212-4121-8121-121212121212";
export const CANAL = "22222222-2222-4222-8222-222222222222";
export const ROTEADOR = "33333333-3333-4333-8333-333333333333";
export const FUNIL = "44444444-4444-4444-8444-444444444444";
export const ETAPA_1 = "55555555-5555-4555-8555-555555555551";
export const ETAPA_2 = "55555555-5555-4555-8555-555555555552";
export const ENTRADA_DE_MEMORIA = "66666666-6666-4666-8666-666666666666";
/** Um id v4 válido que NÃO aparece em nenhuma leitura: "de fora da organização". */
export const DE_FORA = "77777777-7777-4777-8777-777777777777";

export interface Chamada {
  metodo: string;
  caminho: string;
}

type Falha = number | "lancar";

export interface ConfigDeFontes {
  canais?: unknown;
  roteadores?: unknown;
  /** Detalhe por id; id ausente responde 404. */
  roteador?: Record<string, unknown>;
  agentes?: unknown;
  memoria?: unknown;
  conhecimento?: unknown;
  funis?: unknown;
  /** Etapas por id de funil; id ausente responde 404. */
  etapas?: Record<string, unknown>;
  provedores?: unknown;
  propostas?: { status?: number; resumoDevolvido?: string; semData?: boolean };
  /** Faz a fonte responder esse status (ou lançar). */
  falhar?: Partial<Record<keyof ConfigDeFontes, Falha>>;
}

export interface FontesLigadas {
  /** Tudo o que qualquer dublê recebeu, na ordem. */
  chamadas: Chamada[];
  /** O corpo que chegou ao POST de propostas (`null` se não chegou). */
  corpoDaProposta: () => Record<string, unknown> | null;
  /** Quantas vezes o POST de propostas foi chamado. */
  envios: () => number;
}

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });
}

export function ligarFontes(cfg: ConfigDeFontes = {}): FontesLigadas {
  const chamadas: Chamada[] = [];
  let corpoVisto: Record<string, unknown> | null = null;
  let envios = 0;

  const registrar = (req: Request): string => {
    const caminho = new URL(req.url).pathname;
    chamadas.push({ metodo: req.method, caminho });
    return caminho;
  };
  const falhou = (chave: keyof ConfigDeFontes): Response | null => {
    const f = cfg.falhar?.[chave];
    if (f === undefined) return null;
    if (f === "lancar") throw new Error("falha-simulada");
    return resposta(f, { error: { code: "x", message: "falha" } });
  };
  const simples = (chave: keyof ConfigDeFontes, valor: unknown): HandlerDeRota | undefined =>
    valor === undefined
      ? undefined
      : async (req) => {
          registrar(req);
          return falhou(chave) ?? resposta(200, { data: valor });
        };
  const porId = (chave: keyof ConfigDeFontes, mapa: Record<string, unknown> | undefined, posicao: number): HandlerDeRota | undefined =>
    mapa === undefined
      ? undefined
      : async (req) => {
          const caminho = registrar(req);
          const f = falhou(chave);
          if (f) return f;
          const id = caminho.split("/")[posicao] ?? "";
          return Object.hasOwn(mapa, id) ? resposta(200, { data: mapa[id] }) : resposta(404, { error: { code: "not_found" } });
        };

  const propostas: HandlerDeRota = async (req) => {
    registrar(req);
    envios += 1;
    try {
      corpoVisto = (await req.json()) as Record<string, unknown>;
    } catch {
      corpoVisto = null;
    }
    const falha = falhou("propostas");
    if (falha) return falha;
    if (cfg.propostas?.semData) return resposta(201, {});
    return resposta(cfg.propostas?.status ?? 201, {
      data: {
        id: ID_DA_PROPOSTA,
        kind: corpoVisto?.kind,
        operacao: (corpoVisto?.payload as { operacao?: string } | undefined)?.operacao,
        risk: "seguro",
        status: "pendente",
        resumo: cfg.propostas?.resumoDevolvido ?? corpoVisto?.resumo,
        expires_at: "2026-10-23T09:00:00Z",
      },
    });
  };

  sobreporFontesDeProposta({
    canais: simples("canais", cfg.canais),
    roteadores: simples("roteadores", cfg.roteadores),
    // /api/v1/ai/routers/{id} → posição 5 do caminho dividido por "/".
    roteador: porId("roteador", cfg.roteador, 5),
    agentes: simples("agentes", cfg.agentes),
    memoria: simples("memoria", cfg.memoria),
    conhecimento: simples("conhecimento", cfg.conhecimento),
    funis: simples("funis", cfg.funis),
    // /api/v1/pipelines/{id}/stages → posição 4.
    etapas: porId("etapas", cfg.etapas, 4),
    provedores: simples("provedores", cfg.provedores),
    propostas,
  });

  return { chamadas, corpoDaProposta: () => corpoVisto, envios: () => envios };
}

export function desligarFontes(): void {
  sobreporFontesDeProposta(null);
}

/** O que o registro de `chamarRotaPorDentro` pode conter numa ferramenta `propor_*`: só leitura e o POST de propostas. */
export function soLeituraEPostDePropostas(chamadas: readonly { caminho: string; metodo: string }[]): boolean {
  return chamadas.every(
    (c) => c.metodo === "GET" || (c.metodo === "POST" && c.caminho === "/api/v1/ai/assistente/propostas"),
  );
}
