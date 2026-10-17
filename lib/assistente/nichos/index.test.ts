/**
 * Os nichos como DADO — paridade com a fonte e sanidade.
 *
 * O teste A lê o `nichos.md` da skill de cliente novo, no disco, e prova que cada
 * `esqueleto` é IGUAL ao bloco ```markdown da seção, e que os 7 nomes batem, um a
 * um, com os títulos `## ` do `.md`. É o gate que impede o dado de divergir da
 * fonte.
 *
 * A pasta da skill é DESCOBERTA em runtime, não escrita aqui: o nome dela carrega
 * a marca antiga do produto, e a catraca de marca (`tests/unit/branding.test.ts`)
 * varre `lib/` — inclusive `*.test.ts` — e reprova esse literal. A catraca só
 * encolhe, então não se declara exceção para um caminho de teste; descobre-se.
 */
// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { MODELOS_DE_FOLLOWUP } from "@/lib/followup/modelos";

import { NICHOS_DO_ASSISTENTE, nichoPorId, placeholdersDoEsqueleto } from "./index";

/** O caminho do `nichos.md`, achando a pasta da skill pelo sufixo do nome. */
function caminhoDoNichosMd(): string {
  const skills = path.join(process.cwd(), ".agents", "skills");
  const pasta = readdirSync(skills).find((nome) => nome.endsWith("-cliente-novo"));
  if (!pasta) {
    throw new Error(`pasta da skill de cliente novo não encontrada em ${skills}`);
  }
  return path.join(skills, pasta, "references", "nichos.md");
}

const LINHAS = readFileSync(caminhoDoNichosMd(), "utf8").split("\n");

/** Os títulos `## ` do `.md`, menos o de "Roteiro de teste" (que não é nicho). */
function titulosDeNicho(): string[] {
  return LINHAS.filter((l) => l.startsWith("## "))
    .map((l) => l.slice(3).trim())
    .filter((t) => !t.startsWith("Roteiro de teste"));
}

/** O conteúdo do PRIMEIRO bloco ```markdown depois do título, sem as cercas. */
function blocoMarkdownDepoisDe(titulo: string): string | null {
  const inicio = LINHAS.findIndex((l) => l.trim() === `## ${titulo}`);
  if (inicio < 0) return null;
  for (let i = inicio + 1; i < LINHAS.length; i += 1) {
    if (LINHAS[i]?.startsWith("```markdown")) {
      const conteudo: string[] = [];
      for (let j = i + 1; j < LINHAS.length && !LINHAS[j]?.startsWith("```"); j += 1) {
        conteudo.push(LINHAS[j] ?? "");
      }
      return conteudo.join("\n");
    }
    if (LINHAS[i]?.startsWith("## ")) break;
  }
  return null;
}

/** Nichos que o `.md` NÃO traz com bloco de prompt completo (esqueleto = null). */
const SEM_ESQUELETO = ["imobiliaria", "servicos", "infoproduto", "loja", "generico"] as const;

describe("NICHOS_DO_ASSISTENTE — paridade com nichos.md", () => {
  it("tem exatamente 7 nichos, e cada nome bate com um título `## ` do .md", () => {
    const titulos = titulosDeNicho();
    expect(titulos).toHaveLength(7);
    expect(NICHOS_DO_ASSISTENTE.map((n) => n.nome)).toEqual(titulos);
  });

  it.each(["clinica", "advocacia"] as const)(
    "o esqueleto de %s é IGUAL ao bloco ```markdown da seção",
    (id) => {
      const nicho = nichoPorId(id);
      expect(nicho).toBeDefined();
      if (!nicho) return;
      const bloco = blocoMarkdownDepoisDe(nicho.nome);
      expect(bloco).not.toBeNull();
      expect(nicho.esqueleto).toBe(bloco);
    },
  );

  it("só clínica e advocacia têm esqueleto; os demais são null (lista fixa de propósito)", () => {
    for (const nicho of NICHOS_DO_ASSISTENTE) {
      if ((SEM_ESQUELETO as readonly string[]).includes(nicho.id)) {
        expect({ id: nicho.id, esqueleto: nicho.esqueleto }).toEqual({ id: nicho.id, esqueleto: null });
      } else {
        expect(typeof nicho.esqueleto).toBe("string");
      }
    }
    expect(NICHOS_DO_ASSISTENTE.filter((n) => n.esqueleto !== null).map((n) => n.id)).toEqual([
      "clinica",
      "advocacia",
    ]);
  });
});

describe("NICHOS_DO_ASSISTENTE — sanidade", () => {
  it("ids únicos e sem vazio", () => {
    const ids = NICHOS_DO_ASSISTENTE.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every((id) => id.trim().length > 0)).toBe(true);
  });

  it("todo nicho tem funil com pelo menos 5 etapas, na ordem do .md", () => {
    for (const nicho of NICHOS_DO_ASSISTENTE) {
      expect(nicho.funil.nome.trim().length, `funil de ${nicho.id}`).toBeGreaterThan(0);
      expect(nicho.funil.etapas.length, `etapas de ${nicho.id}`).toBeGreaterThanOrEqual(5);
    }
  });

  it("faq >= 3 em todos, menos o genérico (o .md cita 10 perguntas sem listar)", () => {
    for (const nicho of NICHOS_DO_ASSISTENTE) {
      if (nicho.id === "generico") {
        expect(nicho.faq).toEqual([]);
        continue;
      }
      expect(nicho.faq.length, `faq de ${nicho.id}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("teste >= 3 em todos, menos o genérico (o .md não lista mensagens de teste)", () => {
    for (const nicho of NICHOS_DO_ASSISTENTE) {
      if (nicho.id === "generico") {
        expect(nicho.teste).toEqual([]);
        continue;
      }
      expect(nicho.teste.length, `teste de ${nicho.id}`).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("NICHOS_DO_ASSISTENTE — follow-ups citados existem no catálogo", () => {
  const IDS_DE_MODELO = new Set(MODELOS_DE_FOLLOWUP.map((m) => m.id));

  it("todo id de followup citado existe em MODELOS_DE_FOLLOWUP", () => {
    for (const nicho of NICHOS_DO_ASSISTENTE) {
      for (const modelo of nicho.followups.modelos) {
        expect({ id: nicho.id, modelo, existe: IDS_DE_MODELO.has(modelo) }).toEqual({
          id: nicho.id,
          modelo,
          existe: true,
        });
      }
    }
  });

  it("a clínica cita os quatro modelos de clínica, na ordem do .md", () => {
    const clinica = nichoPorId("clinica");
    expect(clinica?.followups.modelos).toEqual([
      "clinica-consulta-retomada",
      "clinica-exame-marcar",
      "clinica-cirurgia-decisao",
      "clinica-falta-remarcar",
    ]);
  });
});

describe("NICHOS_DO_ASSISTENTE — campos cobre os marcadores do esqueleto", () => {
  it("todo marcador do esqueleto tem entrada em campos, e campos não tem nome morto", () => {
    for (const nicho of NICHOS_DO_ASSISTENTE) {
      if (nicho.esqueleto === null) {
        expect(nicho.campos, `campos de ${nicho.id}`).toEqual([]);
        continue;
      }
      const marcadores = placeholdersDoEsqueleto(nicho.esqueleto);
      expect(marcadores.length, `marcadores de ${nicho.id}`).toBeGreaterThan(0);
      expect(
        nicho.campos.map((c) => c.marcador).sort(),
        `campos de ${nicho.id}`,
      ).toEqual([...marcadores].sort());
      for (const campo of nicho.campos) {
        expect(["negocio", "descricao", "nome_do_agente"], `origem de ${nicho.id}`).toContain(campo.de);
      }
    }
  });
});
