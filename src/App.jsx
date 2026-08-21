import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  initializeApp,
  getAuth,
  signInAnonymously,
  signInWithCustomToken,
  getFirestore,
  doc,
  setDoc,
  collection,
  onSnapshot,
  updateDoc,
  deleteDoc,
} from './localDatabase.js';
import { Trophy, User, LogOut, Settings, Play, Star, Zap, Flame, ShieldAlert, ShieldCheck, Medal, Crown, X, Trash2, Ticket, Music, VolumeX, Bot, Info, Clock } from 'lucide-react';

const firebaseConfig = {};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'quiz-wheel-app';

const THEME = {
  bg: 'bg-[#0d0715]',
  primary: 'text-[#f5c542]',
  primaryBg: 'bg-[#f5c542]',
  secondary: 'text-[#2a1245]',
  secondaryBg: 'bg-[#2a1245]',
  accent: 'text-[#8b5cf6]',
  accentBg: 'bg-[#8b5cf6]',
  surface: 'bg-[#1a0b2e]',
  border: 'border-[#3d1a66]'
};

const DIFFICULTY_SCORES = {
  easy: { correct: 5, wrong: -2, name: 'Dễ' },
  medium: { correct: 10, wrong: -5, name: 'Trung Bình' },
  hard: { correct: 15, wrong: -7, name: 'Khó' }
};

const MAX_SPINS_PER_DAY = 5;

const getTodayString = () => new Date().toISOString().split('T')[0];
const getYesterdayString = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
};

const calculatePower = (user) => {
  if (!user) return 0;
  const streak = user.streak || 0;
  const correct = user.correctAnswers || 0;
  const perfectSpins = user.perfectSpins || 0; 
  const badgesCount = (user.badges || []).length;
  return (streak * 1) + (correct * 2) + (perfectSpins * 10) + (badgesCount * 5);
};

const calculateLevel = (power) => {
  if (power < 10) return { level: 0, title: "Chưa xếp hạng", next: 10 };
  if (power < 50) return { level: 1, title: "Tân Binh", next: 50 };
  if (power < 150) return { level: 2, title: "Học Giả", next: 150 };
  if (power < 300) return { level: 3, title: "Triết Gia", next: 300 };
  if (power < 600) return { level: 4, title: "Đại Thạc Sĩ", next: 600 };
  return { level: 5, title: "Huyền Thoại", next: 9999 };
};

const FORBIDDEN_WORDS = ['ngu', 'chó', 'đụ', 'địt', 'lồn', 'cặc', 'đĩ', 'dmm', 'vkl', 'vcl', 'đm', 'lon', 'cac', 'dit', 'buoi', 'cứt'];
const isProfane = (text) => {
   if (!text) return false;
   const str = ` ${text.toLowerCase()} `;
   return FORBIDDEN_WORDS.some(word => str.includes(` ${word} `));
};

const safeStorage = {
  set: (key, val) => { try { localStorage.setItem(key, val); } catch(e) {} },
  get: (key) => { try { return localStorage.getItem(key); } catch(e) { return null; } },
  remove: (key) => { try { localStorage.removeItem(key); } catch(e) {} }
};

let bgmAudioCtx = null;
let bgmBufferSource = null;

const createBGMBuffer = (ctx) => {
    const sampleRate = ctx.sampleRate;
    const notes = [
        261.63, 329.63, 392.00, 523.25, 
        392.00, 329.63, 261.63, 293.66, 
        349.23, 440.00, 523.25, 587.33, 
        523.25, 440.00, 349.23, 293.66  
    ];
    const noteDuration = 0.25; 
    const bufferLength = sampleRate * noteDuration * notes.length;
    const buffer = ctx.createBuffer(1, bufferLength, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < notes.length; i++) {
        const freq = notes[i];
        const startSample = Math.floor(i * noteDuration * sampleRate);
        const endSample = Math.floor((i + 1) * noteDuration * sampleRate);
        for (let j = startSample; j < endSample; j++) {
            const t = (j - startSample) / sampleRate;
            let envelope = t < 0.02 ? t / 0.02 : t > noteDuration - 0.02 ? (noteDuration - t) / 0.02 : 0.3 + 0.7 * Math.exp(-t * 15); 
            const phase = (t % (1/freq)) * freq;
            data[j] = (phase < 0.5 ? 1 : -1) * envelope * 0.015;
        }
    }
    return buffer;
};

const toggleBGM = (forceStop = false) => {
    try {
        if (!bgmAudioCtx) bgmAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if (bgmBufferSource || forceStop) {
            if (bgmBufferSource) { bgmBufferSource.stop(); bgmBufferSource.disconnect(); bgmBufferSource = null; }
            return false;
        } else {
            if (bgmAudioCtx.state === 'suspended') bgmAudioCtx.resume();
            bgmBufferSource = bgmAudioCtx.createBufferSource();
            bgmBufferSource.buffer = createBGMBuffer(bgmAudioCtx);
            bgmBufferSource.loop = true;
            bgmBufferSource.connect(bgmAudioCtx.destination);
            bgmBufferSource.start();
            return true;
        }
    } catch(e) { console.error("BGM error:", e); return false; }
};

const stopBGM = () => toggleBGM(true);

const playSound = (type) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();

    if (type === 'spin') {
      let startTime = ctx.currentTime;
      let tickRate = 0.05; 
      for (let i = 0; i < 25; i++) {
         const osc = ctx.createOscillator();
         const gainNode = ctx.createGain();
         osc.connect(gainNode); gainNode.connect(ctx.destination);
         osc.type = 'triangle'; osc.frequency.setValueAtTime(400 + (i * 15), startTime); 
         gainNode.gain.setValueAtTime(0, startTime);
         gainNode.gain.linearRampToValueAtTime(0.1, startTime + 0.01);
         gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + 0.05);
         osc.start(startTime); osc.stop(startTime + 0.05);
         startTime += tickRate; tickRate += 0.005; 
      }
      return;
    }

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    osc.connect(gainNode); gainNode.connect(ctx.destination);

    if (type === 'correct') {
      osc.type = 'sine';
      [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => osc.frequency.setValueAtTime(freq, ctx.currentTime + (i*0.1)));
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5);
    } else if (type === 'wrong') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.3);
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
    } else if (type === 'buy') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime); osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0, ctx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.3);
    }
  } catch(e) { console.log("Audio error", e); }
};

const QUESTION_BANKS = {
  math: [
    ['Kết quả của 36 + 27 là bao nhiêu?', ['63', '53', '73', '62'], 0],
    ['Một hình vuông có cạnh 6 cm. Chu vi hình vuông là bao nhiêu?', ['24 cm', '36 cm', '12 cm', '18 cm'], 0],
    ['Phân số nào bằng một nửa?', ['1/2', '2/3', '3/4', '1/3'], 0],
    ['Số tiếp theo trong dãy 3, 6, 9, 12 là số nào?', ['15', '14', '16', '18'], 0],
    ['Một lớp có 32 học sinh, chia đều thành 4 nhóm. Mỗi nhóm có bao nhiêu học sinh?', ['8', '6', '7', '9'], 0],
  ],
  vietnamese: [
    ['Từ nào dưới đây là từ chỉ hoạt động?', ['Chạy', 'Chiếc bàn', 'Màu xanh', 'Niềm vui'], 0],
    ['Câu nào dưới đây là câu hỏi?', ['Bạn đã làm bài tập chưa?', 'Em đang học bài.', 'Hãy mở sách ra!', 'Ôi, bông hoa đẹp quá!'], 0],
    ['Từ nào đồng nghĩa với “chăm chỉ”?', ['Siêng năng', 'Lười biếng', 'Chậm chạp', 'Ồn ào'], 0],
    ['Trong câu “Lan đọc sách”, từ nào chỉ người thực hiện hoạt động?', ['Lan', 'đọc', 'sách', 'đọc sách'], 0],
    ['Từ nào viết đúng chính tả?', ['nghỉ ngơi', 'ngĩ ngơi', 'nghĩ nghơi', 'ngỉ ngơi'], 0],
  ],
  science: [
    ['Bộ phận nào của cây hấp thụ nước và muối khoáng từ đất?', ['Rễ', 'Lá', 'Hoa', 'Quả'], 0],
    ['Con người cần khí nào để hô hấp?', ['Ô-xi', 'Cacbonic', 'Hiđrô', 'Nitơ'], 0],
    ['Nước chuyển từ thể lỏng sang thể khí gọi là gì?', ['Bay hơi', 'Đông đặc', 'Ngưng tụ', 'Nóng chảy'], 0],
    ['Hành tinh nào gần Mặt Trời nhất?', ['Sao Thủy', 'Trái Đất', 'Sao Hỏa', 'Sao Mộc'], 0],
    ['Nguồn năng lượng nào là năng lượng tái tạo?', ['Ánh sáng Mặt Trời', 'Than đá', 'Dầu mỏ', 'Khí tự nhiên'], 0],
  ],
  history: [
    ['Ai là người đọc bản Tuyên ngôn Độc lập ngày 2/9/1945?', ['Chủ tịch Hồ Chí Minh', 'Võ Nguyên Giáp', 'Phan Bội Châu', 'Trần Hưng Đạo'], 0],
    ['Chiến thắng Điện Biên Phủ diễn ra vào năm nào?', ['1954', '1945', '1975', '1968'], 0],
    ['Nhà Trần nổi tiếng với ba lần chiến thắng quân xâm lược nào?', ['Nguyên – Mông', 'Minh', 'Thanh', 'Tống'], 0],
    ['Vị vua nào dời đô từ Hoa Lư ra Thăng Long?', ['Lý Công Uẩn', 'Đinh Tiên Hoàng', 'Lê Lợi', 'Quang Trung'], 0],
  ],
  geography: [
    ['Thủ đô của Việt Nam là thành phố nào?', ['Hà Nội', 'Huế', 'Đà Nẵng', 'Thành phố Hồ Chí Minh'], 0],
    ['Dãy núi dài nhất Việt Nam là dãy núi nào?', ['Trường Sơn', 'Hoàng Liên Sơn', 'Tam Đảo', 'Bạch Mã'], 0],
    ['Đồng bằng lớn nhất Việt Nam là đồng bằng nào?', ['Đồng bằng sông Cửu Long', 'Đồng bằng sông Hồng', 'Đồng bằng duyên hải miền Trung', 'Cao nguyên Mộc Châu'], 0],
    ['Việt Nam nằm ở khu vực nào của châu Á?', ['Đông Nam Á', 'Đông Á', 'Nam Á', 'Trung Á'], 0],
  ],
  english: [
    ['Từ tiếng Anh nào có nghĩa là “quyển sách”?', ['book', 'pen', 'table', 'school'], 0],
    ['Chọn dạng đúng: “She ___ to school every day.”', ['goes', 'go', 'going', 'gone'], 0],
    ['Từ trái nghĩa với “hot” là gì?', ['cold', 'warm', 'big', 'fast'], 0],
    ['Câu nào dùng để hỏi tên?', ['What is your name?', 'How old are you?', 'Where are you from?', 'How are you?'], 0],
  ],
};

const selectQuestionBank = (topic) => {
  const value = topic.toLowerCase();
  if (/toán|phép tính|số học/.test(value)) return QUESTION_BANKS.math;
  if (/tiếng việt|ngữ văn|chính tả/.test(value)) return QUESTION_BANKS.vietnamese;
  if (/khoa học|tự nhiên|sinh học|vật lý|hóa học/.test(value)) return QUESTION_BANKS.science;
  if (/lịch sử/.test(value)) return QUESTION_BANKS.history;
  if (/địa lý|địa lí/.test(value)) return QUESTION_BANKS.geography;
  if (/tiếng anh|english/.test(value)) return QUESTION_BANKS.english;
  return [
    [`Nội dung nào sau đây phù hợp nhất với chủ đề “${topic}”?`, [`Kiến thức cốt lõi của ${topic}`, `Một nội dung không liên quan đến ${topic}`, 'Một nhận định thiếu căn cứ', 'Tất cả phương án đều sai'], 0],
    [`Khi tìm hiểu về “${topic}”, việc nào nên làm trước tiên?`, ['Xác định khái niệm và thông tin chính', 'Bỏ qua nguồn tài liệu', 'Chỉ học thuộc một câu', 'Không cần kiểm tra thông tin'], 0],
    [`Cách học nào giúp hiểu chủ đề “${topic}” tốt nhất?`, ['Kết hợp đọc, thực hành và tự giải thích', 'Chỉ nhìn đáp án', 'Không đặt câu hỏi', 'Ghi nhớ mà không hiểu'], 0],
  ];
};

const callGemini = async (prompt, systemInstruction = null, isJson = false) => {
  if (isJson) {
    const requestedCount = Math.min(10, Math.max(1, Number(prompt.match(/Tạo (\d+)/)?.[1] || 1)));
    const topic = prompt.match(/chủ đề: "([^"]+)"/)?.[1] || 'Kiến thức tổng hợp';
    const bank = selectQuestionBank(topic);
    const templates = Array.from({ length: requestedCount }, (_, index) => {
      const [text, options, correctIndex] = bank[index % bank.length];
      const shift = index % options.length;
      const rotatedOptions = [...options.slice(shift), ...options.slice(0, shift)];
      return { text, options: rotatedOptions, correctIndex: (correctIndex - shift + options.length) % options.length };
    });
    return JSON.stringify(templates);
  }

  const normalized = prompt.toLowerCase();
  if (normalized.includes('gợi ý') || normalized.includes('giải đố')) {
    return 'Hãy đọc kỹ câu hỏi, loại hai đáp án ít hợp lý nhất rồi chọn giữa hai phương án còn lại nhé!';
  }
  if (normalized.includes('lượt') || normalized.includes('quay')) {
    return 'Mỗi ngày bạn có 5 lượt. Hết lượt, hãy dùng xu mua thêm hoặc cổ vũ Top 3 để nhận xu nhé!';
  }
  if (normalized.includes('xu')) {
    return 'Bạn có thể nhận xu từ vòng quay, trả lời đúng và cổ vũ người chơi Top 3 khi hết lượt.';
  }
  return 'Cú Mèo gợi ý: vào Chơi Ngay để quay, trả lời đúng để tăng điểm và tích lũy Lực Học nhé!';
};

const AIAssistant = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [chat, setChat] = useState([{ role: 'model', text: 'Xin chào! Mình là Cú Mèo. Bạn cần mình giải đáp luật chơi, cách tính Lực Chiến hay cách kiếm điểm Xu?' }]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [chat, isOpen]);

  const handleSend = async (e) => {
    if (e) e.preventDefault();
    if (!input.trim() || isTyping) return;
    
    const userText = input.trim();
    setInput('');
    setChat(prev => [...prev, { role: 'user', text: userText }]);
    setIsTyping(true);

    const prompt = `Học sinh hỏi: "${userText}".\n\nThông tin game:\n- Vòng Quay Kiến Thức.\n- Quay vòng nhận câu hỏi trắc nghiệm.\n- Mỗi ngày có 5 lượt. Hết lượt có thể MUA THÊM lượt bằng xu (1 lượt=20xu, 3 lượt=45xu, 5 lượt=75xu, 10 lượt=150xu) hoặc đi Cổ vũ TOP 3 để nhận xu ngẫu nhiên.\n- Lực Chiến (LC) = (Chuỗi ngày x 1) + (Câu đúng x 2) + (Siêu tốc x 10) + (Huy hiệu x 5).\n- Trả lời đúng (Dễ +5, TB +10, Khó +15), Sai bị trừ.\n- Trả lời đúng 3 lần được +1 lượt quay miễn phí.\n\nĐóng vai trợ lý Cú Mèo, trả lời siêu ngắn gọn (1-2 câu), vui vẻ để hướng dẫn. Tuyệt đối không xưng "tôi" hay "robot".`;
    
    const response = await callGemini(prompt, "Bạn là Cú Mèo, trợ lý ảo trong game Vòng Quay Kiến Thức.");
    setChat(prev => [...prev, { role: 'model', text: response || 'Hệ thống năng lượng đang bảo trì, bạn hỏi lại sau xíu nhé!' }]);
    setIsTyping(false);
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {isOpen && (
        <div className="mb-4 w-72 sm:w-80 bg-[#1a0b2e] border-2 border-[#8b5cf6] rounded-2xl rounded-br-none shadow-[0_0_20px_rgba(139,92,246,0.4)] overflow-hidden flex flex-col h-[400px] animate-fade-in">
          <div className="bg-[#8b5cf6] text-white p-3 font-bold flex justify-between items-center">
            <span className="flex items-center gap-2">🦉 Cú Mèo Hỗ Trợ</span>
            <button onClick={() => setIsOpen(false)} className="text-white hover:scale-110 transition-transform"><X size={18} /></button>
          </div>
          <div ref={chatRef} className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-4 bg-[#0d0715]/80">
            {chat.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                 <div className={`max-w-[85%] p-3 rounded-xl text-sm ${msg.role === 'user' ? 'bg-[#f5c542] text-[#0d0715] font-medium rounded-br-none' : 'bg-[#2a1245] border border-[#3d1a66] text-gray-200 rounded-bl-none shadow-md'}`}>
                    {msg.text}
                 </div>
              </div>
            ))}
            {isTyping && (
               <div className="flex justify-start">
                  <div className="bg-[#2a1245] border border-[#3d1a66] p-3 rounded-xl rounded-bl-none flex gap-1 items-center h-10 shadow-md">
                     <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></span>
                     <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></span>
                     <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.4s'}}></span>
                  </div>
               </div>
            )}
          </div>
          <form onSubmit={handleSend} className="p-2 border-t border-[#3d1a66] flex gap-2 bg-[#1a0b2e]">
            <input type="text" value={input} onChange={e => setInput(e.target.value)} placeholder="Nhập câu hỏi của bạn..." className="flex-1 bg-[#0d0715] text-white text-sm rounded-lg px-3 py-2 outline-none focus:border-[#8b5cf6] border border-[#3d1a66] transition-colors" />
            <button type="submit" disabled={isTyping || !input.trim()} className="bg-[#8b5cf6] text-white p-2 rounded-lg disabled:opacity-50 hover:bg-[#7c3aed] transition-colors"><Zap size={18}/></button>
          </form>
        </div>
      )}
      
      <div className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#1a0b2e] border-2 border-[#8b5cf6] flex items-center justify-center shadow-[0_0_20px_rgba(139,92,246,0.5)] cursor-pointer hover:scale-110 transition-transform`}
           onClick={() => setIsOpen(!isOpen)}>
        {!isOpen && <span className="absolute -top-1 -right-1 flex h-4 w-4"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span></span>}
        <span className="text-3xl drop-shadow-[0_0_5px_#fff]">🦉</span>
      </div>
    </div>
  );
};

const PentagramAvatar = ({ colorClass, strokeColor }) => (
  <div className="absolute inset-0 pointer-events-none z-20 flex justify-center items-center">
    <svg viewBox="0 0 100 100" className="w-[120%] h-[120%] drop-shadow-[0_0_8px_currentColor]" style={{color: strokeColor}}>
      <circle cx="50" cy="50" r="46" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 3" className="opacity-60 animate-[spin_10s_linear_infinite]" />
      <polygon points="50,5 61,38 95,38 68,59 78,92 50,72 22,92 32,59 5,38 39,38" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-90" />
      <circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" strokeWidth="1" className="opacity-30" />
    </svg>
  </div>
);

const QuestionModal = ({ question, onClose }) => {
    const [timeLeft, setTimeLeft] = useState(15);
    const [selectedOpt, setSelectedOpt] = useState(null);
    const [isChecking, setIsChecking] = useState(false);
    const [aiHint, setAiHint] = useState('');
    const [isAskingAi, setIsAskingAi] = useState(false);
    
    const diffInfo = DIFFICULTY_SCORES[question.difficulty || 'medium'];

    useEffect(() => {
        if (isChecking) return;
        if (timeLeft <= 0) {
            handleCheck(-1);
            return;
        }
        const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
        return () => clearInterval(timer);
    }, [timeLeft, isChecking]);

    const handleCheck = (index) => {
        setIsChecking(true);
        setSelectedOpt(index);
        const isCorrect = index === question.correctIndex;
        setTimeout(() => {
            onClose(isCorrect, 15 - timeLeft);
        }, 2000);
    };

    const handleAskAi = async () => {
        setIsAskingAi(true);
        const prompt = `Câu hỏi: "${question.text}".\nĐáp án:\nA: ${question.options[0]}\nB: ${question.options[1]}\nC: ${question.options[2]}\nD: ${question.options[3]}\n\nHãy đưa ra một gợi ý ngắn gọn, vui vẻ để giúp học sinh suy luận ra đáp án, nhưng TUYỆT ĐỐI KHÔNG nói thẳng đáp án đúng là gì. Đóng vai Cú Mèo.`;
        const hint = await callGemini(prompt, "Bạn là Cú Mèo hỗ trợ giải đố.");
        setAiHint(hint || "Cú Mèo đang bận xíu, bạn tự cố gắng suy nghĩ nha!");
        setIsAskingAi(false);
    };

    return (
        <div className="fixed inset-0 bg-[#0d0715]/90 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#1a0b2e] border-2 border-[#8b5cf6] rounded-2xl p-6 w-full max-w-2xl shadow-[0_0_30px_rgba(139,92,246,0.3)] animate-fade-in relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-[#0d0715]">
                    <div className="h-full bg-gradient-to-r from-[#f5c542] to-red-500 transition-all duration-1000 ease-linear" style={{ width: `${(timeLeft / 15) * 100}%` }}></div>
                </div>

                <div className="flex justify-between items-center mb-6">
                    <div className="flex gap-2">
                        <span className={`px-3 py-1 rounded text-xs font-bold ${question.difficulty === 'hard' ? 'bg-red-900/50 text-red-400' : question.difficulty === 'easy' ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'}`}>
                            {diffInfo.name}
                        </span>
                        <span className="px-3 py-1 rounded text-xs font-bold bg-[#2a1245] text-white">Chủ đề: {question.topic}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-green-400 font-bold text-sm bg-green-900/30 px-2 py-1 rounded">+{diffInfo.correct} Xu</span>
                        <span className="text-red-400 font-bold text-sm bg-red-900/30 px-2 py-1 rounded">{diffInfo.wrong} Xu</span>
                    </div>
                </div>

                <div className="flex justify-between items-end mb-4">
                    <h2 className="text-xl sm:text-2xl font-bold text-white leading-relaxed flex-1">{question.text}</h2>
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center font-black text-2xl border-4 shrink-0 ml-4 ${timeLeft <= 5 ? 'text-red-500 border-red-500 animate-pulse' : 'text-[#f5c542] border-[#f5c542]'}`}>
                        {timeLeft}
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                    {question.options.map((opt, idx) => {
                        let btnClass = "bg-[#0d0715] border-[#3d1a66] text-white hover:bg-[#2a1245] hover:border-[#8b5cf6]";
                        if (isChecking) {
                            if (idx === question.correctIndex) btnClass = "bg-green-600 border-green-500 text-white shadow-[0_0_15px_#22c55e]";
                            else if (idx === selectedOpt) btnClass = "bg-red-600 border-red-500 text-white shadow-[0_0_15px_#ef4444]";
                            else btnClass = "bg-[#0d0715] border-[#3d1a66] text-gray-500 opacity-50";
                        }
                        const labels = ['A', 'B', 'C', 'D'];
                        return (
                            <button key={idx} onClick={() => !isChecking && handleCheck(idx)} disabled={isChecking}
                                className={`p-4 rounded-xl border text-left flex items-center gap-3 transition-all ${btnClass}`}>
                                <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${isChecking && idx === question.correctIndex ? 'bg-white text-green-600' : 'bg-[#2a1245] text-gray-300'}`}>
                                    {labels[idx]}
                                </span>
                                <span className="font-medium flex-1">{opt}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-6 pt-4 border-t border-[#3d1a66] flex justify-between items-center">
                    {!aiHint ? (
                         <button onClick={handleAskAi} disabled={isAskingAi || isChecking} className="flex items-center gap-2 text-sm text-[#f5c542] hover:text-[#ff9d00] font-medium transition-colors">
                             <Bot size={16} className={isAskingAi ? 'animate-bounce' : ''}/> 
                             {isAskingAi ? 'Cú Mèo đang suy nghĩ...' : 'Hỏi AI gợi ý'}
                         </button>
                    ) : (
                         <div className="text-sm text-yellow-200 bg-yellow-900/30 p-3 rounded-lg border border-yellow-700/50 w-full flex gap-2">
                             <Bot size={18} className="shrink-0 mt-0.5"/> <span>{aiHint}</span>
                         </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const WheelGame = ({ userData, questions }) => {
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState('');
  
  // 8 Pháp trận: 7 ô xu nhỏ, 1 ô Báu vật (Golden Node) vị trí số 7
  const NORMAL_NODES = [1, 2, 5, 1, 2, 5, 1];
  
  const SPIN_PACKAGES = [
    { id: 'pkg1', spins: 1, cost: 20 },
    { id: 'pkg2', spins: 3, cost: 45 },
    { id: 'pkg3', spins: 5, cost: 75 },
    { id: 'pkg4', spins: 10, cost: 150, badge: 'HOT' },
  ];

  const handleSpin = () => {
    if (isSpinning || showModal) return;
    if (questions.length === 0) { setMessage('Chưa có câu hỏi! Vui lòng liên hệ giáo viên.'); return; }
    if (userData.spinsLeft <= 0) {
      setMessage('Bạn đã hết lượt quay. Hãy mua thêm lượt bằng Xu ở ngay bên dưới nhé!');
      document.getElementById('store-section')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setIsSpinning(true);
    setMessage('');
    playSound('spin');

    const rand = Math.random();
    // Tỉ lệ 1/1000 vào ô Báu vật (nhân đôi Xu), ngược lại random 7 ô thường
    const targetSegment = rand < 0.001 ? 7 : Math.floor(Math.random() * 7);

    const segmentDegree = 360 / 8;
    const currentBase = rotation - (rotation % 360);
    const targetRotation = 360 - (targetSegment * segmentDegree);
    const variance = (Math.random() * 20) - 10;
    const totalRotation = currentBase + (360 * 5) + targetRotation + variance;

    setRotation(totalRotation);

    setTimeout(async () => {
      setIsSpinning(false);
      
      const isGolden = targetSegment === 7;
      const bonusXu = isGolden ? (userData.points || 0) : NORMAL_NODES[targetSegment];
      
      try {
         await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', userData.id), {
             points: (userData.points || 0) + bonusXu,
             spinsLeft: Math.max(0, userData.spinsLeft - 1)
         });
         setMessage(isGolden ? `🎉 BÁU VẬT! Bạn trúng ô Nhân Đôi Xu (+${bonusXu})!` : `✨ Trúng Pháp trận May mắn: +${bonusXu} xu!`);
         if(isGolden) playSound('correct');
      } catch (err) { console.error(err); }

      setTimeout(() => {
          const randomQ = questions[Math.floor(Math.random() * questions.length)];
          setSelectedQuestion(randomQ);
          setShowModal(true);
      }, 1500);
    }, 3000);
  };

  const handleAnswer = async (isCorrect, timeTaken) => {
    setShowModal(false);
    const diff = selectedQuestion.difficulty || 'medium';
    playSound(isCorrect ? 'correct' : 'wrong');

    const pointsChange = isCorrect ? DIFFICULTY_SCORES[diff].correct : DIFFICULTY_SCORES[diff].wrong;
    const currentPoints = userData.points || 0; // Đã được cộng xu từ vòng quay trước đó
    const newPoints = Math.max(0, currentPoints + pointsChange);

    const newCorrectCount = isCorrect ? (userData.correctAnswers || 0) + 1 : (userData.correctAnswers || 0);
    let finalSpinsLeft = userData.spinsLeft; 
    let freeSpinMsg = '';

    // Trả lời đúng 3 lần được +1 lượt quay
    if (isCorrect && newCorrectCount > 0 && newCorrectCount % 3 === 0) {
        finalSpinsLeft += 1;
        freeSpinMsg = '🎁 Bạn đã trả lời đúng 3 câu! Thưởng 1 LƯỢT QUAY MIỄN PHÍ!';
        playSound('buy');
    }

    const updates = {
      points: newPoints,
      correctAnswers: newCorrectCount,
      consecutiveCorrect: isCorrect ? Math.max(1, (userData.consecutiveCorrect || 0) + 1) : 0,
      spinsLeft: finalSpinsLeft
    };

    if (isCorrect && timeTaken < 5000) updates.perfectSpins = (userData.perfectSpins || 0) + 1;

    const badges = [...(userData.badges || [])];
    if (updates.consecutiveCorrect >= 10 && !badges.includes('Thiện xạ')) { badges.push('Thiện xạ'); updates.badges = badges; }

    updates.history = [
      { date: new Date().toISOString(), qId: selectedQuestion.id, topic: selectedQuestion.topic, correct: isCorrect, pointsChange },
      ...(userData.history || []).slice(0, 9)
    ];
    
    updates.power = calculatePower({ ...userData, ...updates });

    try {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', userData.id), updates);
      if (freeSpinMsg) setTimeout(() => setMessage(freeSpinMsg), 1000);
    } catch (err) { console.error("Error updating stats", err); }
  };

  const handleBuyPackage = async (spinsToAdd, cost) => {
    if (userData.points < cost) return;
    const updates = { points: userData.points - cost, spinsLeft: userData.spinsLeft + spinsToAdd };
    updates.power = calculatePower({ ...userData, ...updates }); 
    try {
      playSound('buy');
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', userData.id), updates);
      setMessage(`Mua thành công ${spinsToAdd} lượt quay! (-${cost} xu)`);
      setTimeout(() => setMessage(''), 3000);
    } catch (err) { console.error("Buy error", err); }
  };

  return (
    <div className="flex flex-col items-center mt-2 w-full">
      {/* HUD Header */}
      <div className="text-center mb-10 w-full max-w-md">
         <p className="text-gray-400 text-sm mb-4 font-medium tracking-wide">Vận mệnh đang chờ — Hãy thử vận may của bạn</p>
         <div className="flex justify-center gap-3">
            <div className="bg-[#1a0b2e] border border-[#f5c542]/50 px-5 py-2.5 rounded-full flex items-center gap-2 shadow-[0_0_15px_rgba(245,197,66,0.15)]">
               <Star className="text-[#f5c542]" size={16} fill="currentColor" />
               <span className="font-bold text-[#f5c542]">{userData.points || 0} xu</span>
            </div>
            <div className={`bg-[#1a0b2e] px-5 py-2.5 rounded-full flex items-center gap-2 relative ${userData.spinsLeft <= 0 ? 'border border-red-500/50 shadow-[0_0_15px_rgba(239,68,68,0.2)]' : 'border border-green-500/50 shadow-[0_0_15px_rgba(34,197,94,0.15)]'}`}>
               <span className={`text-lg leading-none ${userData.spinsLeft <= 0 ? 'text-red-400' : 'text-green-400'}`}>🍀</span>
               <span className={`font-bold ${userData.spinsLeft <= 0 ? 'text-red-400' : 'text-green-400'}`}>x{userData.spinsLeft}</span>
               <button onClick={() => document.getElementById('store-section')?.scrollIntoView({behavior: 'smooth', block: 'center'})} 
                       className="absolute -right-3 -top-2 w-7 h-7 bg-green-500 rounded-full text-[#0d0715] flex items-center justify-center font-black text-xl hover:scale-110 shadow-[0_0_10px_#22c55e] transition-transform animate-pulse z-10" 
                       title="Mua thêm lượt">+</button>
            </div>
         </div>
      </div>

      {message && <div className="mb-6 bg-[#2a1245] text-[#f5c542] border border-[#f5c542]/50 px-6 py-3 rounded-xl text-sm shadow-[0_0_20px_rgba(245,197,66,0.2)] font-bold animate-fade-in text-center">{message}</div>}

      {/* VÒNG QUAY DARK FANTASY */}
      <div className="relative w-[320px] h-[320px] sm:w-[480px] sm:h-[480px] my-6 mb-16 flex items-center justify-center">
        {/* Glow nền */}
        <div className="absolute inset-0 bg-[#8b5cf6] blur-[120px] opacity-20 rounded-full pointer-events-none"></div>
        
        {/* Mũi tên */}
        <div className="absolute -top-4 sm:-top-8 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[12px] sm:border-l-[16px] border-l-transparent border-r-[12px] sm:border-r-[16px] border-r-transparent border-t-[20px] sm:border-t-[28px] border-t-[#f5c542] drop-shadow-[0_0_12px_rgba(245,197,66,1)]"></div>
        
        {/* Trục quay */}
        <div className="w-full h-full relative" style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 3s cubic-bezier(0.2, 0, 0.2, 1)' }}>
          {[...Array(8)].map((_, i) => {
             const isGolden = i === 7;
             const nodeVal = isGolden ? (userData.points || 0) : NORMAL_NODES[i];
             
             return (
                <div key={i} className="absolute inset-0 flex justify-center pointer-events-none" style={{transform: `rotate(${i * 45}deg)`}}>
                    <div className={`w-16 h-16 sm:w-20 sm:h-20 mt-2 sm:mt-4 rounded-full flex items-center justify-center relative transition-all duration-300
                        ${isGolden ? 'bg-gradient-to-br from-[#fcd34d] to-[#92400e] border-2 border-[#fcd34d] shadow-[0_0_25px_#f59e0b]' : 'bg-[#0d0715] border-2 border-[#a855f7] shadow-[0_0_20px_rgba(168,85,247,0.5)]'}`}>
                        
                        {!isGolden && (
                            <svg className="absolute inset-[-10px] w-[calc(100%+20px)] h-[calc(100%+20px)] text-[#a855f7] opacity-80 animate-[spin_6s_linear_infinite]" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="50" cy="50" r="45" strokeDasharray="10 5" />
                                <polygon points="50,10 60,40 90,40 65,60 75,90 50,70 25,90 35,60 10,40 40,40" strokeWidth="1" className="opacity-50"/>
                            </svg>
                        )}
                        {isGolden && (
                             <svg className="absolute inset-[-5px] w-[calc(100%+10px)] h-[calc(100%+10px)] text-[#fcd34d] opacity-100 animate-[spin_4s_linear_infinite]" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="50" cy="50" r="45" strokeDasharray="15 5" />
                                <polygon points="50,5 61,38 95,38 68,59 78,92 50,72 22,92 32,59 5,38 39,38" strokeWidth="2"/>
                            </svg>
                        )}

                        <span className={`font-black text-xl sm:text-2xl z-10 drop-shadow-[0_2px_4px_#000] ${isGolden ? 'text-white' : 'text-[#e9d5ff]'}`}>
                            +{nodeVal}
                        </span>
                    </div>
                </div>
             )
          })}
        </div>

        {/* Nút QUAY trung tâm Báu vật */}
        <button onClick={handleSpin} disabled={isSpinning || userData.spinsLeft <= 0}
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-28 h-28 sm:w-36 sm:h-36 rounded-full border-[4px] sm:border-[6px] flex flex-col items-center justify-center font-black text-2xl sm:text-3xl z-10 transition-all
            ${isSpinning || userData.spinsLeft <= 0 
              ? 'bg-[#1a0b2e] border-gray-600 text-gray-500 cursor-not-allowed' 
              : 'bg-gradient-to-b from-[#fcd34d] via-[#d97706] to-[#78350f] border-[#fcd34d] text-white shadow-[0_0_40px_rgba(245,197,66,0.6),inset_0_0_20px_rgba(0,0,0,0.8)] hover:scale-[1.05] active:scale-95'}`}>
          <span className="drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] tracking-wider">QUAY</span>
        </button>
      </div>

      {/* Cửa hàng Mua lượt (Dark Fantasy Style) */}
      <div id="store-section" className="w-full max-w-4xl mt-8 mb-12">
         <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="font-bold text-white flex items-center gap-2 text-lg">
               <Ticket className="text-[#f5c542]" size={20} /> Giá Mua Lượt Quay
            </h3>
         </div>
         <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {SPIN_PACKAGES.map(pkg => {
               const canAfford = userData.points >= pkg.cost;
               const highlightClass = (userData.spinsLeft <= 0 && canAfford) ? 'border-[#f5c542] shadow-[0_0_15px_rgba(245,197,66,0.3)] animate-[pulse_2s_ease-in-out_infinite]' : 'border-[#3d1a66]';
               
               return (
               <button key={pkg.id} onClick={() => handleBuyPackage(pkg.spins, pkg.cost)} disabled={!canAfford}
                  className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border transition-all duration-300 ${highlightClass} ${
                     canAfford ? 'bg-[#1a0b2e] hover:bg-[#2a1245] hover:border-[#f5c542] hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(245,197,66,0.2)]' : 'bg-[#0d0715] opacity-50 cursor-not-allowed'
                  }`}>
                  {pkg.badge && (
                     <span className="absolute -top-3 right-4 bg-gradient-to-r from-orange-500 to-[#f5c542] text-[#0d0715] text-[11px] font-black px-3 py-0.5 rounded-full uppercase shadow-md">
                        {pkg.badge}
                     </span>
                  )}
                  <div className="flex items-center gap-2 text-2xl font-black text-white mb-2">
                     <span className="w-6 h-6 rounded-full bg-gradient-to-br from-[#fcd34d] to-[#d97706] flex items-center justify-center text-xs shadow-inner">🪙</span> 
                     {pkg.spins}x
                  </div>
                  <div className="text-[#f5c542] font-bold text-base">
                     {pkg.cost} xu
                  </div>
               </button>
            )})}
         </div>
      </div>

      {showModal && selectedQuestion && <QuestionModal question={selectedQuestion} onClose={handleAnswer} />}
    </div>
  );
};

const Leaderboard = ({ allUsers, currentUserData }) => {
  const [cheerMsg, setCheerMsg] = useState('');

  const sortedUsers = useMemo(() => {
    return [...allUsers]
      .filter(u => u.role !== 'admin')
      .sort((a, b) => (b.power || 0) - (a.power || 0));
  }, [allUsers]);

  const top3 = sortedUsers.slice(0, 3);
  const podiumOrder = [];
  if (top3[1]) podiumOrder.push({ ...top3[1], rank: 2, pos: 'left' });
  if (top3[0]) podiumOrder.push({ ...top3[0], rank: 1, pos: 'center' });
  if (top3[2]) podiumOrder.push({ ...top3[2], rank: 3, pos: 'right' });

  const handleCheer = async (targetId, targetName) => {
      if (currentUserData.spinsLeft > 0) {
          setCheerMsg('Bạn vẫn còn lượt quay! Hãy dùng hết lượt trước khi đi Cổ vũ nhé.');
          setTimeout(() => setCheerMsg(''), 3000);
          return;
      }
      if (currentUserData.cheeredToday?.includes(targetId)) return;
      
      const bonusXu = Math.floor(Math.random() * 11) + 5; 
      const updates = { points: (currentUserData.points || 0) + bonusXu, cheeredToday: [...(currentUserData.cheeredToday || []), targetId] };
      try {
          playSound('buy');
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', currentUserData.id), updates);
          setCheerMsg(`Cổ vũ ${targetName} thành công! Bạn nhận được ${bonusXu} Xu 🪙`);
          setTimeout(() => setCheerMsg(''), 4000);
      } catch (e) { console.error(e); }
  };

  return (
    <div className="space-y-10 max-w-4xl mx-auto">
      <div className="text-center pt-6">
        <div className="inline-block border-2 border-[#2a1245] rounded-full px-8 py-2 bg-[#1a0b2e]">
           <h2 className="text-xl md:text-2xl font-black text-white tracking-widest uppercase flex items-center gap-2"><Trophy className="text-[#f5c542]"/> HUYỀN THOẠI KOL AI</h2>
        </div>
      </div>

      {cheerMsg && (
        <div className="bg-green-900/40 border border-green-500/50 text-green-300 p-4 rounded-xl text-center font-bold animate-fade-in shadow-[0_0_15px_rgba(34,197,94,0.3)]">
          {cheerMsg}
        </div>
      )}

      {/* Bục Podium */}
      <div className="flex justify-center items-end gap-3 md:gap-6 mt-12 h-[340px]">
          {podiumOrder.map((user) => {
            const st = {
              1: { bg: 'bg-gradient-to-b from-[#451a03] to-[#2a1245]', border: 'border-[#f59e0b]', text: 'text-[#f59e0b]', height: 'h-[280px] md:h-[300px]', stroke: '#f59e0b' },
              2: { bg: 'bg-gradient-to-b from-[#3b0764] to-[#1e1b4b]', border: 'border-[#a855f7]', text: 'text-[#a855f7]', height: 'h-[240px] md:h-[260px]', stroke: '#a855f7' },
              3: { bg: 'bg-gradient-to-b from-[#1f2937] to-[#111827]', border: 'border-[#9ca3af]', text: 'text-[#9ca3af]', height: 'h-[220px] md:h-[240px]', stroke: '#9ca3af' }
            }[user.rank];
            const canCheer = currentUserData.id !== user.id && currentUserData.spinsLeft <= 0 && !(currentUserData.cheeredToday?.includes(user.id));

            return (
              <div key={user.id} className={`flex flex-col items-center relative rounded-2xl border ${st.border} ${st.bg} ${st.height} w-[110px] md:w-[160px] shadow-2xl p-2 md:p-4 transition-transform hover:-translate-y-2`}>
                
                <div className="relative w-16 h-16 md:w-24 md:h-24 mt-2 md:mt-4 mb-4">
                  <PentagramAvatar strokeColor={st.stroke} />
                  <div className="absolute inset-[15%] rounded-full bg-[#0d0715] flex items-center justify-center text-2xl md:text-4xl z-10 overflow-hidden shadow-inner border border-gray-800">🧑‍🎓</div>
                </div>
                
                <div className={`font-bold text-[10px] md:text-xs mb-1 ${st.text}`}>TOP {user.rank}</div>
                <div className="font-bold text-center text-xs md:text-sm text-white truncate w-full mb-2">{user.displayName}</div>
                
                <div className={`flex items-center gap-1 font-black ${st.text} mb-2`}><Zap size={14} fill="currentColor" /> {user.power || 0} LC</div>
                <div className="flex gap-2 text-xs text-gray-400 font-medium"><span className="flex items-center gap-0.5">{user.streak || 0} <Flame size={12} className="text-[#f59e0b]"/></span></div>
                <div className="flex gap-2 text-[10px] md:text-xs text-gray-500 mt-1"><span>{user.points || 0} xu</span><span><Star size={10} className="inline text-yellow-500 mb-0.5"/> {user.perfectSpins || 0}</span></div>

                {canCheer && (
                   <button onClick={() => handleCheer(user.id, user.displayName)} className={`absolute -bottom-4 bg-[#0d0715] border ${st.border} ${st.text} text-[10px] md:text-xs font-bold px-4 py-1.5 rounded-full hover:scale-110 shadow-lg z-30 transition-transform`}>👏 Cổ vũ</button>
                )}
                {(currentUserData.cheeredToday?.includes(user.id)) && (
                   <div className="absolute -bottom-3 bg-green-900 border border-green-500 text-green-400 text-[10px] font-bold px-3 py-1 rounded-full z-30">Đã cổ vũ ✓</div>
                )}
              </div>
            );
          })}
      </div>

      <div className="bg-[#1a0b2e] border-t border-[#3d1a66] p-4 text-xs md:text-sm text-gray-300 text-center rounded-xl shadow-lg mt-8">
        <p className="flex items-center justify-center gap-2 mb-1"><Trophy className="text-[#f5c542] w-4 h-4"/> <strong>TOP 50 KOL AI — Xếp hạng Lực Chiến</strong></p>
        <p className="opacity-70 font-mono text-[10px] md:text-xs">Lực chiến = Chuỗi học(x1) + Câu đúng(x2) + Siêu tốc(x10) + Huy hiệu(x5)</p>
      </div>

      <div className="space-y-3">
        {sortedUsers.slice(0, 50).map((u, index) => {
          const currentRank = index + 1;
          const isMe = u.id === currentUserData.id;
          
          let borderGlow = 'border-[#2a1245]';
          if (currentRank === 1) borderGlow = 'border-[#f59e0b] shadow-[0_0_15px_rgba(245,158,11,0.2)] bg-[#451a03]/20';
          else if (currentRank === 2) borderGlow = 'border-[#a855f7] bg-[#3b0764]/20';
          else if (currentRank === 3) borderGlow = 'border-[#9ca3af] bg-[#1f2937]/30';

          return (
            <div key={u.id} className={`flex items-center p-3 md:p-4 rounded-2xl border ${borderGlow} ${isMe ? 'bg-[#f5c542]/10 ring-2 ring-[#f5c542]' : 'bg-[#1a0b2e]'} transition-all`}>
              <div className="w-10 flex flex-col items-center justify-center shrink-0 mr-2 md:mr-4">
                 {currentRank === 1 ? <Crown className="text-[#f59e0b] w-6 h-6 mb-1"/> : 
                  currentRank === 2 ? <Medal className="text-[#a855f7] w-6 h-6 mb-1"/> : 
                  currentRank === 3 ? <Medal className="text-[#9ca3af] w-6 h-6 mb-1"/> : 
                  <span className="font-black text-gray-500 text-lg">{currentRank}</span>}
                 {currentRank <= 3 && <span className={`text-[9px] font-black uppercase ${currentRank===1?'text-[#f59e0b]':currentRank===2?'text-[#a855f7]':'text-[#9ca3af]'}`}>TOP {currentRank}</span>}
              </div>

              <div className="relative w-12 h-12 md:w-14 md:h-14 shrink-0 mr-3 md:mr-5">
                 {currentRank <= 3 && (
                    <div className={`absolute inset-[-4px] rounded-full border-2 border-dashed ${currentRank===1?'border-[#f59e0b]':currentRank===2?'border-[#a855f7]':'border-[#9ca3af]'} animate-[spin_4s_linear_infinite] opacity-80`}></div>
                 )}
                 <div className="w-full h-full rounded-full bg-[#0d0715] flex items-center justify-center text-xl z-10 relative overflow-hidden border border-gray-700">🧑‍🎓</div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h4 className={`font-bold text-sm md:text-base truncate ${currentRank===1?'text-[#f59e0b]':isMe?'text-[#f5c542]':'text-white'}`}>{u.displayName}</h4>
                  {currentRank === 1 && <span className="text-[9px] md:text-[10px] bg-[#0d0715] text-white px-2 py-0.5 rounded-full border border-gray-600 font-bold whitespace-nowrap"><Crown size={10} className="inline mr-1 text-[#f5c542]"/>TOP THE QUEEN</span>}
                  {currentRank === 2 && <span className="text-[9px] md:text-[10px] bg-[#0d0715] text-white px-2 py-0.5 rounded-full border border-gray-600 font-bold whitespace-nowrap"><Star size={10} className="inline mr-1 text-green-400"/>May mắn 25%</span>}
                </div>
                <div className="text-[10px] md:text-xs text-gray-400 truncate flex items-center gap-1">
                   <ShieldCheck size={12} className={currentRank===1?'text-[#f59e0b]':currentRank===2?'text-[#a855f7]':'text-gray-500'}/> Đại sứ KOL AI • <span className={currentRank===1?'text-green-400 font-medium':''}>Lv.{calculateLevel(u.power).level} {calculateLevel(u.power).title}</span>
                </div>
              </div>

              <div className="flex flex-col items-end shrink-0 ml-2">
                <div className={`font-black text-lg md:text-xl ${currentRank===1?'text-[#f59e0b]':currentRank===2?'text-[#a855f7]':'text-gray-200'}`}><Zap size={14} className="inline mb-1" fill="currentColor"/> {u.power || 0}</div>
                <div className="text-[10px] text-gray-500 font-mono mt-1 hidden sm:block">{u.points || 0} xu | {u.streak || 0} 🔥</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const AuthForms = ({ allUsers, onLoginSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);

  useEffect(() => {
    const handleFirstInteraction = () => {
        if (!bgmBufferSource) {
            const isPlaying = toggleBGM();
            setIsMusicPlaying(isPlaying);
        }
        document.removeEventListener('click', handleFirstInteraction);
        document.removeEventListener('keydown', handleFirstInteraction);
    };
    document.addEventListener('click', handleFirstInteraction);
    document.addEventListener('keydown', handleFirstInteraction);
    return () => {
        document.removeEventListener('click', handleFirstInteraction);
        document.removeEventListener('keydown', handleFirstInteraction);
        stopBGM();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);

    const cleanUsername = username.toLowerCase().trim();
    if (cleanUsername.length < 3 || cleanUsername.includes(' ')) { setError('Tên đăng nhập không hợp lệ (ít nhất 3 ký tự, không khoảng trắng).'); setLoading(false); return; }
    if (password.length < 4) { setError('Mật khẩu quá ngắn.'); setLoading(false); return; }
    if (isProfane(cleanUsername) || (!isLogin && isProfane(displayName))) { setError('Tên của bạn chứa từ ngữ không phù hợp thuần phong mỹ tục. Vui lòng đặt lại tên khác!'); setLoading(false); return; }

    try {
      if (isLogin) {
        const user = allUsers.find(u => u.username === cleanUsername);
        if (!user) {
           if (cleanUsername === 'admin' && password === '123@') {
              const newUserRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
              const newUserData = { username: cleanUsername, password: password, displayName: 'Giáo viên', role: 'admin', points: 0, power: 0, streak: 0, lastLogin: '', spinsLeft: MAX_SPINS_PER_DAY, correctAnswers: 0, consecutiveCorrect: 0, perfectSpins: 0, badges: [], history: [], cheeredToday: [] };
              await setDoc(newUserRef, newUserData);
              onLoginSuccess({ id: newUserRef.id, ...newUserData });
              setLoading(false); return;
           }
           setError('Tài khoản không tồn tại. Nếu bạn là học sinh mới, vui lòng Đăng ký.');
        } else if (user.password !== password) {
           setError('Sai mật khẩu!');
        } else {
           onLoginSuccess(user);
        }
      } else {
        if (!displayName) { setError('Vui lòng nhập họ tên hiển thị.'); setLoading(false); return; }
        if (cleanUsername === 'admin') { setError('Không thể đăng ký tài khoản admin.'); setLoading(false); return; }
        if (allUsers.find(u => u.username === cleanUsername)) { setError('Tên đăng nhập này đã có người sử dụng.'); setLoading(false); return; }

        const newUserRef = doc(collection(db, 'artifacts', appId, 'public', 'data', 'users'));
        const newUserData = { username: cleanUsername, password: password, displayName: displayName, role: 'student', points: 0, power: 0, streak: 0, lastLogin: '', spinsLeft: MAX_SPINS_PER_DAY, correctAnswers: 0, consecutiveCorrect: 0, perfectSpins: 0, badges: [], history: [], cheeredToday: [] };
        await setDoc(newUserRef, newUserData);
        onLoginSuccess({ id: newUserRef.id, ...newUserData });
      }
    } catch (err) { console.error(err); setError('Có lỗi kết nối. Vui lòng thử lại.'); }
    setLoading(false);
  };

  return (
    <div className="w-full max-w-md mt-10">
      <div className={`${THEME.surface} border ${THEME.border} rounded-2xl p-8 shadow-2xl relative overflow-hidden`}>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 bg-[#8b5cf6] opacity-20 blur-[50px] rounded-full"></div>
        <button type="button" onClick={() => setIsMusicPlaying(toggleBGM())} className={`absolute top-4 right-4 z-20 p-2 rounded-full border ${isMusicPlaying ? 'bg-[#8b5cf6] border-[#8b5cf6] text-white shadow-[0_0_10px_rgba(139,92,246,0.5)]' : 'bg-[#0d0715] border-[#3d1a66] text-gray-500'} transition-all`}>
            {isMusicPlaying ? <Music size={16} className="animate-pulse" /> : <VolumeX size={16} />}
        </button>

        <div className="text-center mb-8 relative z-10">
          <div className="mx-auto w-16 h-16 bg-[#2a1245] border-2 border-[#f5c542] rounded-full flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(245,197,66,0.3)]"><Star className="text-[#f5c542] w-8 h-8" /></div>
          <h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#f5c542] to-[#ff9d00]">Vòng Quay Kiến Thức</h2>
          <p className="text-gray-400 mt-2">{isLogin ? 'Đăng nhập để tiếp tục (Giáo viên: admin/123@)' : 'Tạo tài khoản chiến binh mới'}</p>
        </div>

        {error && <div className="bg-red-500/20 border border-red-500 text-red-300 p-3 rounded-lg mb-4 text-sm text-center">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4 relative z-10">
          {!isLogin && (
            <div>
              <label className="block text-sm text-gray-300 mb-1">Họ tên hiển thị</label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)} className="w-full bg-[#0d0715] border border-[#3d1a66] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#f5c542] transition-colors" placeholder="VD: Nguyễn Văn A" />
            </div>
          )}
          <div>
            <label className="block text-sm text-gray-300 mb-1">Tên đăng nhập</label>
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} className="w-full bg-[#0d0715] border border-[#3d1a66] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#f5c542] transition-colors" placeholder="Viết liền không dấu" />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Mật khẩu</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-[#0d0715] border border-[#3d1a66] rounded-lg px-4 py-3 text-white focus:outline-none focus:border-[#f5c542] transition-colors" placeholder="••••••" />
          </div>
          <button type="submit" disabled={loading} className={`w-full py-3 rounded-lg font-bold text-[#0d0715] shadow-[0_0_15px_rgba(245,197,66,0.4)] transition-all ${loading ? 'bg-gray-400' : 'bg-gradient-to-r from-[#f5c542] to-[#e6b322] hover:scale-[1.02]'}`}>
            {loading ? 'Đang xử lý...' : (isLogin ? 'Vào Game' : 'Đăng Ký')}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-gray-400 relative z-10">
          {isLogin ? "Chưa có tài khoản? " : "Đã có tài khoản? "}
          <button type="button" onClick={() => { setIsLogin(!isLogin); setError(''); }} className="text-[#f5c542] font-semibold hover:underline">{isLogin ? "Đăng ký ngay" : "Đăng nhập"}</button>
        </div>
      </div>
    </div>
  );
};

const Dashboard = ({ userData, allUsers }) => {
  const levelInfo = calculateLevel(userData.power);
  const sortedUsers = useMemo(() => [...allUsers].filter(u => u.role !== 'admin').sort((a, b) => (b.power || 0) - (a.power || 0)), [allUsers]);
  const rank = sortedUsers.findIndex(u => u.id === userData.id) + 1;
  const displayRank = rank > 0 ? `#${rank}` : 'Chưa xếp hạng';
  const badges = userData.badges || [];
  
  return (
    <div className="space-y-6">
      <div className={`${THEME.surface} border ${THEME.border} rounded-2xl p-6 lg:p-8 relative overflow-hidden shadow-xl`}>
        <div className="absolute top-0 right-0 w-64 h-64 bg-[#f5c542] opacity-5 blur-[100px] rounded-full pointer-events-none"></div>
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 relative z-10">
          <div className="relative">
            <div className={`w-24 h-24 rounded-full bg-[#0d0715] border-4 flex items-center justify-center text-4xl shadow-lg ${levelInfo.level >= 3 ? 'border-[#f5c542] shadow-[#f5c542]/50' : 'border-[#8b5cf6] shadow-[#8b5cf6]/50'}`}>🧑‍🎓</div>
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-[#2a1245] border border-[#f5c542] text-[#f5c542] text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">Lv.{levelInfo.level}</div>
          </div>
          <div className="flex-1 text-center md:text-left">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold text-white flex items-center justify-center md:justify-start gap-2">{userData.displayName}</h1>
                <p className="text-[#8b5cf6] font-medium mt-1">{levelInfo.title}</p>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-3 text-sm text-gray-300">
                  <span className="flex items-center gap-1 bg-[#0d0715] px-3 py-1.5 rounded-lg border border-[#3d1a66]"><Crown size={14} className="text-[#f5c542]" /> Hạng: <strong className="text-white">{displayRank}</strong></span>
                  <span className="flex items-center gap-1 bg-[#0d0715] px-3 py-1.5 rounded-lg border border-[#3d1a66]"><Zap size={14} className="text-blue-400" /> Lực học: <strong className="text-white">{userData.power || 0}</strong></span>
                  <span className="flex items-center gap-1 bg-[#0d0715] px-3 py-1.5 rounded-lg border border-[#3d1a66]"><Star size={14} className="text-yellow-400" /> Xu: <strong className="text-white">{userData.points || 0}</strong></span>
                </div>
              </div>
              <div className="bg-[#0d0715] border border-[#f5c542]/30 rounded-xl p-4 flex flex-col items-center min-w-[120px]">
                <Flame size={28} className="text-[#f5c542] mb-1 animate-pulse" />
                <span className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#f5c542] to-[#ff9d00]">{userData.streak || 0}</span>
                <span className="text-xs text-gray-400 uppercase tracking-wider font-bold mt-1">Ngày học</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className={`${THEME.surface} border ${THEME.border} rounded-2xl p-6 shadow-lg`}>
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Flame className="text-[#f5c542]" /> Chuỗi Ngày Chăm Chỉ</h3>
          <div className="flex justify-between mb-4">
            {[1,2,3,4,5,6,7].map(i => {
              const active = i <= (userData.streak || 0);
              return <div key={i} className={`w-8 h-10 rounded-md flex items-center justify-center border-2 transition-all duration-300 ${active ? 'bg-[#f5c542]/20 border-[#f5c542] text-[#f5c542] shadow-[0_0_8px_rgba(245,197,66,0.5)]' : 'bg-[#0d0715] border-[#3d1a66] text-gray-600'}`}><Flame size={16} className={active ? 'animate-pulse' : ''} /></div>;
            })}
          </div>
          <p className="text-xs text-gray-400 italic">⚠️ Đăng nhập học mỗi ngày để giữ lửa. Nghỉ 1 ngày chuỗi sẽ về 0!</p>
        </div>
        <div className={`${THEME.surface} border ${THEME.border} rounded-2xl p-6 shadow-lg`}>
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Medal className="text-[#8b5cf6]" /> Huy Hiệu Đạt Được</h3>
          <div className="flex flex-wrap gap-3">
            {badges.length === 0 ? <span className="text-gray-500 italic text-sm">Chưa có huy hiệu nào. Hãy tích cực tham gia nhé!</span> : badges.map((badge, idx) => (
               <div key={idx} className="flex items-center gap-1.5 bg-[#0d0715] border border-[#3d1a66] px-3 py-1.5 rounded-full text-sm font-medium"><span>{badge==='Người mới'?'🌱':badge==='Chuyên cần'?'🔥':'🎯'}</span> {badge}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const AdminPanel = ({ questions, allUsers }) => {
  const [formData, setFormData] = useState({ text: '', opt0: '', opt1: '', opt2: '', opt3: '', correctIndex: 0, topic: 'Toán học', difficulty: 'medium' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formMsg, setFormMsg] = useState({ type: '', text: '' });
  const [aiGenTopic, setAiGenTopic] = useState('');
  const [aiGenGrade, setAiGenGrade] = useState('Lớp 5');
  const [aiGenCount, setAiGenCount] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedQs, setSelectedQs] = useState([]);
  const [activeTab, setActiveTab] = useState('questions'); 

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.text || !formData.opt0 || !formData.opt1 || !formData.opt2 || !formData.opt3) return;
    setIsSubmitting(true);
    const qData = { text: formData.text, options: [formData.opt0, formData.opt1, formData.opt2, formData.opt3], correctIndex: parseInt(formData.correctIndex), topic: formData.topic, difficulty: formData.difficulty, createdAt: new Date().toISOString() };
    try {
      await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'questions')), qData);
      setFormData({ text: '', opt0: '', opt1: '', opt2: '', opt3: '', correctIndex: 0, topic: formData.topic, difficulty: formData.difficulty });
      setFormMsg({ type: 'success', text: 'Đã lưu câu hỏi thành công!' });
      setTimeout(() => setFormMsg({ type: '', text: '' }), 3000);
    } catch (err) { setFormMsg({ type: 'error', text: 'Có lỗi xảy ra khi lưu.' }); }
    setIsSubmitting(false);
  };

  const handleAIGenerate = async () => {
    if (!aiGenTopic) { setFormMsg({ type: 'error', text: 'Vui lòng nhập chủ đề để AI tạo câu hỏi.' }); return; }
    const count = parseInt(aiGenCount) || 1;
    setIsGenerating(true); setFormMsg({ type: '', text: '' });
    
    const prompt = `Tạo ${count} câu hỏi trắc nghiệm tiếng Việt chủ đề: "${aiGenTopic}" cho đối tượng: ${aiGenGrade}. Độ khó: ${formData.difficulty}. Trả về định dạng JSON là mảng chứa object: {"text": "Nội dung", "options": ["A", "B", "C", "D"], "correctIndex": 0}`;
    const responseText = await callGemini(prompt, "Bạn là trợ lý giáo viên tạo câu hỏi trắc nghiệm. Chỉ trả về mảng JSON.", true);
    
    try {
      if (responseText) {
        const match = responseText.match(/\[[\s\S]*\]/); 
        if (match) {
           const parsedArray = JSON.parse(match[0]);
           if (Array.isArray(parsedArray) && parsedArray.length > 0) {
             let successCount = 0;
             for (const parsed of parsedArray) {
               if (parsed.text && parsed.options?.length === 4 && parsed.correctIndex !== undefined) {
                 const qData = { text: parsed.text, options: parsed.options, correctIndex: parseInt(parsed.correctIndex), topic: aiGenTopic, difficulty: formData.difficulty, createdAt: new Date().toISOString() };
                 await setDoc(doc(collection(db, 'artifacts', appId, 'public', 'data', 'questions')), qData);
                 successCount++;
               }
             }
             setFormMsg({ type: 'success', text: `AI đã tạo và tự động lưu ${successCount} câu hỏi!` });
           } else throw new Error("Invalid structure");
        } else throw new Error("Regex match failed");
      } else throw new Error("Empty response");
    } catch (error) { setFormMsg({ type: 'error', text: 'AI tạo thất bại. Vui lòng thử lại.' }); }
    setIsGenerating(false);
  };

  const handleDeleteMultiple = async () => {
      if (selectedQs.length === 0) return;
      try {
          setIsSubmitting(true);
          await Promise.all(selectedQs.map(id => deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'questions', id))));
          setFormMsg({ type: 'success', text: `Đã xoá ${selectedQs.length} câu hỏi thành công!` });
          setSelectedQs([]); 
          setTimeout(() => setFormMsg({ type: '', text: '' }), 3000);
      } catch (e) { setFormMsg({ type: 'error', text: 'Lỗi khi xoá câu hỏi.' }); }
      setIsSubmitting(false);
  };

  const handleResetSpins = async (userId, name) => {
      try {
          await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', userId), { spinsLeft: MAX_SPINS_PER_DAY });
          setFormMsg({ type: 'success', text: `Đã khôi phục ${MAX_SPINS_PER_DAY} lượt cho ${name}!` });
          setTimeout(() => setFormMsg({ type: '', text: '' }), 3000);
      } catch (e) { setFormMsg({ type: 'error', text: 'Lỗi khi reset lượt.' }); }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-2 mb-4 bg-[#1a0b2e] p-2 rounded-xl border border-[#3d1a66]">
         <button onClick={() => setActiveTab('questions')} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'questions' ? 'bg-[#f5c542] text-[#0d0715]' : 'text-gray-400 hover:bg-[#2a1245]'}`}>📚 Quản lý Câu Hỏi</button>
         <button onClick={() => setActiveTab('users')} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-colors ${activeTab === 'users' ? 'bg-[#f5c542] text-[#0d0715]' : 'text-gray-400 hover:bg-[#2a1245]'}`}>🧑‍🎓 Quản lý Học Sinh</button>
      </div>

      {formMsg.text && ( <div className={`mb-4 p-3 rounded-lg text-sm border ${formMsg.type === 'error' ? 'bg-red-900/30 border-red-500/50 text-red-300' : 'bg-green-900/30 border-green-500/50 text-green-300'}`}>{formMsg.text}</div> )}

      {activeTab === 'users' && (
         <div className={`${THEME.surface} border ${THEME.border} rounded-2xl p-6 shadow-xl`}>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><User className="text-[#f5c542]"/> Danh sách Học sinh</h2>
            <div className="overflow-x-auto">
               <table className="w-full text-left text-sm text-gray-300">
                  <thead className="bg-[#2a1245] text-xs uppercase text-gray-400">
                     <tr><th className="p-3 rounded-tl-lg">Học sinh</th><th className="p-3">Tài khoản</th><th className="p-3">Xu</th><th className="p-3 text-center">Lượt quay</th><th className="p-3 rounded-tr-lg text-right">Thao tác</th></tr>
                  </thead>
                  <tbody className="divide-y divide-[#3d1a66]">
                     {allUsers.filter(u => u.role !== 'admin').map(u => (
                        <tr key={u.id} className="hover:bg-[#0d0715]/50">
                           <td className="p-3 font-bold text-white">{u.displayName}</td>
                           <td className="p-3 font-mono text-xs">{u.username}</td>
                           <td className="p-3 text-[#f5c542] font-medium">{u.points || 0}</td>
                           <td className="p-3 text-center"><span className={`px-2 py-1 rounded font-bold text-xs ${u.spinsLeft <= 0 ? 'bg-red-900/50 text-red-400' : 'bg-green-900/50 text-green-400'}`}>{u.spinsLeft}</span></td>
                           <td className="p-3 text-right">
                              <button onClick={() => handleResetSpins(u.id, u.displayName)} disabled={u.spinsLeft >= MAX_SPINS_PER_DAY} className="bg-[#8b5cf6] hover:bg-[#7c3aed] disabled:bg-gray-600 disabled:text-gray-400 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-colors">+ Reset 5 Lượt</button>
                           </td>
                        </tr>
                     ))}
                  </tbody>
               </table>
            </div>
         </div>
      )}

      {activeTab === 'questions' && (
        <>
          <div className={`${THEME.surface} border ${THEME.border} rounded-2xl p-6 shadow-xl`}>
             <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-6 gap-4 border-b border-[#3d1a66] pb-4">
                <h2 className="text-xl font-bold flex items-center gap-2 shrink-0"><Settings className="text-[#f5c542]"/> Thêm Câu Hỏi Mới</h2>
                <div className="flex items-center gap-2 w-full xl:w-auto bg-[#0d0715] p-2 rounded-xl border border-[#3d1a66]">
                   <Bot className="text-[#8b5cf6] shrink-0 ml-1"/>
                   <input type="text" value={aiGenTopic} onChange={e=>setAiGenTopic(e.target.value)} placeholder="Nhập chủ đề cho AI..." className="bg-transparent text-white text-sm px-2 py-1 outline-none w-32 sm:w-40" />
                   <select value={aiGenGrade} onChange={e=>setAiGenGrade(e.target.value)} className="bg-[#2a1245] text-white text-xs rounded p-1.5 outline-none border border-[#3d1a66]"><option>Mầm non</option><option>Lớp 1</option><option>Lớp 5</option><option>Lớp 9</option><option>Lớp 12</option></select>
                   <select value={aiGenCount} onChange={e=>setAiGenCount(e.target.value)} className="bg-[#2a1245] text-white text-xs rounded p-1.5 outline-none border border-[#3d1a66]">{[1,2,3,5,10].map(n=><option key={n} value={n}>{n} câu</option>)}</select>
                   <button onClick={handleAIGenerate} disabled={isGenerating} className="bg-[#8b5cf6] hover:bg-[#7c3aed] text-white px-3 py-1.5 rounded-lg text-sm font-bold disabled:opacity-50 whitespace-nowrap">Tạo Nhanh</button>
                </div>
             </div>
             
             <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div>
                      <label className="block text-sm text-gray-300 mb-1">Chủ đề (Môn học)</label>
                      <input type="text" value={formData.topic} onChange={e=>setFormData({...formData, topic: e.target.value})} className="w-full bg-[#0d0715] border border-[#3d1a66] rounded-lg px-3 py-2 text-white outline-none focus:border-[#f5c542]" required />
                   </div>
                   <div>
                      <label className="block text-sm text-gray-300 mb-1">Mức độ khó</label>
                      <select value={formData.difficulty} onChange={e=>setFormData({...formData, difficulty: e.target.value})} className="w-full bg-[#0d0715] border border-[#3d1a66] rounded-lg px-3 py-2 text-white outline-none focus:border-[#f5c542]">
                         <option value="easy">Dễ (+5 điểm / -2 điểm)</option><option value="medium">Trung bình (+10 điểm / -5 điểm)</option><option value="hard">Khó (+15 điểm / -7 điểm)</option>
                      </select>
                   </div>
                </div>
                <div>
                   <label className="block text-sm text-gray-300 mb-1">Nội dung câu hỏi</label>
                   <textarea value={formData.text} onChange={e=>setFormData({...formData, text: e.target.value})} className="w-full bg-[#0d0715] border border-[#3d1a66] rounded-lg px-3 py-2 text-white outline-none focus:border-[#f5c542] h-20" required />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   {[0,1,2,3].map(i => (
                      <div key={i} className="flex items-center gap-2">
                         <input type="radio" name="correctIndex" checked={formData.correctIndex === i} onChange={()=>setFormData({...formData, correctIndex: i})} className="w-4 h-4 accent-[#f5c542]" />
                         <input type="text" value={formData[`opt${i}`]} onChange={e=>setFormData({...formData, [`opt${i}`]: e.target.value})} placeholder={`Đáp án ${['A','B','C','D'][i]}`} className="flex-1 bg-[#0d0715] border border-[#3d1a66] rounded-lg px-3 py-2 text-white outline-none focus:border-[#f5c542]" required />
                      </div>
                   ))}
                </div>
                <div className="pt-2">
                   <button type="submit" disabled={isSubmitting} className="bg-[#f5c542] hover:bg-[#e6b322] text-[#0d0715] px-6 py-2.5 rounded-lg font-bold shadow-[0_0_15px_rgba(245,197,66,0.3)] disabled:opacity-50">Lưu Câu Hỏi Bằng Tay</button>
                </div>
             </form>
          </div>

          <div className={`${THEME.surface} border ${THEME.border} rounded-2xl p-6 shadow-xl`}>
             <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><Settings className="text-[#f5c542]"/> Ngân Hàng Câu Hỏi ({questions.length})</h2>
                <button onClick={handleDeleteMultiple} disabled={isSubmitting || selectedQs.length === 0} className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"><Trash2 size={16}/> Xóa hàng loạt ({selectedQs.length})</button>
             </div>
             
             <div className="space-y-3">
                {questions.length === 0 ? <p className="text-gray-500 italic text-center py-4">Chưa có câu hỏi nào trong ngân hàng.</p> : (
                   <div className="flex items-center gap-2 p-2 bg-[#2a1245] rounded-lg border border-[#3d1a66]">
                      <input type="checkbox" checked={selectedQs.length === questions.length && questions.length > 0} onChange={e => setSelectedQs(e.target.checked ? questions.map(q=>q.id) : [])} className="w-4 h-4 accent-[#f5c542] ml-2" />
                      <span className="text-sm font-bold text-gray-300">Chọn tất cả {questions.length} câu</span>
                      {selectedQs.length > 0 && <span className="ml-auto mr-2 text-xs font-bold text-[#f5c542]">Đã chọn {selectedQs.length}</span>}
                   </div>
                )}
                {questions.map((q, i) => (
                   <div key={q.id} className={`bg-[#0d0715] border rounded-xl p-4 flex gap-4 transition-colors ${selectedQs.includes(q.id) ? 'border-[#f5c542] shadow-[0_0_10px_rgba(245,197,66,0.2)]' : 'border-[#3d1a66]'}`}>
                      <div className="pt-1"><input type="checkbox" checked={selectedQs.includes(q.id)} onChange={() => setSelectedQs(prev => prev.includes(q.id) ? prev.filter(id => id !== q.id) : [...prev, q.id])} className="w-4 h-4 accent-[#f5c542]" /></div>
                      <div className="flex-1">
                         <div className="flex items-center gap-2 mb-2">
                            <span className="font-bold text-gray-400">Câu {i+1}:</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${q.difficulty === 'hard' ? 'bg-red-900/50 text-red-400' : q.difficulty === 'easy' ? 'bg-green-900/50 text-green-400' : 'bg-yellow-900/50 text-yellow-400'}`}>{DIFFICULTY_SCORES[q.difficulty||'medium'].name}</span>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#2a1245] text-white">{q.topic}</span>
                         </div>
                         <p className="font-medium text-white mb-3">{q.text}</p>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                            {q.options.map((opt, oIdx) => (
                               <div key={oIdx} className={`p-2 rounded border ${oIdx === q.correctIndex ? 'bg-green-900/30 border-green-500/50 text-green-400 font-bold' : 'bg-[#1a0b2e] border-[#3d1a66] text-gray-400'}`}>
                                  {['A','B','C','D'][oIdx]}. {opt}
                               </div>
                            ))}
                         </div>
                      </div>
                   </div>
                ))}
             </div>
          </div>
        </>
      )}
    </div>
  );
};

export default function App() {
  const [fbReady, setFbReady] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loggedInUser, setLoggedInUser] = useState(null);
  const [currentView, setCurrentView] = useState('login'); 
  const initialCheckDone = useRef(false);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) await signInWithCustomToken(auth, __initial_auth_token);
        else await signInAnonymously(auth);
        setFbReady(true);
      } catch (err) { try { await signInAnonymously(auth); setFbReady(true); } catch(e) { console.error(e); } }
    };
    initAuth();
  }, []);

  useEffect(() => {
    if (!fbReady) return;
    const unsubUsers = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'users'), (snap) => {
      const uData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setAllUsers(uData);
      if (!initialCheckDone.current) {
         initialCheckDone.current = true;
         const savedId = safeStorage.get('quizWheelUserId');
         if (savedId) {
            const u = uData.find(x => x.id === savedId);
            if (u) {
               setCurrentView(u.role === 'admin' ? 'admin' : 'dashboard');
               const today = getTodayString();
               if (u.lastLogin !== today) {
                   const updates = { lastLogin: today, spinsLeft: Math.max(u.spinsLeft || 0, MAX_SPINS_PER_DAY), cheeredToday: [] };
                   updates.streak = u.lastLogin === getYesterdayString() ? (u.streak || 0) + 1 : 1;
                   updates.power = calculatePower({ ...u, ...updates });
                   updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', u.id), updates).catch(console.error);
               } else { setLoggedInUser(u); }
            }
         }
      }
    }, console.error);

    const unsubQ = onSnapshot(collection(db, 'artifacts', appId, 'public', 'data', 'questions'), (snap) => {
      setQuestions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, console.error);

    return () => { unsubUsers(); unsubQ(); };
  }, [fbReady]);

  useEffect(() => {
     if (loggedInUser) {
        const latestUser = allUsers.find(u => u.id === loggedInUser.id);
        if (latestUser && JSON.stringify(latestUser) !== JSON.stringify(loggedInUser)) setLoggedInUser(latestUser);
     }
  }, [allUsers, loggedInUser]);

  const handleLoginSuccess = async (user) => {
    safeStorage.set('quizWheelUserId', user.id);
    const today = getTodayString();
    let updates = {}; let needsUpdate = false;

    if (user.lastLogin !== today) {
      needsUpdate = true;
      updates.lastLogin = today; updates.spinsLeft = Math.max(user.spinsLeft || 0, MAX_SPINS_PER_DAY); updates.cheeredToday = [];
      updates.streak = user.lastLogin === getYesterdayString() ? (user.streak || 0) + 1 : 1;
      const currentBadges = user.badges || [];
      if (updates.streak >= 7 && !currentBadges.includes('Chuyên cần')) updates.badges = [...currentBadges, 'Chuyên cần'];
    }

    const combinedData = { ...user, ...updates };
    const currentPower = calculatePower(combinedData);
    if (combinedData.power !== currentPower) { needsUpdate = true; updates.power = currentPower; }

    if (needsUpdate) {
      try {
        await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'users', user.id), updates);
        setLoggedInUser({ ...user, ...updates });
      } catch (err) { setLoggedInUser(user); }
    } else { setLoggedInUser(user); }

    setCurrentView(user.role === 'admin' ? 'admin' : 'dashboard');
  };

  const NavBtn = ({ icon, label, active, onClick }) => (
    <button onClick={onClick} className={`flex items-center space-x-2 px-3 py-2 sm:px-4 sm:py-2 rounded-lg transition-all duration-300 ${active ? 'bg-[#f5c542] text-[#0d0715] font-bold shadow-[0_0_10px_rgba(245,197,66,0.5)]' : 'text-gray-400 hover:bg-[#2a1245] hover:text-white'}`}>
      {icon} <span className="hidden sm:inline">{label}</span>
    </button>
  );

  if (!fbReady) return <div className={`min-h-screen ${THEME.bg} text-white flex items-center justify-center font-bold`}>Đang kết nối hệ thống...</div>;

  return (
    <div className={`min-h-screen ${THEME.bg} text-white font-sans overflow-x-hidden selection:bg-[#f5c542] selection:text-[#2a1245]`}>
      
      {loggedInUser && (
        <nav className={`${THEME.surface} border-b ${THEME.border} p-4 flex justify-between items-center sticky top-0 z-40 shadow-md`}>
          <div className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-[#2a1245] rounded-full border-2 border-[#f5c542] flex items-center justify-center"><Star className="text-[#f5c542] w-6 h-6" /></div>
            <span className="font-bold text-xl hidden sm:inline text-transparent bg-clip-text bg-gradient-to-r from-[#f5c542] to-[#ff9d00]">Quiz Wheel</span>
          </div>

          <div className="flex space-x-1 sm:space-x-4">
            <NavBtn icon={<User size={18}/>} label="Hồ sơ" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
            {loggedInUser.role !== 'admin' && <NavBtn icon={<Play size={18}/>} label="Chơi Ngay" active={currentView === 'wheel'} onClick={() => setCurrentView('wheel')} />}
            <NavBtn icon={<Trophy size={18}/>} label="KOL AI" active={currentView === 'leaderboard'} onClick={() => setCurrentView('leaderboard')} />
            {loggedInUser.role === 'admin' && <NavBtn icon={<Settings size={18}/>} label="Quản trị" active={currentView === 'admin'} onClick={() => setCurrentView('admin')} />}
            <button onClick={() => { safeStorage.remove('quizWheelUserId'); setLoggedInUser(null); setCurrentView('login'); }} className="p-2 sm:px-4 sm:py-2 rounded-lg text-red-400 hover:bg-red-400/10 transition-colors flex items-center space-x-2"><LogOut size={18} /> <span className="hidden sm:inline">Thoát</span></button>
          </div>
        </nav>
      )}

      <main className="p-4 sm:p-6 lg:p-8 flex justify-center min-h-[calc(100vh-80px)]">
        {!loggedInUser ? (
          <AuthForms allUsers={allUsers} onLoginSuccess={handleLoginSuccess} />
        ) : (
          <div className="w-full max-w-5xl animate-fade-in">
            {currentView === 'dashboard' && <Dashboard userData={loggedInUser} allUsers={allUsers} />}
            {currentView === 'wheel' && loggedInUser.role !== 'admin' && <WheelGame userData={loggedInUser} questions={questions} />}
            {currentView === 'leaderboard' && <Leaderboard allUsers={allUsers} currentUserData={loggedInUser} />}
            {currentView === 'admin' && loggedInUser.role === 'admin' && <AdminPanel questions={questions} allUsers={allUsers} />}
          </div>
        )}
      </main>

      {loggedInUser && loggedInUser.role !== 'admin' && <AIAssistant />}
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: #0d0715; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #3d1a66; border-radius: 4px; }
      `}} />
    </div>
  );
}
