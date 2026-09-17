---
impacto: capacidade_nova
secao: corrigido
titulo: O botão "Reativar" de tipo de agendamento passa a funcionar
---

Em Configurações › Agenda, o botão "Reativar" de um tipo de agendamento desativado nunca funcionou — sempre devolvia "Nenhum campo para alterar", porque a porta que ele usava (a mesma de renomear/mudar duração) não conhecia o campo "ativo".

Agora reativar tem porta própria, com a mesma exigência de papel do desativar, e fica registrado na auditoria como "tipo reativado".
