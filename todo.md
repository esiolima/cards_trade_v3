Gerador de Cards PDF - TODO
Funcionalidades Obrigatórias
[x] Interface web para upload de arquivo Excel (.xlsx)
[x] Validação de formato e tamanho do arquivo
[x] Processamento assíncrono com Puppeteer
[x] WebSocket (Socket.io) para progresso em tempo real
[x] Barra de progresso visual com quantidade e porcentagem
[x] Geração automática de arquivo ZIP
[x] Botão de download para arquivo ZIP
[x] Sistema de templates HTML (cupom, promoção, queda, bc)
[x] Substituição dinâmica de variáveis nos templates
[x] Conversão de logotipos para Base64
[x] Armazenamento temporário com limpeza automática
Infraestrutura
[x] Copiar templates e fontes do projeto original
[x] Instalar dependências (puppeteer, xlsx, archiver, socket.io)
[x] Configurar rotas tRPC para upload e processamento
[x] Implementar WebSocket com Socket.io
[x] Criar estrutura de pastas temporárias
Frontend
[x] Página de upload elegante
[x] Componente de barra de progresso
[x] Validação de arquivo no cliente
[x] Botão de download
[x] Feedback visual durante processamento
Backend
[x] Rota de upload de arquivo
[x] Processamento de planilha Excel
[x] Geração de PDFs com Puppeteer
[x] Criação de arquivo ZIP
[x] Limpeza automática de arquivos temporários
[x] Tratamento de erros
Testes
[x] Testar upload de arquivo
[x] Testar processamento de planilha
[x] Testar geração de PDFs
[x] Testar download de ZIP
[x] Testar progresso em tempo real
Bugs Identificados
[x] Card Cupom: logo não aparecendo
[x] Card Cupom: palavra "cupom" muito pequena (90 graus)
[x] Card BC: box com "BC" muito grande
[x] Todos os cards: símbolo de porcentagem muito pequeno
[x] Todos os cards: logos muito pequenos (precisam dobrar de tamanho)
[x] Substituir fonte Montserrat por Inter em todos os templates
[x] Aumentar X% no card BC
[x] Adicionar espaço no rodapé (60px)
[x] Implementar responsividade de fonte com clamp()
Gerenciador de Logos (Nova Funcionalidade)
[x] Criar componente LogoManager.tsx para upload de logos
[x] Criar router logoRouter.ts para gerenciar logos
[x] Criar logoUploadHandler.ts para processar uploads
[x] Adicionar rota /api/logo/upload no servidor
[x] Implementar confirmação de substituição de logos
[x] Implementar logo padrão blank.png quando vazio
[x] Adicionar rota /logos no App.tsx
[x] Adicionar botão "Gerenciar Logos" na página principal
