/**
 * Os tipos do catálogo de métricas do assistente — a FORMA do contrato:
 * uma consulta NUNCA lança, e a falha é um valor da união fechada
 * `ResultadoDeMetrica`, nunca uma exceção.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import type { Role } from "@/lib/auth/types";
import type { ModuloOpcional } from "@/lib/instalacao/modulos";

import type { PeriodoResolvido } from "./periodo";

/**
 * Papéis que podem consultar métricas — derivados do `Role` do repositório,
 * nada duplicado. `ai_operator` fica de fora: métrica é consulta de pessoa.
 */
export type Papel = Exclude<Role, "ai_operator">;

/**
 * Contexto de uma consulta — a organização e o papel VÊM DA SESSÃO (quem monta
 * é a rota do chat, com `requireRole`), nunca do que o modelo disser.
 */
export interface ContextoDeConsulta {
  /** Sempre de fonte confiável — o modelo nunca escolhe a organização. */
  orgId: string;
  /** O papel EFETIVO da pessoa na organização ativa. */
  papel: Papel;
  idioma: "pt-BR" | "es";
  /** Fuso da organização; inválido cai para UTC dentro das métricas. */
  fuso: string;
  agoraIso: string;
  /** O client que `modulosLigados` pede (o mesmo do layout autenticado). */
  bancoDosModulos: SupabaseClient;
}

/**
 * O resultado de uma métrica — união FECHADA: o modelo recebe sempre a régua
 * junto do dado, e cada motivo de falha diz o que acontecer.
 */
export type ResultadoDeMetrica =
  | {
      ok: true;
      metrica: string;
      periodo: PeriodoResolvido | null;
      regua: string;
      dados: unknown;
      avisos: string[];
    }
  | { ok: false; metrica: string; motivo: "sem_permissao"; papel_minimo: Papel }
  | { ok: false; metrica: string; motivo: "modulo_ausente"; modulo: ModuloOpcional }
  | { ok: false; metrica: string; motivo: "parametro_invalido"; detalhe: string }
  | { ok: false; metrica: string; motivo: "indisponivel"; detalhe: string };

/** A definição de uma métrica — o que o catálogo declara sobre cada uma. */
export interface DefinicaoDeMetrica<P> {
  /** Identificador snake_case neutro — sem nome de tela nem de provedor. */
  id: string;
  /** Uma frase, em português, para o modelo escolher a métrica. */
  descricao: string;
  /** O MESMO papel mínimo da rota que alimenta a métrica. */
  papelMinimo: Papel;
  /** Módulo opcional de que a métrica depende (`null` = independente). */
  modulo: ModuloOpcional | null;
  /** O que o modelo pode passar — Zod ESTIRTO, sem URL, sem SQL, sem caminho. */
  parametros: z.ZodType<P>;
  /** Dimensões, para o modelo saber o que dá para perguntar. */
  dimensoes: readonly string[];
  /** Definição, janela e fuso, em uma frase que vai junto da resposta. */
  regua: string;
  executar(ctx: ContextoDeConsulta, params: P): Promise<ResultadoDeMetrica>;
}
