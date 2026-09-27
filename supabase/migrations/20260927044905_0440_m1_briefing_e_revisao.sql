-- 20260927044905_0440_m1_briefing_e_revisao.sql
-- (renumerada de 0416 -> 0440 ao atualizar a branch com a main: 0416 colidia
-- com 0416_autoria_em_nome_de_na_mensagem do Rafael)
-- M1 (onda de modelos, §5.2 da spec de 21/09) — rascunho confiável.
-- Cinco colunas novas em crm_proposals, todas nullable e sem CHECK fechado
-- (nenhuma tem vocabulário fechado na spec):
--   briefing_json    — insumo estruturado do briefing (segmento, serviço,
--                       estágio, identidade, textos, fotos) — auditável.
--   prazo_dias_uteis — prazo confirmado/autorizado, nunca inferido.
--   pagamento        — texto curto (ex.: "50_50") ou livre validado.
--   resumo_comercial — gerado na emissão (lib/propostas/resumo-comercial.ts),
--                       nunca digitado à mão.
--   version_reason   — motivo da revisão (POST .../revise), opcional.
alter table public.crm_proposals add column if not exists briefing_json jsonb;
alter table public.crm_proposals add column if not exists prazo_dias_uteis int;
alter table public.crm_proposals add column if not exists pagamento text;
alter table public.crm_proposals add column if not exists resumo_comercial text;
alter table public.crm_proposals add column if not exists version_reason text;
