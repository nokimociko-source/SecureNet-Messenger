import React, { useState, useRef, useEffect } from 'react';
import { Message, User, Session } from '../types';
import EmojiStickerPicker from './EmojiStickerPicker';

interface ChatViewProps {
  session: Session;
  messages: Message[];
  currentUser: User;
  onSend: (content: string) => void;
  onSendFile?: (file: File, type?: string) => void;
  onClearHistory?: () => void;
  onDeleteChat?: () => void;
  onDeleteMessage?: (messageId: string) => void;
  onBack: () => void;
  onCall?: () => void;
  onVideoCall?: () => void;
  onUpdateGroup?: (name: string) => void;
  onAddMember?: (userId: string) => void;
  onRemoveMember?: (userId: string) => void;
  onLeaveGroup?: () => void;
  onBlockUser?: (contactId: string, isBlocked: boolean) => void;
  contacts?: any[];
}

export default function ChatView({
  session,
  messages,
  currentUser,
  contacts = [],
  onSend,
  onSendFile,
  onClearHistory,
  onDeleteChat,
  onDeleteMessage,
  onBack,
  onCall,
  onVideoCall,
  onUpdateGroup,
  onAddMember,
  onRemoveMember,
  onLeaveGroup,
  onBlockUser
}: ChatViewProps) {
  const [inputMessage, setInputMessage] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'text' | 'voice' | 'video'>('voice');
  const [isRecording, setIsRecording] = useState(false);
  const [isLocked, setIsLocked] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [isTyping, setIsTyping] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [activeModal, setActiveModal] = useState<'info' | 'members' | 'add' | 'settings' | 'search' | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  
  // Telegram-style recording logic
  const holdTimerRef = useRef<any>(null);
  const startYRef = useRef<number>(0);

  const handleContextMenu = (e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setSelectedMessage(msg);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSelectedMessage(null);
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMessage.trim() && !selectedFile) return;

    if (selectedFile && onSendFile) {
      try {
        await onSendFile(selectedFile);
        setSelectedFile(null);
        setPreviewUrl(null);
      } catch (err) {
        console.error('File upload failed', err);
      }
    }

    if (inputMessage.trim()) {
      onSend(inputMessage);
      setInputMessage('');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: inputMode === 'video' 
      });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      const chunks: Blob[] = [];
      
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      
      recorder.onstop = async () => {
        if (chunks.length === 0) return;
        const blob = new Blob(chunks, { type: inputMode === 'voice' ? 'audio/webm' : 'video/webm' });
        const file = new File([blob], inputMode === 'voice' ? 'voice.webm' : 'circle.webm', { type: blob.type });
        if (onSendFile) onSendFile(file);
        stream.getTracks().forEach(track => track.stop());
      };
      
      recorder.start();
      setIsRecording(true);
      setIsLocked(false);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('Recording error', err);
      setIsRecording(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      alert('Ошибка доступа к микрофону или камере'); 
    }
  };

  const stopRecording = (cancel = false) => {
    if (mediaRecorderRef.current && isRecording) {
      if (cancel) {
        mediaRecorderRef.current.ondataavailable = null;
        mediaRecorderRef.current.onstop = () => {
          mediaRecorderRef.current = null;
        };
      }
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsLocked(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    }
  };

  const onBtnPointerDown = (e: React.PointerEvent) => {
    startYRef.current = e.clientY;
    holdTimerRef.current = setTimeout(() => {
      startRecording();
    }, 250);
  };

  const onBtnPointerMove = (e: React.PointerEvent) => {
    if (!isRecording || isLocked) return;
    const deltaY = startYRef.current - e.clientY;
    if (deltaY > 60) setIsLocked(true);
  };

  const onBtnPointerUp = () => {
    clearTimeout(holdTimerRef.current);
    if (!isRecording) {
      setInputMode(prev => prev === 'voice' ? 'video' : 'voice');
    } else if (!isLocked) {
      stopRecording();
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="h-screen flex flex-col bg-[#0f0a1e]">
      {/* Header */}
      <div className="glass px-6 py-3 flex items-center justify-between z-10 shadow-2xl border-b border-white/5">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-white/10 rounded-full transition-all text-white/70 hover:text-white active:scale-90">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          
          <div className="relative group cursor-pointer">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 flex items-center justify-center font-bold text-white shadow-lg group-hover:scale-105 transition-transform">
              {session.contactName[0]}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 border-2 border-[#0f0a1e] rounded-full"></div>
          </div>

          <div>
            <h3 className="font-bold text-white text-base leading-tight flex items-center gap-1.5">
              {session.contactName}
              {session.verified && (
                <svg className="text-blue-400" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1.9 14.6L6.7 13.2l1.4-1.4 2 2 4.5-4.5 1.4 1.4-5.9 5.9z"/>
                </svg>
              )}
            </h3>
            <span className="text-xs text-purple-300/70">
              {isTyping && session.contactId !== currentUser.id ? 'печатает...' : 'онлайн'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 relative">
           <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/20 mr-2">
             <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse"></span>
             <span className="text-[10px] uppercase tracking-wider font-black text-purple-300">Шифрование активно</span>
           </div>

           <button className="p-2 hover:bg-white/10 rounded-full transition-all text-white/40 hover:text-white">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
           </button>

           <button onClick={onCall} className="p-2 hover:bg-white/10 rounded-full transition-all text-white/40 hover:text-white">
             <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l2.28-2.28a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
           </button>
           
           <button onClick={onVideoCall} className="p-2 hover:bg-white/10 rounded-full transition-all text-white/40 hover:text-white">
             <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
           </button>

            <div className="relative">
              <button onClick={() => setShowMenu(!showMenu)} className={`p-2 hover:bg-white/10 rounded-full transition-all ${showMenu ? 'bg-white/20 text-white' : 'text-white/50'}`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>
              </button>
              
              {showMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)}></div>
                  <div className="absolute right-0 mt-2 w-64 glass rounded-2xl border border-white/10 shadow-2xl z-50 overflow-hidden animate-message py-2 text-white text-[13px] font-medium">
                    <button onClick={() => { setActiveModal('info'); setShowMenu(false); }} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/10 text-left transition-colors">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                      Информация о чате
                    </button>
                    <button onClick={() => { setIsMuted(!isMuted); setShowMenu(false); }} className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/10 text-left transition-colors ${isMuted ? 'text-purple-400' : ''}`}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                      {isMuted ? 'Включить звук' : 'Без звука'}
                    </button>
                    <button onClick={() => { setActiveModal('search'); setShowMenu(false); }} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/10 text-left transition-colors border-b border-white/5">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                      Поиск сообщений
                    </button>

                    {session.isGroup && (
                      <>
                        <button onClick={() => { setActiveModal('members'); setShowMenu(false); }} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/10 text-left transition-colors">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                          Участники
                        </button>
                        <button onClick={() => { setActiveModal('add'); setShowMenu(false); }} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/10 text-left transition-colors">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
                          Добавить участников
                        </button>
                        <button onClick={() => { setActiveModal('settings'); setShowMenu(false); }} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/10 text-left transition-colors">
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                          Управление группой
                        </button>
                      </>
                    )}

                    <button onClick={() => { onClearHistory?.(); setShowMenu(false); }} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/10 text-left transition-colors">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      Очистить историю
                    </button>
                    <button onClick={() => { onDeleteChat?.(); setShowMenu(false); }} className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-red-500/10 text-red-400 text-left transition-colors font-bold">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
                      {session.isGroup ? 'Покинуть группу' : 'Удалить чат'}
                    </button>
                  </div>
                </>
              )}
            </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-2 bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] custom-scrollbar">
        <div className="max-w-3xl mx-auto space-y-4">
          {messages.map((message, idx) => {
            const isOwn = message.senderId === currentUser.id;
            const isNextSame = messages[idx + 1]?.senderId === message.senderId;
            
            return (
              <div key={message.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'} animate-message`} style={{ marginBottom: isNextSame ? '2px' : '12px' }}>
                <div 
                  onContextMenu={(e) => handleContextMenu(e, message)} 
                  className={`relative max-w-[85%] sm:max-w-[70%] cursor-default select-none transition-all
                    ${message.type === 'sticker' 
                      ? 'bg-transparent shadow-none' 
                      : (isOwn ? 'bubble-sent shadow-xl' : 'bubble-received shadow-xl')} 
                    ${message.type === 'image' && !message.content ? 'p-0 overflow-hidden' : (message.type === 'sticker' ? 'p-0' : 'px-4 py-2.5')}`}
                >
                  {message.type === 'sticker' && message.fileUrl && (
                    <div className="w-40 h-40 sm:w-48 sm:h-48 animate-in zoom-in duration-300">
                      <img src={message.fileUrl} alt="Sticker" className="w-full h-full object-contain hover:scale-110 transition-transform duration-300 drop-shadow-xl" />
                    </div>
                  )}

                  {message.type === 'image' && message.fileUrl && (
                    <div className={`${message.content ? 'mb-2 -mx-2 -mt-1' : ''} overflow-hidden rounded-lg`}>
                      <img src={message.fileUrl} alt="Media" className="max-w-full h-auto object-cover cursor-pointer hover:opacity-90 transition-opacity" onClick={() => window.open(message.fileUrl, '_blank')} />
                    </div>
                  )}

                  {(message.type === 'audio' || (message.type === 'file' && message.fileName?.toLowerCase().endsWith('.webm'))) && message.fileUrl && (
                    <div className="flex items-center gap-3 p-1 mb-1 min-w-[220px]">
                       <button 
                         onClick={(e) => {
                           const audio = e.currentTarget.nextElementSibling as HTMLAudioElement;
                           if (audio.paused) {
                             audio.play();
                             e.currentTarget.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>';
                           } else {
                             audio.pause();
                             e.currentTarget.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
                           }
                         }}
                         className="w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white shadow-lg transition-all active:scale-90"
                       >
                         <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                       </button>
                       <audio 
                         src={message.fileUrl} 
                         onEnded={(e) => {
                           const btn = e.currentTarget.previousElementSibling as HTMLButtonElement;
                           btn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>';
                         }}
                         className="hidden" 
                       />
                       <div className="flex-1 flex flex-col gap-1">
                          <div className="h-1 bg-white/10 rounded-full relative overflow-hidden">
                             <div className="absolute inset-0 bg-white/40 w-0 animate-pulse"></div>
                          </div>
                          <div className="flex justify-between text-[9px] font-bold text-white/40 uppercase tracking-tighter">
                             <span>{message.type === 'file' ? 'Файл-Аудио' : 'Голосовое'}</span>
                             <span>{message.fileName || '0:45'}</span>
                          </div>
                       </div>
                    </div>
                  )}

                  {(message.type === 'video' || (message.type === 'file' && message.fileName?.toLowerCase().endsWith('.mp4'))) && message.fileUrl && (
                    <div className="w-64 h-64 rounded-full overflow-hidden border-4 border-white/10 shadow-2xl relative group/video mb-2 cursor-pointer">
                       <video 
                         src={message.fileUrl} 
                         className="w-full h-full object-cover" 
                         loop 
                         playsInline
                         onClick={(e) => {
                            if (e.currentTarget.paused) e.currentTarget.play(); else e.currentTarget.pause();
                         }}
                       />
                       <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/video:opacity-100 transition-opacity pointer-events-none">
                          <svg width="40" height="40" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                       </div>
                    </div>
                  )}

                  {message.type === 'file' && !message.fileName?.toLowerCase().endsWith('.webm') && !message.fileName?.toLowerCase().endsWith('.mp4') && (
                    <div className="flex items-center gap-3 p-2 bg-black/20 rounded-xl mb-2 border border-white/5">
                      <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center text-xl">📄</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate text-white">{message.fileName || 'Документ'}</div>
                        <div className="text-[10px] text-white/50">Файл</div>
                      </div>
                      <a href={message.fileUrl} download={message.fileName} className="p-2 hover:bg-white/10 rounded-lg text-white/70">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </a>
                    </div>
                  )}

                  {message.content && <p className="text-[15px] leading-relaxed break-words text-white">{message.content}</p>}
                  
                  <div className={`flex items-center justify-end gap-1 ${message.type === 'image' && !message.content ? 'absolute bottom-2 right-2 bg-black/40 px-2 py-0.5 rounded-full backdrop-blur-sm' : 'mt-1'}`}>
                    <span className={`text-[10px] font-medium ${message.type === 'image' && !message.content ? 'text-white' : 'opacity-60'}`}>{formatTime(message.timestamp)}</span>
                    {isOwn && (
                      <span className="flex">
                        {message.status === 'read' ? (
                          <svg className="text-blue-300" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/><polyline points="24 6 13 17 8 12"/></svg>
                        ) : (
                          <svg className="opacity-60" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="glass p-3 sm:p-4">
        <div className="max-w-3xl mx-auto">
          {previewUrl && (
            <div className="mb-3 relative p-2 glass rounded-2xl border border-purple-500/30 flex items-center gap-4 animate-message">
              <img src={previewUrl} className="w-16 h-16 rounded-xl object-cover" alt="Preview" />
              <div className="flex-1 min-w-0 font-bold text-sm truncate text-white">{selectedFile?.name}</div>
              <button onClick={clearFile} className="p-2 hover:bg-red-500/20 text-red-400 rounded-full">✕</button>
            </div>
          )}

          <form onSubmit={handleSend} className="flex items-end gap-2 sm:gap-3">
            <div className={`flex-1 glass flex items-end p-1 rounded-[24px] border border-white/10 transition-all ${isRecording ? 'bg-red-500/10 border-red-500/20 shadow-lg' : ''}`}>
              {!isRecording ? (
                <>
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 hover:bg-white/10 rounded-full text-purple-300 transition-colors"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.51a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg></button>
                  <textarea rows={1} value={inputMessage} onChange={(e) => { setInputMessage(e.target.value); setIsTyping(e.target.value.length > 0); e.target.style.height = 'inherit'; e.target.style.height = `${e.target.scrollHeight}px`; }} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }} placeholder="Сообщение..." className="flex-1 bg-transparent border-none text-white placeholder-white/20 py-3 px-2 resize-none max-h-32 focus:ring-0 text-[15px]" />
                  <div className="relative">
                    <EmojiStickerPicker 
                      isOpen={showPicker} 
                      onClose={() => setShowPicker(false)} 
                      onEmojiSelect={(emoji) => {
                        setInputMessage(prev => prev + emoji);
                        setShowPicker(false);
                      }}
                      onStickerSelect={async (url) => {
                        try {
                          const res = await fetch(url);
                          const blob = await res.blob();
                          const file = new File([blob], 'sticker.webp', { type: 'image/webp' });
                          if (onSendFile) onSendFile(file, 'sticker');
                          setShowPicker(false);
                        } catch (e) {
                          console.error('Sticker send error', e);
                        }
                      }}
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowPicker(!showPicker)}
                      className={`p-3 transition-colors rounded-full ${showPicker ? 'text-purple-400 bg-white/10' : 'text-purple-300 hover:bg-white/10'}`}
                    >
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center px-4 py-2.5 justify-between animate-fadeIn relative overflow-hidden">
                   <div className="flex items-center gap-3 text-red-400 font-bold text-sm">
                      <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-ping"></span>
                      {formatDuration(recordingTime)}
                   </div>
                   
                   {!isLocked && (
                     <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2 text-white/30 text-[10px] font-black uppercase tracking-widest animate-pulse">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="m18 15-6-6-6 6"/></svg>
                        Вверх для замка
                     </div>
                   )}
                   
                   {isLocked && (
                     <div className="text-purple-400 text-[10px] font-black uppercase tracking-widest animate-bounce">
                        Запись заблокирована 🔒
                     </div>
                   )}

                   <button type="button" onClick={() => stopRecording(true)} className="text-xs font-bold text-white/30 hover:text-red-400 transition-colors">Отмена</button>
                </div>
              )}
            </div>
            
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

            {(inputMessage.trim() || selectedFile || (isRecording && isLocked)) ? (
              <button 
                type={isLocked ? "button" : "submit"}
                onClick={isLocked ? () => stopRecording() : undefined}
                className="p-4 bg-gradient-to-tr from-purple-600 to-indigo-600 text-white rounded-full transition-all shadow-xl active:scale-90 flex-shrink-0"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polyline points="22 2 15 22 11 13 2 9 22 2"/></svg>
              </button>
            ) : (
              <button 
                type="button" 
                onPointerDown={onBtnPointerDown}
                onPointerMove={onBtnPointerMove}
                onPointerUp={onBtnPointerUp}
                className={`p-4 transition-all rounded-full shadow-2xl relative flex-shrink-0 touch-none ${
                  isRecording 
                    ? 'bg-red-500 scale-125 shadow-red-500/20' 
                    : 'bg-gradient-to-tr from-purple-600 to-indigo-600 text-white active:scale-95'
                }`}
              >
                {inputMode === 'voice' ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/><path d="M7 21h10"/></svg>
                )}
                
                {isRecording && !isLocked && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 p-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 animate-bounce">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><path d="M7 11V7a5 5 0 0 1 10 0v4"/><rect x="3" y="11" width="18" height="11" rx="2"/></svg>
                  </div>
                )}

                {!isRecording && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-purple-400 rounded-full border-2 border-[#0f0a1e] flex items-center justify-center animate-bounce shadow-lg">
                     <span className="text-[8px] font-black">🔄</span>
                  </div>
                )}
              </button>
            )}
          </form>
        </div>
      </div>

      {/* Context Menu */}
      {selectedMessage && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setSelectedMessage(null)}></div>
          <div className="fixed z-[60] w-48 glass rounded-2xl border border-white/10 shadow-2xl overflow-hidden py-1.5" style={{ top: Math.min(contextMenuPos.y, window.innerHeight - 200), left: Math.min(contextMenuPos.x, window.innerWidth - 200) }}>
            <button className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/10 text-white/80 text-sm">Ответить</button>
            <button onClick={() => copyToClipboard(selectedMessage.content)} className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/10 text-white/80 text-sm">Копировать</button>
            <button className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/10 text-white/80 text-sm">Переслать</button>
            <button onClick={() => { onDeleteMessage?.(selectedMessage.id); setSelectedMessage(null); }} className="w-full px-4 py-2 flex items-center gap-3 hover:bg-red-500/10 text-red-400 text-sm">Удалить</button>
          </div>
        </>
      )}

      {/* Modals */}
      {activeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setActiveModal(null)}></div>
          <div className="relative w-full max-w-md glass rounded-[32px] border border-white/10 shadow-2xl overflow-hidden animate-message">
             <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-black text-white text-lg uppercase tracking-tight">
                   {activeModal === 'info' && 'Информация'}
                   {activeModal === 'members' && 'Участники'}
                   {activeModal === 'add' && 'Добавить'}
                   {activeModal === 'settings' && 'Настройки группы'}
                   {activeModal === 'search' && 'Поиск'}
                </h3>
                <button onClick={() => setActiveModal(null)} className="p-2 hover:bg-white/10 rounded-full text-white/50 hover:text-white">✕</button>
             </div>

             <div className="p-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                {activeModal === 'info' && (
                   <div className="space-y-6 text-center">
                      <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-purple-500 to-pink-500 mx-auto flex items-center justify-center text-3xl font-black text-white shadow-2xl">
                         {session.contactName[0]}
                      </div>
                      <div>
                         <h2 className="text-2xl font-black text-white">{session.contactName}</h2>
                         <p className="text-purple-300/50 text-sm">Группа • {session.isGroup ? `${session.participants?.length || 0} участников` : 'Личный чат'}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                         <button className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors">
                            <div className="text-xl mb-1">🔔</div>
                            <div className="text-[10px] uppercase font-bold text-white/40">Уведомл.</div>
                         </button>
                         <button className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors">
                            <div className="text-xl mb-1">🖼️</div>
                            <div className="text-[10px] uppercase font-bold text-white/40">Медиа</div>
                         </button>
                         <button className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors">
                            <div className="text-xl mb-1">🔗</div>
                            <div className="text-[10px] uppercase font-bold text-white/40">Ссылки</div>
                         </button>
                         {session.isGroup && (
                           <button onClick={() => setActiveModal('members')} className="p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-colors col-span-3 mt-2 border border-purple-500/20">
                              <div className="text-xl mb-1">👥</div>
                              <div className="text-[10px] uppercase font-bold text-white/40">Участники</div>
                           </button>
                         )}

                         {session.isGroup && (
                           <button 
                             onClick={() => { setActiveModal(null); onLeaveGroup?.(); }} 
                             className="p-3 bg-red-500/10 rounded-2xl hover:bg-red-500/20 transition-colors col-span-3 mt-2 border border-red-500/20 text-red-400"
                           >
                              <div className="text-xl mb-1">🚪</div>
                              <div className="text-[10px] uppercase font-bold">Покинуть группу</div>
                           </button>
                         )}

                         {!session.isGroup && (
                           <button 
                             onClick={() => { setActiveModal(null); onBlockUser?.(session.contactId, session.isBlocked || false); }} 
                             className={`p-3 rounded-2xl transition-colors col-span-3 mt-2 border ${session.isBlocked ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}
                           >
                              <div className="text-xl mb-1">{session.isBlocked ? '🔓' : '🚫'}</div>
                              <div className="text-[10px] uppercase font-bold">{session.isBlocked ? 'Разблокировать' : 'Заблокировать'}</div>
                           </button>
                         )}
                      </div>
                   </div>
                )}

                {activeModal === 'members' && (
                   <div className="space-y-4">
                      {session.participants?.map((p: any) => (
                         <div key={p.userId} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition-colors cursor-pointer group">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center font-bold text-white shadow-lg">
                               {p.username?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1">
                               <div className="text-sm font-bold text-white flex items-center gap-2">
                                  {p.username}
                                  {p.role === 'owner' && <span className="text-[9px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded border border-yellow-500/30 font-black uppercase">Владелец</span>}
                                  {p.role === 'admin' && <span className="text-[9px] bg-blue-500/20 text-blue-500 px-1.5 py-0.5 rounded border border-blue-500/30 font-black uppercase">Админ</span>}
                               </div>
                               <div className="text-[10px] text-white/30 uppercase font-black flex items-center gap-1.5">
                                  <span className={`w-1.5 h-1.5 rounded-full ${p.online ? 'bg-green-500' : 'bg-white/20'}`}></span>
                                  {p.online ? 'в сети' : 'был недавно'}
                               </div>
                            </div>
                            {session.participants?.find((part: any) => part.userId === currentUser.id && (part.role === 'owner' || part.role === 'admin')) && p.userId !== currentUser.id && (
                               <button 
                                 onClick={(e) => { e.stopPropagation(); onRemoveMember?.(p.userId); }}
                                 className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-500/10 text-red-400 rounded-lg transition-all"
                                 title="Удалить из группы"
                               >
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
                               </button>
                            )}
                         </div>
                      ))}
                      {(!session.participants || session.participants.length === 0) && (
                         <div className="text-center py-8 text-white/30 italic text-sm font-bold uppercase tracking-tighter">Список пуст</div>
                      )}
                   </div>
                )}

                {activeModal === 'add' && (
                    <div className="space-y-4">
                       <div className="glass p-3 rounded-2xl border border-white/10">
                          <input 
                            type="text" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Поиск контактов..." 
                            className="w-full bg-transparent border-none text-white placeholder-white/20 focus:ring-0 text-sm" 
                          />
                       </div>
                       <div className="text-[10px] font-black text-white/20 uppercase tracking-widest px-1">Ваши контакты</div>
                       <div className="space-y-2 max-h-[50vh] overflow-y-auto custom-scrollbar pr-1">
                          {contacts
                            .filter(c => !session.participants?.some((p: any) => p.userId === c.id))
                            .filter(c => !searchQuery || c.name.toLowerCase().includes(searchQuery.toLowerCase()))
                            .map(c => (
                             <div key={c.id} className="flex items-center gap-3 p-2 hover:bg-white/5 rounded-xl transition-colors cursor-pointer group">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white shadow-lg text-sm">
                                   {c.name[0]}
                                </div>
                                <div className="flex-1">
                                   <div className="text-sm font-bold text-white">{c.name}</div>
                                   <div className="text-[10px] text-white/30 uppercase font-black">{c.phoneNumber}</div>
                                </div>
                                <button 
                                  onClick={() => { onAddMember?.(c.id); setActiveModal(null); }}
                                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 rounded-xl text-[10px] font-black text-white shadow-lg transition-all active:scale-95"
                                >
                                   ДОБАВИТЬ
                                </button>
                             </div>
                          ))}
                          {contacts.length === 0 && (
                             <div className="text-center py-8 text-white/20 italic text-xs uppercase font-black tracking-widest">Список контактов пуст</div>
                          )}
                       </div>
                    </div>
                 )}

                {activeModal === 'settings' && (
                   <div className="space-y-6">
                      <div className="space-y-2">
                         <div className="text-[10px] font-black text-white/20 uppercase tracking-widest px-1">Основные</div>
                         <div className="p-4 bg-white/5 rounded-2xl space-y-4">
                            <div className="space-y-1.5">
                               <label className="text-[10px] font-black text-white/30 uppercase tracking-widest ml-1">Название группы</label>
                               <div className="flex gap-2">
                                  <input 
                                    type="text" 
                                    defaultValue={session.contactName}
                                    onBlur={(e) => {
                                      if (e.target.value !== session.contactName) {
                                        onUpdateGroup?.(e.target.value);
                                      }
                                    }}
                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:ring-1 focus:ring-purple-500 outline-none"
                                  />
                               </div>
                            </div>
                            <button className="w-full py-3 bg-white/5 rounded-xl flex items-center justify-between px-3 group hover:bg-white/10 transition-all">
                               <div className="text-sm font-bold text-white">Тип группы</div>
                               <div className="text-xs text-purple-400 font-black uppercase">Частная 🔒</div>
                            </button>
                         </div>
                      </div>

                      <div className="space-y-2">
                         <div className="text-[10px] font-black text-white/20 uppercase tracking-widest px-1">Разрешения</div>
                         <div className="p-4 bg-white/5 rounded-2xl space-y-4">
                            {['Отправка сообщений', 'Отправка медиа', 'Добавление участников', 'Закрепление сообщений'].map((p) => (
                               <div key={p} className="flex items-center justify-between">
                                  <span className="text-sm text-white/70">{p}</span>
                                  <div className="w-10 h-5 bg-purple-500 rounded-full relative cursor-pointer">
                                     <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div>
                                  </div>
                               </div>
                            ))}
                         </div>
                      </div>

                      {session.participants?.find((p: any) => p.userId === currentUser.id && p.role === 'owner') && (
                        <button 
                          onClick={onDeleteChat}
                          className="w-full p-4 bg-red-500/20 rounded-2xl text-red-400 text-sm font-black uppercase tracking-widest hover:bg-red-500/30 transition-all"
                        >
                           Удалить группу
                        </button>
                      )}
                   </div>
                )}

                {activeModal === 'search' && (
                   <div className="space-y-4">
                      <div className="glass p-3 rounded-2xl border border-white/10">
                         <input 
                           autoFocus
                           type="text" 
                           value={searchQuery}
                           onChange={(e) => setSearchQuery(e.target.value)}
                           placeholder="Что ищем?.." 
                           className="w-full bg-transparent border-none text-white placeholder-white/20 focus:ring-0 text-sm" 
                         />
                      </div>
                      <div className="text-center py-8">
                         <div className="text-4xl mb-2">🔍</div>
                         <div className="text-sm text-white/30 font-bold">Введите запрос для поиска по истории</div>
                      </div>
                   </div>
                )}
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
