---
impacto: capacidade_nova
secao: adicionado
titulo: Filtre contatos por aniversariantes e comandas por cliente
---

Na listagem de contatos (GET /api/v1/contatos) passou a aceitar o parâmetro `aniversario` com os valores `hoje`, `semana` e `mes`, calculados no fuso da organização. É possível ver, de uma só vez, quem faz aniversário hoje, nesta semana ou neste mês — sem precisar exportar ou filtrar à mão.

Na listagem de comandas (GET /api/v1/financeiro/comandas) passou a aceitar o parâmetro `contact_id` (uuid), para ver apenas as comandas de um cliente. Um `contact_id` inválido retorna 400; um `contact_id` de outra organização retorna lista vazia, nunca erro com dado alheio.

Crédito: @paulolimajr77.
