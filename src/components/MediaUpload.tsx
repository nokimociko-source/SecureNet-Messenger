/**
 * MEDIA UPLOAD COMPONENT
 * Handles file/image/voice message attachments with E2E encryption.
 */

import { useState, useRef } from 'react';
import * as crypto from '../crypto/webcrypto';

interface MediaUploadProps {
  chatId: string;
  onUploadComplete: (media: UploadedMedia) => void;
  apiRequest: (url: string, options?: RequestInit) => Promise<Response>;
}

export interface UploadedMedia {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  url: string;
  encryptionKey?: JsonWebKey; // ✅ Fix #6: Key to decrypt this file
  iv?: string; // ✅ Fix #6: IV for decryption
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

const ACCEPTED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm',
  'audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/webm',
  'application/pdf', 'application/zip', 'text/plain',
];

export function MediaUpload({ chatId, onUploadComplete, apiRequest }: MediaUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);

    // Validate size
    if (file.size > MAX_FILE_SIZE) {
      setError(`Файл слишком большой. Максимум: ${MAX_FILE_SIZE / 1024 / 1024}MB`);
      return;
    }

    // Validate type
    if (!ACCEPTED_TYPES.includes(file.type)) {
      setError('Неподдерживаемый формат файла');
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      // ✅ Fix #6: Encrypt file before upload (Zero-Knowledge)
      console.log('🔐 Encrypting media file...');
      const fileBuffer = await file.arrayBuffer();
      const aesKey = await crypto.generateAESKey();
      const { ciphertext, iv } = await crypto.encryptAES(new Uint8Array(fileBuffer), aesKey);
      
      const encryptedBlob = new Blob([ciphertext.buffer as ArrayBuffer], { type: 'application/octet-stream' });
      const encryptedFile = new File([encryptedBlob], file.name, { type: 'application/octet-stream' });

      const formData = new FormData();
      formData.append('file', encryptedFile);
      formData.append('chatId', chatId);
      formData.append('encrypted', 'true');

      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await apiRequest('/media/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Ошибка загрузки');
      }

      const media = await response.json();
      const keyJwk = await crypto.exportPublicKey(aesKey);
      
      setProgress(100);

      onUploadComplete({
        id: media.id,
        fileName: file.name,
        fileSize: file.size,
        mimeType: file.type,
        url: `/api/media/${media.id}?token=${localStorage.getItem('token')}`,
        encryptionKey: keyJwk,
        iv: crypto.arrayToBase64(iv),
      });

      // Reset after brief delay
      setTimeout(() => {
        setUploading(false);
        setProgress(0);
      }, 500);

    } catch (err) {
      setError((err as Error).message);
      setUploading(false);
      setProgress(0);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Attachment button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        style={{
          background: 'none',
          border: 'none',
          cursor: uploading ? 'wait' : 'pointer',
          padding: '8px',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s',
          opacity: uploading ? 0.5 : 1,
        }}
        title="Прикрепить файл"
      >
        {uploading ? (
          <div style={{
            width: 24,
            height: 24,
            border: '2px solid rgba(147, 130, 220, 0.3)',
            borderTopColor: '#9382dc',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
        ) : (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        )}
      </button>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        onChange={handleInputChange}
        style={{ display: 'none' }}
      />

      {/* Drop zone overlay */}
      {dragActive && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(99, 102, 241, 0.15)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <div style={{
            background: 'rgba(30, 30, 60, 0.9)',
            borderRadius: '16px',
            padding: '32px 48px',
            border: '2px dashed #6366f1',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📎</div>
            <div style={{ color: '#e0e0ff', fontSize: 18, fontWeight: 600 }}>Отпустите файл для загрузки</div>
          </div>
        </div>
      )}

      {/* Upload progress */}
      {uploading && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          right: 0,
          background: 'rgba(30, 30, 60, 0.95)',
          borderRadius: '8px 8px 0 0',
          padding: '8px 12px',
          marginBottom: 4,
        }}>
          <div style={{ fontSize: 12, color: '#a0a0c0', marginBottom: 4 }}>
            Загрузка... {progress}%
          </div>
          <div style={{
            height: 3,
            background: 'rgba(99, 102, 241, 0.2)',
            borderRadius: 2,
          }}>
            <div style={{
              height: '100%',
              width: `${progress}%`,
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              borderRadius: 2,
              transition: 'width 0.3s ease',
            }} />
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          left: 0,
          right: 0,
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.3)',
          borderRadius: '8px',
          padding: '8px 12px',
          marginBottom: 4,
          fontSize: 12,
          color: '#fca5a5',
        }}>
          ⚠️ {error}
          <button
            onClick={() => setError(null)}
            style={{
              float: 'right',
              background: 'none',
              border: 'none',
              color: '#fca5a5',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >✕</button>
        </div>
      )}

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

/**
 * MediaPreview — renders media in chat messages (images, audio, files).
 * ✅ Fix #6: Decrypts media before display.
 */
export function MediaPreview({ media }: { media: UploadedMedia }) {
  const [decryptedUrl, setDecryptedUrl] = useState<string | null>(null);
  const [decrypting, setDecrypting] = useState(!!media.encryptionKey);

  useState(() => {
    if (!media.encryptionKey || !media.iv) return;

    const decrypt = async () => {
      try {
        const response = await fetch(media.url);
        const encryptedData = await response.arrayBuffer();
        
        const aesKey = await crypto.importAESKey(media.encryptionKey!);
        const iv = crypto.base64ToArray(media.iv!);
        
        const plaintext = await crypto.decryptAES(new Uint8Array(encryptedData), aesKey, iv);
        const blob = new Blob([plaintext.buffer as ArrayBuffer], { type: media.mimeType });
        setDecryptedUrl(URL.createObjectURL(blob));
      } catch (err) {
        console.error('Failed to decrypt media:', err);
      } finally {
        setDecrypting(false);
      }
    };

    decrypt();
  });

  const displayUrl = media.encryptionKey ? decryptedUrl : media.url;

  if (decrypting) {
    return <div style={{ fontSize: 12, color: '#8888aa', padding: 8 }}>🔓 Расшифровка медиа...</div>;
  }

  if (!displayUrl && media.encryptionKey) {
    return <div style={{ fontSize: 12, color: '#ef4444', padding: 8 }}>❌ Ошибка расшифровки</div>;
  }

  const isImage = media.mimeType.startsWith('image/');
  const isAudio = media.mimeType.startsWith('audio/');
  const isVideo = media.mimeType.startsWith('video/');

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  if (isImage) {
    return (
      <div style={{ maxWidth: 300, borderRadius: 12, overflow: 'hidden', marginTop: 4 }}>
        <img
          src={displayUrl!}
          alt={media.fileName}
          style={{ width: '100%', display: 'block' }}
          loading="lazy"
        />
      </div>
    );
  }

  if (isAudio) {
    return (
      <div style={{ marginTop: 4, maxWidth: 300 }}>
        <audio controls style={{ width: '100%' }}>
          <source src={displayUrl!} type={media.mimeType} />
        </audio>
        <div style={{ fontSize: 11, color: '#8888aa', marginTop: 2 }}>{media.fileName}</div>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div style={{ maxWidth: 300, borderRadius: 12, overflow: 'hidden', marginTop: 4 }}>
        <video controls style={{ width: '100%' }}>
          <source src={displayUrl!} type={media.mimeType} />
        </video>
      </div>
    );
  }

  // Generic file
  return (
    <a
      href={displayUrl!}
      download={media.fileName}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 12px',
        background: 'rgba(99, 102, 241, 0.1)',
        borderRadius: 8,
        color: '#a0a0ff',
        textDecoration: 'none',
        marginTop: 4,
        maxWidth: 280,
      }}
    >
      <span style={{ fontSize: 24 }}>📄</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 500, wordBreak: 'break-all' }}>{media.fileName}</div>
        <div style={{ fontSize: 11, color: '#8888aa' }}>{formatSize(media.fileSize)}</div>
      </div>
    </a>
  );
}

export default MediaUpload;
