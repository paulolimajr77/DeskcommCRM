import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { VinculoDaMarcacao } from "@/components/agenda/VinculoDaMarcacao";

// `vi.mock` sobe para o topo do arquivo, ANTES das declaracoes — por isso o
// dublê nasce dentro da fábrica, com `vi.hoisted`, e não numa const acima.
// Sem isso o erro e "Cannot access 'api' before initialization", que nao diz
// nada sobre o que houve.
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: api }));

/**
 * O e-mail do convidado só preenchia quando a pessoa ESCOLHIA o cliente na
 * lista — e não quando o cliente já vinha pronto.
 *
 * ## Reproduzido pela tela, 2026-09-13
 *
 * `/app/agenda?contato=<id>` é como se chega à agenda a partir de um contato ou
 * de uma conversa: `EntradaDaAgenda` chama `onContext`, que preenche o cliente
 * direto no estado. Esse caminho nunca passa pela escolha na lista, então o
 * e-mail — que viajava junto do clique — nunca chegava.
 *
 * Medido no navegador, com a instalação real: painel aberto com "Paulo Lima Jr"
 * já no campo do cliente, e o campo do convidado vazio, mostrando só o
 * `cliente@empresa.com` do placeholder. Esse contato TEM e-mail cadastrado.
 *
 * E é o caminho natural de quem marca para um cliente: você está na conversa
 * dele e clica para agendar.
 */

let client: QueryClient;

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  api.get.mockResolvedValue({
    data: {
      contacts: [{ id: "c1", name: "Paulo Lima Jr", email: "paulo@exemplo.com" }],
      conversations: [],
    },
  });
});

afterEach(cleanup);

function montar(props: Partial<React.ComponentProps<typeof VinculoDaMarcacao>> = {}) {
  return render(
    <IdiomaProvider locale="pt">
      <QueryClientProvider client={client}>
        <VinculoDaMarcacao
          contactId="c1"
          conversationId=""
          onChange={() => {}}
          onEmailDoCliente={() => {}}
          {...props}
        />
      </QueryClientProvider>
    </IdiomaProvider>,
  );
}

describe("o cliente que já vem pronto também entrega o e-mail", () => {
  it("⛔ avisa o e-mail quando o cliente chega de fora, sem clique nenhum", async () => {
    const onEmailDoCliente = vi.fn();
    montar({ onEmailDoCliente });
    await waitFor(() => expect(onEmailDoCliente).toHaveBeenCalledWith("paulo@exemplo.com"));
  });

  it("contato sem e-mail avisa ausência, e não deixa lixo do anterior", async () => {
    api.get.mockResolvedValue({
      data: { contacts: [{ id: "c2", name: "CPFL", email: null }], conversations: [] },
    });
    const onEmailDoCliente = vi.fn();
    montar({ contactId: "c2", onEmailDoCliente });
    await waitFor(() => expect(onEmailDoCliente).toHaveBeenCalledWith(null));
  });

  it("⛔ CONTROLE: sem cliente escolhido, NÃO avisa e-mail nenhum", async () => {
    // Sem este par, uma implementação que disparasse sempre passaria no caso de
    // cima — e ficaria mandando `null` em compromisso pessoal, apagando um
    // e-mail que a pessoa tivesse acabado de digitar.
    const onEmailDoCliente = vi.fn();
    montar({ contactId: "", onEmailDoCliente });
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(onEmailDoCliente).not.toHaveBeenCalled();
  });
});
