---
impacto: capacidade_nova
secao: corrigido
titulo: Se alguma peça do banco não voltar depois da atualização, você fica sabendo
---

A atualização pausa serviços e os devolve no fim. Numa instalação real eles não voltaram, e a atualização disse "concluída com sucesso" mesmo assim — a volta era muda, sem rastro de falha.

Agora ela confere peça por peça, tenta de novo e, se faltar alguma, avisa em vermelho com o nome e o comando para subir à mão. Fica calada quando tudo volta certo.
