"use client";

import { useState, useEffect, useRef } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface Flashcard {
  question: string;
  answer: string;
}

interface QuizQuestion {
  question: string;
  options: string[];
  correctAnswerIndex: number;
  explanation: string;
}

interface DocItem {
  id: string;
  file_name: string;
  summary: string;
  flashcards?: Flashcard[];
  quiz?: QuizQuestion[];
  created_at: string;
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<string>("");
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>("Study_Guide");
  const [loading, setLoading] = useState<boolean>(false);
  const [cardLoading, setCardLoading] = useState<boolean>(false);
  const [quizLoading, setQuizLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [flippedCards, setFlippedCards] = useState<{ [key: number]: boolean }>({});
  const [quiz, setQuiz] = useState<QuizQuestion[]>([]);
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: number }>({});
  const [showResults, setShowResults] = useState<boolean>(false);
  const [history, setHistory] = useState<DocItem[]>([]);
  const [isCameraCapture, setIsCameraCapture] = useState<boolean>(false);
  const [deviceId, setDeviceId] = useState<string>("");

  const [activeTab, setActiveTab] = useState<"summary" | "flashcards" | "quiz">("summary");

  const [showCamera, setShowCamera] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string>("");
  const [capturedPreview, setCapturedPreview] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const fetchHistory = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/documents?t=${Date.now()}`, {
        cache: "no-store",
        headers: { "x-device-id": deviceId },
      });
      const data = await res.json();
      if (Array.isArray(data.documents)) {
        setHistory(data.documents);
      }
    } catch (err) {
      console.error("Could not load history", err);
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (deviceId) {
      fetchHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (capturedPreview) {
        URL.revokeObjectURL(capturedPreview);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let id = localStorage.getItem("soblescan_device_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("soblescan_device_id", id);
    }
    setDeviceId(id);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

      if (!allowedTypes.includes(selected.type)) {
        setErrorMessage("Unsupported file type. Please upload a JPG, PNG, WEBP, or PDF.");
        setFile(null);
        return;
      }

      if (selected.size > 10 * 1024 * 1024) {
        setErrorMessage("File too large. Maximum size is 10MB.");
        setFile(null);
        return;
      }

      setFile(selected);
      setCurrentFileName(selected.name.replace(/\.[^/.]+$/, ""));
      setIsCameraCapture(false);
      setErrorMessage("");
    }
  };

  const openCamera = async () => {
    setCameraError("");
    setCapturedPreview(null);
    setCapturedBlob(null);
    setShowCamera(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err: any) {
      setCameraError(
        "Could not access camera. Please allow camera permissions or use file upload instead."
      );
    }
  };

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (capturedPreview) {
      URL.revokeObjectURL(capturedPreview);
    }
    setCapturedPreview(null);
    setCapturedBlob(null);
    setShowCamera(false);
    setCameraError("");
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setCapturedBlob(blob);
        setCapturedPreview(URL.createObjectURL(blob));
      },
      "image/jpeg",
      0.92
    );
  };

  const retakePhoto = () => {
    if (capturedPreview) {
      URL.revokeObjectURL(capturedPreview);
    }
    setCapturedPreview(null);
    setCapturedBlob(null);
  };

  const confirmPhoto = () => {
    if (!capturedBlob) return;

    const capturedFile = new File([capturedBlob], `capture_${Date.now()}.jpg`, {
      type: "image/jpeg",
    });
    setFile(capturedFile);
    setCurrentFileName(`Capture_${new Date().toLocaleDateString().replace(/\//g, "-")}`);
    setIsCameraCapture(true);
    setErrorMessage("");

    if (capturedPreview) {
      URL.revokeObjectURL(capturedPreview);
    }
    setCapturedPreview(null);
    setCapturedBlob(null);
    closeCamera();
  };

  const handleScan = async () => {
    if (!file || loading) return;
    setLoading(true);
    setSummary("");
    setFlashcards([]);
    setFlippedCards({});
    setQuiz([]);
    setSelectedAnswers({});
    setShowResults(false);
    setErrorMessage("");
    setActiveTab("summary");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "x-device-id": deviceId },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to scan document");

      setSummary(data.summary);
      setDocumentId(data.documentId);
      fetchHistory();
    } catch (error: any) {
      setErrorMessage(error.message || "An unexpected error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectHistoryDoc = (doc: DocItem) => {
    setSummary(doc.summary);
    setDocumentId(doc.id);
    setCurrentFileName(doc.file_name.replace(/\.[^/.]+$/, ""));
    setFlashcards(Array.isArray(doc.flashcards) ? doc.flashcards : []);
    setQuiz(Array.isArray(doc.quiz) ? doc.quiz : []);
    setFlippedCards({});
    setSelectedAnswers({});
    setShowResults(false);
    setErrorMessage("");
    setActiveTab("summary");
  };

  const handleDeleteDoc = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this scan?")) return;

    try {
      const res = await fetch("/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-device-id": deviceId },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) throw new Error("Failed to delete document");

      if (documentId === id) {
        setSummary("");
        setDocumentId(null);
        setFlashcards([]);
        setQuiz([]);
      }

      setHistory((prev) => prev.filter((doc) => doc.id !== id));
    } catch (err: any) {
      alert(err.message || "Could not delete document");
    }
  };

  const handleGenerateFlashcards = async (forceNew = false) => {
    if (!summary || cardLoading) return;
    setCardLoading(true);
    setErrorMessage("");

    try {
      const response = await fetch("/api/flashcards", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-id": deviceId },
        body: JSON.stringify({ documentId, summary, forceNew }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to generate flashcards");

      setFlashcards(data.flashcards);
      setFlippedCards({});
      setActiveTab("flashcards");
      fetchHistory();
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to create flashcards");
    } finally {
      setCardLoading(false);
    }
  };

  const handleGenerateQuiz = async (forceNew = false) => {
    if (!summary || quizLoading) return;
    setQuizLoading(true);
    setSelectedAnswers({});
    setShowResults(false);
    setErrorMessage("");

    try {
      const response = await fetch("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-id": deviceId },
        body: JSON.stringify({ documentId, summary, forceNew }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to generate quiz");

      setQuiz(data.quiz);
      setActiveTab("quiz");
      fetchHistory();

      const container = document.getElementById("main-scroll-area");
      if (container) {
        container.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (error: any) {
      setErrorMessage(error.message || "Failed to create quiz");
    } finally {
      setQuizLoading(false);
    }
  };

  const toggleCardFlip = (idx: number) => {
    setFlippedCards((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const handleSelectOption = (qIdx: number, optIdx: number) => {
    if (showResults) return;
    setSelectedAnswers((prev) => ({ ...prev, [qIdx]: optIdx }));
  };

  const handleSubmitQuiz = () => {
    setShowResults(true);
    setTimeout(() => {
      const container = document.getElementById("main-scroll-area");
      if (container) {
        container.scrollTo({ top: 0, behavior: "smooth" });
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      document.documentElement.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
  };

  const score = quiz.reduce((acc, q, idx) => {
    return selectedAnswers[idx] === q.correctAnswerIndex ? acc + 1 : acc;
  }, 0);

  const handleExportPDF = () => {
    if (!summary) return;

    const safeFileName = currentFileName.replace(/[^a-zA-Z0-9 _-]/g, "").trim() || "Study_Guide";

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.setTextColor(30, 41, 59);
    doc.text("SobelScan Study Guide", 14, 20);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text(`Source: ${safeFileName} | Date: ${new Date().toLocaleDateString()}`, 14, 26);
    doc.line(14, 30, pageWidth - 14, 30);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text("1. Document Summary", 14, 40);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(51, 65, 85);

    const cleanSummary = summary.replace(/[#*`_]/g, "");
    const splitSummary = doc.splitTextToSize(cleanSummary, pageWidth - 28);
    doc.text(splitSummary, 14, 48);

    let nextY = 48 + splitSummary.length * 5;

    if (flashcards.length > 0) {
      if (nextY > 230) {
        doc.addPage();
        nextY = 20;
      } else {
        nextY += 10;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text("2. Key Flashcards", 14, nextY);

      const tableData = flashcards.map((c) => [c.question, c.answer]);
      autoTable(doc, {
        startY: nextY + 5,
        head: [["Question", "Answer"]],
        body: tableData,
        headStyles: { fillColor: [79, 70, 229] },
        styles: { fontSize: 9, cellPadding: 4 },
        margin: { left: 14, right: 14 },
      });
    }

    if (quiz.length > 0) {
      const lastTable = (doc as any).lastAutoTable;
      let quizY = lastTable ? lastTable.finalY + 15 : nextY + 10;

      if (quizY > 250) {
        doc.addPage();
        quizY = 20;
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(15, 23, 42);
      doc.text("3. Practice Quiz", 14, quizY);

      const quizTableData = quiz.map((q, i) => [
        `${i + 1}. ${q.question}`,
        q.options[q.correctAnswerIndex] || "",
      ]);

      autoTable(doc, {
        startY: quizY + 5,
        head: [["Question", "Correct Answer"]],
        body: quizTableData,
        headStyles: { fillColor: [16, 185, 129] },
        styles: { fontSize: 9, cellPadding: 4 },
        margin: { left: 14, right: 14 },
      });
    }

    doc.save(`${safeFileName}_Study_Guide.pdf`);
  };

  return (
    <main
      className="flex min-h-screen"
      style={{ backgroundColor: "#EEF0EA", fontFamily: "'Source Serif 4', serif" }}
    >
      <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&family=JetBrains+Mono:wght@400;500&display=swap");

        @keyframes scanbeam {
          0% {
            top: 0%;
            opacity: 0;
          }
          8% {
            opacity: 1;
          }
          92% {
            opacity: 1;
          }
          100% {
            top: 100%;
            opacity: 0;
          }
        }
        .scan-beam {
          position: absolute;
          left: 0;
          right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #2f6fed, transparent);
          box-shadow: 0 0 12px 2px rgba(47, 111, 237, 0.6);
          animation: scanbeam 3.2s ease-in-out infinite;
          pointer-events: none;
        }
        .ruled-paper {
          background-image: repeating-linear-gradient(
            to bottom,
            transparent,
            transparent 27px,
            #d8dcd3 28px
          );
        }
      `}</style>

      {/* Sidebar */}
      <aside
        className="w-80 border-r hidden md:flex flex-col justify-between shrink-0"
        style={{ backgroundColor: "#FBFBF8", borderColor: "#D8DCD3" }}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-1">
            <h2
              className="text-sm font-semibold tracking-widest uppercase"
              style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#1C2521" }}
            >
              Scan Log
            </h2>
            <button
              type="button"
              onClick={fetchHistory}
              disabled={refreshing}
              className="flex items-center gap-1 text-xs font-semibold disabled:opacity-50 transition"
              style={{ color: "#2F6FED", fontFamily: "'JetBrains Mono', monospace" }}
            >
              <svg
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {refreshing ? "syncing" : "refresh"}
            </button>
          </div>
          <div className="h-px w-full mb-4" style={{ backgroundColor: "#D8DCD3" }} />

          <div className="space-y-1 overflow-y-auto max-h-[85vh]">
            {history.length === 0 ? (
              <p
                className="text-xs italic"
                style={{ color: "#8B958E", fontFamily: "'JetBrains Mono', monospace" }}
              >
                log is empty — scan your first page
              </p>
            ) : (
              history.map((doc) => (
                <div
                  key={doc.id}
                  onClick={() => handleSelectHistoryDoc(doc)}
                  className="group relative flex items-center justify-between px-3 py-2.5 cursor-pointer border-l-2 transition"
                  style={{
                    borderColor: documentId === doc.id ? "#2F6FED" : "transparent",
                    backgroundColor: documentId === doc.id ? "#EAF1FE" : "transparent",
                  }}
                >
                  <div className="truncate pr-2">
                    <p
                      className="truncate text-sm"
                      style={{
                        color: "#1C2521",
                        fontWeight: documentId === doc.id ? 600 : 400,
                      }}
                    >
                      {doc.file_name}
                    </p>
                    <p
                      className="text-[10px] mt-0.5"
                      style={{ color: "#8B958E", fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      {new Date(doc.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteDoc(e, doc.id)}
                    title="Delete Scan"
                    className="opacity-0 group-hover:opacity-100 transition p-1 rounded hover:bg-red-50"
                    style={{ color: "#8B958E" }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </aside>

      {/* Main Container */}
      <div id="main-scroll-area" className="flex-1 p-6 md:p-10 flex flex-col items-center overflow-y-auto">
        <div
          className="w-full max-w-3xl rounded-sm p-8 md:p-10 relative overflow-hidden"
          style={{
            backgroundColor: "#FBFBF8",
            border: "1px solid #D8DCD3",
            boxShadow: "6px 6px 0px 0px #D8DCD3",
          }}
        >
          <div className="scan-beam" />

          <div className="flex items-center justify-center mb-3">
            <span
              className="text-[10px] tracking-[0.2em] uppercase px-2.5 py-1 rounded-full border"
              style={{
                color: "#2F6FED",
                borderColor: "#2F6FED",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              AI Document Scanner
            </span>
          </div>

          <h1
            className="text-4xl md:text-5xl font-bold text-center mb-2 tracking-tight"
            style={{ fontFamily: "'Space Grotesk', sans-serif", color: "#1C2521" }}
          >
            Soblescan
          </h1>
          <p
            className="text-center text-sm mb-8 max-w-lg mx-auto leading-relaxed"
            style={{ color: "#5B6660" }}
          >
            Feed a page through the scanner. We'll pull the text, the takeaways,
            and the questions worth remembering.
          </p>

          <div className="mb-6 flex flex-col items-center gap-3">
            <div
              className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md p-4 rounded-sm"
              style={{ border: "1px dashed #B8C0B4", backgroundColor: "#F5F6F1" }}
            >
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleFileChange}
                className="block w-full text-sm file:mr-4 file:rounded-sm file:border-0 file:px-4 file:py-2 file:text-sm file:font-semibold hover:file:opacity-90"
                style={{ color: "#5B6660" }}
              />
              <span
                className="text-xs shrink-0"
                style={{ color: "#8B958E", fontFamily: "'JetBrains Mono', monospace" }}
              >
                or
              </span>
              <button
                type="button"
                onClick={openCamera}
                className="flex items-center justify-center gap-1.5 rounded-sm px-4 py-2 text-sm font-semibold transition shrink-0 w-full sm:w-auto"
                style={{ backgroundColor: "#1C2521", color: "#FBFBF8" }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Take Photo
              </button>
            </div>

            {file && isCameraCapture && (
              <div
                className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-sm border"
                style={{
                  color: "#3E6B1F",
                  backgroundColor: "#EFFADB",
                  borderColor: "#B9E86B",
                  fontFamily: "'JetBrains Mono', monospace",
                }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                captured: {file.name}
              </div>
            )}

            {file && (
              <button
                onClick={handleScan}
                disabled={loading}
                className="px-6 py-2.5 text-sm font-semibold rounded-sm transition disabled:opacity-50"
                style={{ backgroundColor: "#2F6FED", color: "#FBFBF8" }}
              >
                {loading ? "Scanning..." : "Scan New Document"}
              </button>
            )}
          </div>

          {errorMessage && (
            <div
              className="mt-4 p-4 rounded-sm border"
              style={{ backgroundColor: "#FDEEED", borderColor: "#E2574C" }}
            >
              <h3
                className="text-sm font-semibold"
                style={{ color: "#B23A31", fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Error
              </h3>
              <p className="text-sm mt-1" style={{ color: "#B23A31" }}>
                {errorMessage}
              </p>
            </div>
          )}

          {summary && (
            <div className="mt-8">
              {/* Action Ribbon & Navigation Tabs */}
              <div
                className="flex flex-col sm:flex-row items-center justify-between pb-3 gap-3 border-b"
                style={{ borderColor: "#D8DCD3" }}
              >
                <div className="flex gap-1">
                  {(["summary", "flashcards", "quiz"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className="px-4 py-2 text-xs font-semibold uppercase tracking-wide rounded-sm transition"
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        backgroundColor: activeTab === tab ? "#1C2521" : "transparent",
                        color: activeTab === tab ? "#FBFBF8" : "#5B6660",
                      }}
                    >
                      {tab === "summary" && "Summary"}
                      {tab === "flashcards" && `Flashcards${flashcards.length > 0 ? ` (${flashcards.length})` : ""}`}
                      {tab === "quiz" && `Quiz${quiz.length > 0 ? ` (${quiz.length})` : ""}`}
                    </button>
                  ))}
                </div>

                <div className="flex gap-2">
                  {flashcards.length === 0 && (
                    <button
                      onClick={() => handleGenerateFlashcards(false)}
                      disabled={cardLoading}
                      className="px-3 py-1.5 text-xs font-semibold rounded-sm border disabled:opacity-50"
                      style={{ borderColor: "#2F6FED", color: "#2F6FED" }}
                    >
                      {cardLoading ? "Generating..." : "+ Flashcards"}
                    </button>
                  )}
                  {quiz.length === 0 && (
                    <button
                      onClick={() => handleGenerateQuiz(false)}
                      disabled={quizLoading}
                      className="px-3 py-1.5 text-xs font-semibold rounded-sm border disabled:opacity-50"
                      style={{ borderColor: "#3E6B1F", color: "#3E6B1F" }}
                    >
                      {quizLoading ? "Building..." : "+ Quiz"}
                    </button>
                  )}
                  <button
                    onClick={handleExportPDF}
                    className="px-3 py-1.5 text-xs font-semibold rounded-sm"
                    style={{ backgroundColor: "#1C2521", color: "#FBFBF8" }}
                  >
                    Export PDF
                  </button>
                </div>
              </div>

              {/* Tab 1: Summary */}
              {activeTab === "summary" && (
                <div
                  className="mt-6 p-6 rounded-sm ruled-paper"
                  style={{ backgroundColor: "#F5F6F1", border: "1px solid #D8DCD3" }}
                >
                  <pre
                    className="whitespace-pre-wrap text-sm leading-relaxed"
                    style={{ color: "#1C2521", fontFamily: "'Source Serif 4', serif" }}
                  >
                    {summary}
                  </pre>
                </div>
              )}

              {/* Tab 2: Interactive Flip Flashcards */}
              {activeTab === "flashcards" && (
                <div className="mt-6">
                  {flashcards.length === 0 ? (
                    <div
                      className="text-center py-12 rounded-sm"
                      style={{ border: "1px dashed #B8C0B4" }}
                    >
                      <p className="text-sm mb-3" style={{ color: "#5B6660" }}>
                        No flashcards generated yet for this scan.
                      </p>
                      <button
                        onClick={() => handleGenerateFlashcards(false)}
                        disabled={cardLoading}
                        className="px-4 py-2 text-xs font-semibold rounded-sm disabled:opacity-50"
                        style={{ backgroundColor: "#2F6FED", color: "#FBFBF8" }}
                      >
                        {cardLoading ? "Generating..." : "Generate Flashcards"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center text-xs" style={{ color: "#8B958E" }}>
                        <span>Click any card to reveal/hide answer</span>
                        <button
                          onClick={() => handleGenerateFlashcards(true)}
                          disabled={cardLoading}
                          className="font-semibold hover:underline"
                          style={{ color: "#2F6FED" }}
                        >
                          {cardLoading ? "Regenerating..." : "Regenerate Cards"}
                        </button>
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        {flashcards.map((card, idx) => {
                          const isFlipped = !!flippedCards[idx];
                          return (
                            <div
                              key={idx}
                              onClick={() => toggleCardFlip(idx)}
                              className="cursor-pointer rounded-sm p-5 transition min-h-[160px] flex flex-col justify-between select-none"
                              style={{
                                backgroundColor: isFlipped ? "#1C2521" : "#FBFBF8",
                                border: isFlipped ? "1px solid #1C2521" : "1px solid #D8DCD3",
                                boxShadow: "3px 3px 0px 0px #D8DCD3",
                              }}
                            >
                              <div>
                                <span
                                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                                  style={{
                                    fontFamily: "'JetBrains Mono', monospace",
                                    backgroundColor: isFlipped ? "#B9E86B" : "#EAF1FE",
                                    color: isFlipped ? "#1C2521" : "#2F6FED",
                                  }}
                                >
                                  {isFlipped ? "Answer" : `Card #${idx + 1}`}
                                </span>
                                <p
                                  className="mt-3 text-sm font-medium"
                                  style={{ color: isFlipped ? "#FBFBF8" : "#1C2521" }}
                                >
                                  {isFlipped ? card.answer : card.question}
                                </p>
                              </div>
                              <p
                                className="text-[10px] mt-4 font-semibold"
                                style={{
                                  fontFamily: "'JetBrains Mono', monospace",
                                  color: isFlipped ? "#B9E86B" : "#8B958E",
                                }}
                              >
                                {isFlipped ? "click to view question" : "click to reveal answer"}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Tab 3: Practice Quiz */}
              {activeTab === "quiz" && (
                <div className="mt-6">
                  {quiz.length === 0 ? (
                    <div
                      className="text-center py-12 rounded-sm"
                      style={{ border: "1px dashed #B8C0B4" }}
                    >
                      <p className="text-sm mb-3" style={{ color: "#5B6660" }}>
                        No practice quiz built yet for this scan.
                      </p>
                      <button
                        onClick={() => handleGenerateQuiz(false)}
                        disabled={quizLoading}
                        className="px-4 py-2 text-xs font-semibold rounded-sm disabled:opacity-50"
                        style={{ backgroundColor: "#3E6B1F", color: "#FBFBF8" }}
                      >
                        {quizLoading ? "Building Quiz..." : "Build Practice Quiz"}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div
                        className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b"
                        style={{ borderColor: "#D8DCD3" }}
                      >
                        <div>
                          {showResults ? (
                            <span
                              className="text-sm font-bold px-3 py-1 rounded-full"
                              style={{ backgroundColor: "#B9E86B", color: "#1C2521" }}
                            >
                              Score: {score} / {quiz.length}
                            </span>
                          ) : (
                            <span className="text-xs" style={{ color: "#8B958E" }}>
                              Select your answers and submit below
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => handleGenerateQuiz(true)}
                          disabled={quizLoading}
                          className="px-3.5 py-1.5 text-xs font-semibold rounded-sm disabled:opacity-50"
                          style={{ backgroundColor: "#3E6B1F", color: "#FBFBF8" }}
                        >
                          {quizLoading ? "Generating..." : "Generate New Questions"}
                        </button>
                      </div>

                      {quiz.map((q, qIdx) => (
                        <div
                          key={qIdx}
                          className="rounded-sm p-5"
                          style={{ backgroundColor: "#FBFBF8", border: "1px solid #D8DCD3" }}
                        >
                          <p className="text-sm font-bold mb-3" style={{ color: "#1C2521" }}>
                            {qIdx + 1}. {q.question}
                          </p>
                          <div className="space-y-2">
                            {q.options.map((option, optIdx) => {
                              const isSelected = selectedAnswers[qIdx] === optIdx;
                              const isCorrect = q.correctAnswerIndex === optIdx;

                              let borderColor = "#D8DCD3";
                              let bg = "transparent";
                              let textColor = "#5B6660";

                              if (isSelected && !showResults) {
                                borderColor = "#2F6FED";
                                bg = "#EAF1FE";
                                textColor = "#1C2521";
                              }
                              if (showResults) {
                                if (isCorrect) {
                                  borderColor = "#3E6B1F";
                                  bg = "#EFFADB";
                                  textColor = "#1C2521";
                                } else if (isSelected && !isCorrect) {
                                  borderColor = "#E2574C";
                                  bg = "#FDEEED";
                                  textColor = "#B23A31";
                                }
                              }

                              return (
                                <button
                                  key={optIdx}
                                  onClick={() => handleSelectOption(qIdx, optIdx)}
                                  className="w-full text-left p-3 rounded-sm border text-xs transition"
                                  style={{ borderColor, backgroundColor: bg, color: textColor }}
                                >
                                  {option}
                                </button>
                              );
                            })}
                          </div>
                          {showResults && (
                            <p
                              className="text-xs mt-3 pt-2 border-t"
                              style={{ color: "#5B6660", borderColor: "#D8DCD3" }}
                            >
                              <span className="font-semibold">Explanation:</span> {q.explanation}
                            </p>
                          )}
                        </div>
                      ))}

                      {!showResults && (
                        <button
                          onClick={handleSubmitQuiz}
                          disabled={Object.keys(selectedAnswers).length < quiz.length}
                          className="w-full py-2.5 text-sm font-semibold rounded-sm disabled:opacity-50"
                          style={{ backgroundColor: "#3E6B1F", color: "#FBFBF8" }}
                        >
                          Submit Quiz
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Live Camera Modal */}
      {showCamera && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-lg">
            {cameraError ? (
              <div className="rounded-sm p-6 text-center" style={{ backgroundColor: "#FBFBF8" }}>
                <p className="text-sm mb-4" style={{ color: "#B23A31" }}>{cameraError}</p>
                <button
                  onClick={closeCamera}
                  className="px-4 py-2 text-sm font-semibold rounded-sm"
                  style={{ backgroundColor: "#1C2521", color: "#FBFBF8" }}
                >
                  Close
                </button>
              </div>
            ) : (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full rounded-sm border-4 border-white/20 ${
                    capturedPreview ? "hidden" : "block"
                  }`}
                />

                {capturedPreview && (
                  <div className="relative">
                    <img
                      src={capturedPreview}
                      alt="Captured preview"
                      className="w-full rounded-sm border-4 border-white/20"
                    />
                    <span
                      className="absolute top-3 left-3 bg-black/60 text-white text-xs font-semibold px-2 py-1 rounded"
                      style={{ fontFamily: "'JetBrains Mono', monospace" }}
                    >
                      preview — check for blur before continuing
                    </span>
                  </div>
                )}

                <div className="flex items-center justify-center gap-6 mt-6">
                  {capturedPreview ? (
                    <>
                      <button
                        onClick={retakePhoto}
                        className="flex items-center gap-2 rounded-full border border-white/30 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10 transition"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Retake
                      </button>
                      <button
                        onClick={confirmPhoto}
                        className="flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold shadow-lg transition"
                        style={{ backgroundColor: "#B9E86B", color: "#1C2521" }}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Use This Photo
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={closeCamera}
                        className="rounded-full border border-white/30 px-5 py-3 text-sm font-semibold text-white hover:bg-white/10"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={capturePhoto}
                        className="rounded-full bg-white w-16 h-16 flex items-center justify-center shadow-lg hover:scale-105 transition"
                        title="Capture"
                      >
                        <div className="w-12 h-12 rounded-full" style={{ border: "4px solid #2F6FED" }} />
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}
    </main>
  );
}