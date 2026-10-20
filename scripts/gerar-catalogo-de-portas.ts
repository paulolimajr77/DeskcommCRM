// Gera lib/assistente/portas/catalogo.gerado.ts a partir de app/api/v1/**/route.ts.
// Rode com: pnpm portas:gerar (ou tsx scripts/gerar-catalogo-de-portas.ts).
//
// O que faz:
// 1. Varre todos os app/api/v1/**/route.ts.
// 2. Detecta cada verbo exportado nas duas formas:
//    - export async function GET(req, ctx) (declaracao de funcao)
//    - export const GET = ... (constante de arrow function)
//    e imprime quantas rotas usam cada forma.
// 3. Extrai o comentario de cabecalho (primeira frase) de cada route.ts.
// 4. Escreve o catalogo em ordem estable (por id), com cabecalho de "nao edite".
// 5. Emite CARREGADORES somente para portas de leitura permitida (GET e nao proibida),
//    com import("@/app/api/v1/.../route") estatico, no padrao de
//    lib/assistente/ferramentas/proposta-comum.ts.
//
// Exporta tambem montarConteudoCatalogo() (puro, sem escrever disco) para que
// o teste de "em dia" compare sem depender do arquivo gravado.

import fs from "node:fs";
import path from "node:path";

import {
  AREAS_SO_LEITURA,
  ESCRITA_PERMITIDA,
  casaComPrefixo,
  ehProibida,
  PREFIXOS_PROIBIDOS,
  PORTAS_PROIBIDAS,
  SUFIXOS_PROIBIDOS,
} from "../lib/assistente/portas/listas";

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, "app", "api", "v1");
const OUT = path.join(ROOT, "lib", "assistente", "portas", "catalogo.gerado.ts");

type Metodo = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
const METODOS: Metodo[] = ["GET", "POST", "PATCH", "PUT", "DELETE"];

function segmentoSobApiV1(arquivoAbsoluto: string): string[] {
  const rel = path.relative(API_DIR, String(arquivoAbsoluto)).split(path.sep);
  if (rel[rel.length - 1] === "route.ts") rel.pop();
  return rel;
}

function idDe(segmentos: string[]): string {
  return segmentos.map((s) => s.replace(/^\[(.+)\]$/, ":$1")).join("/");
}

function caminhoDe(segmentos: string[]): string {
  return segmentos.join("/");
}

function areaDe(segmentos: string[]): string {
  return segmentos[0] ?? "";
}

function parametrosDe(segmentos: string[]): string[] {
  const out: string[] = [];
  for (const s of segmentos) {
    const m = s.match(/^\[(.+)\]$/);
    if (m) out.push(m[1]!);
  }
  return out;
}

// Primeira frase do comentario de cabecalho (bloco /* ... */ no topo).
function resumoDoCabecalho(conteudo: string): string {
  const m = conteudo.match(/^\s*\/\*\*(?:(?!\*\/).)*\*\//s);
  if (!m) return "";
  let texto = m[0];
  texto = texto.replace(/^\s*\/\*\*\s*/, "").replace(/\*\/\s*$/, "");
  texto = texto.replace(/^\s*\*\s?/gm, " ").trim();
  const fim = texto.search(/\.(?=\s|$)/);
  if (fim === -1) return texto;
  return texto.slice(0, fim + 1).trim();
}

interface Porta {
  id: string;
  caminho: string;
  metodos: Metodo[];
  parametros: string[];
  area: string;
  resumo: string;
}

function lerPorta(arquivoAbsoluto: string): Porta | null {
  const segmentos = segmentoSobApiV1(arquivoAbsoluto);
  if (segmentos.length === 0) return null;
  const conteudo = fs.readFileSync(arquivoAbsoluto, "utf8");
  const metodos: Metodo[] = [];
  for (const m of METODOS) {
    const rxFn = new RegExp(
      "export\\s+async\\s+function\\s+" + m + "\\b",
      "g",
    );
    const rxConst = new RegExp(
      "export\\s+const\\s+" + m + "\\s*[:=]",
      "g",
    );
    if (rxFn.test(conteudo) || rxConst.test(conteudo)) {
      metodos.push(m);
    }
  }
  if (metodos.length === 0) return null;
  return {
    id: idDe(segmentos),
    caminho: caminhoDe(segmentos),
    metodos,
    parametros: parametrosDe(segmentos),
    area: areaDe(segmentos),
    resumo: resumoDoCabecalho(conteudo),
  };
}

// Monta o texto completo do arquivo gerado (puro, sem escrever disco).
export function montarConteudoCatalogo(portas: readonly Porta[]): string {
  const ordenadas = [...portas].sort((a, b) => a.id.localeCompare(b.id));

  const linhas: string[] = [];
  linhas.push("// Arquivo gerado por scripts/gerar-catalogo-de-portas.ts. NAO EDITE.");
  linhas.push("// Rode pnpm portas:gerar para regenerar apos adicionar/remover rotas.");
  linhas.push("");
  linhas.push('import type { Metodo, PortaDoCatalogo } from "./tipos";');
  linhas.push("");

  // Portas proibidas (prefixo, exata ou sufixo OAuth) saem do catalogo por
  // completo: id fora do catálogo já é recusado por portaDeLeituraPermitida e
  // escritaPermitida.
  const permitidas = ordenadas.filter((p) => !ehProibida(p.id));

  linhas.push("// Todas as portas do catalogo (apenas as nao proibidas).");
  linhas.push("export const CATALOGO_DE_PORTAS: readonly PortaDoCatalogo[] = [");
  for (const p of permitidas) {
    linhas.push("  {");
    linhas.push("    id: " + JSON.stringify(p.id) + ",");
    linhas.push("    caminho: " + JSON.stringify(p.caminho) + ",");
    linhas.push(
      "    metodos: [" +
        p.metodos.map((m) => JSON.stringify(m)).join(", ") +
        "],",
    );
    linhas.push(
      "    parametros: [" +
        p.parametros.map((s) => JSON.stringify(s)).join(", ") +
        "],",
    );
    linhas.push("    area: " + JSON.stringify(p.area) + ",");
    linhas.push("    resumo: " + JSON.stringify(p.resumo) + ",");
    linhas.push("  },");
  }
  linhas.push("] as const;");
  linhas.push("");

  const leitura = ordenadas.filter(
    (p) => p.metodos.includes("GET") && !ehProibida(p.id),
  );
  linhas.push("// Carregadores de leitura permitida (GET e nao proibido).");
  linhas.push("// O bundler nao aceita import com caminho variavel, entao cada um e um");
  linhas.push("// import() de caminho literal, no padrao de proposta-comum.ts.");
  linhas.push(
    "export const CARREGADORES: Record<string, () => Promise<Record<string, unknown>>> = {",
  );
  for (const p of leitura) {
    linhas.push("  " + JSON.stringify(p.id) + ": async () => {");
    const modulo = "@/app/api/v1/" + p.caminho + "/route";
    linhas.push("    const mod = await import(" + JSON.stringify(modulo) + ");");
    linhas.push("    return { GET: mod.GET };");
    linhas.push("  },");
  }
  linhas.push("};");
  linhas.push("");

  // Carregadores de escrita: apenas as portas da lista branca ESCRITA_PERMITIDA,
  // devolvendo TODOS os métodos aprovados para cada porta. O bundler nao aceita
  // import com caminho variavel, entao cada um e um import() de caminho literal.
  const escritaPorPorta = new Map<string, Metodo[]>();
  for (const e of ESCRITA_PERMITIDA) {
    if (!escritaPorPorta.has(e.porta)) escritaPorPorta.set(e.porta, []);
    escritaPorPorta.get(e.porta)!.push(e.metodo);
  }
  linhas.push("// Carregadores de escrita permitida (apenas ESCRITA_PERMITIDA).");
  linhas.push("// O bundler nao aceita import com caminho variavel, entao cada um e um");
  linhas.push("// import() de caminho literal, no padrao de proposta-comum.ts.");
  linhas.push(
    "export const CARREGADORES_DE_ESCRITA: Record<string, () => Promise<Record<string, unknown>>> = {",
  );
  for (const [porta, metodos] of escritaPorPorta) {
    const p = ordenadas.find((x) => x.id === porta);
    if (!p) continue;
    const metodosValidos = metodos.filter((m) => p.metodos.includes(m));
    if (metodosValidos.length === 0) continue;
    linhas.push("  " + JSON.stringify(porta) + ": async () => {");
    const modulo = "@/app/api/v1/" + p.caminho + "/route";
    linhas.push("    const mod = await import(" + JSON.stringify(modulo) + ");");
    linhas.push("    return {");
    for (const m of metodosValidos) {
      linhas.push("      " + m + ": mod." + m + ",");
    }
    linhas.push("    };");
    linhas.push("  },");
  }
  linhas.push("};");
  linhas.push("");

  return linhas.join("\n") + "\n";
}

export function varrerRotas(): Porta[] {
  const portas: Porta[] = [];
  function walk(dir: string) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name === "route.ts") {
        const p = lerPorta(full);
        if (p) portas.push(p);
      }
    }
  }
  walk(API_DIR);
  return portas;
}

function main() {
  const portas = varrerRotas();

  let fnForm = 0;
  let constForm = 0;
  const arquivos = fs
    .readdirSync(API_DIR, { encoding: "utf8", recursive: true })
    .filter((f) => f.endsWith("route.ts")) as string[];
  for (const arquivo of arquivos) {
    const conteudo = fs.readFileSync(path.join(API_DIR, arquivo), "utf8");
    let temFn = false;
    let temConst = false;
    for (const m of METODOS) {
      if (new RegExp("export\\s+async\\s+function\\s+" + m + "\\b").test(conteudo))
        temFn = true;
      if (new RegExp("export\\s+const\\s+" + m + "\\s*[:=]").test(conteudo))
        temConst = true;
    }
    if (temFn) fnForm++;
    if (temConst) constForm++;
  }

  console.log("Rotas encontradas:", portas.length);
  console.log(
    "Formas de exportacao (arquivos com pelo menos um verbo):",
  );
  console.log("  export async function: " + fnForm);
  console.log("  export const =:        " + constForm);
  console.log("  total de arquivos:     " + (fnForm + constForm));

  const porMetodo: Record<string, number> = {};
  for (const p of portas) {
    for (const m of p.metodos) porMetodo[m] = (porMetodo[m] || 0) + 1;
  }
  console.log("Portas por metodo: " + JSON.stringify(porMetodo));

  const permitidas = portas.filter((p) => !ehProibida(p.id));
  const leitura = permitidas.filter((p) => p.metodos.includes("GET"));
  const proibidas = portas.filter((p) => ehProibida(p.id));
  console.log("Portas no catalogo (nao proibidas): " + permitidas.length);
  console.log("Leitura permitidas: " + leitura.length);
  console.log("Proibidas (fora do catalogo): " + proibidas.length);

  const conteudo = montarConteudoCatalogo(portas);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, conteudo, "utf8");
  console.log("Escrito: " + OUT);
}

function isDirectExecution(): boolean {
  return /gerar-catalogo-de-portas\.ts$/i.test(process.argv[1] || "");
}

if (isDirectExecution()) main();
