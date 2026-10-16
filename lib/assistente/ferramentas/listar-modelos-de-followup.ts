/**
 * Ferramenta `listar_modelos_de_followup` — o catálogo de modelos prontos.
 *
 * Lê o catálogo EM CÓDIGO (`lib/followup/modelos/`), sem rota. Projeção por
 * LISTA POSITIVA: `id`, `nome`, `nicho`, `resumo`, `oQueDispara`, `pedeEtapa`,
 * `toques` (calculado do grafo por `toquesDoModelo`) e `horizonte_dias`
 * (calculado por `horizonteDoModeloMs`, arredondado). NUNCA o grafo nem os
 * textos das mensagens: eles vão para o banco, não para o modelo.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import {
  horizonteDoModeloMs,
  MODELOS_DE_FOLLOWUP,
  toquesDoModelo,
} from "@/lib/followup/modelos";

import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

const DIA_MS = 86_400_000;

const esquemaDeEntrada = z.strictObject({});

export function criarListarModelosDeFollowup(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Lista os modelos de follow-up prontos do catálogo (id, nome, nicho, resumo, o que dispara, " +
      "se pede etapa do funil, quantos toques e o horizonte em dias). " +
      "Use para escolher o modelo antes de instalar com `instalar_modelo_de_followup`.",
    inputSchema: esquemaDeEntrada,
    execute: protegida("listar_modelos_de_followup", esquemaDeEntrada, async () => {
      void entrada;
      const modelos = MODELOS_DE_FOLLOWUP.map((modelo) => ({
        id: modelo.id,
        nome: modelo.nome,
        nicho: modelo.nicho,
        resumo: modelo.resumo,
        oQueDispara: modelo.oQueDispara,
        pedeEtapa: modelo.pedeEtapa,
        toques: toquesDoModelo(modelo.grafo),
        horizonte_dias: Math.round(horizonteDoModeloMs(modelo.grafo) / DIA_MS),
      }));

      return { ok: true as const, modelos };
    }),
  });
}
