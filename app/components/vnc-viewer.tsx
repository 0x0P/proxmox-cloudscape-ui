"use client";

import { useEffect, useRef } from "react";
import RFB from "novnc";

interface VncViewerProps {
  wsUrl: string;
  vncPassword: string;
  onConnect: () => void;
  onDisconnect: (clean: boolean) => void;
}

export default function VncViewer({ wsUrl, vncPassword, onConnect, onDisconnect }: VncViewerProps) {
  const displayRef = useRef<HTMLDivElement>(null);
  const rfbRef = useRef<RFB | null>(null);

  useEffect(() => {
    if (!displayRef.current) return;

    displayRef.current.innerHTML = "";

    const rfb = new RFB(displayRef.current, wsUrl, {
      credentials: { password: vncPassword },
    });

    rfb.scaleViewport = true;
    rfb.resizeSession = true;
    rfb.qualityLevel = 6;
    rfb.compressionLevel = 2;

    rfb.addEventListener("connect", onConnect);
    rfb.addEventListener("credentialsrequired", () => {
      rfb.sendCredentials({ password: vncPassword });
    });
    rfb.addEventListener("disconnect", (e: { detail: { clean: boolean } }) => {
      onDisconnect(e.detail.clean);
    });

    rfbRef.current = rfb;

    return () => {
      try { rfb.disconnect(); } catch {}
      rfbRef.current = null;
    };
  }, [wsUrl, vncPassword, onConnect, onDisconnect]);

  return (
    <div
      ref={displayRef}
      style={{
        width: "100%",
        height: "calc(100vh - 220px)",
        minHeight: 480,
        background: "#000",
      }}
    />
  );
}
