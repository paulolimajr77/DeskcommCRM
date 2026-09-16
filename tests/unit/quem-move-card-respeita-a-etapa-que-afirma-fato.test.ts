import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";

import { describe, expect, it } from "vitest";
import ts from "typescript";

/**
 * O SÉTIMO ESCRITOR DE `stage_id` NÃO ENTRA CALADO.
 *
 * ─── O DEFEITO QUE ESTA CERCA EXISTE PARA NÃO REPETIR ───
 *
 * `crm_stages.afirma_fato` (migration 0274) marca as etapas do funil que
 * AFIRMAM que algo já aconteceu. A trava foi posta no `moveLeadHandler` — e,
 * medido DEPOIS, SEIS caminhos escrevem `crm_leads.stage_id`. A trava cobria
 * UM.
 *
 * E o defeito real de produção passou por um dos cinco descobertos. Em
 * 2026-09-16, em produção, o negócio foi para "Proposta enviada" a partir da
 * mensagem em que o agente PROMETEU a proposta: o classificador avançou
 * `lead_state.stage`, e `agent-stage-sync.ts` moveu o card com um
 * `.update({ stage_id })` direto — sem passar por trava nenhuma. Ninguém
 * enviou proposta nenhuma, e o card apareceu adiantado num lugar que não
 * chama a atenção de ninguém.
 *
 * A decisão do dono do produto é: **a máquina não afirma fato; a pessoa sim.**
 * Todos os escritores de `stage_id` têm de consultar
 * `podeEntrarNaEtapa` — ou estar numa lista explícita de exceções, com a
 * justificativa escrita.
 *
 * Consertar os seis não impede o sétimo. Esta cerca impede.
 *
 * ─── POR QUE A VARREDURA É AST, E NÃO UMA SONDA DE TRECHO ───
 *
 * Rodei a sonda ingênua — procurar `.update(` e ver se `stage_id` aparece nos
 * 400 caracteres seguintes — sobre `app/`, `lib/`, `workers/`, `hooks/` e
 * `components/`. Ela devolveu 8 arquivos, e **2 eram falso positivo**:
 *
 *   - `lib/operacao/entradas-automaticas.ts` — é `webhook_sources.default_stage_id`,
 *     outra tabela;
 *   - `lib/leads/etapa-que-afirma-fato.ts` — a palavra aparece dentro de um
 *     COMENTÁRIO.
 *
 * 25% de erro. Uma cerca com essa taxa treina a ignorar vermelho. Aqui a
 * varredura usa o compilador `typescript` (pacote AST) para ler a ESTrutura e
 * não os bytes: o AST enxerga a tabela do `.from("crm_leads")` na mesma
 * cadeia, e comentários não são nós.
 *
 * ─── O QUE A CERCA COBRA, E O QUE ELA NÃO COBRA ───
 *
 * Cada escritor de `stage_id` em produção ou importa
 * `@/lib/leads/etapa-que-afirma-fato`, ou está na allowlist com justificativa
 * escrita. Nada mais.
 *
 * Esta cerca prova ALCANCE, não correção: quem prova que a regra está certa
 * são os testes da própria `podeEntrarNaEtapa` e os testes de cada integrador.
 * A cerca existe para o arquivo novo, aquele que ninguém lembra de incluir nas
 * outras provas.
 *
 * ─── A ALLOWLIST, E POR QUE ELA SÓ ENCOLHE ───
 *
 * As exceções nascem de duas realidades que não têm como importar a regra:
 * o board é arrastado por uma PESSOA logada, e arquivar etapa é um gesto de
 * `manager` na tela de Configurações. São as duas portas humanas.
 *
 * Uma entrada morta na allowlist é permissão que sobrou — e é assim que a
 * próxima exceção entra de carona. Por isso um dos casos abaixo obriga que
 * toda chave da allowlist ainda exista e ainda escreva `stage_id`.
 */

const RAIZ = process.cwd();
const DIRS = ["app", "lib", "workers", "hooks", "components"] as const;

/**
 * A allowlist de exceções.
 *
 * O valor é a JUSTIFICATIVA da exceção, escrita para a próxima pessoa que
 * for mexer nisto e não quiser escavar git blame. As duas justificativas
 * têm de ser reais: a cerca cobra um mínimo de 80 caracteres, porque
 * "legado" e "ok" não explicam nada.
 */
const PODEM_ESCREVER_SEM_A_REGRA: Readonly<Record<string, string>> = {
  "app/api/v1/leads/[id]/move/route.ts":
    "O BOARD. Quem arrasta o card é uma PESSOA logada por cookie, e a decisão do dono do produto é que a pessoa É a confirmação de que o fato aconteceu. Aplicar a regra aqui recusaria justamente quem tem o direito de afirmar.",
  "lib/leads/stage-operations.ts":
    "ARQUIVAR uma etapa. O gesto é de um `manager` na tela de Configurações › Funis, e o destino é escolhido por ele na hora; os negócios não são movidos por decisão de máquina, e sim empurrados por uma pessoa que está tirando a coluna do quadro.",
};

/**
 * Os seis escritores conhecidos até a última medição.
 *
 * O caso de CONTROLE DE ALCANCE exige que todos estejam no conjunto
 * encontrado: uma varredura que devolvesse conjunto VAZIO passaria no caso
 * 1, e é exatamente esse o modo mais provável de falha de uma cerca de AST.
 */
const ESCRITORES_CONHECIDOS = [
  "app/api/v1/leads/[id]/move/route.ts",
  "app/api/v1/leads/_handler.ts",
  "lib/leads/agent-stage-sync.ts",
  "lib/leads/appointment-stage-move.ts",
  "lib/leads/handoff-stage-move.ts",
  "lib/leads/stage-operations.ts",
] as const;

const CAMINHO_DA_REGRA = "@/lib/leads/etapa-que-afirma-fato";

/** Arquivos de teste não são escritores em produção; a cerca não os mede. */
function ehArquivoDeTeste(caminho: string): boolean {
  return /\.(test|spec)\.(?:ts|tsx)$/.test(caminho);
}

/** Varre os diretórios de produção em busca de arquivos TypeScript. */
function listarArquivos(): string[] {
  const alvos: string[] = [];
  for (const dir of DIRS) {
    const absoluto = join(RAIZ, dir);
    const percorre = (atual: string, relativo: string) => {
      for (const entrada of readdirSync(atual, { withFileTypes: true })) {
        const rel = posix.join(relativo, entrada.name);
        if (entrada.isDirectory()) {
          percorre(posix.join(atual, entrada.name), rel);
        } else if (
          (rel.endsWith(".ts") || rel.endsWith(".tsx")) &&
          !ehArquivoDeTeste(rel)
        ) {
          alvos.push(rel);
        }
      }
    };
    percorre(absoluto, dir);
  }
  return alvos;
}

/** Conteúdo e AST de um arquivo, prontos para as duas verificações. */
function carregar(caminho: string): { caminho: string; fonte: string; ast: ts.SourceFile } {
  const fonte = readFileSync(join(RAIZ, caminho), "utf8");
  const ast = ts.createSourceFile(caminho, fonte, ts.ScriptTarget.Latest, true);
  return { caminho, fonte, ast };
}

/** True se a cadeia de chamadas contém `.from("crm_leads")`. */
function cadeiaTemFromCrmLeads(call: ts.CallExpression): boolean {
  let node: ts.Node = call;
  while (ts.isCallExpression(node) || ts.isPropertyAccessExpression(node)) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isPropertyAccessExpression(expr) && expr.name.text === "from") {
        const arg = node.arguments[0];
        if (arg && ts.isStringLiteral(arg) && arg.text === "crm_leads") return true;
      }
      if (ts.isPropertyAccessExpression(expr)) {
        node = expr.expression;
      } else {
        break;
      }
    } else {
      node = node.expression;
    }
  }
  return false;
}

/**
 * O objeto literal do argumento tem a propriedade `stage_id`?
 *
 * Suporta `{ stage_id: ... }` e o shorthand `{ stage_id }`.
 */
function objetoTemStageId(obj: ts.ObjectLiteralExpression): boolean {
  return obj.properties.some((p) => {
    if (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) {
      const nome = p.name;
      return ts.isIdentifier(nome) && nome.text === "stage_id";
    }
    return false;
  });
}

/**
 * Constrói o mapa de variáveis cujo inicializador é UM objeto literal.
 *
 * Um identificador resolvido por aqui dá veredito seguro; um identificador
 * que não está no mapa (vem de outro módulo, de um call, de um spread) ficará
 * sem resolução e o chamador optará pelo falso positivo — nunca pelo falso
 * negativo.
 */
function mapaDeObjetos(ast: ts.SourceFile): Map<string, ts.ObjectLiteralExpression> {
  const mapa = new Map<string, ts.ObjectLiteralExpression>();
  function visit(node: ts.Node): void {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (
          decl.name &&
          ts.isIdentifier(decl.name) &&
          decl.initializer &&
          ts.isObjectLiteralExpression(decl.initializer)
        ) {
          mapa.set(decl.name.text, decl.initializer);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return mapa;
}

/**
 * Decide se o argumento de uma escrita carrega `stage_id`.
 *
 * ⚠️ A regra aqui é a do falso positivo, não a do falso negativo: quando não
 * dá para provar que NÃO tem `stage_id`, contamos como tendo. Perder um
 * escritor de verdade é o defeito inteiro; incluir um suspeito custa no
 * máximo uma linha de allowlist com justificativa.
 */
function argumentoCarregaStageId(
  arg: ts.Expression | undefined,
  mapa: Map<string, ts.ObjectLiteralExpression>,
): boolean {
  if (!arg) return true; // ausência de argumento não é provável; não deixe passar.
  if (ts.isObjectLiteralExpression(arg)) {
    return objetoTemStageId(arg);
  }
  if (ts.isIdentifier(arg)) {
    const alvo = mapa.get(arg.text);
    return alvo === undefined ? true : objetoTemStageId(alvo);
  }
  // Spreads, calls, etc. não são resolvíveis aqui sem risco de falso negativo.
  return true;
}

/**
 * True se o arquivo escreve `stage_id` em `crm_leads`.
 *
 * A detecção cobre `.update(...)`, `.insert(...)` e `.upsert(...)` cuja cadeia
 * de chamadas contenha `.from("crm_leads")`.
 */
function arquivoEscreveStageId(arquivo: ReturnType<typeof carregar>): boolean {
  const mapa = mapaDeObjetos(arquivo.ast);
  let achou = false;

  function visit(node: ts.Node): void {
    if (achou) return;
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        const metodo = expr.name.text;
        if (metodo === "update" || metodo === "insert" || metodo === "upsert") {
          if (cadeiaTemFromCrmLeads(node)) {
            const arg = node.arguments[0];
            if (argumentoCarregaStageId(arg, mapa)) {
              achou = true;
              return;
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(arquivo.ast);
  return achou;
}

/** True se o arquivo importa o módulo da regra compartilhada. */
function importaRegra(ast: ts.SourceFile): boolean {
  let achou = false;
  function visit(node: ts.Node): void {
    if (achou) return;
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      if (node.moduleSpecifier.text === CAMINHO_DA_REGRA) {
        achou = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return achou;
}

const TODOS_OS_ARQUIVOS = listarArquivos().map(carregar);
const ESCRITORES = TODOS_OS_ARQUIVOS.filter(arquivoEscreveStageId).map((a) => a.caminho);

describe("quem move o card respeita a etapa que afirma fato", () => {
  it("CONTROLE DE ALCANCE — a varredura encontra pelo menos os seis escritores conhecidos", () => {
    // ⛔ SEM ESTE CASO, o caso principal da cerca vira vácuo: uma varredura que
    // devolvesse conjunto vazio passaria no caso 1 e ninguém notaria. É o modo
    // de falha mais provável de uma cerca de AST — o seletor erra, um nó
    // renomeia, e tudo fica verde.
    const conjunto = new Set(ESCRITORES);
    for (const conhecido of ESCRITORES_CONHECIDOS) {
      expect(
        conjunto.has(conhecido),
        `escritor conhecido não foi encontrado: ${conhecido}`,
      ).toBe(true);
    }
  });

  it("⭐ todo escritor de `stage_id` ou importa a regra, ou está na allowlist", () => {
    for (const caminho of ESCRITORES) {
      const arquivo = TODOS_OS_ARQUIVOS.find((a) => a.caminho === caminho)!;

      if (PODEM_ESCREVER_SEM_A_REGRA[caminho] !== undefined) continue;

      expect(
        importaRegra(arquivo.ast),
        `${caminho} escreve stage_id em crm_leads sem consultar a regra.\n` +
          `Saídas possíveis:\n` +
          `  1. importar ${CAMINHO_DA_REGRA} e chamar podeEntrarNaEtapa antes da escrita;\n` +
          `  2. entrar na allowlist deste teste escrevendo POR QUÊ esta escrita não é uma afirmação de fato.` +
          `Justificativa vazia não passa — a cerca obriga no mínimo 80 caracteres.`,
      ).toBe(true);
    }
  });

  it("CONTROLE DE DISCRIMINAÇÃO — a varredura NÃO acusa `lib/operacao/entradas-automaticas.ts`", () => {
    // É `webhook_sources.default_stage_id`, outra tabela. Foi falso positivo
    // MEDIDO da sonda ingênua, e é o que prova que a cerca lê a TABELA da
    // cadeia e não a proximidade dos bytes.
    expect(ESCRITORES).not.toContain("lib/operacao/entradas-automaticas.ts");
  });

  it("CONTROLE DE COMENTÁRIO — a varredura NÃO acusa `lib/leads/etapa-que-afirma-fato.ts`", () => {
    // Ali `stage_id` aparece dentro de COMENTÁRIO explicando o que a regra
    // deve fazer. O AST não enxerga comentário, e é essa a razão de usá-lo.
    expect(ESCRITORES).not.toContain("lib/leads/etapa-que-afirma-fato.ts");
  });

  it("cada justificativa da allowlist tem no mínimo 80 caracteres", () => {
    // "legado" e "ok" não são justificativa. O campo existe para a próxima
    // pessoa entender a exceção sem escavar git blame; uma exceção que ninguém
    // entende é permissão que sobrou.
    for (const [caminho, justificativa] of Object.entries(PODEM_ESCREVER_SEM_A_REGRA)) {
      expect(
        justificativa.length,
        `justificativa da allowlist é curta demais para ${caminho}`,
      ).toBeGreaterThanOrEqual(80);
    }
  });

  it("a allowlist não guarda entrada morta — toda chave ainda escreve `stage_id`", () => {
    // Entrada morta na allowlist é permissão que sobrou, e é assim que a
    // próxima exceção entra de carona. A allowlist SÓ encolhe.
    for (const caminho of Object.keys(PODEM_ESCREVER_SEM_A_REGRA)) {
      expect(
        ESCRITORES.includes(caminho),
        `allowlist contém ${caminho}, que não escreve mais stage_id — remova a exceção`,
      ).toBe(true);
    }
  });
});
