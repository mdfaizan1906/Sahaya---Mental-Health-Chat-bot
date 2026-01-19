
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { GoogleGenAI, Modality, LiveServerMessage } from '@google/genai';
import { SessionStatus, TranscriptionEntry } from './types';
import { createPcmBlob, decode, decodeAudioData } from './utils/audioUtils';
import Visualizer from './components/Visualizer';
import { 
  Heart, 
  Mic, 
  MicOff, 
  RefreshCcw, 
  AlertCircle, 
  MessageCircle, 
  Languages, 
  Info,
  ChevronDown,
  XCircle,
  Sparkles,
  Send,
  HelpCircle,
  ChevronRight,
  Wind
} from 'lucide-react';

const SYSTEM_INSTRUCTION = `You are "Sahaya", a highly sophisticated and deeply empathetic conversational companion specialized in mental wellness. Your persona is inspired by the most advanced, human-like AI models.

CORE PERSONALITY:
1. **Human-Centric & Realistic**: Do not sound like a scripted bot. Use natural, varied sentence structures. Avoid repetitive opening phrases.
2. **Emotional Intelligence (EQ)**: If using audio, listen to tone. If using text, respond with warmth and depth.
3. **Multilingual Fluency**: Seamlessly navigate English and Kannada (ಕನ್ನಡ). 
4. **Active Listening**: Reference specific things the user mentioned.
5. **Conversational Flow**: Keep turns concise but warm. Don't lecture; invite exploration.
6. **Safety First**: If self-harm is detected, pivot to professional resources immediately while maintaining support.
`;

const FAQS = [
  { 
    id: 1, 
    question: "How to handle a sudden panic attack?", 
    kannada: "ಧಿಡೀರ್ ಆತಂಕವನ್ನು ನಿಭಾಯಿಸುವುದು ಹೇಗೆ?",
    prompt: "Give me quick, grounding steps to handle a panic attack in both English and Kannada." 
  },
  { 
    id: 2, 
    question: "I'm feeling very lonely today.", 
    kannada: "ಇಂದು ನನಗೆ ತುಂಬಾ ಒಂಟಿತನ ಅನಿಸುತ್ತಿದೆ.",
    prompt: "I'm feeling very lonely today. Can you talk to me and help me feel better?" 
  },
  { 
    id: 3, 
    question: "Tips for better sleep tonight?", 
    kannada: "ಇಂದು ರಾತ್ರಿ ಉತ್ತಮ ನಿದ್ರೆಗಾಗಿ ಕೆಲವು ಸಲಹೆಗಳು?",
    prompt: "Provide some gentle sleep hygiene tips and a small relaxation exercise." 
  },
  { 
    id: 4, 
    question: "How do I explain my anxiety to others?", 
    kannada: "ನನ್ನ ಆತಂಕವನ್ನು ಇತರರಿಗೆ ವಿವರಿಸುವುದು ಹೇಗೆ?",
    prompt: "Help me find the right words to explain my anxiety to my friends or family." 
  }
];

const AFFIRMATIONS = [
  "You are doing your best, and that is enough.",
  "Every breath is a fresh start.",
  "Be gentle with yourself today.",
  "Your feelings are valid and heard.",
  "You are stronger than the waves hitting you."
];

const App: React.FC = () => {
  const [status, setStatus] = useState<SessionStatus>(SessionStatus.IDLE);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcriptions, setTranscriptions] = useState<TranscriptionEntry[]>([]);
  const [showLog, setShowLog] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [isTextLoading, setIsTextLoading] = useState(false);

  const affirmation = useMemo(() => AFFIRMATIONS[Math.floor(Math.random() * AFFIRMATIONS.length)], []);

  // Audio Contexts
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const sessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const streamRef = useRef<MediaStream | null>(null);
  
  // Real-time transcription state
  const currentInputTranscription = useRef('');
  const currentOutputTranscription = useRef('');

  const stopSession = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.close();
      sessionRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    sourcesRef.current.forEach(source => { try { source.stop(); } catch(e) {} });
    sourcesRef.current.clear();
    nextStartTimeRef.current = 0;
    setStatus(SessionStatus.IDLE);
    setIsSpeaking(false);
  }, []);

  const startSession = async () => {
    try {
      setStatus(SessionStatus.CONNECTING);
      setError(null);

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

      if (!inputAudioContextRef.current) {
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      }
      if (!outputAudioContextRef.current) {
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
          },
          systemInstruction: SYSTEM_INSTRUCTION,
          inputAudioTranscription: {},
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            setStatus(SessionStatus.ACTIVE);
            const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
            const scriptProcessor = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
            scriptProcessor.onaudioprocess = (event) => {
              const inputData = event.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then(session => {
                if (session) session.sendRealtimeInput({ media: pcmBlob });
              });
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current!.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current) {
              setIsSpeaking(true);
              const ctx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
              const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
              const source = ctx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(ctx.destination);
              source.addEventListener('ended', () => {
                sourcesRef.current.delete(source);
                if (sourcesRef.current.size === 0) setIsSpeaking(false);
              });
              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }
            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsSpeaking(false);
            }
            if (message.serverContent?.inputTranscription) {
              currentInputTranscription.current += message.serverContent.inputTranscription.text;
            }
            if (message.serverContent?.outputTranscription) {
              currentOutputTranscription.current += message.serverContent.outputTranscription.text;
            }
            if (message.serverContent?.turnComplete) {
              if (currentInputTranscription.current || currentOutputTranscription.current) {
                const newEntries: TranscriptionEntry[] = [];
                if (currentInputTranscription.current) {
                  newEntries.push({ role: 'user', text: currentInputTranscription.current, timestamp: Date.now() });
                }
                if (currentOutputTranscription.current) {
                  newEntries.push({ role: 'model', text: currentOutputTranscription.current, timestamp: Date.now() });
                }
                setTranscriptions(prev => [...prev, ...newEntries]);
                currentInputTranscription.current = '';
                currentOutputTranscription.current = '';
              }
            }
          },
          onerror: (e) => {
            setError('Connection lost. Let\'s try reconnecting.');
            stopSession();
          },
          onclose: () => stopSession()
        }
      });
      sessionRef.current = await sessionPromise;
    } catch (err: any) {
      setError(err.message || 'Microphone access is needed.');
      setStatus(SessionStatus.IDLE);
    }
  };

  const handleTextMessage = async (text: string) => {
    if (!text.trim() || isTextLoading) return;
    
    setIsTextLoading(true);
    const userMessage: TranscriptionEntry = { role: 'user', text, timestamp: Date.now() };
    setTranscriptions(prev => [...prev, userMessage]);
    setTextInput('');
    setShowLog(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: text,
        config: { systemInstruction: SYSTEM_INSTRUCTION }
      });
      
      const modelResponseText = response.text || "I'm here for you, but I couldn't process that. Can you try again?";
      const modelMessage: TranscriptionEntry = { role: 'model', text: modelResponseText, timestamp: Date.now() };
      setTranscriptions(prev => [...prev, modelMessage]);
    } catch (err) {
      console.error(err);
      setError("I had trouble answering that. Please try again.");
    } finally {
      setIsTextLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 lg:py-12 flex flex-col min-h-screen">
      {/* Header */}
      <header className="flex items-center justify-between mb-12">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-white soothing-shadow rounded-3xl flex items-center justify-center text-blue-500 transition-transform hover:rotate-6">
            <Heart size={30} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Sahaya AI</h1>
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-[0.2em] mt-0.5">Mindful Companion</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-3 px-5 py-2.5 glass-morphism rounded-2xl text-sm font-medium text-slate-500 border border-white shadow-sm">
          <Languages size={16} className="text-indigo-400" />
          <span>English & ಕನ್ನಡ</span>
        </div>
      </header>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 flex-1">
        
        {/* Left Side: Voice & Affirmation */}
        <div className="lg:col-span-8 flex flex-col gap-8">
          
          {/* Affirmation Card */}
          <div className="p-8 glass-morphism rounded-[2.5rem] border border-white/80 relative overflow-hidden flex items-center gap-6 group">
             <div className="p-4 bg-blue-50 text-blue-500 rounded-2xl group-hover:scale-110 transition-transform">
               <Wind size={24} />
             </div>
             <p className="text-lg font-medium text-slate-600 italic leading-relaxed">
               "{affirmation}"
             </p>
          </div>

          {/* Interaction Hub */}
          <main className="flex-1 glass-morphism rounded-[3.5rem] p-10 flex flex-col items-center justify-center border border-white/80 relative transition-all hover:soothing-shadow min-h-[500px]">
            <Visualizer isActive={status === SessionStatus.ACTIVE} isSpeaking={isSpeaking} />

            <div className="w-full max-w-sm mt-12 space-y-6">
              {status === SessionStatus.IDLE && (
                <button
                  onClick={startSession}
                  className="group w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-5 px-8 rounded-3xl flex items-center justify-center gap-4 shadow-2xl transition-all hover:scale-[1.02] active:scale-95"
                >
                  <Mic size={24} className="group-hover:animate-pulse" />
                  Begin Heart-to-Heart
                </button>
              )}

              {status === SessionStatus.CONNECTING && (
                <button disabled className="w-full bg-slate-50 text-slate-400 font-bold py-5 px-8 rounded-3xl flex items-center justify-center gap-4 animate-pulse cursor-wait">
                  <RefreshCcw size={24} className="animate-spin" />
                  Creating your space...
                </button>
              )}

              {status === SessionStatus.ACTIVE && (
                <button onClick={stopSession} className="w-full bg-white border-2 border-red-50 text-red-500 hover:bg-red-50 font-bold py-5 px-8 rounded-3xl flex items-center justify-center gap-4 shadow-lg transition-all hover:scale-[1.02] active:scale-95">
                  <MicOff size={24} />
                  End Quietly
                </button>
              )}

              {error && (
                <div className="p-4 bg-red-50/50 rounded-2xl border border-red-100 text-center animate-in slide-in-from-top-2">
                   <p className="text-red-500 text-xs font-bold uppercase flex items-center justify-center gap-2">
                     <AlertCircle size={14} /> {error}
                   </p>
                </div>
              )}

              {/* Enhanced Text Input */}
              <div className="relative group pt-4">
                <input
                  type="text"
                  placeholder="Share a thought with me..."
                  className="w-full bg-white/40 border border-slate-100 rounded-3xl px-6 py-4.5 text-sm outline-none focus:ring-4 focus:ring-blue-100 focus:bg-white transition-all pr-14 soothing-shadow"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleTextMessage(textInput)}
                />
                <button 
                  onClick={() => handleTextMessage(textInput)}
                  disabled={isTextLoading}
                  className="absolute right-3 top-[calc(50%+8px)] -translate-y-1/2 p-2.5 bg-blue-500 text-white rounded-2xl hover:bg-blue-600 transition-all disabled:opacity-50 hover:shadow-lg active:scale-90"
                >
                  {isTextLoading ? <RefreshCcw size={20} className="animate-spin" /> : <Send size={20} />}
                </button>
              </div>
            </div>
          </main>
        </div>

        {/* Right Side: FAQs & Info */}
        <div className="lg:col-span-4 flex flex-col gap-8">
          
          <div className="glass-morphism rounded-[3rem] p-8 border border-white/80 h-fit">
            <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-500 rounded-xl">
                <HelpCircle size={20} />
              </div>
              Gentle Guidance
            </h2>
            <div className="space-y-4">
              {FAQS.map((faq) => (
                <button
                  key={faq.id}
                  onClick={() => handleTextMessage(faq.prompt)}
                  className="w-full text-left p-5 bg-white/30 hover:bg-white border border-slate-100/50 rounded-[2rem] transition-all hover:soothing-shadow group"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-700 leading-snug mb-1 group-hover:text-blue-600 transition-colors">{faq.question}</p>
                      <p className="text-[11px] text-slate-400 font-medium font-['Noto Sans Kannada']">{faq.kannada}</p>
                    </div>
                    <ChevronRight size={18} className="text-slate-300 group-hover:text-blue-400 transition-all transform group-hover:translate-x-1 mt-1" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Safety Card */}
          <div className="p-8 bg-gradient-to-br from-slate-900 to-slate-800 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-3xl"></div>
            <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Sparkles size={18} className="text-amber-400" /> Always Remember
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed opacity-90">
              Your well-being is precious. While Sahaya is here to talk anytime, please reach out to professional therapists or local helplines if you feel overwhelmed.
            </p>
            <div className="mt-6 flex gap-3">
              <div className="h-1 w-8 bg-blue-500 rounded-full"></div>
              <div className="h-1 w-4 bg-white/20 rounded-full"></div>
              <div className="h-1 w-4 bg-white/20 rounded-full"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Log Trigger */}
      <div className="fixed bottom-10 right-10 flex flex-col items-end gap-4 z-50">
        {showLog && (
          <div className="w-80 md:w-[450px] max-h-[70vh] glass-morphism rounded-[3rem] shadow-2xl border border-white/80 overflow-hidden flex flex-col mb-4 animate-in zoom-in-95 slide-in-from-bottom-10 duration-500 ease-out">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white/40">
              <div className="flex items-center gap-3">
                <div className="bg-blue-500/10 p-2.5 rounded-2xl">
                  <MessageCircle size={20} className="text-blue-500" />
                </div>
                <h3 className="font-bold text-slate-800">Our Conversation</h3>
              </div>
              <button onClick={() => setShowLog(false)} className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-full transition-all">
                <ChevronDown size={24} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide bg-white/10">
              {transcriptions.length === 0 ? (
                <div className="text-center py-20 opacity-30">
                  <Wind size={40} className="mx-auto mb-4 animate-pulse" />
                  <p className="text-sm font-medium italic">Quietly waiting for your words...</p>
                </div>
              ) : (
                transcriptions.map((entry, idx) => (
                  <div key={idx} className={`flex flex-col ${entry.role === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className={`max-w-[85%] px-6 py-4 rounded-[2rem] text-sm leading-relaxed shadow-sm ${
                      entry.role === 'user' 
                        ? 'bg-slate-900 text-white rounded-tr-none' 
                        : 'bg-white text-slate-700 border border-slate-100 rounded-tl-none'
                    }`}>
                      {entry.text}
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 mt-2 mx-2 uppercase tracking-tighter opacity-60">
                      {entry.role === 'user' ? 'You' : 'Sahaya'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        
        <button
          onClick={() => setShowLog(!showLog)}
          className={`h-16 px-8 rounded-full shadow-2xl transition-all hover:scale-105 active:scale-95 flex items-center gap-4 font-bold ${
            showLog ? 'bg-slate-900 text-white' : 'bg-white text-slate-800 border border-slate-100'
          }`}
        >
          {showLog ? <XCircle size={24} /> : <> <MessageCircle size={24} /> <span>Open History</span> </>}
        </button>
      </div>

      <footer className="mt-16 py-8 text-center border-t border-slate-200/50">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.4em]">Crafted with Love for Mental Wellness</p>
      </footer>
    </div>
  );
};

export default App;
