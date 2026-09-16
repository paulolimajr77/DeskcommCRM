import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * TODA CHAVE DA VERSÃO DO AGENTE TEM DE TER PORTA — alguém precisa conseguir ligá-la.
 *
 * ─── O defeito que este arquivo existe para impedir ─────────────────────────
 *
 * `lead_fields_propose_new` (migration 0271) nasceu completa por dentro: coluna
 * no banco, carregada na config, e o motor decidindo por ela em
 * `inbound-turn.ts`. Faltava a única coisa que a tornava útil — **um jeito de
 * ligar**. Não havia interruptor na tela, ela não entrava no schema que valida
 * a versão, não chegava ao PATCH e não era copiada ao duplicar. A coluna nasce
 * `not null default false`, então ela era `false` para sempre, em toda
 * instalação, e a capacidade inteira era inalcançável.
 *
 * ⚠️ **ESTA É A IMAGEM NO ESPELHO de `knobs-da-versao-publicada-sao-aplicados`,
 * e é por isso que aquela cerca não pegou.** Aquela mede "tudo que a TELA grava,
 * o MOTOR aplica" — e aqui o motor aplicava direitinho. Esta mede o sentido
 * contrário: "tudo que o MOTOR lê, alguém consegue GRAVAR". As duas juntas
 * fecham o círculo; cada uma sozinha deixa metade aberta.
 *
 * ─── Por que a régua começa no BANCO, e não no que o código lê ──────────────
 *
 * Começar pela lista de colunas que a config carrega seria medir o universo
 * errado: a coluna que ninguém lê também não seria vista. O DDL é o único lugar
 * onde a coluna existe no dia em que nasce — antes de qualquer SELECT. E o
 * baseline é o que o self-hoster realmente aplica.
 *
 * Prova de que a régua importa: `lib/database.types.ts` (gerado) **não tinha**
 * `lead_fields_propose_new` quando esta cerca foi escrita. Uma cerca apoiada
 * nele teria ficado verde com o defeito na frente.
 *
 * ─── A fraqueza, declarada ──────────────────────────────────────────────────
 *
 * Isto mede TEXTO: procura o nome da coluna dentro de cada arquivo. Uma porta
 * construída por caminho que a busca não conhece (`{ ...src }` no duplicar, uma
 * chave montada por concatenação) passaria batido. Por isso existe o controle
 * positivo abaixo — instrumento que não acha nada devolve verde igual a
 * instrumento que não achou problema.
 *
 * E ela NÃO mede semântica: acha as quatro portas e não percebe se a regra de
 * dependência entre duas chaves sumiu. Isso é de outra cerca.
 */

const RAIZ = process.cwd();
const BASELINE = path.join("supabase", "baseline.sql");

/** As quatro portas. Faltando qualquer uma, a chave não é alcançável de verdade. */
const PORTAS: Readonly<Record<string, string>> = {
  "schema que valida a versão": path.join("lib", "ai", "agents", "validation.ts"),
  "duplicar/reverter versão": path.join("lib", "ai", "agents", "duplicate.ts"),
  "PATCH da versão": path.join(
    "app", "api", "v1", "ai", "agents", "[id]", "versions", "[vid]", "route.ts",
  ),
  "tela do agente": path.join(
    "app", "app", "ai", "agents", "[id]", "_components", "AgentForm.tsx",
  ),
};

/**
 * Colunas que NÃO são chave de configuração — e a razão de cada uma.
 *
 * ⛔ **Esta lista só encolhe.** Entrada nova aqui é dívida declarada, e declarar
 * é melhor que esconder: a próxima pessoa lê o motivo em vez de descobrir na
 * produção. Mas declarar não é resolver.
 */
const SEM_PORTA_ACEITO: Readonly<Record<string, string>> = {
  // ── Identidade e ciclo de vida: o sistema escreve, ninguém configura ──
  id: "chave primária",
  organization_id: "dono da linha, resolvido da sessão",
  agent_id: "a qual agente esta versão pertence",
  version_number: "contador, atribuído ao criar",
  status: "draft/published/superseded — muda por publicar, não por formulário",
  published_at: "carimbo de quando publicou",
  superseded_at: "carimbo de quando outra versão tomou o lugar",
  created_at: "carimbo",
  created_by: "quem criou",
  provisioning_origin: "de onde a versão veio (assistente, cópia, API)",

  // ── ⛔ DÍVIDA REAL, não coluna de sistema ──
  multimodal_input:
    "DÍVIDA: o motor LÊ (agent-config.ts, `multimodalInput`) e não há porta nenhuma — " +
    "mesmo defeito que criou este arquivo, achado por ele. Registrado na fila.",
  video_frames_enabled:
    "DÍVIDA: sem porta e sem consumidor encontrado na versão do agente — decidir se " +
    "vira chave de verdade ou se sai do schema. Registrado na fila.",
};

/**
 * A busca é por PALAVRA INTEIRA, e não por pedaço.
 *
 * ⛔ `includes` cru daria verde de graça para uma coluna cujo nome fosse pedaço
 * de outra coisa já escrita no arquivo: `fields` casa dentro de
 * `lead_fields_enabled` e de `custom_fields`; `model` casa em `operator_model`;
 * `input` casa em `inputSchema`. Uma coluna assim passaria nas quatro portas sem
 * ter nenhuma — a cerca ficaria verde exatamente no caso que ela existe para
 * pegar. Achado revisando o diff, antes de empurrar.
 */
function temPorta(fonte: string, coluna: string): boolean {
  // ⚠️ A BARRA É DOBRADA de propósito. Num template literal, `\w` vira só `w`
  // (JavaScript trata escape desconhecido como o próprio caractere), e a expressão
  // viraria "não precedido da LETRA w" — que é quase sempre verdade. O caso de
  // teste abaixo acusou isto na primeira rodada.
  return new RegExp(`(?<![\\w$])${coluna}(?![\\w$])`).test(fonte);
}

function colunasDaVersao(): string[] {
  const sql = readFileSync(path.join(RAIZ, BASELINE), "utf8");
  const cols = new Set<string>();

  const criacao = /CREATE TABLE (?:IF NOT EXISTS )?"public"\."ai_agent_versions" \(([\s\S]*?)\n\);/.exec(sql);
  if (criacao) {
    for (const m of (criacao[1] ?? "").matchAll(/^\s+"(\w+)"\s/gm)) if (m[1]) cols.add(m[1]);
  }
  // As colunas que entraram DEPOIS do dump vivem no apêndice, e a grafia varia
  // (`public.` opcional, aspas opcionais, várias por instrução).
  for (const st of sql.matchAll(
    /alter\s+table\s+(?:only\s+)?(?:public\.)?"?ai_agent_versions"?\b([\s\S]*?);/gi,
  )) {
    for (const m of (st[1] ?? "").matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?"?(\w+)"?/gi)) {
      if (m[1]) cols.add(m[1]);
    }
  }
  return [...cols].sort();
}

describe("toda chave da versão do agente tem porta", () => {
  const colunas = colunasDaVersao();
  const fontes = Object.fromEntries(
    Object.entries(PORTAS).map(([nome, p]) => [nome, readFileSync(path.join(RAIZ, p), "utf8")]),
  );

  it("controle positivo: o instrumento realmente lê o banco e os quatro arquivos", () => {
    // Sem isto, um regex quebrado devolveria zero coluna e a cerca inteira
    // ficaria verde sem medir nada — que é como uma cerca morre em silêncio.
    expect(colunas.length, "nenhuma coluna lida do baseline — o regex quebrou?").toBeGreaterThan(25);
    expect(colunas, "coluna conhecida ausente: a leitura do DDL está incompleta").toContain(
      "lead_fields_enabled",
    );
    for (const [nome, src] of Object.entries(fontes)) {
      expect(src.length, `${nome}: arquivo vazio ou caminho errado`).toBeGreaterThan(500);
    }
  });

  it("⛔ nenhuma chave nova nasce sem um jeito de ligá-la", () => {
    const semPorta: string[] = [];
    for (const c of colunas) {
      if (c in SEM_PORTA_ACEITO) continue;
      const faltam = Object.keys(PORTAS).filter((nome) => !temPorta(fontes[nome] ?? "", c));
      if (faltam.length > 0) semPorta.push(`${c} — falta em: ${faltam.join(", ")}`);
    }
    expect(
      semPorta,
      "\nEstas chaves da versão o motor pode ler e NINGUÉM consegue ligar.\n" +
        "Dê porta às quatro, ou declare em SEM_PORTA_ACEITO com o motivo:\n" +
        `${semPorta.join("\n")}\n`,
    ).toEqual([]);
  });

  it("a busca é por palavra inteira — nome que é PEDAÇO de outro não conta como porta", () => {
    // Este caso guarda a correção acima. Sem ele, alguém troca `temPorta` por
    // `includes` num refactor e a cerca volta a dar verde de graça.
    const trecho = "lead_fields_enabled: v.lead_fields_enabled, custom_fields, operator_model";
    expect(temPorta(trecho, "fields"), "`fields` casou dentro de outra palavra").toBe(false);
    expect(temPorta(trecho, "model"), "`model` casou dentro de `operator_model`").toBe(false);
    // Controle: a palavra inteira continua sendo achada.
    expect(temPorta(trecho, "lead_fields_enabled")).toBe(true);
    expect(temPorta(trecho, "operator_model")).toBe(true);
  });

  it("a lista de exceções não guarda coluna que não existe mais", () => {
    // Exceção órfã é pior que exceção: ela some do banco e a justificativa
    // fica, dando a impressão de que alguém decidiu algo sobre o que existe.
    const orfas = Object.keys(SEM_PORTA_ACEITO).filter((c) => !colunas.includes(c));
    expect(orfas, `exceções sem coluna correspondente: ${orfas.join(", ")}`).toEqual([]);
  });
});
