import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import ts from "typescript";

import { describe, expect, it } from "vitest";

/**
 * O FUSO QUE NÃO EXISTE DERRUBA QUEM O LÊ.
 *
 * ─── O defeito, medido ─────────────────────────────────────────────────────
 *
 * O fuso da agenda do atendente era texto livre validado só por
 * `z.string().min(1).max(64)`. Qualquer coisa passava. E `localMoment`
 * (lib/routing/eligibility) usa `Intl.DateTimeFormat`, que LANÇA `RangeError`
 * num fuso inexistente:
 *
 *   America/Asuncion   → funciona
 *   America/Asunción   → RangeError   ← o acento que um hispanofalante escreve
 *   Asuncion           → RangeError
 *
 * Salvava sem reclamar e derrubava a avaliação de disponibilidade de todo
 * atendente com aquela agenda. O defeito não aparecia na tela que o causou:
 * aparecia no roteamento, como atendente que nunca fica elegível.
 *
 * ─── Duas defesas, e as duas fazem falta ───────────────────────────────────
 *
 * A LISTA impede o erro de digitação, que é a origem. A CHECAGEM defende a API,
 * que aceita qualquer cliente e não passa pela tela.
 */
import { availabilityScheduleSchema } from "@/lib/schemas/routing";
import { FUSOS_OFERECIDOS, fusoValido } from "@/lib/tempo/fusos";

describe("a checagem do fuso", () => {
  it("aceita o que o runtime sabe usar", () => {
    expect(fusoValido("America/Asuncion")).toBe(true);
    expect(fusoValido("America/Sao_Paulo")).toBe(true);
    expect(fusoValido("UTC")).toBe(true);
  });

  it("recusa o acento — o erro que um hispanofalante comete natural", () => {
    expect(fusoValido("America/Asunción")).toBe(false);
  });

  it("recusa nome sem região e lixo", () => {
    expect(fusoValido("Asuncion")).toBe(false);
    expect(fusoValido("xyz")).toBe(false);
    expect(fusoValido("")).toBe(false);
  });

  it("pergunta ao RUNTIME, não a uma lista nossa", () => {
    // A base de fusos muda (países criam e apagam zonas), e quem sabe qual
    // versão está instalada é o próprio runtime. Uma lista nossa responderia
    // "sim" para um código que o `Intl` recusa — e o erro voltaria a aparecer
    // longe daqui.
    const fonte = readFileSync("lib/tempo/fusos.ts", "utf8");
    expect(fonte).toMatch(/new Intl\.DateTimeFormat/);
  });
});

describe("todo fuso oferecido é utilizável", () => {
  it("nenhuma linha da lista derruba quem a usar", () => {
    // Guarda a lista de si mesma: acrescentar um código errado aqui reintroduz
    // exatamente o defeito, e por um caminho que ninguém suspeitaria.
    for (const f of FUSOS_OFERECIDOS) {
      expect(fusoValido(f.codigo), f.codigo).toBe(true);
    }
  });

  it("Assunção está na lista — é o fuso deste país", () => {
    expect(FUSOS_OFERECIDOS.map((f) => f.codigo)).toContain("America/Asuncion");
  });
});

describe("a agenda do atendente rejeita fuso inválido", () => {
  it("recusa, em vez de salvar e quebrar o roteamento depois", () => {
    const r = availabilityScheduleSchema.safeParse({
      timezone: "America/Asunción",
      windows: [],
    });
    expect(r.success).toBe(false);
  });

  it("aceita o válido", () => {
    const r = availabilityScheduleSchema.safeParse({
      timezone: "America/Asuncion",
      windows: [],
    });
    expect(r.success).toBe(true);
  });

  it("sem fuso continua caindo no padrão — não vira erro", () => {
    // Agenda sem fuso é o estado de quem nunca abriu essa tela. Recusá-la
    // quebraria o salvamento de quem só queria mexer nas janelas.
    const r = availabilityScheduleSchema.safeParse({ windows: [] });
    expect(r.success).toBe(true);
  });
});

describe("as telas OFERECEM em vez de pedir para digitar", () => {
  it("o painel anti-banimento", () => {
    const fonte = readFileSync("components/connections/AntiBanSheet.tsx", "utf8");
    expect(fonte).toMatch(/FUSOS_OFERECIDOS\.map/);
    expect(fonte, "ainda é campo de texto").not.toMatch(/aria-label="Fuso horário IANA"\s*\n\s*\/>/);
  });

  it("e a agenda do atendente", () => {
    const fonte = readFileSync("app/app/team/_components/AttendantsClient.tsx", "utf8");
    expect(fonte).toMatch(/FUSOS_OFERECIDOS\.map/);
  });
});


/**
 * NENHUMA TELA DECLARA A PRÓPRIA LISTA DE FUSOS.
 *
 * ─── Por que a cerca por NOME não bastava ───────────────────────────────────
 *
 * Os dois casos acima vigiam duas telas escolhidas a dedo. Enquanto eles
 * ficavam verdes, existiam QUATRO listas divergentes no repositório — e as três
 * que divergiam simplesmente não estavam na cerca. Medido em 2026-09-11: 14
 * entradas em `FUSOS_OFERECIDOS`, 12 no onboarding, 6 em Configurações ›
 * Organização e as mesmas 6 copiadas em Configurações › Perfil.
 *
 * O custo não era estético: quem escolhia **Cuiabá** no onboarding (a única
 * lista que a oferecia) encontrava o campo das Configurações **em branco**, sem
 * conseguir nem confirmar o próprio fuso — e Mato Grosso é UTC−4, uma hora de
 * erro em toda janela de envio e todo lembrete.
 *
 * Cerca por nome só alcança o que alguém lembrou de nomear. Esta varre.
 *
 * ─── Pelo AST, não por texto ───────────────────────────────────────────────
 *
 * A prosa deste repositório cita identificadores de fuso em comentário o tempo
 * todo — o próprio `AntiBanSheet` tem dois, e é uma das telas CERTAS. Uma
 * varredura de texto reprovaria o arquivo por ele explicar a regra. O AST
 * enxerga literais de string; comentário não é literal.
 */
describe("nenhuma tela declara a própria lista de fusos", () => {
  const RAIZ = process.cwd();
  const FUSO = /^(?:America|Europe|Asia|Africa|Australia|Pacific|Atlantic|Indian)\//;

  /** Todo `.tsx` de `app/` e `components/` — as telas, não as bibliotecas. */
  function telas(dir: string, achados: string[] = []): string[] {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") telas(caminho, achados);
      } else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) {
        achados.push(caminho);
      }
    }
    return achados;
  }

  /** Literais de fuso IANA no arquivo — comentários excluídos por construção. */
  function literaisDeFuso(caminho: string): string[] {
    const fonte = readFileSync(caminho, "utf8");
    const arquivo = ts.createSourceFile(caminho, fonte, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const achados = new Set<string>();
    const visitar = (no: ts.Node): void => {
      if (ts.isStringLiteral(no) && FUSO.test(no.text)) achados.add(no.text);
      no.forEachChild(visitar);
    };
    visitar(arquivo);
    return [...achados];
  }

  const arquivos = [join(RAIZ, "app"), join(RAIZ, "components")].flatMap((d) => telas(d));

  it("CONTROLE: a varredura achou as telas (senão ela aprova o vazio)", () => {
    expect(arquivos.length).toBeGreaterThan(50);
  });

  it("duas ou mais opções de fuso no mesmo arquivo é uma LISTA, e lista tem um dono só", () => {
    // Um literal só é um PADRÃO (`"America/Sao_Paulo"` como fallback), e isso
    // segue legítimo. DOIS ou mais é alguém escolhendo o que oferecer, e essa
    // escolha tem endereço: `lib/tempo/fusos.ts`.
    const infratoras = arquivos
      .map((a) => ({ arquivo: relative(RAIZ, a).split(sep).join("/"), fusos: literaisDeFuso(a) }))
      .filter((x) => x.fusos.length >= 2);

    expect(
      infratoras.map((x) => `${x.arquivo} (${x.fusos.join(", ")})`),
      "esta tela escolhe fusos por conta própria — importe `FUSOS_OFERECIDOS` de " +
        "`lib/tempo/fusos.ts`. Quatro listas divergentes já deixaram o campo de " +
        "Configurações em branco para quem mora em Cuiabá.",
    ).toEqual([]);
  });
});
