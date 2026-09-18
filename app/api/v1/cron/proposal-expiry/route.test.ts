import { describe, expect, it } from "vitest";
import { encontrarPropostasVencidas } from "./route";

describe("encontrarPropostasVencidas", () => {
  it("proposta enviada com valid_until no passado: vencida", () => {
    const r = encontrarPropostasVencidas(
      [{ id: "p1", organization_id: "org-1", lead_id: "l1", contact_id: "c1", status: "enviada", valid_until: "2026-09-01" }],
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(1);
  });

  it("valid_until no futuro: não vence", () => {
    const r = encontrarPropostasVencidas(
      [{ id: "p1", organization_id: "org-1", lead_id: "l1", contact_id: "c1", status: "enviada", valid_until: "2026-12-01" }],
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(0);
  });

  it("status já decidido (aceita/recusada): não vence de novo", () => {
    const r = encontrarPropostasVencidas(
      [{ id: "p1", organization_id: "org-1", lead_id: "l1", contact_id: "c1", status: "aceita", valid_until: "2026-09-01" }],
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(0);
  });

  it("valid_until nulo: nunca vence (rascunho sem prazo definido não deveria chegar aqui, mas se chegar, não quebra)", () => {
    const r = encontrarPropostasVencidas(
      [{ id: "p1", organization_id: "org-1", lead_id: "l1", contact_id: "c1", status: "enviada", valid_until: null }],
      new Date("2026-09-17"),
    );
    expect(r).toHaveLength(0);
  });
});
