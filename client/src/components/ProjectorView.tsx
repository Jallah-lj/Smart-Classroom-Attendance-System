import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { Clock, ShieldCheck, MapPin, Maximize2, Minimize2, RefreshCw, KeyRound, Users } from 'lucide-react';

interface ProjectorViewProps {
  sessionId: string;
  onExit: () => void;
}

export function ProjectorView({ sessionId, onExit }: ProjectorViewProps) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(15);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [presentCount, setPresentCount] = useState<number>(1);
  const [rotatingRoomCode, setRotatingRoomCode] = useState<boolean>(false);

  const fetchLiveQr = async () => {
    try {
      const res = await apiRequest(`/sessions/${sessionId}/live-qr`);
      setData(res);
      setSecondsRemaining(res.expiresInSeconds || 15);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load live QR code');
    }
  };

  useEffect(() => {
    fetchLiveQr();
    const interval = setInterval(fetchLiveQr, 5000);
    return () => clearInterval(interval);
  }, [sessionId]);

  // Local 1-second countdown ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 1 ? prev - 1 : 15));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Keyboard shortcuts (Escape, F for fullscreen)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onExit();
      } else if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
        setIsFullscreen(false);
      }
    }
  };

  const rotateRoomCode = async () => {
    setRotatingRoomCode(true);
    try {
      const res = await apiRequest(`/sessions/${sessionId}/rotate-room-code`, {
        method: 'POST'
      });
      setData((prev: any) => ({ ...prev, roomCode: res.roomCode }));
    } catch (err: any) {
      console.error('Failed to rotate code:', err);
    } finally {
      setRotatingRoomCode(false);
    }
  };

  if (error) {
    return (
      <div className="fixed inset-0 bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-8 z-50 font-sans">
        <p className="text-rose-400 font-medium mb-4">{error}</p>
        <button
          onClick={onExit}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold rounded border border-zinc-700"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fixed inset-0 bg-zinc-950 text-zinc-400 flex items-center justify-center z-50 font-sans">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-zinc-300" />
          <span className="text-sm">Initializing projector display...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col justify-between p-6 md:p-10 z-50 select-none overflow-hidden font-sans">
      {/* Top Banner: Course & Venue Info */}
      <header className="flex items-center justify-between border-b border-zinc-800 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
              Live Attendance Session
            </span>
            <span className="text-xs text-zinc-500 font-mono">
              {data.sessionCode}
            </span>
          </div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-zinc-50">
            {data.courseCode}: {data.courseTitle}
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-xs text-zinc-400 mt-2">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-zinc-400" />
              {data.venueName}
            </span>
            <span>·</span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-zinc-400" />
              Session ends at {new Date(data.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span>·</span>
            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <Users className="w-4 h-4 text-emerald-400" />
              Live Checked In: <strong className="font-mono tabular-nums text-white text-sm">{presentCount}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={rotateRoomCode}
            disabled={rotatingRoomCode}
            className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 rounded transition-colors flex items-center gap-1.5"
            title="Generate new 4-digit room code if leaked"
          >
            <KeyRound className="w-3.5 h-3.5" />
            <span>{rotatingRoomCode ? 'Rotating...' : 'Rotate Code'}</span>
          </button>

          <button
            onClick={toggleFullscreen}
            className="px-3 py-1.5 text-xs font-medium text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-700 rounded transition-colors flex items-center gap-1.5"
            title="Toggle Fullscreen [F]"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
          </button>

          <button
            onClick={onExit}
            className="px-3 py-1.5 text-xs font-semibold text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded transition-colors"
            title="Exit Projector Mode [Esc]"
          >
            Close [Esc]
          </button>
        </div>
      </header>

      {/* Main Center Stage: Huge QR Code and Room Code */}
      <main className="flex-1 flex flex-col md:flex-row items-center justify-center gap-10 md:gap-20 my-4">
        {/* Dynamic Rotating QR Code */}
        <div className="flex flex-col items-center">
          <div className="bg-white p-5 rounded-2xl shadow-2xl border-4 border-zinc-200">
            <img
              src={data.qrDataUrl}
              alt="Dynamic Attendance QR Code"
              className="w-64 h-64 md:w-96 md:h-96 object-contain"
            />
          </div>
          <div className="mt-4 flex items-center gap-2 text-xs md:text-sm text-zinc-400">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Dynamic Token (Rotates in <span className="tabular-nums font-mono font-bold text-zinc-100">{secondsRemaining}s</span>)</span>
          </div>
        </div>

        {/* Big Room Code */}
        <div className="flex flex-col items-center md:items-start text-center md:text-left">
          <p className="text-xs uppercase tracking-widest text-zinc-400 font-semibold mb-2">
            Step 2: Room Passcode
          </p>
          <div className="bg-zinc-900 border border-zinc-800 px-8 py-5 rounded-2xl">
            <span className="text-6xl md:text-8xl font-black tracking-widest text-white font-mono tabular-nums">
              {data.roomCode}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-3 max-w-xs leading-relaxed">
            Enter this 4-digit code in the mobile check-in interface after scanning the QR code to verify in-hall presence.
          </p>
        </div>
      </main>

      {/* Footer: Plain instructions and cryptographic integrity note */}
      <footer className="border-t border-zinc-800 pt-4 flex flex-col md:flex-row items-center justify-between text-xs text-zinc-400 gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Server-verified cryptographically signed dynamic QR token. Screenshots expire within 15 seconds.</span>
        </div>
        <div className="text-zinc-500">
          Apex University · Single Institution System · Africa/Kigali
        </div>
      </footer>
    </div>
  );
}
