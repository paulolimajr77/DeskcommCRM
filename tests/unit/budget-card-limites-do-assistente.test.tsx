import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * OS LIMITES DE PERGUNTAS DO ASSISTENTE NO CARTÃO ORÇAMENTO (T6).
 *
 * O administrador define quantas perguntas cada pessoa (e, se quiser, a
 * organização inteira) pode fazer por dia. O que este arquivo prende:
 *  1. o diálogo mostra o valor atual e MANDA o que foi digitado — e a
 *     organização vazia vai como `null` (sem limite), nunca como 0 nem omitida;
 *  2. valor fora da faixa desabilita o salvar, com a faixa dita em palavras;
 *  3. quem não é administrador vê o limite, mas não o botão de editar;
 *  4. o diálogo reaberto volta ao valor salvo (não guarda o que foi digitado e
 *     descartado);
 *  5. em espanhol, as frases novas saem do dicionário.
 */

vi.mock("@/lib/api/client", () => ({
  apiClient: { get: vi.fn(), patch: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

import { BudgetCard } from "@/components/ai/BudgetCard";
import { apiClient } from "@/lib/api/client";
import type { BudgetStatus } from "@/lib/ai/budget/check";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

function estado(over: Partial<BudgetStatus> = {}): BudgetStatus {
  return {
    organization_id: "22222222-2222-4222-8222-222222222222",
    monthly_limit_cents: 5000,
    current_month_consumed_cents: 1234,
    pct: 24.68,
    alarm_threshold_pct: 80,
    enforcement_mode: "off",
    enforcement_effective_at: null,
    enforcement_env: "on",
    blocked_now: false,
    gasto_incompleto: false,
    current_period_start: "2026-03-01",
    last_alarm_sent_at: null,
    updated_at: "2026-08-15T00:00:00.000Z",
    assistant_questions_per_user_day: 60,
    assistant_questions_per_org_day: null,
    ...over,
  };
}

function montar(status: BudgetStatus, opcoes: { isAdmin?: boolean; locale?: string } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IdiomaProvider locale={opcoes.locale ?? "pt-BR"}>
        <BudgetCard initialData={status} isAdmin={opcoes.isAdmin ?? true} />
      </IdiomaProvider>
    </QueryClientProvider>,
  );
}

async function abrirDialogo() {
  await userEvent.click(screen.getByRole("button", { name: "Editar limite" }));
}

function campoDaPessoa(): HTMLInputElement {
  return screen.getByLabelText(/por pessoa, por dia/iu) as HTMLInputElement;
}

function campoDaOrganizacao(): HTMLInputElement {
  return screen.getByLabelText(/por organização, por dia/iu) as HTMLInputElement;
}

async function digitar(campo: HTMLElement, texto: string) {
  await userEvent.clear(campo);
  if (texto !== "") await userEvent.type(campo, texto);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(apiClient.patch).mockResolvedValue({ data: estado() });
});

describe("o diálogo do administrador", () => {
  it("abre com o valor atual da pessoa e a organização vazia (sem limite)", async () => {
    montar(estado());
    await abrirDialogo();
    expect(campoDaPessoa()).toHaveValue(60);
    expect(campoDaOrganizacao()).toHaveValue(null);
    expect(screen.getByText("Perguntas ao assistente")).toBeInTheDocument();
  });

  it("abre com o limite da organização quando ele existe", async () => {
    montar(estado({ assistant_questions_per_user_day: 25, assistant_questions_per_org_day: 400 }));
    await abrirDialogo();
    expect(campoDaPessoa()).toHaveValue(25);
    expect(campoDaOrganizacao()).toHaveValue(400);
  });

  it("digitar 30 e 200 e salvar manda exatamente esses dois números", async () => {
    montar(estado());
    await abrirDialogo();
    await digitar(campoDaPessoa(), "30");
    await digitar(campoDaOrganizacao(), "200");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    const [url, corpo] = vi.mocked(apiClient.patch).mock.calls[0] ?? [];
    expect(url).toBe("/api/v1/ai/budget");
    expect(corpo).toMatchObject({ assistant_questions_per_user_day: 30, assistant_questions_per_org_day: 200 });
  });

  it("organização esvaziada vai como null (sem limite), não como 0 nem omitida", async () => {
    montar(estado({ assistant_questions_per_org_day: 200 }));
    await abrirDialogo();
    await digitar(campoDaOrganizacao(), "");
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(apiClient.patch).toHaveBeenCalledTimes(1));
    const [, corpo] = vi.mocked(apiClient.patch).mock.calls[0] ?? [];
    expect(corpo).toHaveProperty("assistant_questions_per_org_day", null);
    expect(corpo).toHaveProperty("assistant_questions_per_user_day", 60);
  });

  it.each([["0"], ["10001"], ["1.5"]])(
    "pessoa com %s: salvar desabilitado e a faixa dita em palavras",
    async (valor) => {
      montar(estado());
      await abrirDialogo();
      await digitar(campoDaPessoa(), valor);
      expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
      expect(screen.getByText("Inteiro entre 1 e 10.000")).toBeInTheDocument();
      expect(apiClient.patch).not.toHaveBeenCalled();
    },
  );

  it.each([["0"], ["100001"], ["2.5"]])(
    "organização com %s: salvar desabilitado e a faixa dita em palavras",
    async (valor) => {
      montar(estado());
      await abrirDialogo();
      await digitar(campoDaOrganizacao(), valor);
      expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
      expect(screen.getByText("Inteiro entre 1 e 100.000")).toBeInTheDocument();
    },
  );

  it("a pessoa vazia também desabilita o salvar (o limite por pessoa é obrigatório)", async () => {
    montar(estado());
    await abrirDialogo();
    await digitar(campoDaPessoa(), "");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeDisabled();
  });

  it("os extremos da faixa são aceitos: 1 e 10000 / 1 e 100000", async () => {
    montar(estado());
    await abrirDialogo();
    await digitar(campoDaPessoa(), "10000");
    await digitar(campoDaOrganizacao(), "100000");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
    await digitar(campoDaPessoa(), "1");
    await digitar(campoDaOrganizacao(), "1");
    expect(screen.getByRole("button", { name: "Salvar" })).toBeEnabled();
  });

  it("reabrir o diálogo depois de cancelar volta ao valor salvo", async () => {
    montar(estado());
    await abrirDialogo();
    await digitar(campoDaPessoa(), "7");
    await digitar(campoDaOrganizacao(), "9");
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Salvar" })).toBeNull());

    await abrirDialogo();
    expect(campoDaPessoa()).toHaveValue(60);
    expect(campoDaOrganizacao()).toHaveValue(null);
    expect(apiClient.patch).not.toHaveBeenCalled();
  });
});

describe("a linha de leitura no cartão", () => {
  it("o gerente (não administrador) vê o limite da pessoa e NÃO vê o botão de editar", () => {
    montar(estado(), { isAdmin: false });
    expect(screen.queryByRole("button", { name: "Editar limite" })).toBeNull();
    expect(screen.getByText(/^Assistente:/u).textContent).toBe("Assistente: 60 perguntas por pessoa por dia");
  });

  it("com limite da organização, a linha cita os dois", () => {
    montar(estado({ assistant_questions_per_org_day: 200 }), { isAdmin: false });
    expect(screen.getByText(/^Assistente:/u).textContent).toBe(
      "Assistente: 60 perguntas por pessoa por dia · 200 por organização por dia",
    );
  });

  it("sem limite da organização, a linha não fala em organização", () => {
    montar(estado({ assistant_questions_per_org_day: null }));
    expect(screen.getByText(/^Assistente:/u).textContent ?? "").not.toContain("organização");
  });
});

describe("em espanhol", () => {
  it("a linha do cartão e a seção do diálogo saem do dicionário", async () => {
    montar(estado({ assistant_questions_per_org_day: 200 }), { locale: "es" });
    expect(screen.getByText(/^Asistente:/u).textContent).toBe(
      "Asistente: 60 preguntas por persona por día · 200 por organización por día",
    );
    await userEvent.click(screen.getByRole("button", { name: "Editar límite" }));
    expect(screen.getByText("Preguntas al asistente")).toBeInTheDocument();
    expect(screen.getByLabelText(/por persona, por día/iu)).toHaveValue(60);
    expect(screen.getByLabelText(/por organización, por día/iu)).toHaveValue(200);
  });
});
