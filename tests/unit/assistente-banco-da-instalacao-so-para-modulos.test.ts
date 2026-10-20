/**
 * O CLIENTE DE SERVIÇO NO CONTEXTO DO ASSISTENTE SÓ SERVE AOS INTERRUPTORES DE MÓDULO.
 *
 * `ContextoDeConsulta.bancoDaInstalacao` é o client de serviço (ignora RLS) que
 * a rota do chat entrega para ler `platform_config`/`modulos_instalados`, que
 * não têm policy para a sessão. É a única porta de serviço dentro do catálogo
 * de métricas e das ferramentas do modelo, e as duas coisas que o modelo toca
 * (dado de cliente e tela) NÃO podem passar por ela: um adaptador de métrica
 * que lesse `crm_leads` por aqui furaria a RLS da pessoa que perguntou.
 *
 * A cerca é por lista: só estes arquivos podem citar o campo. Quem precisar de
 * um quinto lugar tem de vir aqui, ler o comentário acima e justificar.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = join(__dirname, "..", "..");
const PASTAS = ["lib/assistente", "app/api/v1/ai/assistente"];

/** Quem pode citar `bancoDaInstalacao` (caminhos relativos à raiz, com `/`). */
const PERMITIDOS = new Set([
  "lib/assistente/metricas/tipos.ts", // declara o campo
  "lib/assistente/metricas/modulos.ts", // lê os interruptores
  "lib/assistente/ferramentas/telas.ts", // lê os interruptores para listar telas
  "app/api/v1/ai/assistente/chat/route.ts", // monta o contexto
]);

function arquivosDeCodigo(pasta: string): string[] {
  const achados: string[] = [];
  for (const nome of readdirSync(pasta)) {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) {
      achados.push(...arquivosDeCodigo(caminho));
    } else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome) && nome !== "auxiliar-de-teste.ts") {
      achados.push(caminho);
    }
  }
  return achados;
}

function relativo(caminho: string): string {
  return relative(RAIZ, caminho).split(sep).join("/");
}

describe("bancoDaInstalacao no contexto do assistente", () => {
  const codigo = PASTAS.flatMap((pasta) => arquivosDeCodigo(join(RAIZ, pasta)));

  it("controle: a varredura enxerga código (senão a lista vazia leria como 'nada vaza')", () => {
    expect(codigo.length).toBeGreaterThan(20);
    expect(codigo.map(relativo)).toContain("lib/assistente/metricas/tipos.ts");
  });

  it("só os 4 arquivos permitidos citam o campo — e todos eles de fato citam", () => {
    const quemCita = codigo.filter((caminho) => readFileSync(caminho, "utf8").includes("bancoDaInstalacao")).map(relativo);
    expect([...quemCita].sort()).toEqual([...PERMITIDOS].sort());
  });

  it("nenhuma métrica nem consulta usa o campo (dado de cliente passa só pela sessão)", () => {
    const metricas = codigo
      .map(relativo)
      .filter((caminho) => /^lib\/assistente\/metricas\/(adaptadores|consultas)\//.test(caminho));
    expect(metricas.length).toBeGreaterThan(10);
    for (const caminho of metricas) {
      expect(readFileSync(join(RAIZ, caminho), "utf8"), caminho).not.toContain("bancoDaInstalacao");
    }
  });

  it("em modulos.ts e telas.ts o campo só entra como argumento de modulosLigados", () => {
    for (const caminho of ["lib/assistente/metricas/modulos.ts", "lib/assistente/ferramentas/telas.ts"]) {
      const linhas = readFileSync(join(RAIZ, caminho), "utf8")
        .split("\n")
        .filter((linha) => linha.includes("bancoDaInstalacao") && !linha.trim().startsWith("//") && !linha.trim().startsWith("*"));
      expect(linhas.length, caminho).toBeGreaterThan(0);
      for (const linha of linhas) expect(linha, caminho).toContain("modulosLigados(");
    }
  });
});
