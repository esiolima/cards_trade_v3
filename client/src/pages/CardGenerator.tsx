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
    socket.on("connect", () => { console.log("Connected to server"); socket.emit("join", sessionId); });
    socket.on("progress", (data: ProgressData) => setProgress(data));
    socket.on("error", (message: string) => { setError(message); setIsProcessing(false); });
    socketRef.current = socket;
    return () => { socket.disconnect(); };
  }, [sessionId]);

  const handleFileSelect = (selectedFile: File | null | undefined) => {
    if (!selectedFile) return;
    if (!selectedFile.name.endsWith(".xlsx")) { setError("Por favor, selecione um arquivo .xlsx válido"); return; }
    if (selectedFile.size > 10 * 1024 * 1024) { setError("O arquivo não pode exceder 10MB"); return; }
    setFile(selectedFile);
    setError(null);
    setZipPath(null);
    setProgress(null);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(e.target.files?.[0]);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    handleFileSelect(droppedFile);
  };

  const handleUpload = async () => {
    if (!file) { setError("Por favor, selecione um arquivo"); return; }
    setIsProcessing(true);
    setError(null);
    setProgress(null);
    setZipPath(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const uploadResponse = await fetch("/api/upload", { method: "POST", body: formData });
      if (!uploadResponse.ok) throw new Error("Erro ao fazer upload do arquivo");
      const { filePath } = await uploadResponse.json();
      const result = await generateCardsMutation.mutateAsync({ filePath, sessionId });
      if (result.success) setZipPath(result.zipPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao processar arquivo");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = async () => {
    if (!zipPath) return;
    try {
      const response = await fetch(`/api/download?zipPath=${encodeURIComponent(zipPath)}`);
      if (!response.ok) throw new Error("Erro ao baixar arquivo");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cards.zip";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao baixar arquivo");
    }
  };

  // ✅ ALTERAÇÃO 1: NOVO GRADIENTE
  const bgColor = isDark
    ? "bg-gradient-to-br from-[#002f67] via-[#4c0d6d] to-[#002f67]"
    : "bg-gradient-to-br from-slate-100 via-blue-100 to-purple-100";

  const cardBg = isDark ? "bg-white/10 backdrop-blur-lg border border-white/20" : "bg-white/50 backdrop-blur-lg border border-white/80";
  const textPrimary = isDark ? "text-white" : "text-slate-900";
  const textSecondary = isDark ? "text-slate-300" : "text-slate-600";
  const borderColor = isDark ? "border-white/20" : "border-slate-300/50";
  const accentColor = isDark ? "text-cyan-300" : "text-blue-600";
  const uploadBg = isDark ? "bg-black/20" : "bg-white/30";
  const uploadBorder = isDragging ? (isDark ? 'border-cyan-300' : 'border-blue-600') : (isDark ? "border-white/30 hover:border-white/50" : "border-blue-300/80 hover:border-blue-400");

  return (
    <div className={`min-h-screen py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-500 ${bgColor}`}>
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-16">
          <div className="flex items-center space-x-4">
            <img src="/martins-logo.png" alt="Martins" className="h-12 object-contain" />
            <div>
              <h1 className={`text-3xl font-bold ${textPrimary}`}>Gerador de Cards</h1>
              <p className={`text-sm ${textSecondary}`}>Núcleo de Comunicação e Marketing / Trade Martins</p>
            </div>
          </div>
          <button onClick={() => setIsDark(!isDark)} className={`p-3 rounded-full transition-all duration-300 backdrop-blur-sm ${isDark ? "bg-white/10 hover:bg-white/20 text-yellow-400" : "bg-black/10 hover:bg-black/20 text-slate-700"}`}>
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <div className="grid lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className={`${cardBg} rounded-2xl p-8 shadow-2xl transition-all duration-300`}>
              
              {!isProcessing && !zipPath && (
                <div className="space-y-6">
                  <div>
                    <h2 className={`text-2xl font-bold ${textPrimary} mb-2`}>Transforme suas Planilhas</h2>
                    <p className={textSecondary}>Converta dados Excel em cards PDF profissionais em segundos</p>
                  </div>

                  <div onClick={() => document.getElementById("file-input")?.click()} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all duration-300 ${uploadBg} ${uploadBorder}`}>
                    <div className="flex flex-col items-center space-y-3 pointer-events-none">
                      <div className={`p-4 rounded-full ${isDark ? 'bg-black/20' : 'bg-black/5'}`}><Upload className={`w-8 h-8 ${accentColor}`} /></div>
                      <div>
                        <p className={`font-semibold ${textPrimary}`}>Clique ou arraste seu arquivo</p>
                        <p className={`text-sm ${textSecondary} mt-1`}>Apenas arquivos .xlsx (máximo 10MB)</p>
                      </div>
                    </div>
                    <input id="file-input" type="file" accept=".xlsx" onChange={handleInputChange} className="hidden" />
                  </div>

                  {file && (
                    <div className={`${isDark ? 'bg-black/20' : 'bg-black/5'} rounded-lg p-4 flex items-center justify-between border ${borderColor}`}>
                      <div className="flex items-center space-x-3">
                        <CheckCircle2 className={`w-5 h-5 ${accentColor}`} />
                        <div>
                          <p className={`font-medium ${textPrimary}`}>{file.name}</p>
                          <p className={`text-sm ${textSecondary}`}>{(file.size / 1024).toFixed(2)} KB</p>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => { setFile(null); setError(null); }} className={`${textSecondary} hover:${textPrimary}`}>Remover</Button>
                    </div>
                  )}

                  {error && (
                    <div className={`${isDark ? 'bg-red-500/20 border-red-400/50' : 'bg-red-500/10 border-red-500/20'} rounded-lg p-4 flex items-start space-x-3`}>
                      <AlertCircle className={`w-5 h-5 ${isDark ? 'text-red-300' : 'text-red-600'} flex-shrink-0 mt-0.5`} />
                      <div>
                        <p className={`font-medium ${isDark ? 'text-red-200' : 'text-red-800'}`}>Erro</p>
                        <p className={`text-sm ${isDark ? 'text-red-300' : 'text-red-700'}`}>{error}</p>
                      </div>
                    </div>
                  )}

                  <Button onClick={handleUpload} disabled={!file || isProcessing} className={`w-full text-white py-6 text-lg font-semibold rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed ${isDark ? 'bg-cyan-500/80 hover:bg-cyan-500' : 'bg-blue-600 hover:bg-blue-700'}`}>
                    Processar Planilha
                  </Button>
                </div>
              )}

              {isProcessing && progress && (
                <div className="space-y-8">
                  <div className="text-center">
                    <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${isDark ? "bg-black/20" : "bg-black/5"}`}><div className="animate-spin"><Hourglass className={`w-10 h-10 ${accentColor}`} /></div></div>
                    <h2 className={`text-2xl font-bold ${textPrimary} mb-2`}>Processando Cards</h2>
                    <p className={textSecondary}>{progress.currentCard}</p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className={`font-medium ${textPrimary}`}>Progresso</span>
                      <span className={`font-bold ${accentColor}`}>{progress.percentage}%</span>
                    </div>
                    <div className={`w-full h-3 rounded-full overflow-hidden ${isDark ? "bg-black/30" : "bg-black/10"}`}>
                      <div className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 transition-all duration-300" style={{ width: `${progress.percentage}%` }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    {[{ label: "Processados", value: progress.processed }, { label: "Total", value: progress.total }, { label: "Restantes", value: progress.total - progress.processed }].map((stat, i) => (
                      <div key={i} className={`rounded-lg p-4 text-center border ${isDark ? 'bg-black/20 border-white/10' : 'bg-black/5 border-slate-400/20'}`}>
                        <p className={`text-2xl font-bold ${accentColor}`}>{stat.value}</p>
                        <p className={`text-xs ${textSecondary} mt-1`}>{stat.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {!isProcessing && zipPath && (
                <div className="space-y-6">
                  <div className="text-center">
                    <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-4 ${isDark ? 'bg-green-500/20' : 'bg-green-500/10'}`}>
                      <CheckCircle2 className={`w-10 h-10 ${isDark ? 'text-green-300' : 'text-green-600'}`} />
                    </div>
                    <h2 className={`text-2xl font-bold ${textPrimary} mb-2`}>Processamento Concluído!</h2>
                    <p className={textSecondary}>{progress?.total} cards foram gerados com sucesso</p>
                  </div>

                  <div className={`${isDark ? 'bg-green-500/20 border-green-400/50' : 'bg-green-500/10 border-green-500/20'} rounded-lg p-6 border`}>
                    <div className="flex items-center justify-between">
                      <span className={`font-medium ${isDark ? 'text-green-200' : 'text-green-800'}`}>Cards Gerados</span>
                      <span className={`text-3xl font-bold ${isDark ? 'text-green-300' : 'text-green-600'}`}>{progress?.total}</span>
                    </div>
                  </div>

                  <Button onClick={handleDownload} className="w-full bg-green-600 hover:bg-green-500 text-white py-6 text-lg font-semibold rounded-lg transition-all duration-300 flex items-center justify-center space-x-2">
                    <Download className="w-5 h-5" />
                    <span>Baixar Cards (ZIP)</span>
                  </Button>

                  <Button onClick={() => { setFile(null); setZipPath(null); setProgress(null); setError(null); }} className={`w-full py-6 text-lg font-semibold transition-all duration-300 ${isDark ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-black/5 hover:bg-black/10 text-slate-800'}`}>
                    Processar Outro Arquivo
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            {[{ icon: "✨", title: "Múltiplos Tipos", description: "Cupons, Promoções, Quedas de Preço, Cashback e BC" }, { icon: "⚡", title: "Processamento Rápido", description: "Geração paralela com progresso em tempo real" }, { icon: "📦", title: "Download Fácil", description: "Todos os cards em um arquivo ZIP" }].map((feature, i) => (
              <div key={i} className={`${cardBg} rounded-xl p-5 shadow-lg transition-all duration-300 hover:border-white/40`}>
                <div className="flex items-start space-x-4">
                  <div className="text-2xl mt-1">{feature.icon}</div>
                  <div>
                    <h3 className={`font-semibold ${textPrimary} mb-1`}>{feature.title}</h3>
                    <p className={`text-sm ${textSecondary}`}>{feature.description}</p>
                  </div>
                </div>
              </div>
            ))}

            {/* ✅ ALTERAÇÃO 2: BOTÃO SOME APENAS DURANTE PROCESSAMENTO */}
            {!isProcessing && (
              <Button onClick={() => setLocation("/logos")} className={`w-full text-white py-6 text-lg font-semibold rounded-lg transition-all duration-300 flex items-center justify-center space-x-2 ${isDark ? 'bg-purple-600/80 hover:bg-purple-600' : 'bg-purple-600 hover:bg-purple-700'}`}>
                <Image className="w-5 h-5" />
                <span>Gerenciar Logos</span>
              </Button>
            )}
          </div>
        </div>

        <div className={`mt-16 pt-8 border-t ${borderColor} text-center`}>
          <p className={`text-sm ${textSecondary}`}>
            Desenvolvido por Esio Lima - Versão 2.2
          </p>
        </div>
      </div>
    </div>
  );
}
