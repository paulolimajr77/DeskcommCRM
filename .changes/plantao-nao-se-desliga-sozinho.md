---
impacto: capacidade_nova
secao: corrigido
titulo: O atendimento para de se desligar sozinho 15 minutos depois de ser ligado
---

Em Equipe › Atendimento, ligar a chave de um atendente durava só uns quinze minutos: o sistema desligava sozinho e ninguém religava, sem aviso.

A causa era uma rotina que esperava um "sinal de vida" nunca implementado. Ela foi removida; a disponibilidade agora é calculada na hora, junto com a jornada publicada — e volta sozinha no início do próximo horário. A coluna "Status" ganha um terceiro estado: **Fora do horário**, distinto de **Desligado**.
