## Refatorar `EditarVisitanteModal.tsx` para alinhar com o modal de Cadastro

Reorganizar os campos e padronizar estilos (tokens M3, mesmas classes do `CadastroVisitanteModal`).

### Mudanças no formulário

1. **Tamanho do Modal**: usar `size="lg"` (igual ao Cadastro) para acomodar a grade de 12 colunas sem rolagem.

2. **Casa Visitada + Placa do Veículo lado a lado**:
   - Substituir os dois blocos verticais por uma `grid grid-cols-12 gap-4`
   - `col-span-3`: Casa/Apto (centralizado, fonte bold, `maxLength=5`, placeholder `Ex: 102A`)
   - `col-span-9`: Placa (fonte mono, tracking `0.15em`, `maxLength=7`, placeholder `ABC-1234`)
   - Manter validação de formato (mensagem de erro abaixo)

3. **Observações em uma única linha**:
   - Trocar o `<textarea rows={3}>` por `<input type="text" />` (igual ao Cadastro)
   - Placeholder: `Informações adicionais relevantes...`

4. **Tipo de Vaga (mesmo padrão do Cadastro)**:
   - Remover os radio buttons atuais
   - Usar dois botões `grid grid-cols-2 gap-2` com ícone `Home`, label e check `UserCheck`
   - Vaga Comum (selected → `border-secondary` + `bg-secondary-container/20`) com selo "Padrão"
   - Vaga Morador (selected → `border-tertiary` + `bg-tertiary-fixed/30`)
   - Renomear o label para "Onde vai estacionar?"

5. **Seleção de Prisma (mesmo padrão do Cadastro)**:
   - Remover o `<select>` HTML
   - Renderizar uma grade `grid grid-cols-6 sm:grid-cols-8 gap-2` com `PrismaBadge` (size `md`) clicáveis para cada prisma livre + o atual marcado como destacado (border `primary`, ring)
   - Mostrar o prisma atualmente selecionado com ring/destaque visual e badge "Atual"
   - Ao clicar, atualiza `numeroPrisma`
   - Opção "Sem prisma" como botão neutro no início da grade

6. **Estilos de input/labels**: substituir as classes legadas (`border-gray-300`, `text-gray-700`, `focus:ring-blue-500`) pelos tokens M3 usados no Cadastro:
   - Labels: `text-label-caps uppercase text-on-surface-variant mb-1.5`
   - Inputs: `px-3 py-2.5 border border-outline-variant rounded-btn bg-surface-container-lowest text-on-surface uppercase ... focus:border-primary`

7. **Botões do rodapé**: harmonizar com o Cadastro
   - Cancelar: `text-on-surface-variant hover:bg-surface-container-high rounded-btn`
   - Salvar: `bg-primary text-on-primary rounded-btn shadow-ambient-1` com ícone `UserCheck` e estado de loading com spinner

8. **Erro**: caixa de erro com `bg-error-container/40 border border-error/30` + ícone `AlertTriangle` (idêntico ao Cadastro).

### Lógica preservada
- Toda a lógica existente (`useEffect` de carga, busca de prismas livres via `supabase`, `editarVisitante`, normalização de casa, uppercase) permanece intacta.
- O comportamento de "prisma atual sempre disponível" continua via `opcoesPrismas`.

### Arquivo afetado
- `src/react-app/components/EditarVisitanteModal.tsx` (única alteração)
