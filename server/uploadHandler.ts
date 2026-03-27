import express, { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const UPLOAD_DIR = path.resolve("uploads");
const LOGOS_DIR = path.resolve("logos");

/* =========================
   UPLOAD PLANILHA (.xlsx)
========================= */

const excelStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix =
      Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const uploadExcel = multer({
  storage: excelStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.originalname.endsWith(".xlsx")) {
      return cb(new Error("Only .xlsx files are allowed"));
    }
    cb(null, true);
  },
});

/* =========================
   UPLOAD LOGO (SEM ALTERAR NOME)
========================= */

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, LOGOS_DIR); // usa pasta existente
  },
  filename: (req, file, cb) => {
    // salva exatamente com nome original
    cb(null, file.originalname);
  },
});

const uploadLogo = multer({
  storage: logoStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/png",
      "image/jpeg",
      "image/jpg",
      "image/webp",
      "image/svg+xml",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only image files are allowed"));
    }

    cb(null, true);
  },
});

export function setupUploadRoute(app: express.Application) {

  // Upload planilha
  app.post(
    "/api/upload",
    uploadExcel.single("file"),
    (req: Request, res: Response) => {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      res.json({
        success: true,
        filePath: req.file.path,
        fileName: req.file.originalname,
      });
    }
  );

  // Upload logo (nome original preservado)
  app.post(
    "/api/upload-logo",
    uploadLogo.single("logo"),
    (req: Request, res: Response) => {
      if (!req.file) {
        return res.status(400).json({ error: "No logo uploaded" });
      }

      res.json({
        success: true,
        fileName: req.file.originalname,
      });
    }
  );

  // Download ZIP
  app.get("/api/download", (req: Request, res: Response) => {
    const { zipPath } = req.query;

    if (!zipPath || typeof zipPath !== "string") {
      return res.status(400).json({ error: "Invalid zip path" });
    }

    const outputDir = path.resolve("output");
    const resolvedPath = path.resolve(zipPath);

    if (!resolvedPath.startsWith(outputDir)) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: "File not found" });
    }

    res.download(resolvedPath, path.basename(resolvedPath));
  });
}
