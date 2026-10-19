// @vitest-environment node
import { tool, type Tool } from "ai";
import { z } from "zod";

import { CATALOGO_DE_PORTAS } from "@/lib/assistente/portas/catalogo.gerado";
import {
  portaDeLeituraPermitida,
  tipoDeMetodoPermitido,
} from "@/lib/assistente/portas/regras";
import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

const esquemaDeEntrada = z.strictObject({
  pergunta: z.string().trim().min(3).max(200),
});
type EntradaDeProcurarPorta = z.infer<typeof esquemaDeEntrada>;

function palavrasDa(pergunta: string): string[] {
  return pergunta
    .toLowerCase()
    .split(/[\s,.;:!?]+/)
    .filter((p) => p.length > 0);
}

function temPalavra(texto: string, palavras: string[]): boolean {
  const t = texto.toLowerCase();
  return palavras.some((palavra) => t.includes(palavra));
}

function portaCorresponde(portaId: string, area: string, resumo: string, palavras: string[]): boolean {
  if (palavrasDa(portaId).some((p) => palavras.includes(p))) return true;
  if (palavrasDa(area).some((p) => palavras.includes(p))) return true;
  if (temPalavra(resumo, palavras)) return true;
  return false;
}

/** Métodos de escrita que o assistente pode usar nesta porta, em ordem. */
function metodosDeEscritaPermitida(portaId: string): ("POST" | "PATCH" | "PUT")[] {
  const resultado: ("POST" | "PATCH" | "PUT")[] = [];
  for (const metodo of ["POST", "PATCH", "PUT"] as const) {
    if (tipoDeMetodoPermitido(portaId, metodo)) resultado.push(metodo);
  }
  return resultado;
}

async function procurarPorta(
  entrada: EntradaDasFerramentas,
  e: EntradaDeProcurarPorta,
): Promise<{ portas: PortaEncontrada[] }> {
  const palavras = palavrasDa(e.pergunta);
  const encontradas: PortaEncontrada[] = [];

  for (const porta of CATALOGO_DE_PORTAS) {
    if (!portaCorresponde(porta.id, porta.area, porta.resumo, palavras)) continue;

    const leituraPermitida = porta.metodos.includes("GET") && portaDeLeituraPermitida(porta.id);
    const escrita = metodosDeEscritaPermitida(porta.id);

    const metodosPermitidos: string[] = [];
    if (leituraPermitida) metodosPermitidos.push("GET");
    metodosPermitidos.push(...escrita);

    encontradas.push({
      id: porta.id,
      caminho: porta.caminho,
      metodos: metodosPermitidos,
      parametros: porta.parametros,
      resumo: porta.resumo,
    });

    if (encontradas.length >= 12) break;
  }

  return { portas: encontradas };
}

export interface PortaEncontrada {
  id: string;
  caminho: string;
  metodos: string[];
  parametros: string[];
  resumo: string;
}

export function criarProcurarPorta(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Busca portas do catálogo da empresa por palavra-chave no id, na área ou no resumo. " +
      "Devolve até 12 portas com os métodos que o assistente PODE usar em cada uma " +
      "(leitura GET e/ou escrita POST/PATCH/PUT), os parâmetros de caminho e o resumo. " +
      "Nunca devolve portas proibidas (envio de mensagem, disparo de campanha, equipe, " +
      "chaves de API, cron, admin, auth, webhooks, LGPD, etc.). Use para encontrar a porta " +
      "certa antes de ler ou propor mudança.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("procurar_porta", esquemaDeEntrada, (e) => procurarPorta(entrada, e)),
  });
}
