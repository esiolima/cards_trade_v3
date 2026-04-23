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
  Sun,
  Info
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

      if (!response.ok) throw new Error("Erro ao gerar jornal");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "jornal_ofertas.pdf";
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success("Jornal PDF gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar jornal:", error);
      toast.error("Erro ao gerar o jornal consolidado.");
    } finally {
      setIsGeneratingJornal(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a192f] via-[#112240] to-[#0a192f] text-white p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header Section */}
        <header className="flex flex-col md:flex-row justify-between items-center gap-6 text-center md:text-left bg-white/5 p-8 rounded-2xl border border-white/10 backdrop-blur-sm shadow-2xl">
          <div className="space-y-2">
            <div className="flex items-center gap-3 justify-center md:justify-start">
              <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-500/20">
                <Settings2 className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-400">
                Gerador de Jornal de Ofertas
              </h1>
            </div>
            <p className="text-blue-200/60 text-lg font-medium">
              Plataforma Inteligente de Automação de Cards
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="icon" className="rounded-full bg-white/5 border-white/10 hover:bg-white/10">
              <Sun className="w-5 h-5" />
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Processing Area */}
          <div className="lg:col-span-2 space-y-8">
            <Card className="bg-[#112240]/80 border-white/10 shadow-xl backdrop-blur-md overflow-hidden">
              <CardHeader className="border-b border-white/5 bg-white/5">
                <CardTitle className="flex items-center gap-2 text-white">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-blue-600 text-sm font-bold">1</span>
                  Escolha sua Planilha
                </CardTitle>
                <CardDescription className="text-blue-200/50">
                  Converta dados Excel em cards PDF profissionais em segundos
                </CardDescription>
              </CardHeader>
              <CardContent className="p-8 space-y-6">
                {!isProcessing && !isCompleted ? (
                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${isDragActive ? "border-blue-500 bg-blue-500/10" : "border-white/10 hover:border-blue-500/50 hover:bg-white/5"}`}
                  >
                    <input {...getInputProps()} />
                    <div className="bg-blue-500/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                      <Upload className="w-10 h-10 text-blue-400" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2 text-white">{file ? file.name : "Clique ou arraste seu arquivo"}</h3>
                    <p className="text-blue-200/40">Apenas arquivos .xlsx (máximo 10MB)</p>
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
                      <h3 className="text-2xl font-bold text-white">Processando Cards</h3>
                      <Progress value={progress} className="h-3 bg-white/5" />
                      <div className="flex justify-center gap-8">
                        <div className="bg-white/5 p-4 rounded-xl border border-white/5 min-w-[120px]">
                          <p className="text-2xl font-bold text-blue-400">{processedCount}</p>
                          <p className="text-xs text-blue-200/40 uppercase tracking-wider">Gerados</p>
                        </div>
                        <div className="bg-white/5 p-4 rounded-xl border border-white/5 min-w-[120px]">
                          <p className="text-2xl font-bold text-white">{totalCount}</p>
                          <p className="text-xs text-blue-200/40 uppercase tracking-wider">Total</p>
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
                      <h3 className="text-3xl font-bold text-white mb-2 uppercase tracking-tight">Sucesso!</h3>
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
                  className="w-full h-16 text-lg font-bold bg-blue-600 hover:bg-blue-500 shadow-xl shadow-blue-600/20 transition-all active:scale-95"
                >
                  {isProcessing ? "TRABALHANDO..." : "PROCESSAR PLANILHA AGORA"}
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Customization Panel */}
          <div className="space-y-8">
            <Card className="bg-[#112240]/80 border-white/10 shadow-xl backdrop-blur-md">
              <CardHeader className="border-b border-white/5 bg-white/5">
                <CardTitle className="flex items-center gap-2 text-white">
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-cyan-600 text-sm font-bold">2</span>
                  Personalize seu Jornal
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-blue-200/60 uppercase text-[10px] font-black tracking-widest flex items-center gap-2">
                      <ImageIcon className="w-3 h-3" /> Imagem de Cabeçalho (Header)
                    </Label>
                    <div className="flex gap-2">
                      <label className="flex-1 cursor-pointer bg-white/5 border border-white/10 rounded-xl p-3 text-xs hover:bg-white/10 transition-all truncate text-center font-medium">
                        <input type="file" className="hidden" accept="image/*" onChange={(e) => setHeaderFile(e.target.files?.[0] || null)} />
                        {headerFile ? headerFile.name : lastHeaderName ? `Último: ${lastHeaderName}` : "Escolher Imagem"}
                      </label>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-blue-200/60 uppercase text-[10px] font-black tracking-widest flex items-center gap-2">
                        <Palette className="w-3 h-3" /> Cor de Fundo
                      </Label>
                      <div className="flex gap-2">
                        <Input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="w-10 h-10 p-1 bg-white/5 border-white/10 rounded-lg cursor-pointer" />
                        <Input value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="flex-1 bg-white/5 border-white/10 rounded-lg text-xs font-mono" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-blue-200/60 uppercase text-[10px] font-black tracking-widest flex items-center gap-2">
                        <Palette className="w-3 h-3" /> Categorias
                      </Label>
                      <div className="flex gap-2">
                        <Input type="color" value={categoryBoxColor} onChange={(e) => setCategoryBoxColor(e.target.value)} className="w-10 h-10 p-1 bg-white/5 border-white/10 rounded-lg cursor-pointer" />
                        <Input value={categoryBoxColor} onChange={(e) => setCategoryBoxColor(e.target.value)} className="flex-1 bg-white/5 border-white/10 rounded-lg text-xs font-mono" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-blue-200/60 uppercase text-[10px] font-black tracking-widest flex items-center gap-2">
                      <Type className="w-3 h-3" /> Texto do Rodapé
                    </Label>
                    <Textarea 
                      value={footerText} 
                      onChange={(e) => setFooterText(e.target.value)}
                      placeholder="Ex: OFERTAS VÁLIDAS ENQUANTO DURAREM OS ESTOQUES..."
                      className="bg-white/5 border-white/10 rounded-xl text-xs h-24 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <Separator className="bg-white/5" />

                <div className="grid grid-cols-2 gap-4">
                  <Button 
                    variant="outline" 
                    onClick={handleDownloadZip} 
                    disabled={cards.length === 0}
                    className="border-white/10 bg-white/5 hover:bg-white/10 text-blue-400 text-[10px] font-bold h-12 rounded-xl"
                  >
                    <Download className="w-4 h-4 mr-2" /> BAIXAR ZIP
                  </Button>
                  <Button 
                    onClick={handleGenerateJornal} 
                    disabled={cards.length === 0 || isGeneratingJornal}
                    className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-[10px] font-bold h-12 rounded-xl shadow-lg shadow-blue-500/20"
                  >
                    {isGeneratingJornal ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                    GERAR JORNAL PDF
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-blue-600/10 border-blue-500/20 shadow-xl">
              <CardContent className="p-6 flex items-start gap-4">
                <Info className="w-6 h-6 text-blue-400 shrink-0" />
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-blue-200 uppercase tracking-wider">Dica do Sistema</h4>
                  <p className="text-xs text-blue-200/60 leading-relaxed">
                    A versão 3.0 agora processa cards em paralelo usando seu servidor de alta performance. O tempo médio de geração é de 2 segundos por card.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer Autoria */}
        <footer className="text-center py-12 border-t border-white/5">
          <p className="text-[10px] font-black tracking-[0.4em] text-blue-500/40 uppercase">
            Desenvolvido por Esio Lima — Versão 3.0
          </p>
        </footer>
      </div>
    </div>
  );
};

export default CardGenerator;
