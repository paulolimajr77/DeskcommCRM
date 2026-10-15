/**
 * Helper comum das métricas que leem fontes com dias em UTC (uso_de_ia e
 * evolucao_da_ia): recusa > 90 dias *antes* de chamar a rota e o aviso fixo.
 * A rota corta silenciosamente; recusar antes é o que evita a mentira.
 */
export const AVISO_TZ_UTC_USO =
  "Os dias desta fonte são contados em UTC, não no fuso da organização; as bordas do período podem deslocar até um dia.";

export function acimaDe90(dias: number, teto: number = 90): boolean {
  return dias > teto;
}
