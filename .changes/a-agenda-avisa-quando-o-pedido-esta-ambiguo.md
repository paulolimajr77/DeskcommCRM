---
impacto: capacidade_nova
secao: corrigido
titulo: A consulta de horários para de devolver lista vazia quando o pedido está malformado
---

Medido em produção em 16 de setembro. Um cliente respondeu "sim pode agendar uma call", e o assistente consultou a agenda **nove vezes seguidas** — sempre com lista vazia, sempre no mesmo engano: mandar juntos um dia específico e um período relativo, que são maneiras diferentes de dizer quando.

A consulta aceitava as duas ao mesmo tempo e só reclamava depois, devolvendo lista vazia. E lista vazia, para quem lê do outro lado, parece "esse dia não tem horário" — daí a caminhada: nove dias, nove consultas, nenhuma marcação.

Agora o pedido com os dois campos juntos é recusado **na entrada**, dizendo quais são. E toda resposta sem horário — inclusive a de recusa — passa a trazer se o atendente publicou (ou não) a jornada dele, que é o que distingue "não tenho vaga neste dia" de "ainda não configurei meus horários".
