import React, { useState, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { 
  Upload, 
  FileSpreadsheet, 
  Download, 
  Settings2, 
  CheckCircle2, 
  Loader2, 
  Palette, 
  Type, 
  Image as ImageIcon,
  AlertCircle,
  Sun
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { io, Socket } from "socket.io-client";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

interface CardData {
  id: string;
  template: string;
  data: any;
}

const CardGenerator: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [cards, setCards] = useState<CardData[]>([]);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isGeneratingJornal, setIsGeneratingJornal] = useState(false);
  
  // Opções de Personalização com Persistência (localStorage)
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [lastHeaderName, setLastHeaderName] = useState<string>(() => localStorage.getItem("lastHeaderName") || "");
  const [backgroundColor, setBackgroundColor] = useState<string>(() => localStorage.getItem("backgroundColor") || "#1a365d");
  const [categoryBoxColor, setCategoryBoxColor] = useState<string>(() => localStorage.getItem("categoryBoxColor") || "#2563eb");
  const [footerText, setFooterText] = useState<string>(() => localStorage.getItem("footerText") || "");

  const socketRef = useRef<Socket | null>(null);

  // Salvar no localStorage sempre que mudar
  useEffect(() => {
    localStorage.setItem("backgroundColor", backgroundColor);
    localStorage.setItem("categoryBoxColor", categoryBoxColor);
    localStorage.setItem("footerText", footerText);
    if (headerFile) {
      setLastHeaderName(headerFile.name);
      localStorage.setItem("lastHeaderName", headerFile.name);
    }
  }, [backgroundColor, categoryBoxColor, footerText, headerFile]);

  useEffect(() => {
    // Configurar Socket.io para o Railway
    const socketInstance = io({
      path: "/socket.io",
      transports: ["polling", "websocket"],
      reconnection: true
    });
    
    socketRef.current = socketInstance;

    socketInstance.on("processProgress", (data: { processed: number, total: number, percentage: number }) => {
      setProgress(data.percentage);
      setProcessedCount(data.processed);
      setTotalCount(data.total);
    });

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const onDrop = (acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setIsCompleted(false);
      setProgress(0);
      setProcessedCount(0);
      setTotalCount(0);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"]
    },
    multiple: false
  });

  const handleProcessExcel = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    setProcessedCount(0);
    setTotalCount(0);
    setCards([]);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/process-excel", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Erro ao processar planilha");
      }

      const data = await response.json();
      setCards(data.cards);
      setIsCompleted(true);
      setProgress(100);
      toast.success("Planilha processada com sucesso!");
    } catch (error: any) {
      console.error("Erro no processamento:", error);
      toast.error(`Falha no processamento: ${error.message || "Erro de rede"}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownloadZip = async () => {
    if (cards.length === 0) return;
    window.open("/api/download-zip", "_blank");
  };

  const handleGenerateJornal = async () => {
    setIsGeneratingJornal(true);
    try {
      const formData = new FormData();
      if (headerFile) formData.append("header", headerFile);
      formData.append("backgroundColor", backgroundColor);
      formData.append("categoryBoxColor", categoryBoxColor);
      formData.append("footerText", footerText);

      const response = await fetch("/api/generate-jornal", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        let errorMessage = "Erro ao gerar jornal";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {}
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const contentDisposition = response.headers.get("content-disposition") || "";
      const fileNameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      const downloadedFileName = fileNameMatch?.[1] || "jornal_ofertas.pdf";
      const a = document.createElement("a");
      a.href = url;
      a.download = downloadedFileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Jornal PDF gerado com sucesso!");
    } catch (error: any) {
      console.error("Erro ao gerar jornal:", error);
      toast.error(error?.message || "Erro ao gerar o jornal consolidado.");
    } finally {
      setIsGeneratingJornal(false);
    }
  };

  const hasHeaderConfigured = Boolean(headerFile || lastHeaderName);
  const isJornalConfigComplete =
    hasHeaderConfigured &&
    Boolean(backgroundColor) &&
    Boolean(categoryBoxColor) &&
    footerText.trim().length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100 text-slate-800 p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left bg-white/70 p-8 rounded-3xl border border-white/80 backdrop-blur-xl shadow-[0_20px_50px_rgba(148,163,184,0.35)]">
          <div className="space-y-2">
            <div className="flex items-center gap-3 justify-center md:justify-start">
              <div className="bg-gradient-to-br from-blue-500 to-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-blue-400/35">
                <Settings2 className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-800 to-blue-600">
                Gerador de Jornal de Ofertas
              </h1>
            </div>
            <p className="text-slate-500 text-lg font-medium">
              Plataforma Inteligente de Automação de Cards
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" className="rounded-full bg-white border-slate-200 hover:bg-slate-100">
              <Sun className="w-5 h-5 text-slate-500" />
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Processing Area */}
          <div className="lg:col-span-2 space-y-8">
            <Card className="bg-white/80 border-white/80 shadow-[0_18px_40px_rgba(148,163,184,0.30)] backdrop-blur-xl overflow-hidden rounded-3xl">
              <CardHeader className="border-b border-slate-100 bg-white/70">
                <CardTitle className="flex items-center gap-2 text-slate-800">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-xs text-white font-bold">1</span>
                  Escolha sua Planilha
                </CardTitle>
                <CardDescription className="text-slate-500">
                  Converta dados Excel em cards PDF profissionais em segundos
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                {!isProcessing && !isCompleted ? (
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${isDragActive ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-400 hover:bg-slate-50"}`}
                  >
                    <input {...getInputProps()} />
                    <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Upload className="w-10 h-10 text-blue-400" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2 text-slate-800">{file ? file.name : "Clique ou arraste seu arquivo"}</h3>
                    <p className="text-slate-500">Apenas arquivos .xlsx (máximo 10MB)</p>
                  </div>
                ) : isProcessing ? (
                  <div className="space-y-8 py-10 text-center">
                    <div className="relative w-24 h-24 mx-auto mb-6">
                      <Loader2 className="w-24 h-24 text-blue-500 animate-spin opacity-20" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-2xl font-bold text-blue-400">{progress}%</span>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-2xl font-bold text-slate-800">Processando Cards</h3>
                      <Progress value={progress} className="h-3 bg-slate-200" />
                      <div className="flex justify-center gap-8">
                        <div className="bg-white p-4 rounded-xl border border-slate-100 min-w-[120px] shadow-sm">
                          <p className="text-2xl font-bold text-blue-400">{processedCount}</p>
                          <p className="text-xs text-slate-500 uppercase tracking-wider">Gerados</p>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-100 min-w-[120px] shadow-sm">
                          <p className="text-2xl font-bold text-slate-700">{totalCount}</p>
                          <p className="text-xs text-slate-500 uppercase tracking-wider">Total</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-10 space-y-6 animate-in fade-in zoom-in duration-500">
                    <div className="bg-emerald-500/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto border-4 border-emerald-500/30">
                      <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                    </div>
                    <div>
                      <h3 className="text-3xl font-bold text-slate-800 mb-2 uppercase tracking-tight">Sucesso!</h3>
                      <p className="text-emerald-400/80 font-medium">{cards.length} cards foram gerados com perfeição.</p>
                    </div>
                    <Button onClick={() => setIsCompleted(false)} variant="link" className="text-blue-400 hover:text-blue-300">
                      Processar outra planilha
                    </Button>
                  </div>
                )}

                <Button 
                  onClick={handleProcessExcel} 
                  disabled={!file || isProcessing || isCompleted}
                  className="w-full h-16 text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-xl shadow-blue-600/20 transition-all active:scale-95 text-white"
                >
                  {isProcessing ? "TRABALHANDO..." : "PROCESSAR PLANILHA AGORA"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Customization Panel */}
          <div className="space-y-8">
            <Card className="bg-white/80 border-white/80 shadow-[0_18px_40px_rgba(148,163,184,0.30)] backdrop-blur-xl rounded-3xl">
              <CardHeader className="border-b border-slate-100 bg-white/70">
                <CardTitle className="flex items-center gap-2 text-slate-800">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-cyan-600 text-sm font-bold">2</span>
                  Personalize seu Jornal
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-slate-500 uppercase text-[10px] font-black tracking-widest flex items-center gap-2">
                      <ImageIcon className="w-3 h-3" /> Imagem de Cabeçalho (Header)
                    </Label>
                    <div className="flex gap-2">
                      <label className="flex-1 cursor-pointer bg-white/5 border border-white/10 rounded-xl p-3 text-xs hover:bg-white/10 transition-all truncate text-center font-medium">
                        <input type="file" className="hidden" accept="image/*,.pdf" onChange={(e) => setHeaderFile(e.target.files?.[0] || null)} />
                        {headerFile ? headerFile.name : lastHeaderName ? `Último: ${lastHeaderName}` : "Escolher Imagem"}
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-slate-500 uppercase text-[10px] font-black tracking-widest flex items-center gap-2">
                        <Palette className="w-3 h-3" /> Cor de Fundo
                      </Label>
                      <div className="flex gap-2">
                        <Input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="w-10 h-10 p-1 bg-white border-slate-200 rounded-lg cursor-pointer" />
                        <Input value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="flex-1 bg-white border-slate-200 rounded-lg text-xs font-mono" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-slate-500 uppercase text-[10px] font-black tracking-widest flex items-center gap-2">
                        <Palette className="w-3 h-3" /> Categorias
                      </Label>
                      <div className="flex gap-2">
                        <Input type="color" value={categoryBoxColor} onChange={(e) => setCategoryBoxColor(e.target.value)} className="w-10 h-10 p-1 bg-white border-slate-200 rounded-lg cursor-pointer" />
                        <Input value={categoryBoxColor} onChange={(e) => setCategoryBoxColor(e.target.value)} className="flex-1 bg-white border-slate-200 rounded-lg text-xs font-mono" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-slate-500 uppercase text-[10px] font-black tracking-widest flex items-center gap-2">
                      <Type className="w-3 h-3" /> Texto do Rodapé
                    </Label>
                    <Textarea 
                      value={footerText} 
                      onChange={(e) => setFooterText(e.target.value)}
                      placeholder="Ex: OFERTAS VÁLIDAS ENQUANTO DURAREM OS ESTOQUES..."
                      className="bg-white border-slate-200 rounded-xl text-xs h-24 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <Separator className="bg-slate-100" />

                <div className="grid grid-cols-2 gap-4">
                  <Button 
                    variant="outline" 
                    onClick={handleDownloadZip} 
                    disabled={cards.length === 0}
                    className="border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[10px] font-bold h-12 rounded-xl"
                  >
                    <Download className="w-4 h-4 mr-2" /> BAIXAR ZIP
                  </Button>
                  <Button 
                    onClick={handleGenerateJornal} 
                    disabled={cards.length === 0 || isGeneratingJornal || !isJornalConfigComplete}
                    className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-[10px] font-bold h-12 rounded-xl shadow-lg shadow-blue-500/20"
                  >
                    {isGeneratingJornal ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                    GERAR JORNAL PDF
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer Autoria */}
        <footer className="text-center py-12 border-t border-slate-200">
          <p className="text-[10px] font-black tracking-[0.4em] text-slate-400 uppercase">
            Desenvolvido por Esio Lima — Versão 3.0
          </p>
        </footer>
      </div>
    </div>
  );
};

export default CardGenerator;
