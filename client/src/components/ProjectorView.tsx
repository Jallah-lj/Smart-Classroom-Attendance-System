import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api.js';
import { Clock, ShieldCheck, MapPin, Maximize2, RefreshCw } from 'lucide-react';

interface ProjectorViewProps {
  sessionId: string;
  onExit: () => void;
}

export function ProjectorView({ sessionId, onExit }: ProjectorViewProps) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [secondsRemaining, setSecondsRemaining] = useState<number>(15);

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
    const interval = setInterval(fetchLiveQr, 5000); // Poll every 5s for freshest token
    return () => clearInterval(interval);
  }, [sessionId]);

  // Local 1-second countdown ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsRemaining((prev) => (prev > 1 ? prev - 1 : 15));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  if (error) {
    return (
      <div className="fixed inset-0 bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-8 z-50">
        <p className="text-rose-400 font-medium mb-4">{error}</p>
        <button
          onClick={onExit}
          className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-sm font-medium rounded border border-zinc-700"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="fixed inset-0 bg-zinc-950 text-zinc-400 flex items-center justify-center z-50">
        <div className="flex items-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-zinc-300" />
          <span className="text-sm">Initializing projector display...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black text-white flex flex-col justify-between p-8 md:p-12 z-50 select-none overflow-hidden font-sans">
      {/* Top Banner: Course & Venue Info */}
      <header className="flex items-center justify-between border-b border-zinc-800 pb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-blue-950 text-blue-300 border border-blue-800">
              Live Attendance Session
            </span>
            <span className="text-xs text-zinc-400 font-mono">
              {data.sessionCode}
            </span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-zinc-50">
            {data.courseCode}: {data.courseTitle}
          </h1>
          <div className="flex items-center gap-4 text-sm text-zinc-400 mt-2">
            <span className="flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-zinc-400" />
              {data.venueName}
            </span>
            <span>·</span>
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-zinc-400" />
              Ends at {new Date(data.endsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        <button
          onClick={onExit}
          className="px-4 py-2 text-xs uppercase tracking-wider font-medium text-zinc-400 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded transition-colors"
          title="Exit Projector Mode"
        >
          Close Display [Esc]
        </button>
      </header>

      {/* Main Center Stage: Huge QR Code and Room Code */}
      <main className="flex-1 flex flex-col md:flex-row items-center justify-center gap-12 md:gap-24 my-6">
        {/* Dynamic Rotating QR Code */}
        <div className="flex flex-col items-center">
          <div className="bg-white p-6 rounded-2xl shadow-2xl border-4 border-zinc-200">
            <img
              src={data.qrDataUrl}
              alt="Dynamic Attendance QR Code"
              className="w-72 h-72 md:w-96 md:md:h-96 object-contain"
            />
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-zinc-400">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Rotates every {data.intervalSeconds}s (Next in <span className="tabular-nums font-mono font-bold text-zinc-200">{secondsRemaining}s</span>)</span>
          </div>
        </div>

        {/* Big Room Code */}
        <div className="flex flex-col items-center md:items-start text-center md:text-left">
          <p className="text-xs uppercase tracking-widest text-zinc-400 font-semibold mb-2">
            Step 2: Room Passcode
          </p>
          <div className="bg-zinc-900 border border-zinc-800 px-8 py-5 rounded-xl">
            <span className="text-6xl md:text-8xl font-black tracking-widest text-white font-mono tabular-nums">
              {data.roomCode}
            </span>
          </div>
          <p className="text-xs text-zinc-400 mt-3 max-w-xs leading-relaxed">
            Enter this passcode on your phone after scanning the QR code to verify in-room presence.
          </p>
        </div>
      </main>

      {/* Footer: Plain instructions and cryptographic integrity note */}
      <footer className="border-t border-zinc-800 pt-4 flex flex-col md:flex-row items-center justify-between text-xs text-zinc-400 gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Server-verified cryptographically signed dynamic QR token. Screenshots expire within 15 seconds.</span>
        </div>
        <div>
          Apex University · Single Institution Attendance
        </div>
      </footer>
    </div>
  );
}
