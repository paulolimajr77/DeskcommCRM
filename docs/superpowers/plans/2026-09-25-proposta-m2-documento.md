# Proposta M2 — Documento (renderer) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar a Onda 2 ("documento") da onda de modelos: o motor que pega um modelo (`ModeloBase`, da M0) mais os dados da proposta (`briefing_json` + proposta + cliente) e produz o documento renderizado — texto final de cada seção, com variáveis substituídas, seções condicionais sem dado omitidas em silêncio, e a lista exata do que falta para poder enviar. Inclui o PDF a partir desse documento.

**Architecture:** Três módulos puros/quase-puros em `lib/propostas/documento/`: extração e substituição de variáveis (regex sobre `{{caminho}}`, sem I/O), o renderer de seções (usa o de variáveis, decide o que entra/sai), e um componente `@react-pdf/renderer` que desenha as seções já prontas. Nenhuma rota nova nesta onda — a M2 é só o motor; quem chama (tela de revisão e envio) é a M3/M5, por desenho da própria spec (§11: "Onda 2 — documento" não inclui canvas nem envio).

**Tech Stack:** TypeScript, `@react-pdf/renderer`, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-21-proposta-comercial-templates-design.md` (§7 — regras mecânicas do renderer, §5.4 — conteúdo piloto anexado, §11 — Onda 2). A M0 (fundamento) e a M1 (rascunho confiável) já estão mescladas em `feat/proposta-comercial`.

## Global Constraints

- **Variáveis são DESCOBERTAS, não declaradas — desvio medido da decisão §7.7 da spec.** A spec pede `variables: {caminho: {type, required}}` por modelo. Medido nos 3 anexos reais (`docs/superpowers/specs/2026-09-21-proposta-templates/*.json`): nenhum declara essa lista — `rendering.variables` é só a STRING `"{{variable.path}}"` (uma nota de formato, não um mapa por variável). `ModeloBase`/`SecaoDoModelo` (M0, `lib/propostas/modelos/tipos.ts`) também não têm campo `variables`. **Ruling desta sessão:** o renderer descobre variáveis varrendo `{{caminho}}` no `body`/`bodyEs` com regex, em vez de validar contra uma lista declarada. Custo se errado: perde a trava "variável desconhecida" que a spec queria (ex.: `{{filter}}` vs `{{filters}}` não é pego automaticamente) — mas como toda variável sem dado já vira `[a definir]` e entra na lista de pendências, um nome errado tem o MESMO efeito visível (aparece como pendência) que um nome inexistente seria se validado; não é um buraco silencioso.
- **"número/numero sempre vazio em rascunho" (spec §7 item 5) é responsabilidade de quem CHAMA o renderer, não do renderer.** O renderer só substitui o que está em `dados` — se `dados.numero` estiver presente, ele substitui. Quem monta `dados` (a M5, na rota de envio) decide se passa o número real ou `null`, do mesmo jeito que `lib/propostas/pdf.tsx` já faz hoje (`numero` só existe depois do envio). Nenhuma task deste plano inventa um flag "está em rascunho" que ninguém usa ainda.
- **Seção condicional sem NENHUM dado é omitida por inteiro (spec §7 item 3), seção com PELO MENOS UM dado aparece normal (com `[a definir]` nas variáveis que faltarem, como qualquer outra seção).** É a heurística possível sem a lista declarada de variáveis por seção — a tela de revisão (M3) dá o ajuste manual (toggle) se a heurística errar; não é destrutivo.
- **Lista vazia (spec §7 item 4) se resolve pela MESMA regra de "valor ausente"** — um array vazio em `dados` conta como ausente, sem mecanismo especial. DIRC: não duplicar lógica que "valor ausente" já cobre.
- Nenhuma task depende do zip dos 8 modelos-piloto — os testes usam um `ModeloBase` de mentira.
- Sem migration nesta onda — nenhuma coluna nova, nenhuma tabela. `rendered_snapshot`/`template_snapshot` (colunas já existentes desde a M0) só recebem o resultado deste renderer na M5 (envio), fora deste plano.

## Review Focus

- **Variável com valor `0` (número) não pode virar "[a definir]".** `0` é um valor válido (ex.: desconto zero), só `undefined`/`null`/`""`/`[]` são "ausente". Task 1 testa isso.
- **`{{caminho}}` repetido duas vezes no mesmo body precisa substituir as DUAS ocorrências**, não só a primeira. Task 1 testa.
- **Seção `required: true` E `conditional: true` ao mesmo tempo (o tipo permite as duas juntas)** — `required` vence: a seção aparece sempre, mesmo sem nenhum dado, com `[a definir]` nas variáveis. Task 2 testa esse caso combinado.
- **`section_order` citando um id que não existe em `sections`** (modelo mal formado) não pode lançar — o renderer pula o id fantasma. Task 2 testa.
- **PDF com ZERO seções renderizadas** (todas condicionais sem dado) não pode quebrar — gera um PDF só com o que existir (título/marca), sem seção nenhuma, sem lançar. Task 3 testa.

---

### Task 1: `lib/propostas/documento/variaveis.ts`

**Files:**
- Create: `lib/propostas/documento/variaveis.ts`
- Create: `lib/propostas/documento/variaveis.test.ts`

**Interfaces:**
- Produces: `extrairVariaveis(texto: string): string[]`; `substituirVariaveis(texto: string, dados: Record<string, unknown>): { textoRenderizado: string; faltantes: string[] }` — Task 2 (`renderer.ts`) consome `substituirVariaveis`.

- [ ] **Step 1: Escrever o teste**

```typescript
// lib/propostas/documento/variaveis.test.ts
import { describe, expect, it } from "vitest";

import { extrairVariaveis, substituirVariaveis } from "./variaveis";

describe("extrairVariaveis", () => {
  it("acha um caminho simples", () => {
    expect(extrairVariaveis("Olá {{client.name}}, tudo bem?")).toEqual(["client.name"]);
  });

  it("acha vários caminhos, sem duplicar", () => {
    expect(extrairVariaveis("{{a.b}} e {{a.b}} e {{c.d}}")).toEqual(["a.b", "c.d"]);
  });

  it("texto sem variável devolve lista vazia", () => {
    expect(extrairVariaveis("texto fixo, sem chave")).toEqual([]);
  });
});

describe("substituirVariaveis", () => {
  it("substitui um caminho simples por um valor de nível 1", () => {
    const r = substituirVariaveis("Olá {{name}}", { name: "Paulo" });
    expect(r.textoRenderizado).toBe("Olá Paulo");
    expect(r.faltantes).toEqual([]);
  });

  it("substitui um caminho aninhado (dot path)", () => {
    const r = substituirVariaveis("Cliente: {{client.name}}", { client: { name: "Acme" } });
    expect(r.textoRenderizado).toBe("Cliente: Acme");
    expect(r.faltantes).toEqual([]);
  });

  it("valor ausente vira [a definir] e entra em faltantes", () => {
    const r = substituirVariaveis("Prazo: {{project.deadline}}", {});
    expect(r.textoRenderizado).toBe("Prazo: [a definir]");
    expect(r.faltantes).toEqual(["project.deadline"]);
  });

  it("valor 0 (número) NÃO é ausente (Review Focus)", () => {
    const r = substituirVariaveis("Desconto: {{discount}}", { discount: 0 });
    expect(r.textoRenderizado).toBe("Desconto: 0");
    expect(r.faltantes).toEqual([]);
  });

  it("string vazia É ausente", () => {
    const r = substituirVariaveis("Nome: {{name}}", { name: "" });
    expect(r.textoRenderizado).toBe("Nome: [a definir]");
    expect(r.faltantes).toEqual(["name"]);
  });

  it("array vazio É ausente (regra de 'lista vazia', §7 item 4)", () => {
    const r = substituirVariaveis("Itens: {{scope.items}}", { scope: { items: [] } });
    expect(r.textoRenderizado).toBe("Itens: [a definir]");
    expect(r.faltantes).toEqual(["scope.items"]);
  });

  it("array não vazio vira string separada por vírgula", () => {
    const r = substituirVariaveis("Itens: {{scope.items}}", { scope: { items: ["a", "b"] } });
    expect(r.textoRenderizado).toBe("Itens: a, b");
    expect(r.faltantes).toEqual([]);
  });

  it("a mesma variável repetida duas vezes substitui as DUAS ocorrências (Review Focus)", () => {
    const r = substituirVariaveis("{{name}} disse oi, {{name}}!", { name: "Ana" });
    expect(r.textoRenderizado).toBe("Ana disse oi, Ana!");
  });

  it("caminho que não existe no objeto (nível intermediário ausente) não lança", () => {
    expect(() => substituirVariaveis("{{a.b.c}}", {})).not.toThrow();
    const r = substituirVariaveis("{{a.b.c}}", {});
    expect(r.faltantes).toEqual(["a.b.c"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/documento/variaveis.test.ts`
Expected: FAIL — `Cannot find module './variaveis'`

- [ ] **Step 3: Implementar**

```typescript
// lib/propostas/documento/variaveis.ts
const PADRAO_VARIAVEL = /\{\{([a-zA-Z0-9_.]+)\}\}/g;

export function extrairVariaveis(texto: string): string[] {
  const encontradas = new Set<string>();
  for (const m of texto.matchAll(PADRAO_VARIAVEL)) {
    encontradas.add(m[1]);
  }
  return [...encontradas];
}

function resolverCaminho(dados: Record<string, unknown>, caminho: string): unknown {
  return caminho.split(".").reduce<unknown>((atual, chave) => {
    if (atual === null || typeof atual !== "object") return undefined;
    return (atual as Record<string, unknown>)[chave];
  }, dados);
}

function ehValorAusente(valor: unknown): boolean {
  if (valor === undefined || valor === null) return true;
  if (typeof valor === "string") return valor.trim().length === 0;
  if (Array.isArray(valor)) return valor.length === 0;
  return false;
}

function formatarValor(valor: unknown): string {
  if (Array.isArray(valor)) return valor.join(", ");
  return String(valor);
}

/**
 * Substitui `{{caminho}}` pelo valor resolvido em `dados` (spec §7 item 1).
 * Valor ausente vira "[a definir]" e entra em `faltantes` (item 2); `0` e
 * outros valores falsy que não são "vazios" (string vazia/array vazio/
 * null/undefined) NÃO contam como ausentes.
 */
export function substituirVariaveis(
  texto: string,
  dados: Record<string, unknown>,
): { textoRenderizado: string; faltantes: string[] } {
  const faltantes: string[] = [];
  const textoRenderizado = texto.replace(PADRAO_VARIAVEL, (_match, caminho: string) => {
    const valor = resolverCaminho(dados, caminho);
    if (ehValorAusente(valor)) {
      faltantes.push(caminho);
      return "[a definir]";
    }
    return formatarValor(valor);
  });
  return { textoRenderizado, faltantes };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/propostas/documento/variaveis.test.ts`
Expected: PASS (10/10)

- [ ] **Step 5: Commit**

```bash
git add lib/propostas/documento/variaveis.ts lib/propostas/documento/variaveis.test.ts
git commit -m "feat(propostas): extrai e substitui variáveis {{caminho}} do documento (M2)"
```

---

### Task 2: `lib/propostas/documento/renderer.ts`

**Files:**
- Create: `lib/propostas/documento/renderer.ts`
- Create: `lib/propostas/documento/renderer.test.ts`

**Interfaces:**
- Consumes: `substituirVariaveis` de `lib/propostas/documento/variaveis.ts` (Task 1); `ModeloBase`, `SecaoDoModelo` de `lib/propostas/modelos/tipos.ts` (já existem, M0).
- Produces: `renderizarDocumento(modelo: ModeloBase, dados: Record<string, unknown>): DocumentoRenderizado` — Task 3 (`pdf-do-documento.tsx`) consome o retorno.

- [ ] **Step 1: Escrever o teste**

```typescript
// lib/propostas/documento/renderer.test.ts
import { describe, expect, it } from "vitest";

import { renderizarDocumento } from "./renderer";
import type { ModeloBase } from "../modelos/tipos";

const MODELO: ModeloBase = {
  slug: "teste",
  version: 1,
  sectionOrder: ["resumo", "diagnostico", "obrigatoria_e_condicional", "fantasma"],
  sections: [
    { id: "resumo", title: "Resumo", titleEs: null, body: "Projeto: {{project.name}}", bodyEs: null, required: true, conditional: false },
    { id: "diagnostico", title: "Diagnóstico", titleEs: null, body: "Achado: {{survey.findings}}", bodyEs: null, required: false, conditional: true },
    { id: "obrigatoria_e_condicional", title: "Garantia", titleEs: null, body: "Prazo de garantia: {{warranty.days}}", bodyEs: null, required: true, conditional: true },
    { id: "sem_id_correspondente", title: "Nunca aparece", titleEs: null, body: "x", bodyEs: null, required: false, conditional: false },
  ],
};

describe("renderizarDocumento", () => {
  it("renderiza na ordem de sectionOrder, com as variáveis substituídas", () => {
    const doc = renderizarDocumento(MODELO, { project: { name: "Site Catálogo" } });
    expect(doc.secoes[0]).toMatchObject({ id: "resumo", title: "Resumo", body: "Projeto: Site Catálogo" });
  });

  it("seção condicional SEM nenhum dado é omitida por inteiro (§7 item 3)", () => {
    const doc = renderizarDocumento(MODELO, { project: { name: "X" } });
    expect(doc.secoes.find((s) => s.id === "diagnostico")).toBeUndefined();
  });

  it("seção condicional COM dado aparece normal, com [a definir] só onde faltar", () => {
    const doc = renderizarDocumento(MODELO, {
      project: { name: "X" },
      survey: { findings: "telhado com infiltração" },
    });
    expect(doc.secoes.find((s) => s.id === "diagnostico")).toMatchObject({
      body: "Achado: telhado com infiltração",
    });
  });

  it("required + conditional juntos: required vence, aparece sempre (Review Focus)", () => {
    const doc = renderizarDocumento(MODELO, { project: { name: "X" } });
    const garantia = doc.secoes.find((s) => s.id === "obrigatoria_e_condicional");
    expect(garantia).toBeDefined();
    expect(garantia?.body).toBe("Prazo de garantia: [a definir]");
  });

  it("id em sectionOrder sem seção correspondente não lança (Review Focus)", () => {
    expect(() => renderizarDocumento(MODELO, {})).not.toThrow();
  });

  it("acumula variaveisFaltando só das seções que APARECEM no documento", () => {
    const doc = renderizarDocumento(MODELO, { project: { name: "X" } });
    // "diagnostico" foi omitida (condicional sem dado) — sua variável NÃO entra.
    expect(doc.variaveisFaltando).not.toContain("survey.findings");
    // "obrigatoria_e_condicional" apareceu (required) — sua variável entra.
    expect(doc.variaveisFaltando).toContain("warranty.days");
  });

  it("modelo com sections vazio devolve documento vazio, sem lançar", () => {
    const vazio: ModeloBase = { slug: "vazio", version: 1, sections: [], sectionOrder: [] };
    const doc = renderizarDocumento(vazio, {});
    expect(doc.secoes).toEqual([]);
    expect(doc.variaveisFaltando).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/documento/renderer.test.ts`
Expected: FAIL — `Cannot find module './renderer'`

- [ ] **Step 3: Implementar**

```typescript
// lib/propostas/documento/renderer.ts
import { extrairVariaveis, substituirVariaveis } from "./variaveis";
import type { ModeloBase, SecaoDoModelo } from "../modelos/tipos";

export interface SecaoRenderizada {
  id: string;
  title: string;
  body: string;
}

export interface DocumentoRenderizado {
  secoes: SecaoRenderizada[];
  variaveisFaltando: string[];
}

/** Uma condicional só aparece sozinha (sem `required`) quando tem PELO MENOS
 * UM dado — spec §7 item 3. Descoberto varrendo o próprio `body`, já que o
 * modelo não declara variáveis por seção (ver Global Constraints do plano). */
function condicionalTemAlgumDado(secao: SecaoDoModelo, dados: Record<string, unknown>): boolean {
  const caminhos = extrairVariaveis(secao.body);
  if (caminhos.length === 0) return true; // seção condicional sem variável nenhuma: sempre aparece.
  return substituirVariaveis(secao.body, dados).faltantes.length < caminhos.length;
}

export function renderizarDocumento(modelo: ModeloBase, dados: Record<string, unknown>): DocumentoRenderizado {
  const porId = new Map(modelo.sections.map((s) => [s.id, s]));
  const secoes: SecaoRenderizada[] = [];
  const variaveisFaltando: string[] = [];

  for (const id of modelo.sectionOrder) {
    const secao = porId.get(id);
    if (!secao) continue; // sectionOrder citando id fantasma: pula, não lança.

    if (secao.conditional && !secao.required && !condicionalTemAlgumDado(secao, dados)) {
      continue; // omitida por inteiro, sem rastro.
    }

    const { textoRenderizado, faltantes } = substituirVariaveis(secao.body, dados);
    secoes.push({ id: secao.id, title: secao.title, body: textoRenderizado });
    variaveisFaltando.push(...faltantes);
  }

  return { secoes, variaveisFaltando };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/propostas/documento/renderer.test.ts`
Expected: PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add lib/propostas/documento/renderer.ts lib/propostas/documento/renderer.test.ts
git commit -m "feat(propostas): renderer de documento — seções, condicionais, pendências (M2)"
```

---

### Task 3: `lib/propostas/documento/pdf-do-documento.tsx`

**Files:**
- Create: `lib/propostas/documento/pdf-do-documento.tsx`
- Create: `lib/propostas/documento/pdf-do-documento.test.ts`

**Interfaces:**
- Consumes: `DocumentoRenderizado` de `lib/propostas/documento/renderer.ts` (Task 2).
- Produces: `renderDocumentoPdf(input: DocumentoPdfInput): Promise<Buffer>` — para a M5 (envio) chamar, fora deste plano.

- [ ] **Step 1: Escrever o teste**

```typescript
// lib/propostas/documento/pdf-do-documento.test.ts
import { describe, expect, it } from "vitest";

import { renderDocumentoPdf } from "./pdf-do-documento";

describe("renderDocumentoPdf", () => {
  it("gera um PDF (buffer não vazio) com seções", async () => {
    const buf = await renderDocumentoPdf({
      titulo: "Proposta de Teste",
      secoes: [
        { id: "resumo", title: "Resumo", body: "Projeto: Site Catálogo" },
        { id: "escopo", title: "Escopo", body: "Serão executados: item A, item B" },
      ],
      marca: { app_name: "DeskcommCRM", accent_hex: null, logoUrl: null },
    });
    expect(buf.byteLength).toBeGreaterThan(0);
  });

  it("gera um PDF mesmo com ZERO seções, sem lançar (Review Focus)", async () => {
    const buf = await renderDocumentoPdf({
      titulo: "Proposta Vazia",
      secoes: [],
      marca: { app_name: "DeskcommCRM", accent_hex: null, logoUrl: null },
    });
    expect(buf.byteLength).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/documento/pdf-do-documento.test.ts`
Expected: FAIL — `Cannot find module './pdf-do-documento'`

- [ ] **Step 3: Implementar**

```typescript
// lib/propostas/documento/pdf-do-documento.tsx
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import React from "react";

import type { SecaoRenderizada } from "./renderer";

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 10 },
  titulo: { fontSize: 16, fontWeight: 700, marginBottom: 16 },
  secaoTitulo: { fontSize: 12, fontWeight: 700, marginTop: 12, marginBottom: 4 },
  secaoBody: { fontSize: 10, lineHeight: 1.4 },
});

export interface DocumentoPdfInput {
  titulo: string;
  secoes: SecaoRenderizada[];
  marca: { app_name: string | null; accent_hex: string | null; logoUrl: string | null };
}

function DocumentoPdfDoc({ d }: { d: DocumentoPdfInput }): React.ReactElement {
  const accent = d.marca.accent_hex ?? undefined;
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={[styles.titulo, accent ? { color: accent } : undefined]}>{d.titulo}</Text>
        {d.secoes.map((s) => (
          <View key={s.id}>
            <Text style={styles.secaoTitulo}>{s.title}</Text>
            <Text style={styles.secaoBody}>{s.body}</Text>
          </View>
        ))}
      </Page>
    </Document>
  );
}

export async function renderDocumentoPdf(input: DocumentoPdfInput): Promise<Buffer> {
  const buf = await renderToBuffer(<DocumentoPdfDoc d={input} />);
  return buf as Buffer;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/propostas/documento/pdf-do-documento.test.ts`
Expected: PASS (2/2)

- [ ] **Step 5: Commit**

```bash
git add lib/propostas/documento/pdf-do-documento.tsx lib/propostas/documento/pdf-do-documento.test.ts
git commit -m "feat(propostas): PDF do documento a partir das seções renderizadas (M2)"
```

---

## Verificação final

- [ ] `npx vitest run lib/propostas/` — tudo verde (inclui os arquivos das 3 tasks acima e tudo que já existia da M0/M1).
- [ ] Push para `fork` e conferir os 4 checks (`ci`, `e2e`, `perf`, `Publicar imagem Docker`).
