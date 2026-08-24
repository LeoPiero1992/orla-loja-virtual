# Automação do estoque ORLA

Enquanto o acesso automático ao SharePoint não estiver autorizado, a loja lê a cópia da planilha sincronizada pelo OneDrive nesta máquina:

`C:\Users\ADMIN\OneDrive - luamorena.com.br\PRONTA ENTREGA AFIO.xlsm`

## Horários

- 09:00 (horário de Brasília)
- 16:30 (horário de Brasília)

O Codex executa a rotina local, lê a aba `ProntaEntrega` e usa a coluna `Saldo Disponível`. Quando o estoque muda, o script envia apenas os arquivos de estoque ao GitHub e a publicação da loja é disparada automaticamente.

O computador precisa estar ligado, conectado à internet e com o OneDrive sincronizado. Se estiver desligado no horário, execute manualmente `scripts\atualizar-estoque-local.ps1` quando voltar.

## Futuro acesso direto ao SharePoint

Quando o acesso Microsoft estiver disponível, a mesma rotina poderá voltar a baixar o arquivo diretamente. Para isso serão necessários:

- `SP_TENANT_ID`
- `SP_CLIENT_ID`
- `SP_CLIENT_SECRET`

A aplicação precisa de uma permissão de leitura do Microsoft Graph para o arquivo (por exemplo `Files.Read.All`, com consentimento do administrador). Depois de configurados os segredos, execute manualmente a ação `Atualizar estoque pelo SharePoint` uma vez para validar os cabeçalhos da planilha.

## Reserva da sacola

Ao adicionar ou alterar uma peça, a loja cria uma reserva no banco por 30 minutos. O cronômetro aparece na sacola e no checkout. Ao terminar o prazo, a sacola é esvaziada e as peças voltam automaticamente à disponibilidade para outras clientes. A criação do pagamento só é aceita enquanto a reserva estiver ativa.
