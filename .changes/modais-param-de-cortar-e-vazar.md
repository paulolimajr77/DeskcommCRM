---
impacto: nada_mudou
secao: corrigido
titulo: A tela de novo agendamento para de cortar, e nomes longos param de vazar dos avisos
---

Em telas mais baixas — um notebook, ou a janela do navegador não maximizada — a
tela de "Novo agendamento" cortava o que não coubesse, sem barra de rolagem e
sem nenhum sinal de que havia mais embaixo. Dependendo do tamanho, o calendário
inteiro ficava inacessível: nenhum dia podia ser escolhido, e os botões
"Voltar" e "Confirmar" ficavam fora da tela.

Medido numa instalação real: numa janela de 1264 por 549 pontos, 42 controles
não tinham como ser alcançados; numa de 1264 por 377, eram 45.

Agora a tela inteira rola, e tudo se alcança rolando — em qualquer tamanho de
janela.

O segundo conserto é nas caixas de aviso. Quando o texto do título trazia um
nome sem espaços — o identificador de uma conexão de WhatsApp, um e-mail
comprido, um endereço — ele era tratado como uma palavra só e escapava da borda
da caixa, aparecendo por cima do fundo. Em tela de celular o texto passava mais
de cem pontos para fora. Agora esses nomes quebram em mais de uma linha e ficam
dentro da caixa.

Você não precisa fazer nada para adotar.
