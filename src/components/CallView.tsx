import { useState, useEffect, useRef } from 'react';
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface CallViewProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser: { id: string; username: string; avatar?: string };
  isIncoming: boolean;
  callType: 'audio' | 'video';
  ws: WebSocket | null;
  onAccept?: () => void;
  onReject?: () => void;
}

export default function CallView({ 
  isOpen, 
  onClose, 
  targetUser, 
  isIncoming, 
  callType, 
  ws,
  onAccept,
  onReject
}: CallViewProps) {
  const [callStatus, setCallStatus] = useState<'calling' | 'ringing' | 'connecting' | 'connected' | 'ended'>('calling');
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(callType === 'video');
  const [duration, setDuration] = useState(0);
  
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const peerConnection = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen) {
      if (isIncoming) setCallStatus('ringing');
      else startCall();
    } else {
      endCall();
    }
    return () => endCall();
  }, [isOpen]);

  useEffect(() => {
    if (callStatus === 'connected') {
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [callStatus]);

  const startCall = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: callType === 'video' 
      });
      localStream.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      initPeerConnection();
      
      // Send invite
      ws?.send(JSON.stringify({
        type: 'call',
        subType: 'invite',
        targetId: targetUser.id,
        callType
      }));
    } catch (err) {
      console.error('Failed to get media', err);
      toast.error('Ошибка доступа к камере/микрофону');
      onClose();
    }
  };

  const initPeerConnection = () => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        ws?.send(JSON.stringify({
          type: 'call',
          subType: 'candidate',
          targetId: targetUser.id,
          candidate: event.candidate
        }));
      }
    };

    pc.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
      setCallStatus('connected');
    };

    if (localStream.current) {
      localStream.current.getTracks().forEach(track => {
        pc.addTrack(track, localStream.current!);
      });
    }

    peerConnection.current = pc;
  };

  const handleAccept = async () => {
    setCallStatus('connecting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: callType === 'video' 
      });
      localStream.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      initPeerConnection();
      
      ws?.send(JSON.stringify({
        type: 'call',
        subType: 'accept',
        targetId: targetUser.id
      }));
      onAccept?.();
    } catch (err) {
      toast.error('Ошибка при ответе');
      handleReject();
    }
  };

  const handleReject = () => {
    ws?.send(JSON.stringify({
      type: 'call',
      subType: 'reject',
      targetId: targetUser.id
    }));
    onReject?.();
    onClose();
  };

  const endCall = () => {
    ws?.send(JSON.stringify({
      type: 'call',
      subType: 'hangup',
      targetId: targetUser.id
    }));
    
    localStream.current?.getTracks().forEach(track => track.stop());
    peerConnection.current?.close();
    peerConnection.current = null;
    setCallStatus('ended');
    setTimeout(() => onClose(), 1000);
  };

  // Listen for WebRTC signaling
  useEffect(() => {
    const handleSignaling = (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      if (data.type !== 'call' || data.senderId !== targetUser.id) return;

      const { subType, offer, answer, candidate } = data.content;

      switch (subType) {
        case 'accept':
          createOffer();
          break;
        case 'reject':
          toast.error('Вызов отклонен');
          onClose();
          break;
        case 'offer':
          handleOffer(offer);
          break;
        case 'answer':
          handleAnswer(answer);
          break;
        case 'candidate':
          handleCandidate(candidate);
          break;
        case 'hangup':
          toast('Звонок завершен');
          onClose();
          break;
      }
    };

    window.addEventListener('message', handleSignaling as any);
    // Actually, in our app, the WS handler is in App.tsx. 
    // We'll need to pass these messages down via a global event or prop.
    // For now, I'll assume we can use a custom event.
    const wsHandler = (e: any) => {
      const { subType, offer, answer, candidate, senderId } = e.detail;
      if (senderId !== targetUser.id) return;

      if (subType === 'accept') createOffer();
      else if (subType === 'reject') { toast.error('Вызов отклонен'); onClose(); }
      else if (subType === 'offer') handleOffer(offer);
      else if (subType === 'answer') handleAnswer(answer);
      else if (subType === 'candidate') handleCandidate(candidate);
      else if (subType === 'hangup') { toast('Звонок завершен'); onClose(); }
    };

    window.addEventListener('securenet-call-signal', wsHandler);
    return () => window.removeEventListener('securenet-call-signal', wsHandler);
  }, [targetUser.id]);

  const createOffer = async () => {
    if (!peerConnection.current) return;
    const offer = await peerConnection.current.createOffer();
    await peerConnection.current.setLocalDescription(offer);
    ws?.send(JSON.stringify({
      type: 'call',
      subType: 'offer',
      targetId: targetUser.id,
      offer
    }));
  };

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    if (!peerConnection.current) return;
    await peerConnection.current.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.current.createAnswer();
    await peerConnection.current.setLocalDescription(answer);
    ws?.send(JSON.stringify({
      type: 'call',
      subType: 'answer',
      targetId: targetUser.id,
      answer
    }));
  };

  const handleAnswer = async (answer: RTCSessionDescriptionInit) => {
    if (!peerConnection.current) return;
    await peerConnection.current.setRemoteDescription(new RTCSessionDescription(answer));
  };

  const handleCandidate = async (candidate: RTCIceCandidateInit) => {
    if (!peerConnection.current) return;
    try {
      await peerConnection.current.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (e) { console.error('Error adding ICE candidate', e); }
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] bg-[#0f0a1e] flex flex-col items-center justify-center animate-in fade-in duration-500 overflow-hidden">
      {/* Background Glow */}
      <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/20 to-indigo-900/20 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-purple-600/5 rounded-full blur-[120px] pointer-events-none animate-pulse" />

      {/* Video Streams */}
      <div className="relative w-full h-full max-w-4xl max-h-[600px] flex items-center justify-center p-4">
        {/* Remote Video (Main) */}
        <div className="relative w-full h-full glass rounded-[40px] overflow-hidden border border-white/10 shadow-2xl bg-black/20">
          <video 
            ref={remoteVideoRef} 
            autoPlay 
            playsInline 
            className="w-full h-full object-cover"
          />
          
          {callStatus !== 'connected' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center space-y-6">
              <div className="w-32 h-32 rounded-full bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-4xl font-black text-white shadow-2xl animate-bounce">
                {targetUser.username[0].toUpperCase()}
              </div>
              <div className="text-center">
                <h2 className="text-3xl font-black text-white tracking-tight">{targetUser.username}</h2>
                <p className="text-purple-300/60 font-bold uppercase tracking-[0.3em] text-xs mt-2">
                  {callStatus === 'ringing' ? 'Входящий вызов...' : 'Вызов...'}
                </p>
              </div>
            </div>
          )}

          {/* Local Video (PIP) */}
          <div className={`absolute bottom-6 right-6 w-32 sm:w-48 aspect-video glass rounded-2xl overflow-hidden border border-white/20 shadow-2xl transition-all duration-500 ${isVideoEnabled ? 'opacity-100' : 'opacity-0 scale-90'}`}>
            <video 
              ref={localVideoRef} 
              autoPlay 
              muted 
              playsInline 
              className="w-full h-full object-cover mirror"
            />
          </div>
        </div>
      </div>

      {/* Controls Overlay */}
      <div className="mt-8 flex flex-col items-center space-y-8 animate-in slide-in-from-bottom-8 duration-700">
        {callStatus === 'connected' && (
          <div className="glass px-6 py-2 rounded-full border border-white/10 text-white font-mono text-lg shadow-xl">
            {formatTime(duration)}
          </div>
        )}

        <div className="flex items-center gap-6">
          {callStatus === 'ringing' ? (
            <>
              <button 
                onClick={handleReject}
                className="w-16 h-16 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-2xl shadow-red-900/40 transition-all hover:scale-110 active:scale-95"
              >
                <PhoneOff size={28} />
              </button>
              <button 
                onClick={handleAccept}
                className="w-20 h-20 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center shadow-2xl shadow-green-900/40 transition-all hover:scale-110 active:scale-95"
              >
                <Phone size={32} />
              </button>
            </>
          ) : (
            <>
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 border border-white/10 ${isMuted ? 'bg-red-500/20 text-red-400' : 'glass text-white'}`}
              >
                {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
              </button>

              <button 
                onClick={endCall}
                className="w-16 h-16 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center shadow-2xl shadow-red-900/40 transition-all hover:scale-110 active:scale-95"
              >
                <PhoneOff size={28} />
              </button>

              <button 
                onClick={() => setIsVideoEnabled(!isVideoEnabled)}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95 border border-white/10 ${!isVideoEnabled ? 'bg-red-500/20 text-red-400' : 'glass text-white'}`}
              >
                {!isVideoEnabled ? <VideoOff size={24} /> : <Video size={24} />}
              </button>
            </>
          )}
        </div>
      </div>

      <style>{`
        .mirror { transform: scaleX(-1); }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
