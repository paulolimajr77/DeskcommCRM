export type ProposalStatus =
  | "rascunho" | "enviada" | "aceita" | "recusada" | "vencida" | "cancelada" | "substituida";

export interface ProposalItemInput {
  id?: string;
  product_id: string | null;
  descricao: string;
  quantidade: number;
  preco_unitario_cents: number;
  desconto_cents: number;
  position: number;
}

export interface ProposalRow {
  id: string;
  organization_id: string;
  lead_id: string;
  status: ProposalStatus;
  numero: number | null;
  ano: number | null;
  versao: number;
  substitui_id: string | null;
  revision: number;
  total_cents: number;
}
