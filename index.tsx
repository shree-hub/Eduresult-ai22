
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { 
  User, 
  Lock, 
  LayoutDashboard, 
  Plus, 
  Search, 
  Trash2, 
  Edit, 
  LogOut, 
  GraduationCap, 
  ClipboardList,
  ChevronLeft,
  X,
  FileText,
  Camera,
  RotateCcw,
  CheckCircle,
  Loader2,
  Scan,
  AlertCircle,
  Settings,
  BookOpen,
  Folder,
  FolderPlus,
  ArrowRight,
  MoreVertical
} from 'lucide-react';
import { GoogleGenAI, Type } from "@google/genai";

// --- Interfaces ---

interface Marks {
  math: number;
  science: number;
  english: number;
  history: number;
  computer: number;
}

interface Student {
  id: string;
  name: string;
  rollNo: string;
  className: string;
  examName: string;
  marks: Marks;
  total: number;
  percentage: number;
  grade: string;
}

interface Exam {
  id: string;
  name: string;
  createdAt: string;
}

interface AICameraScannerProps {
  onScanComplete: (data: Partial<Student>) => void;
  onClose: () => void;
  fixedExamName?: string;
}

interface NavbarProps {
  onLogout?: () => void;
  isAdmin: boolean;
  setPage: (p: string) => void;
}

interface LandingProps {
  students: Student[];
  onCheckResult: (rollNo: string, examName: string) => void;
}

interface StudentResultProps {
  student: Student;
  onBack: () => void;
}

interface AdminDashboardProps {
  students: Student[];
  exams: Exam[];
  onAddStudent: (s: Partial<Student>) => void;
  onUpdateStudent: (s: Student) => void;
  onDeleteStudent: (id: string) => void;
  onAddExam: (name: string) => void;
  onDeleteExam: (id: string) => void;
}

interface LoginProps {
  onLogin: () => void;
}

// --- AI Service ---

const extractStudentDetailsFromImage = async (base64Image: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: 'image/jpeg',
                data: base64Image,
              },
            },
            {
              text: 'Analyze this answer sheet and extract the student details. Return ONLY a JSON object with the following fields: name (string), rollNo (string), className (string), examName (string - if visible on sheet), marks (object with number fields: math, science, english, history, computer). If a value is not found, use empty string for strings or 0 for numbers.',
            },
          ],
        },
      ],
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            rollNo: { type: Type.STRING },
            className: { type: Type.STRING },
            examName: { type: Type.STRING },
            marks: {
              type: Type.OBJECT,
              properties: {
                math: { type: Type.NUMBER },
                science: { type: Type.NUMBER },
                english: { type: Type.NUMBER },
                history: { type: Type.NUMBER },
                computer: { type: Type.NUMBER },
              },
              required: ['math', 'science', 'english', 'history', 'computer']
            }
          },
          required: ['name', 'rollNo', 'className', 'examName', 'marks']
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("AI extraction failed:", error);
    throw error;
  }
};

// --- Utils ---

const calculateGrade = (percentage: number): string => {
  if (percentage >= 90) return 'A+';
  if (percentage >= 80) return 'A';
  if (percentage >= 70) return 'B';
  if (percentage >= 55) return 'C';
  if (percentage >= 35) return 'D';
  return 'F'; 
};

const processStudentData = (data: Partial<Student>): Student => {
  const m = data.marks || { math: 0, science: 0, english: 0, history: 0, computer: 0 };
  const total = Object.values(m).reduce((a, b) => a + (Number(b) || 0), 0);
  const percentage = Number((total / 5).toFixed(2));
  return {
    ...data,
    id: data.id || crypto.randomUUID(),
    name: data.name || '',
    rollNo: data.rollNo || '',
    className: data.className || '',
    examName: data.examName || 'Standard Exam',
    marks: m,
    total,
    percentage,
    grade: calculateGrade(percentage),
  } as Student;
};

// --- Components ---

const AICameraScanner = ({ onScanComplete, onClose, fixedExamName }: AICameraScannerProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [loadMessageIndex, setLoadMessageIndex] = useState(0);

  const loadingMessages = [
    "Initializing camera sensor...",
    "Setting up scanning focus...",
    "Optimizing for low light...",
    "Establishing AI connection...",
  ];

  useEffect(() => {
    startCamera();
    const interval = setInterval(() => setLoadMessageIndex(i => (i + 1) % loadingMessages.length), 2000);
    return () => { stopCamera(); clearInterval(interval); };
  }, []);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = s;
      if (videoRef.current) {
        videoRef.current.srcObject = s;
        videoRef.current.onloadedmetadata = () => setCameraActive(true);
      }
    } catch (err) {
      setError("Camera access denied or unavailable.");
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    setCameraActive(false);
  };

  const captureAndScan = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    const imageDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(imageDataUrl);
    setIsScanning(true);
    
    try {
      const extracted = await extractStudentDetailsFromImage(imageDataUrl.split(',')[1]);
      if (fixedExamName) extracted.examName = fixedExamName;
      onScanComplete(extracted);
    } catch (err) {
      setError("AI analysis failed. Please try a clearer photo.");
      setCapturedImage(null);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900 z-[100] flex flex-col">
      <div className="p-4 flex justify-between items-center bg-slate-800 border-b border-slate-700">
        <h2 className="text-white font-bold flex items-center gap-2"><Scan className="text-indigo-400" /> AI Scanner</h2>
        <button onClick={() => { stopCamera(); onClose(); }} className="p-2 bg-red-500 text-white rounded-full"><X /></button>
      </div>
      <div className="flex-1 relative bg-black flex items-center justify-center">
        {error && <div className="absolute top-4 bg-red-600 text-white px-4 py-2 rounded-lg z-50">{error}</div>}
        {capturedImage ? <img src={capturedImage} className="max-h-full" /> : cameraActive ? <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" /> : <div className="text-indigo-400 flex flex-col items-center gap-4"><Loader2 className="animate-spin" size={48} /><p>{loadingMessages[loadMessageIndex]}</p></div>}
        {isScanning && <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white z-50"><Loader2 className="animate-spin mb-4" size={64} /><p className="text-xl font-bold">AI Analyzing Content...</p></div>}
        {!capturedImage && cameraActive && <button onClick={captureAndScan} className="absolute bottom-10 bg-indigo-600 p-6 rounded-full border-4 border-white shadow-2xl hover:scale-105 transition-transform"><Camera size={32} className="text-white" /></button>}
      </div>
      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
};

const Navbar = ({ onLogout, isAdmin, setPage }: NavbarProps) => (
  <nav className="bg-indigo-700 text-white shadow-lg sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-4 h-16 flex justify-between items-center">
      <div className="flex items-center cursor-pointer group" onClick={() => setPage('landing')}>
        <GraduationCap className="h-8 w-8 mr-2 group-hover:rotate-12 transition-transform" />
        <span className="font-bold text-xl tracking-tight">EduResult</span>
      </div>
      <div className="flex items-center space-x-4">
        {isAdmin ? (
          <button onClick={onLogout} className="flex items-center space-x-2 bg-indigo-800 hover:bg-indigo-900 px-4 py-2 rounded-xl transition-all active:scale-95">
            <LogOut size={18} />
            <span className="font-medium">Logout</span>
          </button>
        ) : (
          <button onClick={() => setPage('login')} className="flex items-center space-x-2 bg-indigo-800 hover:bg-indigo-900 px-4 py-2 rounded-xl transition-all active:scale-95">
            <Lock size={18} />
            <span className="font-medium">Admin Access</span>
          </button>
        )}
      </div>
    </div>
  </nav>
);

const Landing = ({ students, onCheckResult }: LandingProps) => {
  const [rollNo, setRollNo] = useState('');
  const [selectedExam, setSelectedExam] = useState('');
  const exams = useMemo(() => Array.from(new Set(students.map(s => s.examName))).sort(), [students]);

  useEffect(() => { if (exams.length > 0 && !selectedExam) setSelectedExam(exams[0]); }, [exams]);

  return (
    <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-6xl font-extrabold text-slate-900 mb-4 tracking-tight">Check Your <span className="text-indigo-600">Results</span></h1>
        <p className="text-slate-600 text-lg max-w-lg mx-auto leading-relaxed">Secure and fast access to your academic performance records.</p>
      </div>
      <div className="w-full max-w-md bg-white p-8 rounded-3xl shadow-xl border border-slate-100 space-y-5">
        <div className="space-y-2">
          <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Select Exam</label>
          <div className="relative">
            <BookOpen className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <select 
              value={selectedExam} onChange={e => setSelectedExam(e.target.value)}
              className="w-full pl-12 pr-4 py-4 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 font-semibold appearance-none bg-white"
            >
              {exams.length === 0 ? <option disabled>No exams available</option> : exams.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Roll Number</label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" value={rollNo} onChange={e => setRollNo(e.target.value)}
              placeholder="e.g. 2024-001"
              className="w-full pl-12 pr-4 py-4 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 font-semibold"
            />
          </div>
        </div>
        <button 
          onClick={() => onCheckResult(rollNo, selectedExam)}
          disabled={!rollNo || !selectedExam}
          className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg disabled:opacity-50 text-lg"
        >
          View Marksheet
        </button>
      </div>
    </div>
  );
};

const StudentResult = ({ student, onBack }: StudentResultProps) => (
  <div className="max-w-4xl mx-auto p-4 py-12">
    <button onClick={onBack} className="flex items-center text-indigo-600 hover:text-indigo-800 mb-8 font-semibold transition-colors group">
      <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
      <span>Back to Search</span>
    </button>
    <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-slate-100">
      <div className={`${student.grade === 'F' ? 'bg-red-600' : 'bg-indigo-700'} p-12 text-white flex flex-col md:flex-row justify-between items-center gap-8`}>
        <div className="text-center md:text-left">
          <h2 className="text-4xl font-black uppercase mb-2">{student.name}</h2>
          <p className="text-xl opacity-80 font-medium">{student.examName} • Roll: {student.rollNo}</p>
        </div>
        <div className="bg-white/20 px-10 py-6 rounded-3xl text-center border border-white/30 backdrop-blur-sm">
          <p className="text-xs uppercase font-black text-white/70 tracking-widest mb-1">Final Grade</p>
          <p className="text-6xl font-black">{student.grade}</p>
        </div>
      </div>
      <div className="p-12 grid grid-cols-1 md:grid-cols-2 gap-12">
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-slate-800 flex items-center border-b pb-3"><ClipboardList className="mr-3 text-indigo-500" /> Subject Marks</h3>
          {Object.entries(student.marks).map(([subject, marks]) => (
            <div key={subject} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="font-semibold capitalize text-slate-700">{subject}</span>
              <span className="font-black text-slate-900">{marks} <span className="text-xs text-slate-400">/ 100</span></span>
            </div>
          ))}
        </div>
        <div className="space-y-6">
          <h3 className="text-xl font-bold text-slate-800 flex items-center border-b pb-3"><FileText className="mr-3 text-indigo-500" /> Summary</h3>
          <div className="p-8 bg-indigo-50/50 rounded-3xl border border-indigo-100">
            <div className="grid grid-cols-2 gap-8 mb-8">
              <div><p className="text-xs font-black text-slate-400 uppercase tracking-widest">Total</p><p className="text-4xl font-black text-slate-800">{student.total}</p></div>
              <div className="text-right"><p className="text-xs font-black text-slate-400 uppercase tracking-widest">Percentage</p><p className="text-4xl font-black text-indigo-600">{student.percentage}%</p></div>
            </div>
            <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 transition-all duration-1000" style={{ width: `${student.percentage}%` }}></div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

const AdminDashboard = ({ students, exams, onAddStudent, onUpdateStudent, onDeleteStudent, onAddExam, onDeleteExam }: AdminDashboardProps) => {
  const [currentExam, setCurrentExam] = useState<Exam | null>(null);
  const [showExamModal, setShowExamModal] = useState(false);
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [examInput, setExamInput] = useState('');
  const [formData, setFormData] = useState<Partial<Student>>({
    name: '', rollNo: '', className: '', examName: '',
    marks: { math: 0, science: 0, english: 0, history: 0, computer: 0 }
  });

  const filteredStudents = useMemo(() => 
    currentExam ? students.filter(s => s.examName === currentExam.name) : []
  , [students, currentExam]);

  const handleAddExam = (e: React.FormEvent) => {
    e.preventDefault();
    if (examInput.trim()) {
      onAddExam(examInput.trim());
      setExamInput('');
      setShowExamModal(false);
    }
  };

  const handleStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = { ...formData, examName: currentExam?.name || formData.examName };
    if (editingId) onUpdateStudent(processStudentData({ ...data, id: editingId }));
    else onAddStudent(processStudentData(data));
    setShowStudentModal(false);
    setEditingId(null);
  };

  const openStudentModal = (s?: Student) => {
    if (s) { setFormData(s); setEditingId(s.id); }
    else { setFormData({ name: '', rollNo: '', className: '', examName: currentExam?.name || '', marks: { math: 0, science: 0, english: 0, history: 0, computer: 0 } }); setEditingId(null); }
    setShowStudentModal(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {showScanner && (
        <AICameraScanner 
          fixedExamName={currentExam?.name}
          onScanComplete={d => { setFormData(d); setShowScanner(false); setShowStudentModal(true); }}
          onClose={() => setShowScanner(false)}
        />
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-12">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center">
            <LayoutDashboard className="mr-3 text-indigo-600" size={32} />
            {currentExam ? `Exam: ${currentExam.name}` : 'Exam Folders'}
          </h1>
          <p className="text-slate-500 font-medium">
            {currentExam ? `Manage student records for ${currentExam.name}` : 'Organize student results by creating folders for different exams.'}
          </p>
        </div>
        <div className="flex gap-4">
          {currentExam ? (
            <>
              <button onClick={() => setCurrentExam(null)} className="flex items-center gap-2 px-6 py-3 border border-slate-200 text-slate-600 rounded-2xl font-bold hover:bg-slate-50">
                <ChevronLeft size={20} /> Back to Folders
              </button>
              <button onClick={() => setShowScanner(true)} className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800">
                <Camera size={20} /> AI Scan
              </button>
              <button onClick={() => openStudentModal()} className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700">
                <Plus size={20} /> Add Student
              </button>
            </>
          ) : (
            <button onClick={() => setShowExamModal(true)} className="flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-xl hover:bg-indigo-700 active:scale-95 transition-all">
              <FolderPlus size={24} /> New Exam Folder
            </button>
          )}
        </div>
      </div>

      {!currentExam ? (
        /* Folder View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {exams.map(exam => (
            <div key={exam.id} className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 hover:shadow-xl hover:border-indigo-100 transition-all cursor-pointer group flex flex-col justify-between" onClick={() => setCurrentExam(exam)}>
              <div className="flex justify-between items-start mb-6">
                <div className="p-4 bg-indigo-50 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Folder size={32} />
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); if(confirm(`Delete folder "${exam.name}" and all its records?`)) onDeleteExam(exam.id); }}
                  className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                ><Trash2 size={20} /></button>
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-900 mb-1">{exam.name}</h3>
                <p className="text-slate-400 text-sm font-medium">
                  {students.filter(s => s.examName === exam.name).length} Students Enrolled
                </p>
              </div>
              <div className="mt-6 flex items-center text-indigo-600 font-bold group-hover:gap-2 transition-all">
                Enter Folder <ArrowRight size={18} className="ml-1" />
              </div>
            </div>
          ))}
          {exams.length === 0 && (
            <div className="col-span-full py-24 bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] text-center">
              <Folder size={64} className="mx-auto text-slate-200 mb-4" />
              <p className="text-slate-400 font-bold text-xl">Create your first exam folder to get started.</p>
            </div>
          )}
        </div>
      ) : (
        /* Student List View */
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-400 text-xs uppercase font-black tracking-widest">
              <tr>
                <th className="px-8 py-5">Student Information</th>
                <th className="px-8 py-5">Score</th>
                <th className="px-8 py-5">Grade</th>
                <th className="px-8 py-5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredStudents.map(s => (
                <tr key={s.id} className="hover:bg-slate-50/50 transition-colors group">
                  <td className="px-8 py-5">
                    <p className="font-bold text-slate-900">{s.name}</p>
                    <p className="text-xs text-slate-400">Roll: {s.rollNo} • {s.className}</p>
                  </td>
                  <td className="px-8 py-5 font-black text-slate-700">{s.total}/500 ({s.percentage}%)</td>
                  <td className="px-8 py-5">
                    <span className={`px-4 py-1.5 rounded-full text-xs font-black tracking-widest border ${s.grade === 'F' ? 'bg-red-100 text-red-600 border-red-200' : 'bg-green-100 text-green-600 border-green-200'}`}>
                      {s.grade}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right space-x-2">
                    <button onClick={() => openStudentModal(s)} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"><Edit size={18} /></button>
                    <button onClick={() => onDeleteStudent(s.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                  </td>
                </tr>
              ))}
              {filteredStudents.length === 0 && (
                <tr><td colSpan={4} className="py-20 text-center text-slate-300 font-bold">No students in this exam folder.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showExamModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[90]">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95">
            <h3 className="text-2xl font-black text-slate-900 mb-6">New Exam Folder</h3>
            <form onSubmit={handleAddExam} className="space-y-6">
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block">Exam Name</label>
                <input required autoFocus value={examInput} onChange={e => setExamInput(e.target.value)} className="w-full px-6 py-4 border border-slate-100 bg-slate-50 rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none text-slate-900 font-bold" placeholder="e.g. Finals 2024" />
              </div>
              <div className="flex gap-4">
                <button type="button" onClick={() => setShowExamModal(false)} className="flex-1 py-4 border border-slate-100 rounded-2xl font-bold text-slate-400">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">Create</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showStudentModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[90]">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-8 animate-in zoom-in-95">
            <div className="flex justify-between items-center mb-8">
              <h3 className="text-2xl font-black text-slate-900">{editingId ? 'Edit Student' : 'Enroll Student'}</h3>
              <button onClick={() => setShowStudentModal(false)} className="text-slate-300 hover:text-slate-600"><X size={32} /></button>
            </div>
            <form onSubmit={handleStudentSubmit} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block px-1">Full Name</label>
                  <input required value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 font-bold" />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block px-1">Roll No</label>
                  <input required value={formData.rollNo || ''} onChange={e => setFormData({...formData, rollNo: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 font-bold" />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 block px-1">Class</label>
                  <input required value={formData.className || ''} onChange={e => setFormData({...formData, className: e.target.value})} className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 font-bold" />
                </div>
              </div>
              <div className="bg-slate-50 p-6 rounded-3xl space-y-4 border border-slate-100">
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Academic Data (0-100)</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {['math', 'science', 'english', 'history', 'computer'].map(sub => (
                    <div key={sub}>
                      <label className="block text-[10px] font-black uppercase text-slate-500 mb-1 px-1">{sub}</label>
                      <input 
                        type="number" required min="0" max="100"
                        value={formData.marks?.[sub as keyof Marks] ?? 0}
                        onChange={e => setFormData({...formData, marks: {...(formData.marks as Marks), [sub]: parseInt(e.target.value) || 0}})}
                        className="w-full px-4 py-3 bg-white border border-slate-100 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 font-black text-center text-lg"
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-4">
                <button type="button" onClick={() => setShowStudentModal(false)} className="flex-1 py-4 border border-slate-100 rounded-2xl font-bold text-slate-400">Cancel</button>
                <button type="submit" className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black shadow-lg">Save Record</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const Login = ({ onLogin }: LoginProps) => {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setTimeout(() => {
      if (user === 'admin' && pass === 'admin') onLogin();
      else { setError('Unauthorized Credentials'); setLoading(false); }
    }, 1000);
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white p-12 rounded-[3rem] shadow-2xl border border-slate-100 relative overflow-hidden">
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-indigo-600 text-white p-5 rounded-[2rem] shadow-xl">
           {loading ? <Loader2 className="animate-spin" size={32} /> : <Lock size={32} />}
        </div>
        <div className="text-center mt-10 mb-8">
          <h2 className="text-3xl font-black text-slate-900 mb-2">Admin Gateway</h2>
          <p className="text-slate-500 font-medium">Access centralized management system.</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-4">
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
              <input required value={user} onChange={e => setUser(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-slate-50/50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 font-bold" placeholder="Username" />
            </div>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
              <input type="password" required value={pass} onChange={e => setPass(e.target.value)} className="w-full pl-12 pr-4 py-4 bg-slate-50/50 border border-slate-100 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 font-bold" placeholder="Password" />
            </div>
          </div>
          {error && <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-sm font-bold flex items-center gap-2 border border-red-100"><AlertCircle size={18} /> {error}</div>}
          <button disabled={loading} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black shadow-xl hover:bg-slate-800 disabled:bg-slate-400 transition-all text-lg">Sign In</button>
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-around text-xs font-black text-indigo-600 uppercase tracking-widest"><span>Demo: admin</span><span>Pass: admin</span></div>
        </form>
      </div>
    </div>
  );
};

const App = () => {
  const [page, setPage] = useState('landing');
  const [isAdmin, setIsAdmin] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [selected, setSelected] = useState<Student | null>(null);

  useEffect(() => {
    const s = localStorage.getItem('student_db');
    const e = localStorage.getItem('exam_db');
    if (s) setStudents(JSON.parse(s));
    if (e) setExams(JSON.parse(e));
    if (sessionStorage.getItem('is_admin') === 'true') setIsAdmin(true);
  }, []);

  useEffect(() => localStorage.setItem('student_db', JSON.stringify(students)), [students]);
  useEffect(() => localStorage.setItem('exam_db', JSON.stringify(exams)), [exams]);

  const handleLogin = () => { setIsAdmin(true); sessionStorage.setItem('is_admin', 'true'); setPage('admin'); };
  const handleLogout = () => { setIsAdmin(false); sessionStorage.removeItem('is_admin'); setPage('landing'); };

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col selection:bg-indigo-100 selection:text-indigo-700">
      <Navbar isAdmin={isAdmin} onLogout={handleLogout} setPage={setPage} />
      <main className="flex-1">
        {page === 'landing' && <Landing students={students} onCheckResult={(r, ex) => {
          const s = students.find(st => st.rollNo.trim().toLowerCase() === r.trim().toLowerCase() && st.examName === ex);
          if (s) { setSelected(s); setPage('result'); } else alert('Record not found.');
        }} />}
        {page === 'login' && <Login onLogin={handleLogin} />}
        {page === 'result' && selected && <StudentResult student={selected} onBack={() => setPage('landing')} />}
        {page === 'admin' && isAdmin && (
          <AdminDashboard 
            students={students} exams={exams}
            onAddStudent={s => setStudents([...students, s as Student])}
            onUpdateStudent={s => setStudents(students.map(st => st.id === s.id ? s : st))}
            onDeleteStudent={id => { if(confirm('Delete record?')) setStudents(students.filter(s => s.id !== id)); }}
            onAddExam={n => setExams([...exams, { id: crypto.randomUUID(), name: n, createdAt: new Date().toISOString() }])}
            onDeleteExam={id => {
              const ex = exams.find(e => e.id === id);
              setExams(exams.filter(e => e.id !== id));
              setStudents(students.filter(s => s.examName !== ex?.name));
            }}
          />
        )}
      </main>
      <footer className="py-8 text-center text-slate-400 text-sm border-t bg-white">
        <p className="font-bold uppercase tracking-[0.2em] text-[10px] mb-1">EduResult Portal</p>
        <p className="font-medium">&copy; {new Date().getFullYear()} Advanced AI-Powered Record Management</p>
      </footer>
    </div>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
