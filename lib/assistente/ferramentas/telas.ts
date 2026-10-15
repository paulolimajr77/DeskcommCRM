/**
 * Ferramentas `listar_telas` e `abrir_tela` — a navegação do assistente.
 *
 * ═══ UMA LISTA SÓ ═══
 *
 * As telas vêm de `searchable()` de `lib/navigation/registry.ts` — a MESMA
 * função que alimenta a busca ⌘K — com o papel da sessão (`ctx.papel`) e os
 * módulos/capacidades ligados. Nada de lista paralela: tela nova no catálogo
 * aparece aqui sem editar este arquivo, e o que o papel não vê, o assistente
 * não oferece. Título e grupo saem no idioma da sessão, como a paleta traduz.
 * (O `settings` de interface da organização/vínculo não está no contexto da
 * consulta; ele só ESCONDE portas por preferência, nunca concede acesso, então
 * ficar sem ele pode oferecer uma porta que a pessoa dispensou no menu — nunca
 * uma que o papel proíbe.)
 *
 * ═══ O BOTÃO É DO CATÁLOGO, NUNCA DO MODELO ═══
 *
 * `abrir_tela` recebe um `destino` em texto, procura-o por IGUALDADE na lista
 * de telas visíveis e usa o `href` do OBJETO encontrado. O texto do modelo
 * nunca é concatenado, interpolado nem repassado: se não for exatamente um
 * `href` do catálogo visível para esta pessoa, não há botão. A ferramenta só
 * ANOTA o botão no coletor; quem clica (ou não) é a pessoa. Nada navega sozinho.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";

import { traduzir } from "@/lib/i18n/dicionario";
import { modulosLigados } from "@/lib/instalacao/modulos";
import { NAV_GROUPS, searchable, type NavDestination } from "@/lib/navigation/registry";
import { capacidadesLigadas } from "@/lib/organizacao/capacidades";
import type { ContextoDeConsulta } from "@/lib/assistente/metricas";

import { protegida } from "./protegida";
import type { EntradaDasFerramentas } from "./tipos";

export const MAXIMO_DE_TELAS_LISTADAS = 40;
export const MAXIMO_DE_ACOES_POR_TURNO = 3;

/** Sem acento e sem caixa — a mesma normalização da paleta ⌘K. */
function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** As telas que ESTA pessoa pode ver, na ordem do catálogo. */
export async function telasVisiveis(ctx: ContextoDeConsulta): Promise<NavDestination[]> {
  const [modulos, organizacao] = await Promise.all([
    // Interruptores da INSTALAÇÃO: sem policy para a sessão, ver `ContextoDeConsulta.bancoDaInstalacao`.
    modulosLigados(ctx.bancoDaInstalacao ?? ctx.bancoDosModulos),
    // A escolha da ORGANIZAÇÃO (`organizations.settings`) a sessão lê por RLS. Não uso
    // `capacidadesDaOrganizacao(db)`: ela lê os módulos pelo MESMO cliente que lê a
    // organização, e com o cliente da sessão os módulos viriam todos desligados.
    ctx.bancoDosModulos.from("organizations").select("settings").eq("id", ctx.orgId).maybeSingle(),
  ]);
  const capacidades = organizacao.error ? [] : capacidadesLigadas(organizacao.data?.settings, modulos);
  return searchable(false, ctx.papel, undefined, modulos, capacidades);
}

function tituloDe(tela: NavDestination, idioma: ContextoDeConsulta["idioma"]): string {
  return traduzir(tela.label, idioma);
}

function grupoDe(tela: NavDestination, idioma: ContextoDeConsulta["idioma"]): string {
  const grupo = NAV_GROUPS.find((candidato) => candidato.id === tela.group);
  return traduzir(grupo ? grupo.label : tela.group, idioma);
}

const esquemaDeListar = z.strictObject({ busca: z.string().max(80).optional() });

export function criarListarTelas(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Lista as telas do CRM que ESTA pessoa pode abrir, com o destino (`destino`), o título e o " +
      "grupo. Use para descobrir onde algo fica ou para achar o destino certo antes de `abrir_tela`. " +
      "`busca` (opcional) filtra pelo título, sem diferenciar acento nem maiúscula. " +
      "Devolve no máximo 40 telas; se `truncado` vier verdadeiro, refine a busca.",
    inputSchema: esquemaDeListar,
    execute: protegida("listar_telas", esquemaDeListar, async ({ busca }) => {
      const idioma = entrada.ctx.idioma;
      const termo = normalizar((busca ?? "").trim());
      const visiveis = await telasVisiveis(entrada.ctx);
      const achadas = visiveis.filter((tela) => {
        if (termo === "") return true;
        return (
          normalizar(tela.label).includes(termo) || normalizar(tituloDe(tela, idioma)).includes(termo)
        );
      });
      return {
        ok: true as const,
        total_encontrado: achadas.length,
        truncado: achadas.length > MAXIMO_DE_TELAS_LISTADAS,
        telas: achadas.slice(0, MAXIMO_DE_TELAS_LISTADAS).map((tela) => ({
          destino: tela.href,
          titulo: tituloDe(tela, idioma),
          grupo: grupoDe(tela, idioma),
        })),
      };
    }),
  });
}

const esquemaDeAbrir = z.strictObject({ destino: z.string().max(200) });

export function criarAbrirTela(entrada: EntradaDasFerramentas): Tool {
  return tool({
    description:
      "Mostra à pessoa um botão para abrir uma tela do CRM. `destino` é o `destino` EXATO de um item " +
      "de `listar_telas`. Você não navega: o botão só aparece no chat e a pessoa decide se clica. " +
      "Use quando a resposta terminar em 'abra tal tela'. No máximo 3 botões por resposta.",
    inputSchema: esquemaDeAbrir,
    execute: protegida("abrir_tela", esquemaDeAbrir, async ({ destino }) => {
      const visiveis = await telasVisiveis(entrada.ctx);
      const tela = visiveis.find((candidata) => candidata.href === destino);
      if (!tela) return { ok: false as const, motivo: "tela_inexistente" as const };

      const jaTem = entrada.coletor.acoes.some((acao) => acao.href === tela.href);
      if (!jaTem) {
        if (entrada.coletor.acoes.length >= MAXIMO_DE_ACOES_POR_TURNO) {
          return { ok: false as const, motivo: "muitas_acoes" as const };
        }
        entrada.coletor.acoes.push({
          tipo: "abrir_tela",
          rotulo: `${traduzir("Abrir", entrada.ctx.idioma)} ${tituloDe(tela, entrada.ctx.idioma)}`,
          href: tela.href,
        });
      }
      return { ok: true as const, mensagem: "O botão será mostrado; a pessoa decide se clica." };
    }),
  });
}
