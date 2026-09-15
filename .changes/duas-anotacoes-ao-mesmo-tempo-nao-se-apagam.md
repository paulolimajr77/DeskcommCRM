---
impacto: nada_mudou
secao: corrigido
titulo: Duas pessoas anotando o mesmo cliente ao mesmo tempo não apagam uma à outra
---

Quando duas anotações chegavam ao mesmo cliente no mesmo instante — a atendente
digitando um campo na tela enquanto outra pessoa salvava outro campo, ou a IA
preenchendo algo durante o atendimento —, uma das duas podia sumir. Não havia
erro, aviso nem registro: o campo simplesmente não estava lá depois. Acontecia
porque o sistema lia a ficha, juntava o campo novo em memória e regravava a
ficha inteira; quem chegasse por último regravava por cima de uma versão lida
antes da anterior ter sido salva.

Agora a junção acontece dentro do banco de dados, que sabe pôr uma na fila da
outra. Quem chega depois espera, relê o que acabou de ser gravado e acrescenta
em cima. As duas anotações sobrevivem, e corrigir um campo já preenchido
continua funcionando como antes — a última palavra sobre o MESMO campo vence.
