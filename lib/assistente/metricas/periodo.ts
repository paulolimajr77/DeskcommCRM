/**
 * Períodos das métricas — arquivo PURO, sem I/O: nada aqui lê banco, relógio
 * ou requisição. Todo instante entra como `agoraIso` e toda data sai no FUSO
 * da organização.
 *
 * A armadilha que este arquivo existe para não cair: `Date` do JavaScript
 * opera na timezone da MÁQUINA. Somar dias com `setDate` numa VPS em UTC
 * desloca a semana de quem fala de `America/Sao_Paulo`. Aqui toda a
 * aritmética de calendário acontece ancorada ao meio-dia UTC (civil, imune a
 * horário de verão) e a conversão para instante usa `Intl.DateTimeFormat` com
 * o fuso pedido — o deslocamento REAL do dia, inclusive na virada do horário
 * de verão, onde uma semana não tem 168 horas.
 */
import { z } from "zod";

/** Janela máxima de qualquer período — a mesma régua da rota do relatório. */
export const MAXIMO_DE_DIAS = 400;

const MS_POR_DIA = 86_400_000;
const padraoDeData = /^\d{4}-\d{2}-\d{2}$/;

/** Meio-dia UTC do dia civil — âncora estável para aritmética de datas. */
function msDoDia(dia: string): number {
  return Date.UTC(
    Number(dia.slice(0, 4)),
    Number(dia.slice(5, 7)) - 1,
    Number(dia.slice(8, 10)),
    12,
    0,
    0,
  );
}

/** Dia civil (`AAAA-MM-DD`) de um instante ancorado. */
function diaDoMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Soma (ou subtrai) dias civis sem tocar em fuso. */
function somarDias(dia: string, n: number): string {
  return diaDoMs(msDoDia(dia) + n * MS_POR_DIA);
}

/** Dias entre `de` e `ate` CONTANDO os dois (o que a pessoa fala: "de 1 a 7" = 7 dias). */
export function diasInclusive(de: string, ateInclusivo: string): number {
  return Math.round((msDoDia(ateInclusivo) - msDoDia(de)) / MS_POR_DIA) + 1;
}

/** Índice do dia na semana com SEGUNDA = 0 (domingo = 6). */
function indiceSegundaZero(dia: string): number {
  return (new Date(msDoDia(dia)).getUTCDay() + 6) % 7;
}

/** "2026-02-30" passa no regex, mas não existe — confere com a ida e volta. */
function dataDeCalendarioValida(dia: string): boolean {
  if (!padraoDeData.test(dia)) return false;
  return diaDoMs(msDoDia(dia)) === dia;
}

/**
 * As partes de calendário de um instante NO FUSO pedido — a primitiva de
 * leitura. `hourCycle: "h23"` e o `% 24` blindam contra ICU que responde
 * meia-noite como hora "24".
 */
function partesNoFuso(
  instante: Date,
  fuso: string,
): { ano: number; mes: number; dia: number; hora: number; minuto: number; segundo: number } {
  const formato = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const partes: Record<string, string> = {};
  for (const parte of formato.formatToParts(instante)) {
    if (parte.type !== "literal") partes[parte.type] = parte.value;
  }
  return {
    ano: Number(partes.year),
    mes: Number(partes.month),
    dia: Number(partes.day),
    // % 24: alguma ICU responde "24" para meia-noite com `hour12: false`.
    hora: Number(partes.hour) % 24,
    minuto: Number(partes.minute),
    segundo: Number(partes.second),
  };
}

/** O dia civil de um instante no fuso pedido (`AAAA-MM-DD`). */
function diaCivilDe(agoraIso: string, fuso: string): string {
  const p = partesNoFuso(new Date(agoraIso), fuso);
  return `${String(p.ano).padStart(4, "0")}-${String(p.mes).padStart(2, "0")}-${String(p.dia).padStart(2, "0")}`;
}

/** Deslocamento (ms) do fuso NUM instante — o que o horário de verão muda. */
function deslocamentoEmMs(instante: number, fuso: string): number {
  const p = partesNoFuso(new Date(instante), fuso);
  return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - instante;
}

/**
 * O instante da meia-noite LOCAL de um dia no fuso — a parede `00:00` daquele
 * dia, com o deslocamento real. Correção iterativa: adivinha com deslocamento
 * UTC, corrige com o deslocamento medido, repete. Em dia em que a meia-noite
 * NÃO existe (fuso que pula direto da 00:00), converge para o primeiro
 * instante válido do dia — o mesmo comportamento de uma biblioteca de fusos.
 */
function instanteDeMeiaNoite(dia: string, fuso: string): Date {
  const meiaNoiteEmUtc = Date.UTC(
    Number(dia.slice(0, 4)),
    Number(dia.slice(5, 7)) - 1,
    Number(dia.slice(8, 10)),
    0,
    0,
    0,
  );
  let palpite = meiaNoiteEmUtc;
  for (let passo = 0; passo < 3; passo += 1) {
    palpite = meiaNoiteEmUtc - deslocamentoEmMs(palpite, fuso);
  }
  return new Date(palpite);
}

/** Fuso desconhecido NÃO derruba a métrica: cai para UTC, e o `fuso` da resposta o declara. */
function fusoSeguro(fuso: string): string {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: fuso });
    return fuso;
  } catch {
    return "UTC";
  }
}

/** O que o modelo pode pedir — formato validado; semântica no `superRefine`. */
const membrosDoPeriodo = [
  z.strictObject({ tipo: z.literal("semana_passada") }),
  z.strictObject({ tipo: z.literal("semana_atual") }),
  z.strictObject({
    tipo: z.literal("ultimos_dias"),
    dias: z.number().int().min(1).max(MAXIMO_DE_DIAS),
  }),
  z.strictObject({ tipo: z.literal("mes_atual") }),
  z.strictObject({ tipo: z.literal("mes_passado") }),
  z.strictObject({
    tipo: z.literal("intervalo"),
    de: z.string().regex(padraoDeData, "use AAAA-MM-DD"),
    ate: z.string().regex(padraoDeData, "use AAAA-MM-DD"),
  }),
] as const;

/**
 * `intervalo` tem `ate` INCLUSIVO, como a pessoa fala ("de 1 a 7" inclui o 7),
 * com `de <= ate` e janela máxima — rejeitado AQUI, antes de qualquer rota.
 */
export const PeriodoSolicitado = z
  .discriminatedUnion("tipo", membrosDoPeriodo)
  .superRefine((valor, ctxZod) => {
    if (valor.tipo !== "intervalo") return;
    if (!dataDeCalendarioValida(valor.de)) {
      ctxZod.addIssue({ code: "custom", message: "data inicial inválida", path: ["de"] });
      return;
    }
    if (!dataDeCalendarioValida(valor.ate)) {
      ctxZod.addIssue({ code: "custom", message: "data final inválida", path: ["ate"] });
      return;
    }
    if (valor.de > valor.ate) {
      ctxZod.addIssue({ code: "custom", message: "a data inicial é depois da final", path: ["de"] });
      return;
    }
    if (diasInclusive(valor.de, valor.ate) > MAXIMO_DE_DIAS) {
      ctxZod.addIssue({ code: "custom", message: `o intervalo não pode passar de ${MAXIMO_DE_DIAS} dias`, path: ["ate"] });
    }
  });

export type PeriodoSolicitado = z.infer<typeof PeriodoSolicitado>;

/** O período resolvido — datas civis no fuso e instantes com o deslocamento real. */
export interface PeriodoResolvido {
  /** Início, `AAAA-MM-DD` no fuso (inclusivo). */
  de: string;
  /** Fim, `AAAA-MM-DD` no fuso (INCLUSIVO — é o que a pessoa pediu). */
  ateInclusivo: string;
  /** O dia seguinte ao fim — o corte exclusivo para consultas de banco. */
  ateExclusivo: string;
  /** Meia-noite local do início, em ISO com o deslocamento real do fuso. */
  deInstante: string;
  /** Meia-noite local do dia APÓS o fim (o corte exclusivo, em instante). */
  ateInstanteExclusivo: string;
  /** O fuso efetivamente usado (UTC quando o informado era inválido). */
  fuso: string;
  /** `true` quando o período ainda não terminou (semana e mês correntes). */
  parcial: boolean;
  /** Rótulo legível no idioma pedido, ex.: "segunda 05/10 a domingo 11/10/2026". */
  rotulo: string;
}

const nomesDosDias = {
  "pt-BR": ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"],
  es: ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
} as const;

function curto(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

function longo(dia: string): string {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}/${dia.slice(0, 4)}`;
}

/** Semana leva o nome do dia da semana (civil — não depende de fuso); o resto é simples. */
function montarRotulo(de: string, ate: string, comDiaDaSemana: boolean, idioma: "pt-BR" | "es"): string {
  if (!comDiaDaSemana) return `${longo(de)} a ${longo(ate)}`;
  const nomes = nomesDosDias[idioma];
  const inicio = nomes[new Date(msDoDia(de)).getUTCDay()];
  const fim = nomes[new Date(msDoDia(ate)).getUTCDay()];
  return `${inicio} ${curto(de)} a ${fim} ${longo(ate)}`;
}

/**
 * Resolve o pedido do modelo em datas concretas. Semana = SEGUNDA a domingo.
 * `ultimos_dias` conta dias COMPLETOS terminando ontem. `semana_atual` e
 * `mes_atual` são parciais (terminam hoje). Semântica do `intervalo` já foi
 * validada pelo Zod.
 */
export function resolverPeriodo(
  solicitado: PeriodoSolicitado,
  agoraIso: string,
  fuso: string,
  idioma: "pt-BR" | "es" = "pt-BR",
): PeriodoResolvido {
  const fusoEfetivo = fusoSeguro(fuso);
  const hoje = diaCivilDe(agoraIso, fusoEfetivo);

  let de: string;
  let ate: string;
  let parcial = false;
  let comDiaDaSemana = false;

  switch (solicitado.tipo) {
    case "semana_passada": {
      const segundaDestaSemana = somarDias(hoje, -indiceSegundaZero(hoje));
      de = somarDias(segundaDestaSemana, -7);
      ate = somarDias(de, 6);
      comDiaDaSemana = true;
      break;
    }
    case "semana_atual": {
      de = somarDias(hoje, -indiceSegundaZero(hoje));
      ate = hoje;
      parcial = true;
      comDiaDaSemana = true;
      break;
    }
    case "ultimos_dias": {
      ate = somarDias(hoje, -1);
      de = somarDias(hoje, -solicitado.dias);
      break;
    }
    case "mes_atual": {
      de = `${hoje.slice(0, 7)}-01`;
      ate = hoje;
      parcial = true;
      break;
    }
    case "mes_passado": {
      const ultimoDoMesPassado = somarDias(`${hoje.slice(0, 7)}-01`, -1);
      de = `${ultimoDoMesPassado.slice(0, 7)}-01`;
      ate = ultimoDoMesPassado;
      break;
    }
    case "intervalo": {
      de = solicitado.de;
      ate = solicitado.ate;
      break;
    }
  }

  const ateExclusivo = somarDias(ate, 1);

  return {
    de,
    ateInclusivo: ate,
    ateExclusivo,
    deInstante: instanteDeMeiaNoite(de, fusoEfetivo).toISOString(),
    ateInstanteExclusivo: instanteDeMeiaNoite(ateExclusivo, fusoEfetivo).toISOString(),
    fuso: fusoEfetivo,
    parcial,
    rotulo: montarRotulo(de, ate, comDiaDaSemana, idioma),
  };
}
