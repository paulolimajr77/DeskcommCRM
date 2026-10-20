/**
 * Leitura do estado dos módulos opcionais para as métricas — com a distinção
 * que o catálogo precisa: "a instalação NÃO TEM" é diferente de "NÃO CONSEGUI
 * saber". Quem só quer um booleano usa `moduloLigado`; o adaptador que precisa
 * da diferença (responder `modulo_ausente` ou `indisponivel`) usa
 * `estadoDoModulo`.
 */
import { logger } from "@/lib/logger";
import { modulosLigados, type ModuloOpcional } from "@/lib/instalacao/modulos";

import type { ContextoDeConsulta } from "./tipos";

export type EstadoDoModulo = { ok: true; ligado: boolean } | { ok: false };

export async function estadoDoModulo(
  ctx: ContextoDeConsulta,
  nome: ModuloOpcional,
): Promise<EstadoDoModulo> {
  try {
    // Os interruptores da instalação não têm policy para a sessão (ver
    // `ContextoDeConsulta.bancoDaInstalacao`): lê pelo cliente de serviço quando
    // a rota o entregou.
    const ligados = await modulosLigados(ctx.bancoDaInstalacao ?? ctx.bancoDosModulos);
    return { ok: true, ligado: ligados.includes(nome) };
  } catch (erro) {
    const detalhe = erro instanceof Error ? erro.message : String(erro);
    logger.warn("assistente.metricas.leitura_de_modulos_falhou", { modulo: nome, detalhe });
    return { ok: false };
  }
}

/** Atalho booleano para o catálogo; leitura que falhou conta como desligado. */
export async function moduloLigado(ctx: ContextoDeConsulta, nome: ModuloOpcional): Promise<boolean> {
  const estado = await estadoDoModulo(ctx, nome);
  return estado.ok ? estado.ligado : false;
}
