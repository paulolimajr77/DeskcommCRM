// @vitest-environment node
import { tool, type Tool } from "ai";
import { z } from "zod";

import { chamarRotaPorDentro } from "@/lib/assistente/metricas/chamar-rota";
import { abrirPorta } from "@/lib/assistente/portas/abrir";
import { CAMINHOS, FONTES } from "./proposta-comum";
import { anotarCartaoDeProposta } from "./tipos";
import {
  escritaPermitida,
  portaDeLeituraPermitida,
} from "@/lib/assistente/portas/regras";
import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

const esquemaDeEntrada = z.strictObject({
  porta: z.string().min(1).max(200),
  metodo: z.enum(["POST", "PATCH", "PUT"]),
  valores: z.record(z.string(), z.string().min(1).max(64)).optional(),
  corpo: z.record(z.string(), z.unknown()).optional(),
  resumo: z.string().trim().min(3).max(300),
  motivo: z.string().trim().min(3).max(2000),
});
type EntradaDeProporMudanca = z.infer<typeof esquemaDeEntrada>;

async function proporMudanca(
  entrada: EntradaDasFerramentas,
  e: EntradaDeProporMudanca,
): Promise<{ ok: true; propostaId: string } | { ok: false; motivo: string }> {
  // Exige escrita permitida.
  if (!escritaPermitida(e.porta, e.metodo)) {
    return { ok: false, motivo: "porta_nao_liberada" };
  }

  // Para PATCH/PUT, lê o "antes" pela porta GET com o mesmo id.
  let antes: Record<string, unknown> | null = null;
  if (e.metodo !== "POST" && portaDeLeituraPermitida(e.porta)) {
    const valoresParaAntes: Record<string, string> = {};
    // Extrai os parâmetros de caminho da porta id (ex.: "contacts/:id" → { id: valores.id })
    for (const segmento of e.porta.split("/")) {
      const m = segmento.match(/^:(.+)$/);
      if (m && m[1]) {
        const nome = m[1];
        const valor = e.valores?.[nome];
        if (valor) {
          valoresParaAntes[nome] = valor;
        }
      }
    }
    const aberto = await abrirPorta(e.porta, "GET", valoresParaAntes);
    if (aberto) {
      const resposta = await chamarRotaPorDentro(aberto.handler, aberto.caminho, {});
      if ("status" in resposta && resposta.status === 200 && resposta.corpo) {
        const corpo = resposta.corpo as { data?: unknown };
        antes = corpo.data ? { data: corpo.data } : null;
      }
    }
  }

  const corpo = {
    kind: "acao" as const,
    resumo: e.resumo,
    motivo: e.motivo,
    antes: e.metodo !== "POST" ? antes : null,
    payload: {
      porta: e.porta,
      metodo: e.metodo,
      ...(e.valores !== undefined ? { valores: e.valores } : {}),
      ...(e.corpo !== undefined ? { corpo: e.corpo } : {}),
    },
  };

  const resposta = await chamarRotaPorDentro(
    await FONTES.propostas(),
    CAMINHOS.propostas,
    {},
    { metodo: "POST", corpo },
  );

  if (!("status" in resposta) || (resposta.status !== 200 && resposta.status !== 201)) {
    return { ok: false, motivo: "indisponivel" };
  }

  const dados =
    typeof resposta.corpo === "object" && resposta.corpo !== null
      ? (resposta.corpo as { id?: string })
      : undefined;
  const propostaId = dados?.id ?? crypto.randomUUID();

  anotarCartaoDeProposta(entrada.coletor, propostaId);

  return { ok: true, propostaId };
}

export function criarProporMudanca(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "PROPÕE uma mudança em qualquer porta do catálogo da empresa. Não aplica " +
      "nada: grava uma proposta que o administrador aprova na tela. `porta` é o " +
      "id da porta (ex.: `contacts/:id`), `metodo` é POST/PATCH/PUT, `valores` " +
      "preenche parâmetros de caminho, `corpo` é o conteúdo da mudança. " +
      "`resumo` é o título para a pessoa e `motivo` o porquê. Diga sempre que " +
      "PROPÔS, nunca que mudou. Só `admin` pode propor.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("propor_mudanca", esquemaDeEntrada, (e) => proporMudanca(entrada, e)),
  });
}
