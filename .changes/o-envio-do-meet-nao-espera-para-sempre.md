---
impacto: capacidade_nova
secao: corrigido
titulo: "Enviar link ao cliente" para de travar 30 segundos quando o cliente está sendo atendido
---

Clicar em "Enviar link ao cliente" ficava ~30 segundos parado e terminava em "Erro inesperado". O banco não era o problema (19ms) — o pedido entrava numa fila de espera pelo mesmo cliente sem prazo, e a tela tentava de novo sozinha, piorando a fila.

Agora a espera tem teto de 3 segundos; passou disso, a tela diz que o cliente está sendo atendido e não repete sozinha.
