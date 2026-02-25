import { useState, useRef, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle2, AlertCircle, Download, Hourglass, Moon, Sun, Image } from "lucide-react";

interface ProgressData {
  total: number;
  processed: number;
  percentage: number;
  currentCard: string;
}

export default function CardGenerator() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [zipPath, setZipPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sessionId] = useState(() =>
    `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  );
  const [isDark, setIsDark] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const [, setLocation] = useLocation();

  const generateCardsMutation = trpc.card.generateCards.useMutation();

  useEffect(() => {
    const socket = io({
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socket.on("connect", () => {
      socket.emit("join", sessionId);
    });

    socket.on("progress", (data: ProgressData) => {
      setProgress(data);
    });

    socket.on("error", (message: string) => {
      setError(message);
      setIsProcessing(false);
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
    };
  }, [sessionId]);

  const handleFileSelect = (selectedFile: File | null | undefined) => {
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith(".xlsx")) {
      setError("Por favor, selecione um arquivo .xlsx válido");
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError("O arquivo não pode exceder 10MB");
      return;
    }

    setFile(selectedFile);
    setError(null);
    setZipPath(null);
    setProgress(null);
  };

  const handleUpload = async () => {
    if (!file) {
      setError("Por favor, selecione um arquivo");
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProgress(null);
    setZipPath(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const uploadResponse = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error("Erro ao fazer upload do arquivo");
      }

      const { filePath } = await uploadResponse.json();

      const result = await generateCardsMutation.mutateAsync({
        filePath,
        sessionId,
      });

      if (result.success) {
        setZipPath(result.zipPath);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar arquivo");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!zipPath) return;

    try {
      const response = await fetch(
        `/api/download?zipPath=${encodeURIComponent(zipPath)}`
      );

      if (!response.ok) {
        throw new Error("Erro ao baixar arquivo");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;

      const fileName = zipPath.split("/").pop() || "cards.zip";
      a.download = fileName;

      document.body.appendChild(a);
      a.click();

      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao baixar arquivo");
    }
  };

  // 🔵 Background levemente ajustado
  const bgColor = isDark
    ? "bg-gradient-to-br from-gray-900 via-blue-900 to-indigo-950"
    : "bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100";

  const cardBg = isDark
    ? "bg-white/10 backdrop-blur-lg border border-white/20"
    : "bg-white/50 backdrop-blur-lg border border-white/80";

  const textPrimary = isDark ? "text-white" : "text-slate-900";
  const textSecondary = isDark ? "text-slate-300" : "text-slate-600";
  const borderColor = isDark ? "border-white/20" : "border-slate-300/50";
  const accentColor = isDark ? "text-cyan-300" : "text-blue-600";

  return (
    <div
      className={`min-h-screen py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-500 ${bgColor}`}
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-16">
          <div>
            <h1 className={`text-3xl font-bold ${textPrimary}`}>
              Gerador de Cards
            </h1>
          </div>

          <button
            onClick={() => setIsDark(!isDark)}
            className="p-3 rounded-full"
          >
            {isDark ? (
              <Sun className="w-5 h-5 text-yellow-400" />
            ) : (
              <Moon className="w-5 h-5 text-slate-700" />
            )}
          </button>
        </div>

        <div className={`${cardBg} rounded-2xl p-8 shadow-2xl`}>
          {!isProcessing && !zipPath && (
            <>
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => handleFileSelect(e.target.files?.[0])}
              />

              <Button
                onClick={handleUpload}
                disabled={!file}
                className="mt-6 w-full"
              >
                Processar Planilha
              </Button>
            </>
          )}

          {isProcessing && progress && (
            <div className="text-center space-y-4">
              <Hourglass className={`w-10 h-10 ${accentColor} animate-spin`} />
              <p className={textPrimary}>
                {progress.processed} de {progress.total} ({progress.percentage}
                %)
              </p>
            </div>
          )}

          {!isProcessing && zipPath && (
            <div className="space-y-6">
              <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />

              <Button
                onClick={handleDownload}
                className="w-full bg-green-600 hover:bg-green-500 text-white"
              >
                <Download className="w-5 h-5 mr-2" />
                Baixar Cards (ZIP)
              </Button>

              <Button
                onClick={() => {
                  setFile(null);
                  setZipPath(null);
                  setProgress(null);
                  setError(null);
                }}
                className="w-full"
              >
                Processar Outro Arquivo
              </Button>
            </div>
          )}

          {error && (
            <div className="mt-4 text-red-500 flex items-center space-x-2">
              <AlertCircle className="w-5 h-5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* 🔴 BOTÃO SOME DURANTE PROCESSAMENTO */}
        {!isProcessing && (
          <Button
            onClick={() => setLocation("/logos")}
            className="mt-8 w-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center space-x-2"
          >
            <Image className="w-5 h-5" />
            <span>Gerenciar Logos</span>
          </Button>
        )}

        <div className={`mt-16 pt-8 border-t ${borderColor} text-center`}>
          <p className={`text-sm ${textSecondary}`}>
            Desenvolvido por Esio Lima - Versão 3.0
          </p>
        </div>
      </div>
    </div>
  );
}
