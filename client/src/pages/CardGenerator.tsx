import { useState, useRef, useEffect } from "react";
import { io, Socket } from "socket.io-client";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
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
  const [sessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const [isDark, setIsDark] = useState(true);
  const [isDragging, setIsDragging] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const [, setLocation] = useLocation();

  const generateCardsMutation = trpc.card.generateCards.useMutation();

  useEffect(() => {
    const socket = io({ reconnection: true, reconnectionDelay: 1000, reconnectionDelayMax: 5000, reconnectionAttempts: 5 });

    socket.on("connect", () => {
      socket.emit("join", sessionId);
    });

    socket.on("progress", (data: ProgressData) => setProgress(data));

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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files?.[0]);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    handleFileSelect(droppedFile);
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

  // ✅ Download com nome real do zip
  const handleDownload = async () => {
    if (!zipPath) return;

    try {
      const response = await fetch(`/api/download?zipPath=${encodeURIComponent(zipPath)}`);

      if (!response.ok) throw new Error("Erro ao baixar arquivo");

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

  // 🎨 Background sugerido (mantido)
  const bgColor = isDark
    ? "bg-gradient-to-br from-gray-950 via-blue-950 to-indigo-950"
    : "bg-gradient-to-br from-slate-100 via-blue-100 to-purple-100";

  const cardBg = isDark ? "bg-white/10 backdrop-blur-lg border border-white/20" : "bg-white/50 backdrop-blur-lg border border-white/80";
  const textPrimary = isDark ? "text-white" : "text-slate-900";
  const textSecondary = isDark ? "text-slate-300" : "text-slate-600";
  const borderColor = isDark ? "border-white/20" : "border-slate-300/50";
  const accentColor = isDark ? "text-cyan-300" : "text-blue-600";
  const uploadBg = isDark ? "bg-black/20" : "bg-white/30";
  const uploadBorder = isDragging
    ? isDark ? "border-cyan-300" : "border-blue-600"
    : isDark ? "border-white/30 hover:border-white/50" : "border-blue-300/80 hover:border-blue-400";

  return (
    <div className={`min-h-screen py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-500 ${bgColor}`}>
      <div className="max-w-5xl mx-auto">

        {/* HEADER */}
        <div className="flex items-center justify-between mb-16">
          <div className="flex items-center space-x-4">
            <img src="/martins-logo.png" alt="Martins" className="h-12 object-contain" />
            <div>
              <h1 className={`text-3xl font-bold ${textPrimary}`}>Gerador de Cards</h1>
              <p className={`text-sm ${textSecondary}`}>Núcleo de Comunicação e Marketing / Trade Martins</p>
            </div>
          </div>

          <button
            onClick={() => setIsDark(!isDark)}
            className={`p-3 rounded-full transition-all duration-300 backdrop-blur-sm ${isDark ? "bg-white/10 hover:bg-white/20 text-yellow-400" : "bg-black/10 hover:bg-black/20 text-slate-700"}`}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        {/* GRID */}
        <div className="grid lg:grid-cols-3 gap-8">

          {/* COLUNA PRINCIPAL */}
          <div className="lg:col-span-2">
            <div className={`${cardBg} rounded-2xl p-8 shadow-2xl transition-all duration-300`}>

              {/* Upload */}
              {!isProcessing && !zipPath && (
                <div className="space-y-6">
                  <div>
                    <h2 className={`text-2xl font-bold ${textPrimary} mb-2`}>Transforme suas Planilhas</h2>
                    <p className={textSecondary}>Converta dados Excel em cards PDF profissionais em segundos</p>
                  </div>

                  <div
                    onClick={() => document.getElementById("file-input")?.click()}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300 ${uploadBg} ${uploadBorder}`}
                  >
                    <div className="flex flex-col items-center space-y-3 pointer-events-none">
                      <div className={`p-4 rounded-full ${isDark ? 'bg-black/20' : 'bg-black/5'}`}>
                        <Upload className={`w-8 h-8 ${accentColor}`} />
                      </div>
                      <div>
                        <p className={`font-semibold ${textPrimary}`}>Clique ou arraste seu arquivo</p>
                        <p className={`text-sm ${textSecondary} mt-1`}>Apenas arquivos .xlsx (máximo 10MB)</p>
                      </div>
                    </div>
                    <input id="file-input" type="file" accept=".xlsx" onChange={handleInputChange} className="hidden" />
                  </div>

                  <Button
                    onClick={handleUpload}
                    disabled={!file || isProcessing}
                    className={`w-full text-white py-6 text-lg font-semibold rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'bg-cyan-500/80 hover:bg-cyan-500' : 'bg-blue-600 hover:bg-blue-700'}`}
                  >
                    Processar Planilha
                  </Button>
                </div>
              )}

              {/* Processando */}
              {isProcessing && progress && (
                <div className="text-center space-y-6">
                  <Hourglass className={`w-10 h-10 ${accentColor} animate-spin mx-auto`} />
                  <p className={textPrimary}>{progress.currentCard}</p>
                  <Progress value={progress.percentage} />
                </div>
              )}

              {/* Sucesso */}
              {!isProcessing && zipPath && (
                <div className="space-y-6 text-center">
                  <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
                  <Button
                    onClick={handleDownload}
                    className="w-full bg-green-600 hover:bg-green-500 text-white py-6 text-lg font-semibold rounded-lg"
                  >
                    <Download className="w-5 h-5 mr-2" />
                    Baixar Cards (ZIP)
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* COLUNA DIREITA */}
          <div className="space-y-4">
            <div className={`${cardBg} rounded-xl p-5 shadow-lg`}>
              <h3 className={`font-semibold ${textPrimary}`}>✨ Múltiplos Tipos</h3>
              <p className={textSecondary}>Cupons, Promoções, Quedas de Preço, Cashback e BC</p>
            </div>

            <div className={`${cardBg} rounded-xl p-5 shadow-lg`}>
              <h3 className={`font-semibold ${textPrimary}`}>⚡ Processamento Rápido</h3>
              <p className={textSecondary}>Geração paralela com progresso em tempo real</p>
            </div>

            <div className={`${cardBg} rounded-xl p-5 shadow-lg`}>
              <h3 className={`font-semibold ${textPrimary}`}>📦 Download Fácil</h3>
              <p className={textSecondary}>Todos os cards em um arquivo ZIP</p>
            </div>

            {/* Botão some durante processamento */}
            {!isProcessing && (
              <Button
                onClick={() => setLocation("/logos")}
                className={`w-full text-white py-6 text-lg font-semibold rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 ${isDark ? 'bg-purple-600/80 hover:bg-purple-600' : 'bg-purple-600 hover:bg-purple-700'}`}
              >
                <Image className="w-5 h-5" />
                <span>Gerenciar Logos</span>
              </Button>
            )}
          </div>
        </div>

        {/* Rodapé */}
        <div className={`mt-16 pt-8 border-t ${borderColor} text-center`}>
          <p className={`text-sm ${textSecondary}`}>
            Desenvolvido por Esio Lima - Versão 3.1
          </p>
        </div>
      </div>
    </div>
  );
}
