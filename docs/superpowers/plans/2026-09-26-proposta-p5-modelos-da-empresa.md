# Proposta P5 — a empresa cadastra os próprios modelos (inclusive a partir de um arquivo)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para implementar este plano tarefa por tarefa. Passos usam checkbox (`- [ ]`) para acompanhamento.

**Goal:** Fechar o item 5 da spec: em Configurações › Propostas › Modelos a empresa personaliza um modelo da plataforma, cria o seu, ou envia a proposta que já usa e a IA a converte em modelo para revisão; a IA do atendimento e o editor da proposta passam a enxergar esses modelos.

**Architecture:** A tabela `proposal_templates` já existe e o `resolverModelo` já faz a cópia da empresa vencer (M0). Este plano acrescenta: nome e descrição na tabela e a escrita restrita a `manager` (única migration da série); uma régua pura de validação de modelo; a lista "modelos desta organização" num lugar só; rotas de listar, personalizar, criar, editar, desativar e importar; a IA de importação (um ponto de IA novo, no mesmo molde do assistente da proposta); e as telas. Nenhuma ferramenta de IA nova (D11): a recusa de `crm_draft_proposal` passa a listar os modelos válidos.

**Tech Stack:** Postgres (migration + apêndice do baseline), Next.js Route Handlers, Zod, `runModelCall`, `pdfjs-dist` (extrator existente), React 19, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-26-proposta-documento-que-chega-ia-que-espera-e-aviso-design.md`](../specs/2026-09-26-proposta-documento-que-chega-ia-que-espera-e-aviso-design.md) — §1.8, §2 Item 5; decisões D8, D9, D10, D11.

**Depende de:** só P1 (vocabulário de variáveis, canvas). **Revisado em 26/09/2026:** os planos
antigos "P2" e "P3" (que fariam `crm_draft_proposal` resolver o modelo por `resolverModelo`
antes deste plano chegar) saíram e viraram um único P2 novo ("preencher com a conversa") que
não toca essa ferramenta. A troca de `Object.hasOwn(MODELOS_BASE, ...)` para `resolverModelo`
é feita **aqui mesmo**, na Task 7 — não existe mais um plano anterior que a prepare.

## Como este plano é executado (opencode)

As mesmas regras do P1 (seção "Como este plano é executado"), mais duas:

- **Número da migration:** medido em 26/09 o próximo livre na `vps/pljr-combinada` era `0424`, e o plano P0 (sai o preenchimento de campos do funil pela IA) o consome — este plano usa **`0425`** se P0 já tiver sido aplicado antes deste, ou o próximo livre, o que vier primeiro. **Meça de novo antes de criar**, porque outro trabalho pode ter tomado o número: `ls supabase/migrations/ | grep -oE '_[0-9]{4}_' | tr -d _ | sort -n | tail -1` e `pnpm checar:colisao-de-migration`. Use o maior + 1. O plano escreve `NNNN` onde entra esse número.
- **`pnpm test:db` não roda nesta máquina** (sem Docker). Quem prova a migration e o invariante é o job `invariants` do CI do fork, depois que a sessão Claude empurrar.

## Global Constraints

- **Tripla da casa** (CLAUDE.md, Doutrina de Migrations): arquivo em `supabase/migrations/` + bloco idempotente no FIM de `supabase/baseline.sql` + linha no `supabase/migrations/MANIFEST.md`. Tudo `if not exists` / `drop policy if exists` — o `update.sh` reaplica o baseline sem `ON_ERROR_STOP`.
- Escrita em `proposal_templates` exige `manager` **na rota E na política do banco** (D9). A rota usa client admin e filtra `organization_id` pela sessão, nunca pelo corpo.
- O modelo da plataforma continua no código (`MODELOS_BASE`), **nunca** no banco com `organization_id` nulo (spec-mãe §6.1).
- Cópia da empresa de um modelo da plataforma usa o **mesmo `slug`** (D8); modelo novo da empresa usa slug `empresa_<nome>` — nunca colide com a plataforma nem com o `novo` reservado da tela.
- Importação: o arquivo **não é guardado** (D10); PDF/MD/TXT até 5 MB; DOCX recusado com instrução de exportar para PDF; nada é gravado até a pessoa salvar no editor.
- Chave perigosa em variável (`__proto__`, `constructor`, `prototype`) é recusada pela validação.
- Nenhuma ferramenta nova, nenhum pacote, `TETO_TOOLS_POR_AGENTE` intocado (D11).
- Toda tela nova: textos por `t()` com espanhol no mesmo commit; porta em `lib/navigation/catalogo.ts`.

## Review Focus

- **Personalizar, desativar e personalizar de novo** — a versão nova é `max(version) + 1` daquele slug na organização, nunca colide com o índice `(organization_id, slug, version)`. Task 4 testa.
- **Modelo sem seção, com `id` repetido, `section_order` que não bate com as seções, ou `{{` sem fechar** — recusado com o campo e o motivo. Task 3 testa.
- **Usuário `agent` tenta salvar pela API REST direto** (anon key + sessão) — a política do banco recusa. Task 1 (invariante) testa.
- **PDF só de imagem** (escaneado) — a importação devolve a frase de "arquivo sem texto" do extrator existente, não um 500. Task 5 testa.
- **IA sem orçamento ou sem provedor** — a importação devolve `disponivel: false` com o motivo, como o assistente da proposta. Task 5 testa.

---

### Task 0: Worktree e número da migration

- [ ] **Step 1**

```bash
cd "D:/PROJETOS VIBE CODING/DeskcommCRM"
git status --short
git worktree add "../deskcomm-proposta-p5" -b feat/proposta-p5-modelos <BASE-INFORMADA-PELA-SESSAO>
cd "../deskcomm-proposta-p5" && pnpm install --frozen-lockfile
ls supabase/migrations/ | grep -oE '_[0-9]{4}_' | tr -d _ | sort -n | tail -1   # NNNN = este + 1
git fetch origin && git ls-tree --name-only origin/main supabase/migrations/ | grep -oE '_[0-9]{4}_' | tr -d _ | sort -n | tail -1
```

Anote `NNNN` (o maior dos dois + 1) e use-o em toda a Task 1.

---

### Task 1: Migration — nome, descrição e escrita só de `manager`

**Files:**
- Create: `supabase/migrations/20260926200000_NNNN_modelos_de_proposta_da_empresa.sql`
- Modify: `supabase/baseline.sql` (bloco novo no FIM)
- Modify: `supabase/migrations/MANIFEST.md`
- Modify: `tests/invariants/proposta-templates-isolamento-entre-organizacoes.test.ts`

**Interfaces:**
- Produces: colunas `proposal_templates.nome text` e `proposal_templates.descricao text` (nulláveis); política `proposal_templates_write` com `fn_role_at_least(organization_id, 'manager')`.

- [ ] **Step 1: A migration**

```sql
-- 20260926200000_NNNN_modelos_de_proposta_da_empresa.sql
-- NNNN — a empresa cadastra os próprios modelos de proposta (spec de
-- 26/09/2026, item 5).
--
-- 1. `nome` e `descricao`: a tabela nasceu na M0 só com slug/versão/seções,
--    sem nada que uma PESSOA leia. Os modelos da plataforma têm nome no código
--    (ROTULO_DO_MODELO); os da empresa precisam guardar o seu.
-- 2. Escrita só de `manager`+ (D9 da spec; decisão #10 da spec de 21/09:
--    "revisar/alterar proposta só manager+"). A M0 abriu para `agent`, e com a
--    tela nova um atendente reescreveria pela API REST o texto que vai para
--    todo cliente. Nenhum código escreve nesta tabela como `agent` (medido:
--    só `lib/propostas/modelos/resolver.ts` a lia até este plano).
--
-- Aditiva e idempotente; sem backfill (nome nulo cai no rótulo do código).

alter table public.proposal_templates add column if not exists nome text;
alter table public.proposal_templates add column if not exists descricao text;

comment on column public.proposal_templates.nome is
  'Nome do modelo para uma pessoa ler. Nulo numa cópia de modelo da plataforma = usa o rótulo do código (ROTULO_DO_MODELO).';
comment on column public.proposal_templates.descricao is
  'Para que serve este modelo, em uma frase. Opcional.';

drop policy if exists proposal_templates_write on public.proposal_templates;
create policy proposal_templates_write on public.proposal_templates
  for all
  using (organization_id in (select public.fn_user_org_ids())
         and public.fn_role_at_least(organization_id, 'manager'))
  with check (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, 'manager'));
```

Meça antes: a política atual tem exatamente este nome e esta forma, com `'agent'` (`python -c "s=open('supabase/baseline.sql',encoding='utf-8').read(); k=s.rfind('create policy proposal_templates_write'); print(s[k:k+400])"`). Se o nome for outro, **pare e reporte**.

- [ ] **Step 2: O mesmo bloco no fim do `baseline.sql`** — acrescente ao FIM do arquivo:

```sql

-- ---- modelos de proposta da empresa (migration NNNN) ----
-- Espelho idempotente de supabase/migrations/20260926200000_NNNN_modelos_de_proposta_da_empresa.sql
alter table public.proposal_templates add column if not exists nome text;
alter table public.proposal_templates add column if not exists descricao text;

comment on column public.proposal_templates.nome is
  'Nome do modelo para uma pessoa ler. Nulo numa cópia de modelo da plataforma = usa o rótulo do código (ROTULO_DO_MODELO).';
comment on column public.proposal_templates.descricao is
  'Para que serve este modelo, em uma frase. Opcional.';

drop policy if exists proposal_templates_write on public.proposal_templates;
create policy proposal_templates_write on public.proposal_templates
  for all
  using (organization_id in (select public.fn_user_org_ids())
         and public.fn_role_at_least(organization_id, 'manager'))
  with check (organization_id in (select public.fn_user_org_ids())
              and public.fn_role_at_least(organization_id, 'manager'));
```

⚠️ O baseline tem o comentário "As duas funções recriadas moram acima da varredura anon" perto do fim. Este bloco não cria função, então pode ficar no fim. Se houver, depois do ponto em que você colou, um bloco que **recria** a política `proposal_templates_write` com `'agent'`, o seu bloco não é o último e perde — confira: `grep -n "create policy proposal_templates_write" supabase/baseline.sql` tem de ter a SUA ocorrência como a última linha.

- [ ] **Step 3: MANIFEST** — na tabela "Applied" de `supabase/migrations/MANIFEST.md`, depois da linha da `0423`, acrescente (troque NNNN):

```markdown
| `20260926200000` | `NNNN_modelos_de_proposta_da_empresa` | **P5 (spec de 26/09) — a empresa cadastra os próprios modelos de proposta.** Colunas `nome`/`descricao` nulláveis em `proposal_templates` (a tabela da M0 não tinha nada legível por pessoa) e a política `proposal_templates_write` passa de `agent` para `manager`+ (decisão #10 da spec de 21/09; nenhum código escrevia como agent). Aditiva, sem backfill. |
```

- [ ] **Step 4: Invariante** — em `tests/invariants/proposta-templates-isolamento-entre-organizacoes.test.ts`:

1. No import de `./gov-helpers`, acrescente `GOV_MANAGER`.
2. Substitua o caso inteiro (texto atual):

```typescript
  it("agent (piso mínimo, igual a crm_proposals) consegue escrever modelo da própria organização", () => {
    const linhas = writeCountAs(
      GOV_AGENT_A,
      `insert into public.proposal_templates (organization_id, slug) values ('${GOV_ORG}', 'agent-pode')`,
    );
    expect(linhas).toBe(1);
    sql(`delete from public.proposal_templates where slug = 'agent-pode';`);
  });
```

por:

```typescript
  it("agent NÃO escreve modelo (P5, D9 — o texto vai para todo cliente)", () => {
    const linhas = writeCountAs(
      GOV_AGENT_A,
      `insert into public.proposal_templates (organization_id, slug) values ('${GOV_ORG}', 'agent-nao-pode')`,
    );
    expect(linhas).toBe(0);
    sql(`delete from public.proposal_templates where slug = 'agent-nao-pode';`);
  });

  it("manager escreve modelo da própria organização (controle positivo do caso acima)", () => {
    const linhas = writeCountAs(
      GOV_MANAGER,
      `insert into public.proposal_templates (organization_id, slug, nome) values ('${GOV_ORG}', 'manager-pode', 'Modelo do gestor')`,
    );
    expect(linhas).toBe(1);
    sql(`delete from public.proposal_templates where slug = 'manager-pode';`);
  });
```

- [ ] **Step 5: Cercas locais da migration**

Run: `npx vitest run tests/unit/manifest-x-migrations.test.ts tests/unit/baseline-no-piso-do-postgres.test.ts && pnpm checar:colisao-de-migration`
Expected: PASS / sem colisão. (O invariante roda no CI — job `invariants`.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260926200000_NNNN_modelos_de_proposta_da_empresa.sql supabase/baseline.sql supabase/migrations/MANIFEST.md tests/invariants/proposta-templates-isolamento-entre-organizacoes.test.ts
git commit -m "feat(db): NNNN — modelos de proposta da empresa ganham nome e só manager escreve (P5)"
```

---

### Task 2: A lista de modelos da organização, num lugar só

**Files:**
- Create: `lib/propostas/modelos/catalogo-da-organizacao.ts`
- Create: `lib/propostas/modelos/catalogo-da-organizacao.test.ts`

**Interfaces:**
- Produces:
  - `type OrigemDoModelo = "plataforma" | "personalizado" | "empresa"`
  - `interface ModeloListado { slug: string; nome: string; origem: OrigemDoModelo; secoes: number; version: number }`
  - `listarModelosDaOrganizacao(db: SupabaseClient, organizationId: string): Promise<ModeloListado[]>` — os 8 da plataforma primeiro (na ordem de `ROTULO_DO_MODELO`), depois os da empresa por nome.

- [ ] **Step 1: Teste**

```typescript
// lib/propostas/modelos/catalogo-da-organizacao.test.ts
import { describe, expect, it } from "vitest";

import { listarModelosDaOrganizacao } from "./catalogo-da-organizacao";

function db(linhas: Array<Record<string, unknown>>) {
  const cadeia: Record<string, unknown> = {};
  cadeia.select = () => cadeia;
  cadeia.eq = () => cadeia;
  cadeia.then = (resolve: (r: unknown) => unknown) => Promise.resolve({ data: linhas, error: null }).then(resolve);
  return { from: () => cadeia } as never;
}

describe("listarModelosDaOrganizacao", () => {
  it("sem cópia nenhuma: os 8 da plataforma, com o rótulo do código", async () => {
    const lista = await listarModelosDaOrganizacao(db([]), "org-1");
    expect(lista).toHaveLength(8);
    expect(lista[0]).toMatchObject({ slug: "site_institucional", nome: "Site institucional", origem: "plataforma" });
  });

  it("cópia de modelo da plataforma aparece como personalizado, no lugar dele", async () => {
    const lista = await listarModelosDaOrganizacao(
      db([{ slug: "catalogo_imobiliario", nome: null, version: 3, sections: [{}, {}] }]),
      "org-1",
    );
    expect(lista).toHaveLength(8);
    expect(lista.find((m) => m.slug === "catalogo_imobiliario")).toMatchObject({
      origem: "personalizado",
      nome: "Catálogo imobiliário",
      version: 3,
      secoes: 2,
    });
  });

  it("modelo da empresa entra depois dos da plataforma, com o nome dela", async () => {
    const lista = await listarModelosDaOrganizacao(
      db([{ slug: "empresa_locacao", nome: "Locação por temporada", version: 1, sections: [{}] }]),
      "org-1",
    );
    expect(lista).toHaveLength(9);
    expect(lista[8]).toEqual({ slug: "empresa_locacao", nome: "Locação por temporada", origem: "empresa", secoes: 1, version: 1 });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/modelos/catalogo-da-organizacao.test.ts`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Implementar**

```typescript
// lib/propostas/modelos/catalogo-da-organizacao.ts
import type { SupabaseClient } from "@supabase/supabase-js";

import { MODELOS_BASE } from "./catalogo-base";
import { ROTULO_DO_MODELO } from "./rotulos";

export type OrigemDoModelo = "plataforma" | "personalizado" | "empresa";

export interface ModeloListado {
  slug: string;
  nome: string;
  origem: OrigemDoModelo;
  secoes: number;
  version: number;
}

interface LinhaAtiva {
  slug: string;
  nome: string | null;
  version: number;
  sections: unknown;
}

/**
 * O que esta organização pode usar como modelo — uma leitura, um dono. O
 * seletor do editor, a tela de Modelos e a recusa de `crm_draft_proposal`
 * leem daqui (antes, os três usavam só os 8 do código).
 */
export async function listarModelosDaOrganizacao(db: SupabaseClient, organizationId: string): Promise<ModeloListado[]> {
  const { data } = await db
    .from("proposal_templates")
    .select("slug, nome, version, sections")
    .eq("organization_id", organizationId)
    .eq("is_active", true);
  const linhas = (data ?? []) as LinhaAtiva[];
  const porSlug = new Map(linhas.map((l) => [l.slug, l]));
  const contar = (s: unknown) => (Array.isArray(s) ? s.length : 0);

  const daPlataforma: ModeloListado[] = Object.keys(ROTULO_DO_MODELO).map((slug) => {
    const copia = porSlug.get(slug);
    const base = MODELOS_BASE[slug]!;
    return copia
      ? { slug, nome: copia.nome?.trim() || ROTULO_DO_MODELO[slug]!, origem: "personalizado", secoes: contar(copia.sections), version: copia.version }
      : { slug, nome: ROTULO_DO_MODELO[slug]!, origem: "plataforma", secoes: base.sections.length, version: base.version };
  });

  const daEmpresa: ModeloListado[] = linhas
    .filter((l) => !Object.hasOwn(ROTULO_DO_MODELO, l.slug))
    .map((l) => ({ slug: l.slug, nome: l.nome?.trim() || l.slug, origem: "empresa" as const, secoes: contar(l.sections), version: l.version }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));

  return [...daPlataforma, ...daEmpresa];
}
```

- [ ] **Step 4: Rodar e ver passar; commit**

Run: `npx vitest run lib/propostas/modelos/`
Expected: PASS

```bash
git add lib/propostas/modelos/catalogo-da-organizacao.ts lib/propostas/modelos/catalogo-da-organizacao.test.ts
git commit -m "feat(propostas): lista dos modelos da organização num lugar só (P5)"
```

---

### Task 3: A régua de um modelo válido

**Files:**
- Create: `lib/propostas/modelos/validar-modelo.ts`
- Create: `lib/propostas/modelos/validar-modelo.test.ts`

**Interfaces:**
- Produces:
  - `interface ModeloEditavel { nome: string; descricao: string | null; sections: SecaoDoModelo[]; sectionOrder: string[] }`
  - `interface ErroDeModelo { campo: string; mensagem: string }`
  - `validarModelo(m: ModeloEditavel): ErroDeModelo[]`
  - `slugDaEmpresa(nome: string): string` — `empresa_<nome em minúsculas, sem acento, só [a-z0-9_]>`, até 60 caracteres.

- [ ] **Step 1: Teste**

```typescript
// lib/propostas/modelos/validar-modelo.test.ts
import { describe, expect, it } from "vitest";

import { MODELOS_BASE } from "./catalogo-base";
import { ROTULO_DO_MODELO } from "./rotulos";
import { slugDaEmpresa, validarModelo, type ModeloEditavel } from "./validar-modelo";

const secao = (id: string, body = "Texto de {{project.name}}.") => ({
  id, title: `Título ${id}`, titleEs: null, body, bodyEs: null, required: true, conditional: false,
});

function modelo(over: Partial<ModeloEditavel> = {}): ModeloEditavel {
  return { nome: "Locação", descricao: null, sections: [secao("summary"), secao("terms")], sectionOrder: ["summary", "terms"], ...over };
}

describe("validarModelo", () => {
  it("os 8 modelos da plataforma são válidos (controle positivo)", () => {
    for (const [slug, m] of Object.entries(MODELOS_BASE)) {
      expect(validarModelo({ nome: ROTULO_DO_MODELO[slug]!, descricao: null, sections: m.sections, sectionOrder: m.sectionOrder }), slug).toEqual([]);
    }
  });

  it("recusa modelo sem seção", () => {
    expect(validarModelo(modelo({ sections: [], sectionOrder: [] })).map((e) => e.campo)).toContain("sections");
  });

  it("recusa id repetido e id fora do formato", () => {
    const erros = validarModelo(modelo({ sections: [secao("a"), secao("a"), secao("Com Espaço")], sectionOrder: ["a", "a", "Com Espaço"] }));
    expect(erros.some((e) => e.mensagem.includes("repetido"))).toBe(true);
    expect(erros.some((e) => e.campo === "sections.2.id")).toBe(true);
  });

  it("recusa sectionOrder que não bate com as seções", () => {
    expect(validarModelo(modelo({ sectionOrder: ["summary"] })).map((e) => e.campo)).toContain("sectionOrder");
  });

  it("recusa {{ sem fechar e variável com segmento perigoso", () => {
    const erros = validarModelo(modelo({ sections: [secao("summary", "Texto {{project.name"), secao("terms", "{{__proto__.x}}")] }));
    expect(erros.map((e) => e.campo)).toEqual(expect.arrayContaining(["sections.0.body", "sections.1.body"]));
  });

  it("recusa nome curto demais e título vazio", () => {
    const erros = validarModelo(modelo({ nome: "x", sections: [{ ...secao("summary"), title: " " }, secao("terms")] }));
    expect(erros.map((e) => e.campo)).toEqual(expect.arrayContaining(["nome", "sections.0.title"]));
  });
});

describe("slugDaEmpresa", () => {
  it("minúsculo, sem acento, com prefixo", () => {
    expect(slugDaEmpresa("Locação por Temporada!")).toBe("empresa_locacao_por_temporada");
  });
  it("nome só de símbolos ainda gera slug válido", () => {
    expect(slugDaEmpresa("!!!")).toBe("empresa_modelo");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/propostas/modelos/validar-modelo.test.ts`
Expected: FAIL — módulo inexistente

- [ ] **Step 3: Implementar**

```typescript
// lib/propostas/modelos/validar-modelo.ts
import { extrairVariaveis } from "../documento/variaveis";
import type { SecaoDoModelo } from "./tipos";

export interface ModeloEditavel {
  nome: string;
  descricao: string | null;
  sections: SecaoDoModelo[];
  sectionOrder: string[];
}

export interface ErroDeModelo {
  campo: string;
  mensagem: string;
}

const ID_DE_SECAO = /^[a-z][a-z0-9_]{0,40}$/;
const SEGMENTOS_PROIBIDOS = new Set(["__proto__", "constructor", "prototype"]);
const MAXIMO_DE_SECOES = 40;

export function validarModelo(m: ModeloEditavel): ErroDeModelo[] {
  const erros: ErroDeModelo[] = [];
  const nome = m.nome.trim();
  if (nome.length < 2 || nome.length > 80) erros.push({ campo: "nome", mensagem: "O nome precisa ter de 2 a 80 caracteres." });
  if ((m.descricao ?? "").length > 300) erros.push({ campo: "descricao", mensagem: "A descrição passa de 300 caracteres." });
  if (m.sections.length === 0) erros.push({ campo: "sections", mensagem: "O modelo precisa de pelo menos uma seção." });
  if (m.sections.length > MAXIMO_DE_SECOES) erros.push({ campo: "sections", mensagem: `O modelo passa de ${MAXIMO_DE_SECOES} seções.` });

  const vistos = new Set<string>();
  m.sections.forEach((s, i) => {
    if (!ID_DE_SECAO.test(s.id)) {
      erros.push({ campo: `sections.${i}.id`, mensagem: "Identificador da seção: letras minúsculas, números e _ (começando por letra)." });
    } else if (vistos.has(s.id)) {
      erros.push({ campo: `sections.${i}.id`, mensagem: `Identificador de seção repetido: ${s.id}.` });
    }
    vistos.add(s.id);
    if (s.title.trim().length === 0 || s.title.length > 120) {
      erros.push({ campo: `sections.${i}.title`, mensagem: "O título da seção precisa ter de 1 a 120 caracteres." });
    }
    if (s.body.trim().length === 0 || s.body.length > 20000) {
      erros.push({ campo: `sections.${i}.body`, mensagem: "O texto da seção precisa ter de 1 a 20.000 caracteres." });
      return;
    }
    const aberturas = (s.body.match(/\{\{/g) ?? []).length;
    const variaveis = extrairVariaveis(s.body);
    const completas = (s.body.match(/\{\{[a-zA-Z0-9_.]+\}\}/g) ?? []).length;
    if (aberturas !== completas) {
      erros.push({ campo: `sections.${i}.body`, mensagem: "Há uma variável sem fechar, ou com caractere inválido, entre {{ e }}." });
    } else if (variaveis.some((v) => v.split(".").some((seg) => SEGMENTOS_PROIBIDOS.has(seg) || seg.length === 0))) {
      erros.push({ campo: `sections.${i}.body`, mensagem: "Nome de variável não permitido." });
    }
  });

  const ordem = [...m.sectionOrder].sort().join("|");
  const ids = m.sections.map((s) => s.id).sort().join("|");
  if (ordem !== ids) erros.push({ campo: "sectionOrder", mensagem: "A ordem das seções não corresponde às seções do modelo." });

  return erros;
}

export function slugDaEmpresa(nome: string): string {
  const base = nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 51);
  return `empresa_${base || "modelo"}`;
}
```

- [ ] **Step 4: Rodar e ver passar; commit**

Run: `npx vitest run lib/propostas/modelos/validar-modelo.test.ts`
Expected: PASS

```bash
git add lib/propostas/modelos/validar-modelo.ts lib/propostas/modelos/validar-modelo.test.ts
git commit -m "feat(propostas): régua de modelo de proposta válido (P5)"
```

---

### Task 4: As rotas dos modelos

**Files:**
- Create: `app/api/v1/settings/proposal-templates/route.ts` (GET lista, POST personalizar/novo)
- Create: `app/api/v1/settings/proposal-templates/route.test.ts`
- Create: `app/api/v1/settings/proposal-templates/[slug]/route.ts` (GET, PATCH, DELETE)
- Create: `app/api/v1/settings/proposal-templates/[slug]/route.test.ts`
- Modify: `lib/audit/actions.ts`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Consumes: Tasks 2 e 3; `resolverModelo`; `MODELOS_BASE`; `ROTULO_DO_MODELO`.
- Produces:
  - `GET /api/v1/settings/proposal-templates` (viewer) → `ModeloListado[]`
  - `POST` (manager) `{ acao: "personalizar", base_slug }` ou `{ acao: "novo", nome, descricao?, sections?, section_order? }` → `{ slug }`
  - `GET /api/v1/settings/proposal-templates/[slug]` (viewer) → `{ slug, nome, descricao, origem, version, sections, sectionOrder }`
  - `PATCH /[slug]` (manager) `{ nome, descricao, sections, section_order }` → `{ slug, version }`; 409 se o slug não tem cópia ativa da empresa
  - `DELETE /[slug]` (manager) → desativa a cópia (`is_active = false`)
  - Ações de auditoria `proposal_template.saved`, `proposal_template.deactivated`

- [ ] **Step 1: Auditoria** — em `lib/audit/actions.ts`, depois de `"proposal.recovered_from_stuck",` acrescente:

```typescript
  // Modelos de proposta da empresa (P5, spec de 26/09) — o texto que vai para
  // todo cliente; quem mudou e quando é o que se disputa depois.
  "proposal_template.saved",
  "proposal_template.deactivated",
  "proposal_template.imported",
```

- [ ] **Step 1b: Os auxiliares de gravação** — crie `lib/propostas/modelos/gravacao.ts`:

```typescript
// lib/propostas/modelos/gravacao.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export const secaoSchema = z.object({
  id: z.string().max(60),
  title: z.string().max(200),
  body: z.string().max(20000),
  required: z.boolean(),
  conditional: z.boolean(),
});

/** Formato gravado em `proposal_templates.sections` (o que `resolverModelo` lê). */
export function secoesParaGravar(sections: Array<{ id: string; title: string; body: string; required: boolean; conditional: boolean }>) {
  return sections.map((s) => ({
    id: s.id,
    title: s.title.trim(),
    title_es: null,
    body: s.body,
    body_es: null,
    required: s.required,
    conditional: s.conditional,
  }));
}

/**
 * `max(version) + 1` do slug na organização — o índice único é
 * (organization_id, slug, version), e personalizar/desativar/personalizar
 * de novo não pode repetir número.
 */
export async function proximaVersao(db: SupabaseClient, orgId: string, slug: string): Promise<number> {
  const { data } = await db
    .from("proposal_templates")
    .select("version")
    .eq("organization_id", orgId)
    .eq("slug", slug)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return ((data as { version: number } | null)?.version ?? 0) + 1;
}
```

Acrescente o arquivo à lista **Files** desta tarefa e ao `git add` do Step 8.

- [ ] **Step 2: Rota da coleção**

```typescript
// app/api/v1/settings/proposal-templates/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { MODELOS_BASE } from "@/lib/propostas/modelos/catalogo-base";
import { listarModelosDaOrganizacao } from "@/lib/propostas/modelos/catalogo-da-organizacao";
import { proximaVersao, secaoSchema, secoesParaGravar } from "@/lib/propostas/modelos/gravacao";
import { ROTULO_DO_MODELO } from "@/lib/propostas/modelos/rotulos";
import { slugDaEmpresa, validarModelo } from "@/lib/propostas/modelos/validar-modelo";
import { sePropostasDesligadas } from "@/lib/propostas/porta";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const postSchema = z.union([
  z.object({ acao: z.literal("personalizar"), base_slug: z.string().min(1).max(100) }),
  z.object({
    acao: z.literal("novo"),
    nome: z.string().max(200),
    descricao: z.string().max(300).nullable().optional(),
    sections: z.array(secaoSchema).max(40).optional(),
    section_order: z.array(z.string().max(60)).max(40).optional(),
  }),
]);

const SECAO_INICIAL = {
  id: "summary",
  title: "Resumo da proposta",
  titleEs: null,
  body: "Esta proposta apresenta {{project.name}} para {{client.company_or_name}}.",
  bodyEs: null,
  required: true,
  conditional: false,
};

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "proposal_templates" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const admin = createAdminClient();
  return ok(await listarModelosDaOrganizacao(admin, authz.org.orgId), { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "proposal_templates" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });
  const admin = createAdminClient();
  const orgId = authz.org.orgId;

  let linha: Record<string, unknown>;
  if (parsed.data.acao === "personalizar") {
    const slug = parsed.data.base_slug;
    if (!Object.hasOwn(MODELOS_BASE, slug)) return fail("not_found", t("Modelo da plataforma não encontrado."), 404, { requestId });
    const { data: ativa } = await admin
      .from("proposal_templates")
      .select("id")
      .eq("organization_id", orgId)
      .eq("slug", slug)
      .eq("is_active", true)
      .maybeSingle();
    if (ativa) return fail("state_conflict", t("Este modelo já foi personalizado."), 409, { requestId });
    const base = MODELOS_BASE[slug]!;
    linha = {
      organization_id: orgId,
      slug,
      version: await proximaVersao(admin, orgId, slug),
      base_slug: slug,
      base_version: base.version,
      nome: ROTULO_DO_MODELO[slug] ?? null,
      descricao: null,
      sections: secoesParaGravar(base.sections),
      section_order: base.sectionOrder,
      is_active: true,
    };
  } else {
    const nome = parsed.data.nome.trim();
    const sections = parsed.data.sections ?? [SECAO_INICIAL];
    const sectionOrder = parsed.data.section_order ?? sections.map((s) => s.id);
    const erros = validarModelo({
      nome,
      descricao: parsed.data.descricao ?? null,
      sections: sections.map((s) => ({ ...s, titleEs: null, bodyEs: null })),
      sectionOrder,
    });
    if (erros.length > 0) {
      return fail("validation_failed", t("O modelo tem problemas."), 422, { requestId, details: { erros } });
    }
    let slug = slugDaEmpresa(nome);
    for (let n = 2; n <= 9; n++) {
      const { data: existe } = await admin
        .from("proposal_templates")
        .select("id")
        .eq("organization_id", orgId)
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (!existe) break;
      slug = `${slugDaEmpresa(nome).slice(0, 57)}_${n}`;
    }
    linha = {
      organization_id: orgId,
      slug,
      version: await proximaVersao(admin, orgId, slug),
      base_slug: null,
      base_version: null,
      nome,
      descricao: parsed.data.descricao ?? null,
      sections: secoesParaGravar(sections),
      section_order: sectionOrder,
      is_active: true,
    };
  }

  const { error } = await admin.from("proposal_templates").insert(linha);
  if (error) {
    if ((error as { code?: string }).code === "23505") return fail("state_conflict", t("Já existe um modelo ativo com este nome."), 409, { requestId });
    return fail("internal_error", t("Falha ao salvar o modelo."), 500, { requestId });
  }

  void audit({
    action: "proposal_template.saved",
    actorUserId: authz.user.id,
    organizationId: orgId,
    resourceType: "proposal_templates",
    resourceId: null,
    requestId,
    metadata: { slug: linha.slug, acao: parsed.data.acao, version: linha.version },
  });
  return ok({ slug: linha.slug }, { requestId });
}
```

Medido ao escrever: o 409 da casa é `state_conflict` (`lib/api/errors.ts:72` — `conflict` não existe); `audit` aceita `resourceId: null` (`lib/audit/index.ts:42`); `requireRole` recebe `resource` como string livre (`lib/auth/require-role.ts:36`).

- [ ] **Step 3: Rota do item**

```typescript
// app/api/v1/settings/proposal-templates/[slug]/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { traduzir } from "@/lib/i18n/dicionario";
import { MODELOS_BASE } from "@/lib/propostas/modelos/catalogo-base";
import { ROTULO_DO_MODELO } from "@/lib/propostas/modelos/rotulos";
import { validarModelo } from "@/lib/propostas/modelos/validar-modelo";
import { proximaVersao, secaoSchema, secoesParaGravar } from "@/lib/propostas/modelos/gravacao";
import { sePropostasDesligadas } from "@/lib/propostas/porta";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ slug: string }> };

const patchSchema = z.object({
  nome: z.string().max(200),
  descricao: z.string().max(300).nullable(),
  sections: z.array(secaoSchema).max(40),
  section_order: z.array(z.string().max(60)).max(40),
});

interface LinhaDoModelo {
  id: string;
  slug: string;
  nome: string | null;
  descricao: string | null;
  version: number;
  sections: Array<{ id: string; title: string; body: string; required: boolean; conditional: boolean }>;
  section_order: string[];
}

async function copiaAtiva(admin: ReturnType<typeof createAdminClient>, orgId: string, slug: string) {
  const { data } = await admin
    .from("proposal_templates")
    .select("id, slug, nome, descricao, version, sections, section_order")
    .eq("organization_id", orgId)
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  return (data as LinhaDoModelo | null) ?? null;
}

export async function GET(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "proposal_templates" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { slug } = await ctx.params;
  const admin = createAdminClient();

  const copia = await copiaAtiva(admin, authz.org.orgId, slug);
  if (copia) {
    return ok(
      {
        slug,
        nome: copia.nome ?? ROTULO_DO_MODELO[slug] ?? slug,
        descricao: copia.descricao,
        origem: Object.hasOwn(MODELOS_BASE, slug) ? "personalizado" : "empresa",
        version: copia.version,
        sections: copia.sections,
        sectionOrder: copia.section_order,
      },
      { requestId },
    );
  }
  if (Object.hasOwn(MODELOS_BASE, slug)) {
    const base = MODELOS_BASE[slug]!;
    return ok(
      { slug, nome: ROTULO_DO_MODELO[slug] ?? slug, descricao: null, origem: "plataforma", version: base.version, sections: base.sections, sectionOrder: base.sectionOrder },
      { requestId },
    );
  }
  return fail("not_found", t("Modelo não encontrado."), 404, { requestId });
}

export async function PATCH(req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "proposal_templates" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { slug } = await ctx.params;

  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", t("Campos inválidos."), 422, { requestId });
  const erros = validarModelo({
    nome: parsed.data.nome,
    descricao: parsed.data.descricao,
    sections: parsed.data.sections.map((s) => ({ ...s, titleEs: null, bodyEs: null })),
    sectionOrder: parsed.data.section_order,
  });
  if (erros.length > 0) return fail("validation_failed", t("O modelo tem problemas."), 422, { requestId, details: { erros } });

  const admin = createAdminClient();
  const copia = await copiaAtiva(admin, authz.org.orgId, slug);
  if (!copia) {
    return fail("state_conflict", t("Personalize o modelo da plataforma antes de editá-lo."), 409, { requestId });
  }
  const version = await proximaVersao(admin, authz.org.orgId, slug);
  const { error } = await admin
    .from("proposal_templates")
    .update({
      nome: parsed.data.nome.trim(),
      descricao: parsed.data.descricao,
      sections: secoesParaGravar(parsed.data.sections),
      section_order: parsed.data.section_order,
      version,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", authz.org.orgId)
    .eq("id", copia.id);
  if (error) return fail("internal_error", t("Falha ao salvar o modelo."), 500, { requestId });

  void audit({
    action: "proposal_template.saved",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "proposal_templates",
    resourceId: copia.id,
    requestId,
    metadata: { slug, version },
  });
  return ok({ slug, version }, { requestId });
}

export async function DELETE(_req: NextRequest, ctx: Ctx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "proposal_templates" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);
  const { slug } = await ctx.params;
  const admin = createAdminClient();

  const copia = await copiaAtiva(admin, authz.org.orgId, slug);
  if (!copia) return fail("not_found", t("Não há cópia da empresa para este modelo."), 404, { requestId });
  const { error } = await admin
    .from("proposal_templates")
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq("organization_id", authz.org.orgId)
    .eq("id", copia.id);
  if (error) return fail("internal_error", t("Falha ao desativar o modelo."), 500, { requestId });

  void audit({
    action: "proposal_template.deactivated",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "proposal_templates",
    resourceId: copia.id,
    requestId,
    metadata: { slug },
  });
  return ok({ slug }, { requestId });
}
```

Os auxiliares moram em `lib/propostas/modelos/gravacao.ts` (Step 1b), e não numa rota importada pela outra.

- [ ] **Step 4: Testes das rotas** — use o molde de mocks de `app/api/v1/proposals/[id]/documento/route.test.ts` (`vi.hoisted` + `vi.mock` de `require-role`, `impersonate/support`, `supabase/admin`, `audit`, `i18n/dicionario`, `propostas/porta`). Casos obrigatórios, um `it` cada:

`route.test.ts` (coleção):
1. `GET` como viewer devolve 8 itens quando o banco não tem cópia.
2. `POST personalizar` como agent → 403 e nenhum `insert`.
3. `POST personalizar` de slug que não é da plataforma → 404.
4. `POST personalizar` de modelo já personalizado → 409 e nenhum `insert`.
5. `POST personalizar` depois de uma cópia desativada com `version` 2 → `insert` com `version` 3 (Review Focus).
6. `POST novo` com nome "Locação por Temporada" → `insert` com `slug` `empresa_locacao_por_temporada`, `base_slug` nulo e a seção inicial.
7. `POST novo` com seções inválidas (id repetido) → 422 com `details.erros` e nenhum `insert`.

`[slug]/route.test.ts` (item):
1. `GET` de slug da plataforma sem cópia → `origem: "plataforma"` e as seções do código.
2. `GET` de slug inexistente → 404.
3. `PATCH` sem cópia ativa → 409.
4. `PATCH` válido → `update` com `version` = maior + 1 e `nome` aparado.
5. `PATCH` com `{{` sem fechar → 422 e nenhum `update`.
6. `PATCH`/`DELETE` como agent → 403.
7. `DELETE` → `update` com `is_active: false`.

Para o caso 5 da coleção, o mock de `proposal_templates` precisa responder duas consultas diferentes: a de cópia ativa (`.eq("is_active", true).maybeSingle()` → `null`) e a de maior versão (`.order(...).limit(1).maybeSingle()` → `{ version: 2 }`). Distinga pelo que foi chamado na cadeia (guarde um marcador quando `order` for chamado).

- [ ] **Step 5: Traduções** — acrescente ao `DICIONARIO` (confira cada uma antes com `grep`):

```typescript
  "Modelo da plataforma não encontrado.": { es: "Modelo de la plataforma no encontrado." },
  "Este modelo já foi personalizado.": { es: "Este modelo ya fue personalizado." },
  "O modelo tem problemas.": { es: "El modelo tiene problemas." },
  "Já existe um modelo ativo com este nome.": { es: "Ya existe un modelo activo con este nombre." },
  "Falha ao salvar o modelo.": { es: "No fue posible guardar el modelo." },
  "Personalize o modelo da plataforma antes de editá-lo.": { es: "Personaliza el modelo de la plataforma antes de editarlo." },
  "Não há cópia da empresa para este modelo.": { es: "No hay copia de la empresa para este modelo." },
  "Falha ao desativar o modelo.": { es: "No fue posible desactivar el modelo." },
```

(`"Modelo não encontrado."` e `"Campos inválidos."` já existem — confira.)

- [ ] **Step 6: Rodar e ver passar**

Run: `npx vitest run app/api/v1/settings/proposal-templates tests/unit/suporte-cobertura-de-efeitos.test.ts tests/unit/i18n-espanhol-cobre-a-tela.test.ts`
Expected: PASS

- [ ] **Step 7: Sabotar** — copie a rota da coleção, troque `requireRole("manager"` do `POST` por `requireRole("agent"`, rode: o caso 2 falha. Restaure da cópia.

- [ ] **Step 8: Commit**

```bash
git add app/api/v1/settings/proposal-templates lib/propostas/modelos/gravacao.ts lib/audit/actions.ts lib/i18n/dicionario.ts
git commit -m "feat(propostas): rotas para listar, personalizar, criar, editar e desativar modelos da empresa (P5)"
```

---

### Task 5: Criar modelo a partir de um arquivo

**Files:**
- Create: `lib/propostas/modelos/importar.ts`
- Create: `lib/propostas/modelos/importar.test.ts`
- Modify: `lib/ai/pontos/registro.ts`
- Create: `app/api/v1/settings/proposal-templates/importar/route.ts`
- Create: `app/api/v1/settings/proposal-templates/importar/route.test.ts`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Consumes: `runModelCall` (`@/lib/agent-engine/edge/llm/run-model-call`), `ROTULO_DA_VARIAVEL` (P1), `validarModelo` (Task 3), `extractPdfText`/`PdfExtractError` (`@/lib/ai/rag/extractors/pdf`), `extractMarkdownText` (`@/lib/ai/rag/extractors/markdown`), `resolverExtensao` (`@/lib/ai/rag/ingest/documento`).
- Produces:
  - `gerarModeloDoTexto(input: { texto: string; pool: pg.Pool; cfg: LlmEdgeConfig; tenantId: string }): Promise<{ nome: string; sections: SecaoDoModelo[]; sectionOrder: string[] } | null>`
  - `POST /api/v1/settings/proposal-templates/importar` (manager, multipart `file`) → `{ disponivel: true, modelo: { nome, sections, sectionOrder }, erros: ErroDeModelo[] }` ou `{ disponivel: false, motivo }`. **Nada é gravado.**
  - ponto de IA `proposal_template_import`.

- [ ] **Step 1: Registrar o ponto de IA** — em `lib/ai/pontos/registro.ts`, depois do bloco `id: "proposal_assistant"` (termina em `registraEm: "llm_calls",\n  },`), acrescente:

```typescript
  {
    id: "proposal_template_import",
    rotulo: "Transformar proposta da empresa em modelo",
    oQueFaz:
      "Lê a proposta que a empresa já usa (PDF ou texto) e a divide em seções de modelo, trocando os dados de um cliente específico por campos preenchíveis, para uma pessoa revisar antes de salvar.",
    papel: "atender",
    exige: { tools: true },
    emissor: "lib/propostas/modelos/importar.ts",
    sintomaDeFalha:
      "O botão de criar modelo a partir de um arquivo não devolve nada, e a pessoa monta o modelo seção por seção à mão.",
    registraEm: "llm_calls",
  },
```

Meça antes: o `papel` "atender" e a forma de `exige` são os do vizinho `proposal_assistant` (`sed -n '240,260p' lib/ai/pontos/registro.ts`).

- [ ] **Step 2: Teste da IA de importação**

```typescript
// lib/propostas/modelos/importar.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const runModelCall = vi.hoisted(() => vi.fn());
vi.mock("@/lib/agent-engine/edge/llm/run-model-call", () => ({ runModelCall }));

import { gerarModeloDoTexto } from "./importar";

const entrada = { texto: "Proposta para a Imobiliária Rio...", pool: {} as never, cfg: {} as never, tenantId: "org-1" };

function respondeCom(args: unknown) {
  runModelCall.mockResolvedValueOnce({ result: { toolCalls: [{ toolName: "propor_modelo", input: args }] } });
}

beforeEach(() => runModelCall.mockReset());

describe("gerarModeloDoTexto", () => {
  it("usa o ponto proposal_template_import e devolve as seções normalizadas", async () => {
    respondeCom({
      nome: "Portal imobiliário",
      secoes: [
        { id: "Resumo Geral", title: "Resumo", body: "Projeto {{project.name}} para {{client.company}}.", required: true, conditional: false },
        { id: "resumo_geral", title: "Resumo 2", body: "Outro texto.", required: false, conditional: true },
      ],
    });
    const r = await gerarModeloDoTexto(entrada);
    expect(runModelCall).toHaveBeenCalledWith(entrada.pool, entrada.cfg, expect.objectContaining({ purpose: "proposal_template_import", tenantId: "org-1" }));
    expect(r?.nome).toBe("Portal imobiliário");
    expect(r?.sections.map((s) => s.id)).toEqual(["resumo_geral", "resumo_geral_2"]);
    expect(r?.sectionOrder).toEqual(["resumo_geral", "resumo_geral_2"]);
    expect(r?.sections[0]).toMatchObject({ titleEs: null, bodyEs: null, required: true });
  });

  it("modelo que não chama a ferramenta devolve null", async () => {
    runModelCall.mockResolvedValueOnce({ result: { toolCalls: [] } });
    expect(await gerarModeloDoTexto(entrada)).toBeNull();
  });

  it("formato inesperado devolve null", async () => {
    respondeCom({ nome: 3 });
    expect(await gerarModeloDoTexto(entrada)).toBeNull();
  });

  it("o texto enviado à IA é cortado em 30.000 caracteres", async () => {
    respondeCom({ nome: "X", secoes: [{ id: "a", title: "A", body: "b", required: true, conditional: false }] });
    await gerarModeloDoTexto({ ...entrada, texto: "x".repeat(50000) });
    const mensagem = runModelCall.mock.calls[0][2].messages[0].content as string;
    expect(mensagem.length).toBeLessThan(31000);
  });
});
```

- [ ] **Step 3: Implementar**

```typescript
// lib/propostas/modelos/importar.ts
import { tool, type ModelMessage } from "ai";
import type pg from "pg";
import { z } from "zod";

import type { LlmEdgeConfig } from "@/lib/agent-engine/edge/llm/credentials";
import { runModelCall } from "@/lib/agent-engine/edge/llm/run-model-call";
import { ROTULO_DA_VARIAVEL } from "../documento/rotulos-das-variaveis";
import type { SecaoDoModelo } from "./tipos";

const TEXTO_MAXIMO = 30_000;

const respostaShape = {
  nome: z.string().min(1).max(200),
  secoes: z
    .array(
      z.object({
        id: z.string().max(60),
        title: z.string().max(200),
        body: z.string().max(20000),
        required: z.boolean(),
        conditional: z.boolean(),
      }),
    )
    .min(1)
    .max(40),
};

function idNormalizado(bruto: string, usados: Set<string>): string {
  const base =
    bruto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^([0-9])/, "s_$1")
      .slice(0, 36) || "secao";
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base}_${n}`;
  usados.add(id);
  return id;
}

function sistema(): string {
  const vocabulario = Object.entries(ROTULO_DA_VARIAVEL)
    .map(([caminho, rotulo]) => `{{${caminho}}} = ${rotulo}`)
    .join("; ");
  return (
    "Você transforma a proposta comercial que uma empresa já usa num MODELO reutilizável, " +
    "chamando a ferramenta propor_modelo. Divida o texto em seções na ordem em que aparecem, " +
    "mantendo a redação da empresa. Troque todo dado de UM cliente específico (nome de pessoa ou " +
    "empresa, valores, datas, prazos, endereços, quantidades) por variáveis {{caminho}}. Use primeiro " +
    `este vocabulário: ${vocabulario}. ` +
    "Valor total → {{investment.total_formatted}}; prazo → {{schedule.estimated_days}}; validade → " +
    "{{commercial_terms.validity_days}}. Se precisar de uma variável fora do vocabulário, use " +
    "{{scope.nome_em_snake_case}}. Nunca invente conteúdo que não está no texto. Seções que só " +
    "valem para alguns clientes: conditional=true e required=false. O nome do modelo descreve o tipo " +
    "de proposta (ex.: 'Portal imobiliário'), nunca o nome do cliente."
  );
}

export async function gerarModeloDoTexto(input: {
  texto: string;
  pool: pg.Pool;
  cfg: LlmEdgeConfig;
  tenantId: string;
}): Promise<{ nome: string; sections: SecaoDoModelo[]; sectionOrder: string[] } | null> {
  const messages: ModelMessage[] = [
    {
      role: "user",
      content:
        `Texto da proposta da empresa:\n\n${input.texto.slice(0, TEXTO_MAXIMO)}\n\n` +
        "Chame a ferramenta propor_modelo SEMPRE, com o modelo inteiro.",
    },
  ];
  const { result } = await runModelCall(input.pool, input.cfg, {
    tenantId: input.tenantId,
    purpose: "proposal_template_import",
    system: sistema(),
    messages,
    tools: {
      propor_modelo: tool({ inputSchema: z.object(respostaShape), execute: async (args) => args }),
    },
  });

  const chamada = result.toolCalls?.find((c: { toolName: string }) => c.toolName === "propor_modelo");
  if (!chamada) return null;
  const parsed = z.object(respostaShape).safeParse((chamada as { input: unknown }).input);
  if (!parsed.success) return null;

  const usados = new Set<string>();
  const sections: SecaoDoModelo[] = parsed.data.secoes.map((s) => ({
    id: idNormalizado(s.id || s.title, usados),
    title: s.title.trim() || "Seção",
    titleEs: null,
    body: s.body,
    bodyEs: null,
    required: s.required,
    conditional: s.conditional,
  }));
  return { nome: parsed.data.nome.trim(), sections, sectionOrder: sections.map((s) => s.id) };
}
```

Meça antes de colar: os imports usados por `lib/propostas/assistente.ts` para a MESMA chamada (`sed -n '1,20p' lib/propostas/assistente.ts`) — copie de lá os caminhos exatos de `tool`, `ModelMessage`, `LlmEdgeConfig` e `runModelCall`, que são os que já compilam. E a forma de `result.toolCalls` que ele lê (`sed -n '139,150p' lib/propostas/assistente.ts`).

- [ ] **Step 4: A rota de importação**

```typescript
// app/api/v1/settings/proposal-templates/importar/route.ts
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { env } from "@/lib/env";
import { llmEdgeConfigFromEnv } from "@/lib/agent-engine/edge/llm/credentials";
import { LlmBudgetExceededError, LlmModelNotEnabledError, LlmProviderUnknownError } from "@/lib/agent-engine/edge/llm/run-model-call";
import { getSkillsPool } from "@/lib/ai/skills/db";
import { PdfExtractError, extractPdfText } from "@/lib/ai/rag/extractors/pdf";
import { extractMarkdownText } from "@/lib/ai/rag/extractors/markdown";
import { resolverExtensao } from "@/lib/ai/rag/ingest/documento";
import { traduzir } from "@/lib/i18n/dicionario";
import { gerarModeloDoTexto } from "@/lib/propostas/modelos/importar";
import { validarModelo } from "@/lib/propostas/modelos/validar-modelo";
import { sePropostasDesligadas } from "@/lib/propostas/porta";

export const dynamic = "force-dynamic";
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "proposal_templates" });
  if (!authz.ok) return authz.response;
  const desligada = await sePropostasDesligadas(authz.org.orgId, requestId);
  if (desligada) return desligada;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("invalid_request", t("Falha ao processar o envio do arquivo."), 400, { requestId });
  }
  const arquivo = form.get("file");
  if (!(arquivo instanceof File)) return fail("invalid_request", t("Nenhum arquivo foi enviado."), 400, { requestId });
  if (arquivo.size > TAMANHO_MAXIMO) return fail("payload_too_large", t("O arquivo passa de 5 MB."), 413, { requestId });

  const extensaoBruta = arquivo.name.split(".").pop()?.toLowerCase() ?? "";
  if (extensaoBruta === "docx" || extensaoBruta === "doc") {
    return fail("unsupported_media_type", t("Não leio Word diretamente — no Word use \"Salvar como\" → PDF e envie o PDF."), 415, { requestId });
  }
  const extensao = resolverExtensao(arquivo.name, arquivo.type);
  if (extensao !== "pdf" && extensao !== "md" && extensao !== "txt") {
    return fail("unsupported_media_type", t("Envie a proposta em PDF, Markdown (.md) ou texto (.txt)."), 415, { requestId });
  }

  const buffer = Buffer.from(await arquivo.arrayBuffer());
  let texto: string;
  try {
    texto = extensao === "pdf" ? await extractPdfText(buffer) : extractMarkdownText(buffer);
  } catch (erro) {
    if (erro instanceof PdfExtractError) {
      return fail("validation_failed", t("Não encontrei texto neste arquivo. Se for um PDF escaneado, exporte a proposta original como PDF com texto."), 422, { requestId });
    }
    return fail("validation_failed", t("Não consegui ler este arquivo."), 422, { requestId });
  }
  if (texto.trim().length < 50) {
    return fail("validation_failed", t("Não encontrei texto neste arquivo. Se for um PDF escaneado, exporte a proposta original como PDF com texto."), 422, { requestId });
  }

  try {
    const modelo = await gerarModeloDoTexto({
      texto,
      pool: getSkillsPool(),
      cfg: llmEdgeConfigFromEnv(env),
      tenantId: authz.org.orgId,
    });
    if (!modelo) return ok({ disponivel: true, modelo: null, erros: [] }, { requestId });
    const erros = validarModelo({ nome: modelo.nome, descricao: null, sections: modelo.sections, sectionOrder: modelo.sectionOrder });
    void audit({
      action: "proposal_template.imported",
      actorUserId: authz.user.id,
      organizationId: authz.org.orgId,
      resourceType: "proposal_templates",
      resourceId: null,
      requestId,
      metadata: { extensao, bytes: arquivo.size, secoes: modelo.sections.length },
    });
    return ok({ disponivel: true, modelo, erros }, { requestId });
  } catch (err) {
    if (err instanceof LlmBudgetExceededError || err instanceof LlmProviderUnknownError || err instanceof LlmModelNotEnabledError) {
      return ok({ disponivel: false, motivo: err.message }, { requestId });
    }
    throw err;
  }
}
```

Meça antes de colar: cada import é o mesmo que `app/api/v1/proposals/[id]/assistant/route.ts` e `app/api/v1/ai/knowledge/sources/upload/route.ts` já usam (confira os caminhos com `sed -n '1,20p'` nos dois); `extractMarkdownText` é síncrono (`lib/ai/rag/extractors/markdown.ts:38`); os códigos `payload_too_large`, `unsupported_media_type` e `invalid_request` existem (`grep -n "payload_too_large\|unsupported_media_type\|invalid_request" lib/api/errors.ts`). Se `pdf.ts` exigir a estratégia explícita no Next, passe `{ estrategia: "em-processo" }`.

- [ ] **Step 5: Teste da rota** — no molde do `assistant/route.ts` (mocks de `require-role`, `impersonate/support`, `propostas/porta`, `audit`, `i18n/dicionario`, `importar`, `extractors/pdf`, `ai/skills/db`, `edge/llm/credentials`, `env`). Casos, um `it` cada:
1. `.docx` → 415 com "Salvar como".
2. `.csv` → 415.
3. arquivo de 6 MB → 413.
4. PDF cujo `extractPdfText` lança `PdfExtractError` → 422 com "PDF escaneado".
5. `.txt` válido → 200 com `modelo` e `erros: []`, e `audit` chamado com `proposal_template.imported` **sem** o texto no metadata.
6. `gerarModeloDoTexto` lança `LlmBudgetExceededError` → 200 com `disponivel: false`.
7. agent → 403 e `gerarModeloDoTexto` não chamado.

Para montar o `File` no teste: `new File([Buffer.from("texto ".repeat(20))], "proposta.txt", { type: "text/plain" })` num `FormData`, e `new Request("http://x", { method: "POST", body: form })`.

- [ ] **Step 6: Traduções**

```typescript
  "O arquivo passa de 5 MB.": { es: "El archivo supera los 5 MB." },
  "Não leio Word diretamente — no Word use \"Salvar como\" → PDF e envie o PDF.": {
    es: "No leo Word directamente — en Word usa \"Guardar como\" → PDF y envía el PDF.",
  },
  "Envie a proposta em PDF, Markdown (.md) ou texto (.txt).": { es: "Envía la propuesta en PDF, Markdown (.md) o texto (.txt)." },
  "Não encontrei texto neste arquivo. Se for um PDF escaneado, exporte a proposta original como PDF com texto.": {
    es: "No encontré texto en este archivo. Si es un PDF escaneado, exporta la propuesta original como PDF con texto.",
  },
  "Não consegui ler este arquivo.": { es: "No pude leer este archivo." },
```

(`"Falha ao processar o envio do arquivo."` e `"Nenhum arquivo foi enviado."` já existem pela rota de conhecimento — confira.)

- [ ] **Step 7: Rodar e ver passar**

Run: `npx vitest run lib/propostas/modelos/importar.test.ts app/api/v1/settings/proposal-templates tests/unit/pontos-de-ia-completude.test.ts tests/unit/i18n-espanhol-cobre-a-tela.test.ts tests/unit/suporte-cobertura-de-efeitos.test.ts`
Expected: PASS — a cerca de pontos de IA acha o `purpose: "proposal_template_import"` literal e a entrada no registro

- [ ] **Step 8: Sabotar a cerca** — copie `registro.ts`, apague a entrada nova, rode `tests/unit/pontos-de-ia-completude.test.ts`: falha apontando o ponto emitido sem registro. Restaure da cópia.

- [ ] **Step 9: Commit**

```bash
git add lib/propostas/modelos/importar.ts lib/propostas/modelos/importar.test.ts lib/ai/pontos/registro.ts app/api/v1/settings/proposal-templates/importar lib/i18n/dicionario.ts
git commit -m "feat(propostas): a IA transforma a proposta que a empresa já usa num modelo para revisar (P5)"
```

---

### Task 6: As telas

**Files:**
- Create: `app/app/settings/tenant/proposals/modelos/page.tsx`
- Create: `app/app/settings/tenant/proposals/modelos/_client.tsx`
- Create: `app/app/settings/tenant/proposals/modelos/[slug]/page.tsx`
- Create: `app/app/settings/tenant/proposals/modelos/[slug]/_client.tsx`
- Create: `app/app/settings/tenant/proposals/modelos/_client.test.tsx`
- Create: `app/app/settings/tenant/proposals/modelos/[slug]/_client.test.tsx`
- Modify: `app/app/settings/tenant/proposals/_client.tsx` (link para Modelos)
- Modify: `lib/navigation/catalogo.ts`
- Modify: `lib/i18n/dicionario.ts`

**Interfaces:**
- Consumes: as rotas das Tasks 4 e 5.
- Produces: `/app/settings/tenant/proposals/modelos` (lista + importar) e `/app/settings/tenant/proposals/modelos/[slug]` (editor; `slug = "novo"` edita o resultado da importação, lido do `sessionStorage` na chave `modelo-importado`).

- [ ] **Step 1: Medir os moldes** — antes de escrever as páginas, leia: `app/app/settings/tenant/proposals/page.tsx` (como a página server resolve papel e redireciona), `app/app/settings/tenant/proposals/_client.tsx` (componentes de UI usados) e `components/ai/NovoMaterialDialog.tsx:100-130` (como o upload faz `fetch` com `FormData`, que o `apiClient` não suporta). Siga os três.

- [ ] **Step 2: Página server da lista** — `app/app/settings/tenant/proposals/modelos/page.tsx`, igual à `proposals/page.tsx`, trocando o componente por `ModelosDeProposta` e o `metadata.title` por "Modelos de proposta". Exija `manager` do mesmo jeito que a página de propostas faz.

- [ ] **Step 3: Cliente da lista** — `app/app/settings/tenant/proposals/modelos/_client.tsx`:

```tsx
"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/wrappers";

interface ModeloListado {
  slug: string;
  nome: string;
  origem: "plataforma" | "personalizado" | "empresa";
  secoes: number;
  version: number;
}

const ROTULO_DA_ORIGEM: Record<ModeloListado["origem"], string> = {
  plataforma: "Da plataforma",
  personalizado: "Personalizado",
  empresa: "Da empresa",
};

export const CHAVE_DO_MODELO_IMPORTADO = "modelo-importado";

export function ModelosDeProposta() {
  const t = useT();
  const router = useRouter();
  const [modelos, setModelos] = useState<ModeloListado[] | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const [recarga, setRecarga] = useState(0);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get<ApiSuccess<ModeloListado[]>>("/api/v1/settings/proposal-templates", { signal: controller.signal })
      .then((res) => !controller.signal.aborted && setModelos(res.data))
      .catch((e: unknown) => !controller.signal.aborted && showApiError(e));
    return () => controller.abort();
  }, [recarga]);

  async function acao(fn: () => Promise<unknown>) {
    setOcupado(true);
    try {
      await fn();
      setRecarga((n) => n + 1);
    } catch (e) {
      showApiError(e);
    } finally {
      setOcupado(false);
    }
  }

  async function importar(file: File) {
    setOcupado(true);
    setMensagem(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/v1/settings/proposal-templates/importar", { method: "POST", body: form, credentials: "same-origin" });
      const corpo = (await res.json()) as { data?: { disponivel: boolean; motivo?: string; modelo?: unknown }; error?: { message: string } };
      if (!res.ok) {
        setMensagem(corpo.error?.message ?? t("Não consegui ler este arquivo."));
        return;
      }
      if (!corpo.data?.disponivel) {
        setMensagem(corpo.data?.motivo ?? t("A IA não está disponível agora."));
        return;
      }
      if (!corpo.data.modelo) {
        setMensagem(t("A IA não conseguiu montar um modelo com este arquivo."));
        return;
      }
      try {
        window.sessionStorage.setItem(CHAVE_DO_MODELO_IMPORTADO, JSON.stringify(corpo.data.modelo));
      } catch {
        setMensagem(t("O navegador bloqueou o armazenamento temporário; libere e tente de novo."));
        return;
      }
      router.push("/app/settings/tenant/proposals/modelos/novo");
    } finally {
      setOcupado(false);
    }
  }

  if (!modelos) return <div className="p-6">{t("Carregando…")}</div>;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">{t("Modelos de proposta")}</h1>

      <section className="space-y-2 rounded-lg border p-4">
        <h2 className="font-medium">{t("Criar a partir da proposta que a empresa já usa")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("Envie um PDF, .md ou .txt de até 5 MB. A IA divide em seções e troca os dados do cliente por campos; você revisa antes de salvar.")}
        </p>
        <input
          ref={arquivo}
          type="file"
          accept=".pdf,.md,.txt,application/pdf,text/plain,text/markdown"
          aria-label={t("Arquivo da proposta")}
          disabled={ocupado}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importar(f);
            e.target.value = "";
          }}
        />
        {mensagem ? <p role="alert" className="text-sm text-red-700">{mensagem}</p> : null}
      </section>

      <section className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1 space-y-1">
          <span className="text-sm font-medium">{t("Novo modelo em branco")}</span>
          <Input value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} placeholder={t("Ex.: Locação por temporada")} />
        </label>
        <Button
          disabled={ocupado || nomeNovo.trim().length < 2}
          onClick={() =>
            acao(async () => {
              const res = await apiClient.post<ApiSuccess<{ slug: string }>>("/api/v1/settings/proposal-templates", { acao: "novo", nome: nomeNovo.trim() });
              router.push(`/app/settings/tenant/proposals/modelos/${res.data.slug}`);
            })
          }
        >
          {t("Criar")}
        </Button>
      </section>

      <ul className="divide-y rounded-lg border">
        {modelos.map((m) => (
          <li key={m.slug} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div>
              <div className="font-medium">{m.nome}</div>
              <div className="text-xs text-muted-foreground">
                {t(ROTULO_DA_ORIGEM[m.origem])} · {m.secoes} {t("seções")}
              </div>
            </div>
            <div className="flex gap-2">
              {m.origem === "plataforma" ? (
                <Button size="sm" variant="outline" disabled={ocupado}
                  onClick={() => acao(async () => {
                    await apiClient.post("/api/v1/settings/proposal-templates", { acao: "personalizar", base_slug: m.slug });
                    router.push(`/app/settings/tenant/proposals/modelos/${m.slug}`);
                  })}>
                  {t("Personalizar")}
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" asChild>
                    <Link href={`/app/settings/tenant/proposals/modelos/${m.slug}`}>{t("Editar")}</Link>
                  </Button>
                  <Button size="sm" variant="ghost" disabled={ocupado}
                    onClick={() => {
                      const pergunta = m.origem === "personalizado"
                        ? t("Voltar ao modelo da plataforma? As mudanças da empresa deixam de valer nas próximas propostas.")
                        : t("Remover este modelo? As propostas já enviadas não mudam.");
                      if (window.confirm(pergunta)) void acao(() => apiClient.delete(`/api/v1/settings/proposal-templates/${m.slug}`));
                    }}>
                    {m.origem === "personalizado" ? t("Voltar ao modelo da plataforma") : t("Remover")}
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

Medido ao escrever: `Button` aceita `asChild` (`components/ui/button.tsx`) e `apiClient.delete` existe (usado em `app/app/proposals/[id]/_client.tsx`).

- [ ] **Step 4: Editor** — `app/app/settings/tenant/proposals/modelos/[slug]/page.tsx` (server, igual à da lista, passando `slug` de `params`) e `.../[slug]/_client.tsx`:

```tsx
"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import { apiClient } from "@/lib/api/client";
import type { ApiSuccess } from "@/lib/api/wrappers";
import { rotuloDaVariavel } from "@/lib/propostas/documento/rotulos-das-variaveis";
import { CHAVE_DO_MODELO_IMPORTADO } from "../_client";

interface Secao { id: string; title: string; body: string; required: boolean; conditional: boolean }
interface Modelo { nome: string; descricao: string | null; sections: Secao[]; sectionOrder: string[]; origem?: string }

const VARIAVEL = /\{\{([a-zA-Z0-9_.]+)\}\}/g;

function idLivre(secoes: Secao[]): string {
  let n = secoes.length + 1;
  while (secoes.some((s) => s.id === `secao_${n}`)) n++;
  return `secao_${n}`;
}

export function EditorDeModelo({ slug }: { slug: string }) {
  const t = useT();
  const router = useRouter();
  const [modelo, setModelo] = useState<Modelo | null>(null);
  const [erros, setErros] = useState<Array<{ campo: string; mensagem: string }>>([]);
  const [ocupado, setOcupado] = useState(false);
  const importado = slug === "novo";

  useEffect(() => {
    if (importado) {
      try {
        const bruto = window.sessionStorage.getItem(CHAVE_DO_MODELO_IMPORTADO);
        if (bruto) {
          const m = JSON.parse(bruto) as Modelo;
          setModelo({ ...m, descricao: m.descricao ?? null, sections: m.sections.map((s) => ({ ...s })), sectionOrder: m.sectionOrder });
          return;
        }
      } catch {
        /* sem armazenamento: cai no aviso abaixo */
      }
      setModelo({ nome: "", descricao: null, sections: [], sectionOrder: [] });
      return;
    }
    const controller = new AbortController();
    apiClient
      .get<ApiSuccess<Modelo>>(`/api/v1/settings/proposal-templates/${slug}`, { signal: controller.signal })
      .then((res) => !controller.signal.aborted && setModelo(res.data))
      .catch((e: unknown) => !controller.signal.aborted && showApiError(e));
    return () => controller.abort();
  }, [slug, importado]);

  const variaveisUsadas = useMemo(() => {
    const achadas = new Set<string>();
    for (const s of modelo?.sections ?? []) for (const m of s.body.matchAll(VARIAVEL)) achadas.add(m[1]!);
    return [...achadas];
  }, [modelo]);

  if (!modelo) return <div className="p-6">{t("Carregando…")}</div>;
  const somenteLeitura = modelo.origem === "plataforma";

  const mudarSecao = (i: number, patch: Partial<Secao>) =>
    setModelo((m) => m && { ...m, sections: m.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const mover = (i: number, delta: -1 | 1) =>
    setModelo((m) => {
      if (!m) return m;
      const j = i + delta;
      if (j < 0 || j >= m.sections.length) return m;
      const s = [...m.sections];
      [s[i], s[j]] = [s[j]!, s[i]!];
      return { ...m, sections: s };
    });

  async function salvar() {
    if (!modelo) return;
    setOcupado(true);
    setErros([]);
    const corpo = {
      nome: modelo.nome,
      descricao: modelo.descricao,
      sections: modelo.sections,
      section_order: modelo.sections.map((s) => s.id),
    };
    try {
      if (importado) {
        const res = await apiClient.post<ApiSuccess<{ slug: string }>>("/api/v1/settings/proposal-templates", { acao: "novo", ...corpo });
        try { window.sessionStorage.removeItem(CHAVE_DO_MODELO_IMPORTADO); } catch { /* ignore */ }
        router.replace(`/app/settings/tenant/proposals/modelos/${res.data.slug}`);
      } else {
        await apiClient.patch(`/api/v1/settings/proposal-templates/${slug}`, corpo);
        router.push("/app/settings/tenant/proposals/modelos");
      }
    } catch (e) {
      const detalhes = (e as { details?: { erros?: Array<{ campo: string; mensagem: string }> } }).details;
      if (detalhes?.erros) setErros(detalhes.erros);
      showApiError(e);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-6 lg:grid-cols-[1fr_16rem]">
      <div className="space-y-4">
        {importado && modelo.sections.length === 0 ? (
          <p role="alert" className="text-sm text-amber-800">{t("O modelo importado não está mais disponível. Envie o arquivo de novo.")}</p>
        ) : null}
        {somenteLeitura ? (
          <p className="text-sm text-muted-foreground">{t("Este é um modelo da plataforma. Personalize-o na lista para editar.")}</p>
        ) : null}
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("Nome do modelo")}</span>
          <Input value={modelo.nome} disabled={somenteLeitura} onChange={(e) => setModelo({ ...modelo, nome: e.target.value })} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{t("Para que serve (opcional)")}</span>
          <Input value={modelo.descricao ?? ""} disabled={somenteLeitura} onChange={(e) => setModelo({ ...modelo, descricao: e.target.value || null })} />
        </label>

        {erros.length > 0 ? (
          <ul role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {erros.map((e, i) => <li key={i}>{t(e.mensagem)}</li>)}
          </ul>
        ) : null}

        {modelo.sections.map((s, i) => (
          <div key={`${s.id}-${i}`} className="space-y-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label={t("Título da seção")} value={s.title} disabled={somenteLeitura} onChange={(e) => mudarSecao(i, { title: e.target.value })} className="flex-1" />
              {!somenteLeitura ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => mover(i, -1)} aria-label={t("Subir seção")}>↑</Button>
                  <Button size="sm" variant="ghost" onClick={() => mover(i, 1)} aria-label={t("Descer seção")}>↓</Button>
                  <Button size="sm" variant="ghost" onClick={() => setModelo({ ...modelo, sections: modelo.sections.filter((_, j) => j !== i) })}>{t("Remover")}</Button>
                </>
              ) : null}
            </div>
            <Textarea aria-label={t("Texto da seção")} value={s.body} disabled={somenteLeitura} rows={4} onChange={(e) => mudarSecao(i, { body: e.target.value })} />
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={s.required} disabled={somenteLeitura} onChange={(e) => mudarSecao(i, { required: e.target.checked, conditional: e.target.checked ? false : s.conditional })} />
                {t("Obrigatória")}
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={s.conditional} disabled={somenteLeitura} onChange={(e) => mudarSecao(i, { conditional: e.target.checked, required: e.target.checked ? false : s.required })} />
                {t("Só aparece se tiver dado")}
              </label>
            </div>
          </div>
        ))}

        {!somenteLeitura ? (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setModelo({ ...modelo, sections: [...modelo.sections, { id: idLivre(modelo.sections), title: "", body: "", required: true, conditional: false }] })}>
              {t("+ Seção")}
            </Button>
            <Button onClick={salvar} disabled={ocupado}>{ocupado ? t("Salvando…") : t("Salvar modelo")}</Button>
          </div>
        ) : null}
      </div>

      <aside className="space-y-2 text-sm">
        <h2 className="font-medium">{t("Campos usados")}</h2>
        <p className="text-xs text-muted-foreground">{t("Escreva {{campo}} no texto; a proposta troca pelo valor de cada cliente.")}</p>
        <ul className="space-y-1">
          {variaveisUsadas.map((v) => (
            <li key={v}><code className="text-xs">{`{{${v}}}`}</code> — {t(rotuloDaVariavel(v))}</li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
```

Medido ao escrever: o `apiClient` lança `ApiError` com `details` público (`lib/api/types.ts:15-25`), que é o que o `catch` lê. O `setModelo` dentro do `useEffect` cai na regra `react-hooks/set-state-in-effect`, que está como `warn` (`eslint.config.mjs:31`) e não reprova o `pnpm lint`; fica no efeito de propósito, porque ler `sessionStorage` num inicializador de `useState` rodaria também na renderização do servidor.

- [ ] **Step 5: Testes das telas** — `modelos/_client.test.tsx`: (1) lista mostra "Da plataforma" e "Personalizar"; (2) "Personalizar" chama `POST` com `{ acao: "personalizar", base_slug }`; (3) "Voltar ao modelo da plataforma" com `confirm` falso não chama `DELETE`. `[slug]/_client.test.tsx`: (1) modelo da plataforma abre só leitura (sem botão "Salvar modelo"); (2) editar título e salvar chama `PATCH` com `section_order` na ordem da tela; (3) "↓" troca a ordem enviada; (4) com `slug="novo"` e `sessionStorage` preenchido, salvar chama `POST` `acao: "novo"`. Mocks no molde de `app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx` (mais `next/navigation` → `useRouter: () => ({ push: vi.fn(), replace: vi.fn() })`).

- [ ] **Step 6: Porta e link** — em `lib/navigation/catalogo.ts`, logo depois da entrada `href: "/app/settings/tenant/proposals"` (termina em `},`), acrescente:

```typescript
  {
    href: "/app/settings/tenant/proposals/modelos",
    label: "Modelos de proposta",
    description: "Personalize os modelos da plataforma ou crie os da sua empresa, inclusive a partir de uma proposta que você já usa.",
    icon: "FileText",
    group: "organizacao",
    section: "Sua empresa",
    minRole: "manager",
    capacidade: "propostas",
    // SEM `sidebar`, como a tela-mãe de Propostas: chega-se por Configurações.
  },
```

Meça antes: `capacidade` é chave aceita no catálogo (a entrada `/app/proposals` usa) e `icon: "FileText"` existe no conjunto de ícones.

E em `app/app/settings/tenant/proposals/_client.tsx`, logo depois do `<h1>`, acrescente:

```tsx
      <p className="text-sm">
        <Link href="/app/settings/tenant/proposals/modelos" className="underline underline-offset-4">
          {t("Modelos de proposta")}
        </Link>
      </p>
```
(e `import Link from "next/link";` no topo).

- [ ] **Step 7: Traduções** — uma entrada em espanhol para cada texto novo das Steps 3, 4 e 6 que ainda não exista no `DICIONARIO` (confira cada um com `grep`). A lista: "Modelos de proposta", "Criar a partir da proposta que a empresa já usa", "Envie um PDF, .md ou .txt de até 5 MB. A IA divide em seções e troca os dados do cliente por campos; você revisa antes de salvar.", "Arquivo da proposta", "A IA não está disponível agora.", "A IA não conseguiu montar um modelo com este arquivo.", "O navegador bloqueou o armazenamento temporário; libere e tente de novo.", "Novo modelo em branco", "Ex.: Locação por temporada", "Criar", "seções", "Personalizar", "Editar", "Voltar ao modelo da plataforma? As mudanças da empresa deixam de valer nas próximas propostas.", "Remover este modelo? As propostas já enviadas não mudam.", "Voltar ao modelo da plataforma", "Remover", "Da plataforma", "Personalizado", "Da empresa", "O modelo importado não está mais disponível. Envie o arquivo de novo.", "Este é um modelo da plataforma. Personalize-o na lista para editar.", "Nome do modelo", "Para que serve (opcional)", "Título da seção", "Subir seção", "Descer seção", "Texto da seção", "Obrigatória", "Só aparece se tiver dado", "+ Seção", "Salvar modelo", "Campos usados", "Escreva {{campo}} no texto; a proposta troca pelo valor de cada cliente.", e as mensagens de `validarModelo` (Task 3), que a tela mostra por `t(e.mensagem)`.

- [ ] **Step 8: Rodar e ver passar**

Run: `npx vitest run app/app/settings/tenant/proposals tests/unit/navegacao-completude.test.ts tests/unit/i18n-espanhol-cobre-a-tela.test.ts tests/unit/branding.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add app/app/settings/tenant/proposals lib/navigation/catalogo.ts lib/i18n/dicionario.ts
git commit -m "feat(propostas): telas de modelos da empresa — lista, editor e importação de arquivo (P5)"
```

---

### Task 7: A IA e o editor da proposta enxergam os modelos da empresa

**Files:**
- Modify: `lib/mcp/tools/propostas.ts`
- Modify: `lib/mcp/tools/propostas.test.ts`
- Modify: `app/app/proposals/[id]/_components/DocumentoCanvas.tsx`
- Modify: `app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx`

**Interfaces:**
- Consumes: `listarModelosDaOrganizacao` (Task 2); `GET /api/v1/settings/proposal-templates` (Task 4).

- [ ] **Step 1: Teste da ferramenta** — acrescente ao `describe("crm_draft_proposal", ...)`:

```typescript
  it("slug de modelo que não existe: a recusa lista os modelos válidos DESTA organização (P5, D11)", async () => {
    const mundo = montarMundoDeFerramenta();
    const r = (await crmDraftProposal.handler(
      {
        template_slug_sugerido: "imobiliaria",
        lead_id: mundo.leadId,
        titulo: "x",
        conversation_id: mundo.conversationId,
        itens: [{ descricao: "x", quantidade: 1 }],
      },
      mundo.ctx,
    )) as { error?: string; modelos_validos?: Array<{ slug: string; nome: string }> };
    expect(r.error).toMatch(/imobiliaria/);
    expect(r.modelos_validos?.map((m) => m.slug)).toContain("catalogo_imobiliario");
    expect(mundo.propostaCriada).toBeNull();
  });
```

`template_slug_sugerido` continua **opcional** na ferramenta (não existe mais um plano anterior
que o tornasse obrigatório) — este teste só cobre o caminho em que ele foi enviado e não bate
com nenhum modelo, base ou da organização. O teste "slug de modelo válido da organização" desta
mesma Task deve sobrescrever o mock de `proposal_templates` acima para devolver, na listagem,
`data: [{ slug: "catalogo_imobiliario", nome: "Catálogo imobiliário" }]` — meça o formato exato
de `listarModelosDaOrganizacao` (Task 2) antes de montar essa lista mockada.

**Revisado em 26/09/2026 (sem P2/P3 antes deste plano):** não existe um `resolverModelo` já
chamado aqui — a ferramenta hoje (medido em 26/09) só confere `Object.hasOwn(MODELOS_BASE,
input.template_slug_sugerido)`. Esta tarefa faz a troca inteira, do zero.

Antes de colar, no mock `montarMundoDeFerramenta` de `lib/mcp/tools/propostas.test.ts`, acrescente ao `supabase.from` (antes do `throw new Error` de tabela não mockada) o mock de `proposal_templates` que o `resolverModelo` (cópia da organização) e o `listarModelosDaOrganizacao` (listagem) vão consultar:

```typescript
      if (table === "proposal_templates") {
        const cadeia: any = {
          select: () => cadeia,
          eq: () => cadeia,
          maybeSingle: async () => ({ data: null, error: null }),
          then: (resolve: any) => Promise.resolve({ data: [], error: null }).then(resolve),
        };
        return cadeia;
      }
```

(`maybeSingle` atende o `resolverModelo`, que não acha cópia e cai no catálogo do código; `then` atende a listagem — que faz `select().eq().eq()` e é aguardada direto, sem `maybeSingle` — resolvendo com lista vazia. Um teste que precisar de cópia da organização ou de modelos válidos específicos sobrescreve este mock por cima.)

- [ ] **Step 2: Implementar** — em `lib/mcp/tools/propostas.ts`:

a) Imports — acrescente aos já existentes:
```typescript
import { listarModelosDaOrganizacao } from "@/lib/propostas/modelos/catalogo-da-organizacao";
import { resolverModelo } from "@/lib/propostas/modelos/resolver";
```
b) Troque a validação do slug (o texto de hoje):
```typescript
    if (input.template_slug_sugerido !== undefined && !Object.hasOwn(MODELOS_BASE, input.template_slug_sugerido)) {
      return { error: `Modelo "${input.template_slug_sugerido}" não existe no catálogo.` };
    }
```
por:
```typescript
    if (input.template_slug_sugerido !== undefined) {
      const modelo = await resolverModelo(ctx.supabase, ctx.organizationId, input.template_slug_sugerido);
      if (!modelo) {
        const validos = await listarModelosDaOrganizacao(ctx.supabase, ctx.organizationId);
        return {
          error: `Modelo "${input.template_slug_sugerido}" não existe nesta organização. Escolha um de modelos_validos.`,
          modelos_validos: validos.map((m) => ({ slug: m.slug, nome: m.nome })),
        };
      }
    }
```
`MODELOS_BASE` continua importado (usado em `ROTULO_DO_MODELO`/outro trecho do arquivo) — não remova o import se `git grep -c "MODELOS_BASE" lib/mcp/tools/propostas.ts` mostrar mais de uma ocorrência.

c) Na descrição de `template_slug_sugerido`, acrescente ao fim do texto: `" A empresa pode ter modelos próprios: se o tipo de projeto não casar com estes, mande o slug mais próximo e a recusa lista todos os válidos."`

- [ ] **Step 3: O seletor do canvas lista os modelos da organização** — em `DocumentoCanvas.tsx`:

1. Acrescente o estado e a carga, logo depois de `const [recarga, setRecarga] = useState(0);`:
```tsx
  const [modelosDisponiveis, setModelosDisponiveis] = useState<Array<{ slug: string; nome: string }> | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    apiClient
      .get<ApiSuccess<Array<{ slug: string; nome: string }>>>("/api/v1/settings/proposal-templates", { signal: controller.signal })
      .then((res) => !controller.signal.aborted && setModelosDisponiveis(res.data))
      .catch(() => {
        /* sem a lista, o seletor cai nos 8 da plataforma — nunca some */
      });
    return () => controller.abort();
  }, []);

  const opcoesDeModelo: Array<[string, string]> = modelosDisponiveis
    ? modelosDisponiveis.map((m) => [m.slug, m.nome])
    : Object.entries(ROTULO_DO_MODELO);
```
2. Troque as DUAS ocorrências de `Object.entries(ROTULO_DO_MODELO).map(([slug, rotulo]) => (` por `opcoesDeModelo.map(([slug, rotulo]) => (`.
3. O rótulo da sugestão (`ROTULO_DO_MODELO[doc.modeloSlugSugerido]`) passa a ser `opcoesDeModelo.find(([s]) => s === doc.modeloSlugSugerido)?.[1]`.

- [ ] **Step 4: Teste do canvas** — os testes do canvas mockam `apiClient.get` com um único `mockResolvedValue`; agora há duas chamadas. Troque, nos testes do arquivo, `get.mockResolvedValue({ data: X })` por:
```typescript
get.mockImplementation(async (url: string) =>
  url.includes("/settings/proposal-templates") ? { data: [{ slug: "site_institucional", nome: "Site institucional" }, { slug: "empresa_locacao", nome: "Locação" }] } : { data: X },
);
```
e acrescente o caso: "o seletor mostra o modelo da empresa" (`screen.findByRole("option", { name: "Locação" })`). O caso antigo "mostra um seletor manual com os 8 modelos" passa a checar uma opção da lista mockada.

- [ ] **Step 5: Rodar, gates e commit**

```bash
npx vitest run lib/mcp/tools/propostas.test.ts "app/app/proposals/[id]/" lib/propostas
pnpm typecheck && pnpm lint
git add lib/mcp/tools/propostas.ts lib/mcp/tools/propostas.test.ts "app/app/proposals/[id]/_components/DocumentoCanvas.tsx" "app/app/proposals/[id]/_components/DocumentoCanvas.test.tsx"
git commit -m "feat(propostas): IA e editor da proposta enxergam os modelos da empresa (P5)"
```

---

### Task 8: Fragmento e fechamento

- [ ] **Step 1** — crie `.changes/modelos-de-proposta-da-empresa.md`:

```markdown
---
impacto: capacidade_nova
secao: adicionado
titulo: A empresa cadastra os próprios modelos de proposta
---

Em Configurações › Propostas › Modelos dá para personalizar os modelos que vêm com o sistema, criar modelos próprios e — o mais rápido — enviar a proposta que a empresa já usa (PDF ou texto): o assistente a divide em seções e troca os dados de cliente por campos, e você revisa antes de salvar. As propostas novas passam a usar esses modelos, e o assistente de atendimento também os reconhece. Só quem é gestor ou administrador altera modelos.
```

- [ ] **Step 2**

```bash
pnpm release:conferir
npx vitest run lib/propostas lib/mcp/tools/propostas.test.ts "app/api/v1/settings/proposal-templates" "app/app/settings/tenant/proposals" "app/app/proposals" tests/unit/navegacao-completude.test.ts tests/unit/pontos-de-ia-completude.test.ts tests/unit/manifest-x-migrations.test.ts > "$TMP/p5-depois.log" 2>&1; echo "exit=$?"
grep -aE "Test Files|Tests |Errors " "$TMP/p5-depois.log" | tail -3
pnpm typecheck && pnpm lint && pnpm lint:channels && pnpm checar:colisao-de-migration
git add .changes/modelos-de-proposta-da-empresa.md
git commit -m "docs(release): fragmento do P5 da proposta"
```

- [ ] **Step 3: Relatório para a sessão Claude** — commits, rodapés, gates, as sabotagens (Tasks 4, 5), o número de migration usado e a saída de `pnpm checar:colisao-de-migration`. **Não empurre.** Lembre no relatório que o invariante da Task 1 só roda no CI (`invariants`).

## Roteiro de prova na tela (para o dono)

1. Configurações › Propostas › **Modelos de proposta**: os 8 aparecem como "Da plataforma".
2. **Personalizar** "Catálogo imobiliário", mudar o texto de uma seção, salvar; criar um rascunho com esse modelo e ver o texto novo.
3. **Criar a partir da proposta que a empresa já usa**: enviar um PDF de proposta real; revisar as seções e os campos na lateral; salvar.
4. No WhatsApp de teste, pedir orçamento de algo que case com o modelo novo; o rascunho usa o modelo da empresa.
5. **Erro de propósito:** enviar um `.docx` (instrução de exportar); enviar um PDF escaneado (mensagem de "arquivo sem texto"); entrar como `agent` e tentar salvar um modelo (recusado).

## Self-Review

- Spec Item 5: comportamentos 1 (Tasks 2, 6), 2 (Tasks 4, 6), 3 (Tasks 3, 4, 6), 4 (Task 6), 5 (Tasks 5, 6), 6 (Task 7), 7 (Task 7), 8 (Tasks 1, 4). D8 (cópia com o mesmo slug), D9 (Task 1), D10 (Task 5 não grava arquivo), D11 (Task 7, sem ferramenta nova).
- A única migration da série está aqui, com a tripla e o invariante ajustado no mesmo commit.
- Pontos marcados "meça antes de colar" são os que dependem de forma de código que este plano não fixou (erro do `apiClient`, `asChild`, exportar de `route.ts`) — cada um diz o comando e o que fazer se a forma for outra.
