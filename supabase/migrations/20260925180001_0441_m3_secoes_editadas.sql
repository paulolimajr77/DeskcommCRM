-- 20260925180001_0441_m3_secoes_editadas.sql
-- (renumerada de 0417 -> 0441 ao atualizar a branch com a main: 0417 colidia
-- com 0417_message_failed_vira_gatilho do Rafael, além do timestamp
-- 20260925180000 colidir também com a migration 0415 dele)
-- M3 (onda de modelos, §11 — canvas) — edição manual por seção. jsonb
-- {secaoId: textoEditado}, nullable, sem CHECK (mapa livre, chave = id de
-- seção do modelo em uso; não há vocabulário fechado a validar no schema).
alter table public.crm_proposals add column if not exists secoes_editadas jsonb;
