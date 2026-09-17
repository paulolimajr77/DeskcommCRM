---
impacto: capacidade_nova
secao: corrigido
titulo: "Enviar link ao cliente" para de derrubar o banco
---

Um clique em "Enviar link ao cliente" levava o banco a 280% de CPU e nunca voltava. Causa: uma recusa DEFINITIVA (compromisso mudou) era anunciada como passageira, e as camadas de cima tentavam sem parar — 51.556 vezes contra 1 quando anunciada certa. Um teste novo vigia o padrão; outros 80 pontos fora da agenda ainda não foram revisados.
