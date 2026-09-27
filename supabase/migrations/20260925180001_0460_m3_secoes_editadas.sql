-- 20260925180001_0460_m3_secoes_editadas.sql
-- (renumerada de 0417 -> 0441 -> 0460: 0417 e 0441 já estavam tomados por
-- migrations diferentes — o último, 0441, pelo 0441_sons_dos_avisos do
-- upstream; o carimbo 20260925180000 da 0417 também colidia com a
-- 20260925180000_0415_teto_de_tokens_ativos_por_organizacao do upstream e já
-- foi desempatado em +1s (39b6737d2) — o carimbo 20260925180001 fica)
-- M3 (onda de modelos, §11 — canvas) — edição manual por seção. jsonb
-- {secaoId: textoEditado}, nullable, sem CHECK (mapa livre, chave = id de
-- seção do modelo em uso; não há vocabulário fechado a validar no schema).
alter table public.crm_proposals add column if not exists secoes_editadas jsonb;
