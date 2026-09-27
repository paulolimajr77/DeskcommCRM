/**
 * O CARTÃO QUE GRITA SÓ QUANDO O AVISO É NOVO.
 *
 * O `proposta_pronta_para_revisao` nasce no worker e o CRM está aberto. A tela
 * tem duas exigências opostas, e é a segunda que costuma ser implementada: o
 * aviso tem que aparecer sem ninguém abrir a Central, e NÃO pode reaparecer a
 * cada F5 por causa dos avisos que já estavam abertos. Daí a primeira carga só
 * registrar ids.
 *
 * O `o-sino-conta-o-que-ninguem-olhou.test.tsx` mede a outra metade do mesmo
 * arquivo de avisos, pelo lado do sino (a contagem de não vistos). Aqui é o
 * lado da TELA: o que acontece quando o polling traz um item que nasceu depois
 * que a pessoa abriu o CRM.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentInboxItem } from "@/hooks/ai/useAgentInbox";

// O que o `useAgentInbox` devolve, trocado entre uma carga e outra. É `hoisted`
// porque o mock do módulo roda ANTES do corpo deste arquivo: um `let` aqui
// estaria em TDZ quando o componente o pedisse pela primeira vez.
const caixa = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("@/hooks/ai/useAgentInbox", () => ({ useAgentInbox: () => ({ data: caixa.data }) }));
// Mesmo gate do `AlertsBell`: `useAuth` para o papel, `destinosDaInterface`
// para a interface da organização. A visibilidade do cartão NÃO é o que este
// arquivo mede — deixar a Central sempre liberada é o que separa "o cartão não
// apareceu" de "a interface escondeu a Central".
vi.mock("@/hooks/auth/AuthProvider", () => ({
  useAuth: () => ({
    user: { id: "user-1", is_platform_admin: false, support: null },
    activeOrg: { orgId: "org-1", name: "Imobiliária Rio", role: "agent" },
  }),
  usePermission: () => true,
}));
vi.mock("@/lib/navigation/interface", () => ({ destinosDaInterface: () => [{ href: "/app/ai/inbox" }] }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (s: string) => s }));

import { AvisoDePropostaEmDestaque } from "./AvisoDePropostaEmDestaque";

const ANTIGO: AgentInboxItem = {
  id: "antigo-1",
  kind: "proposta_pronta_para_revisao",
  severity: "info",
  title: "Proposta antiga — Casa do Ipê",
  body: null,
  ref_kind: "proposal",
  ref_id: "prop-antiga",
  status: "open",
  created_at: "2026-09-20T10:00:00Z",
  destination: { estado: "indisponivel", orientacao: "" },
};

const NOVO: AgentInboxItem = {
  id: "novo-1",
  kind: "proposta_pronta_para_revisao",
  severity: "info",
  // O título é DADO (nome da proposta, do cliente): entra como veio, nunca por
  // t(). Por isso o caso olha a string inteira.
  title: "Proposta da Ana — Condomínio Alvorada",
  body: null,
  ref_kind: "proposal",
  ref_id: "prop-nova",
  status: "open",
  created_at: "2026-09-27T10:00:00Z",
  destination: { estado: "disponivel", rotulo: "Abrir proposta", href: "/app/proposals/prop-nova" },
};

const DE_OUTRO_KIND: AgentInboxItem = {
  ...NOVO,
  id: "novo-2",
  kind: "budget_exceeded",
  title: "Orçamento de IA estourado",
  destination: { estado: "indisponivel", orientacao: "" },
};

/** Carga da Central: SEMPRE um objeto novo, porque o efeito só refaz com `data` novo. */
function abertos(items: AgentInboxItem[]) {
  return { items, open_count: items.length, unseen_count: items.length };
}

const cartao = () => screen.queryByTestId("aviso-proposta-destaque");

describe("aviso de proposta em destaque", () => {
  beforeEach(() => {
    caixa.data = undefined;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("primeira carga com aviso de proposta NÃO mostra o cartão", () => {
    // A carga que abre a tela já pode trazer avisos antigos. Mostrar o cartão
    // aqui é o defeito: o F5 do fim da tarde repetiria um grito de ontem.
    caixa.data = abertos([ANTIGO]);
    const { rerender } = render(<AvisoDePropostaEmDestaque />);
    expect(cartao()).toBeNull();

    // E o polling que devolve a MESMA lista também não pode acordar nada.
    caixa.data = abertos([ANTIGO]);
    rerender(<AvisoDePropostaEmDestaque />);
    expect(cartao()).toBeNull();
  });

  it("carga seguinte com aviso NOVO mostra o cartão com o título e o destino", async () => {
    caixa.data = abertos([ANTIGO]);
    const { rerender } = render(<AvisoDePropostaEmDestaque />);
    expect(cartao()).toBeNull();

    caixa.data = abertos([ANTIGO, NOVO]);
    rerender(<AvisoDePropostaEmDestaque />);

    const aviso = await screen.findByTestId("aviso-proposta-destaque");
    expect(aviso).toHaveTextContent("Proposta da Ana — Condomínio Alvorada");
    expect(aviso).toHaveTextContent("A IA preparou uma proposta. Confira antes de enviar.");
    expect(screen.getByRole("link", { name: "Abrir proposta" })).toHaveAttribute(
      "href",
      "/app/proposals/prop-nova",
    );
  });

  it("aviso NOVO de outro kind não mostra o cartão", () => {
    // O cartão é do `proposta_pronta_para_revisao`. Um handoff ou um orçamento
    // estourado é a Central que trata — se o cartão aparece para qualquer item
    // novo, ele vira sino e para de informar.
    caixa.data = abertos([ANTIGO]);
    const { rerender } = render(<AvisoDePropostaEmDestaque />);

    caixa.data = abertos([ANTIGO, DE_OUTRO_KIND]);
    rerender(<AvisoDePropostaEmDestaque />);
    expect(cartao()).toBeNull();
  });

  it("Dispensar esconde o cartão, e ele não volta na carga seguinte", async () => {
    caixa.data = abertos([ANTIGO]);
    const { rerender } = render(<AvisoDePropostaEmDestaque />);
    caixa.data = abertos([ANTIGO, NOVO]);
    rerender(<AvisoDePropostaEmDestaque />);
    await screen.findByTestId("aviso-proposta-destaque");

    fireEvent.click(await screen.findByTestId("aviso-proposta-dispensar"));
    expect(cartao()).toBeNull();

    // E a carga seguinte não ressuscita: dispensar vale para o aviso, não só
    // para o clique.
    caixa.data = abertos([ANTIGO, NOVO]);
    rerender(<AvisoDePropostaEmDestaque />);
    expect(cartao()).toBeNull();
  });

  it("CONTROLE — com Notification presente, o aviso novo notifica o sistema", async () => {
    // O caso de baixo (os dois ausentes) passaria por vacuidade num componente
    // que nunca chamasse nenhum dos dois. Aqui a notificação EXISTE e é
    // chamada — o que prova que o efeito de "aviso novo" roda de verdade.
    //
    // O som não entra: `oscilador.start()` não tem efeito observável, e o
    // componente lê `window.AudioContext` (o objeto do jsdom), não o global do
    // teste — um stub que não chega lá daria um controle verde sobre vazio. O
    // que o som tem de não quebrar é medido no caso seguinte, pelo CARTÃO.
    const notified: string[] = [];
    vi.stubGlobal(
      "Notification",
      class {
        static permission = "granted";
        constructor(titulo: string) {
          notified.push(titulo);
        }
      },
    );

    caixa.data = abertos([ANTIGO]);
    const { rerender } = render(<AvisoDePropostaEmDestaque />);
    caixa.data = abertos([ANTIGO, NOVO]);
    rerender(<AvisoDePropostaEmDestaque />);
    await screen.findByTestId("aviso-proposta-destaque");

    expect(notified).toEqual(["Proposta da Ana — Condomínio Alvorada"]);
  });

  it("sem window.Notification e sem AudioContext nada quebra", async () => {
    // jsdom não implementa nenhum dos dois — e é também o caso de navegador
    // antigo e de instalação com permissão negada. O aviso tem que aparecer
    // igual, porque o CARTÃO é a notificação; som e notificação de sistema são
    // o PLUS. Aqui os dois são explicitamente AUSENTES, e o que se prova é o
    // cartão — o caminho que o controle acima mostra ser alcançado.
    vi.stubGlobal("Notification", undefined);
    vi.stubGlobal("AudioContext", undefined);
    vi.stubGlobal("webkitAudioContext", undefined);

    caixa.data = abertos([ANTIGO]);
    const { rerender } = render(<AvisoDePropostaEmDestaque />);
    caixa.data = abertos([ANTIGO, NOVO]);
    rerender(<AvisoDePropostaEmDestaque />);

    expect(await screen.findByTestId("aviso-proposta-destaque")).toHaveTextContent(
      "Proposta da Ana — Condomínio Alvorada",
    );
  });
});
