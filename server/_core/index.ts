import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import multer from "multer";
import { CardGenerator } from "../cardGenerator";
import path from "path";
import fs from "fs";
import { Server as SocketIOServer } from "socket.io";

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Limite de tamanho para lidar com assets e base64
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ extended: true, limit: "50mb" }));

  app.use(cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"]
  }));

  // Servir a pasta output como estática para o navegador acessar o preview.html e o pdf
  const OUTPUT_DIR = path.join(process.cwd(), "output");
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  app.use("/output", express.static(OUTPUT_DIR));

  const upload = multer({ dest: "uploads/" });
  const generator = new CardGenerator();
  await generator.initialize();

  // Rota para processamento de planilha
  app.post("/api/process-excel", upload.single("file"), async (req, res) => {
    try {
      if (!req.file) return res.status(400).json({ error: "Nenhum arquivo enviado" });

      const uploadsDir = path.join(process.cwd(), "uploads_excel");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const permanentPath = path.join(uploadsDir, "current_planilha.xlsx");
      fs.copyFileSync(req.file.path, permanentPath);

      const cards = await generator.processExcel(req.file.path);
      fs.unlinkSync(req.file.path);
      
      res.json({ cards });
    } catch (error: any) {
      console.error("Erro no processamento da planilha:", error);
      res.status(500).json({ error: error.message || "Erro interno no servidor" });
    }
  });

  // Rota para download do ZIP de cards individuais
  app.get("/api/download-zip", async (req, res) => {
    try {
      const zipPath = await generator.generateZip();
      res.download(zipPath, "cards_individuais.zip");
    } catch (error: any) {
      console.error("Erro ao gerar ZIP:", error);
      res.status(500).json({ error: "Erro ao gerar ZIP" });
    }
  });

  // PASSO 1: Gerar Preview HTML Interativo
  app.post("/api/generate-jornal-preview", upload.single("header"), async (req, res) => {
    try {
      const { backgroundColor, categoryBoxColor, footerText } = req.body;
      const headerPath = req.file ? req.file.path : undefined;

      console.log("Iniciando geração do jornal com as opções:", { 
        backgroundColor, 
        categoryBoxColor, 
        footerTextLength: footerText?.length,
        hasHeader: !!headerPath 
      });

      const previewUrl = await generator.generateJornalPreview({
        headerPath,
        backgroundColor: backgroundColor || "#1a365d",
        categoryBoxColor: categoryBoxColor || "#2563eb",
        footerText: footerText || ""
      });

      res.download(pdfPath, "jornal_ofertas.pdf", (err) => {
        if (err) console.error("Erro ao enviar PDF:", err);
        if (headerPath && fs.existsSync(headerPath)) fs.unlinkSync(headerPath);
      });
    } catch (error: any) {
      console.error("Erro no preview do jornal:", error);
      res.status(500).json({ error: error.message || "Erro interno" });
    }
  });

  // PASSO 2: Gerar PDF Final após conferência
  app.post("/api/generate-jornal-pdf", async (req, res) => {
    try {
      const pdfPath = await generator.generateFinalPDF();
      res.json({ success: true, pdfUrl: "/output/jornal_ofertas.pdf" });
    } catch (error: any) {
      console.error("Erro na geração do PDF final:", error);
      res.status(500).json({ error: error.message || "Erro interno" });
    }
  });

  const io = new SocketIOServer(server, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/socket.io"
  });

  generator.on("progress", (data) => {
    io.emit("processProgress", data);
  });

  // Configuração de arquivos estáticos do Frontend
  const clientDistPath = path.join(process.cwd(), "dist", "public");
  const fallbackDistPath = path.join(process.cwd(), "dist", "client");
  const finalDistPath = fs.existsSync(clientDistPath) ? clientDistPath : fallbackDistPath;
  
  app.use(express.static(finalDistPath));
  
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/") || req.path.startsWith("/output/")) return;
    
    const indexPath = path.join(finalDistPath, "index.html");
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send("Site não encontrado. Verifique o build.");
    }
  });

  const port = Number(process.env.PORT) || 8080;
  server.listen(port, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${port}`);
  });
}

startServer().catch(console.error);