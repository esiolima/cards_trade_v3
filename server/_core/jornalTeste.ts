export const renderJornalTeste = () => {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Jornal Teste</title>
  <style>
    body { 
      font-family: sans-serif; 
      background-color: #f0f0f0; 
      padding: 40px; 
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
    }
    .card {
      background: white;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.1);
      max-width: 500px;
      text-align: center;
    }
    h1 { color: #333; margin-top: 0; }
    p { color: #666; line-height: 1.6; }
    .footer { margin-top: 20px; font-size: 0.8em; color: #999; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Gerador de Cards - Teste</h1>
    <p>Este é um placeholder para o conteúdo do jornal. O erro de deploy acontecia porque este arquivo continha um formato de texto (JSON) que o sistema não conseguia ler como código.</p>
    <p>Agora o erro foi corrigido e o sistema consegue completar o build com sucesso!</p>
    <div class="footer">
      Manus AI - Correção de Deploy
    </div>
  </div>
</body>
</html>
`;
};
