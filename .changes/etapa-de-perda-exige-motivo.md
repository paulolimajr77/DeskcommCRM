---
impacto: nada_mudou
secao: corrigido
titulo: Mover um card para uma etapa de perda sem motivo deixa de dar erro 500
---

Mover um card para uma etapa de perda sem motivo respondia "Erro inesperado" (500) nos três caminhos que trocam etapa: arrasto, lote e o assistente de IA. O motivo já era exigência do banco; a tela é que deixava a pergunta chegar lá e devolvia a recusa como falha de servidor.

Agora cada caminho responde com a recusa de negócio: o arrasto volta o card e pede o motivo, o lote avisa antes de tentar, e o assistente não move — abre aviso na Central para uma pessoa decidir.
