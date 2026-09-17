---
impacto: capacidade_nova
secao: adicionado
titulo: Levar um negócio aberto para outro funil (o clone que a P-01 mandava usar)
---

Negócio que começou no funil errado não tinha por onde sair: o quadro só troca etapa dentro do mesmo funil, e a API recusava apontando para um "clone" que não existia.

Agora existe a troca de funil pela API (`POST /api/v1/leads/[id]/clone`; o botão no quadro vem depois). Cria o negócio no funil de destino com os mesmos dados, encerra a origem como perdida, e os dois lados contam a troca na timeline. Negócio já encerrado não é clonado.
