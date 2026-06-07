import { useState, useEffect } from "react";
import { useGame } from "../state";
import { LevelGuide } from "./LevelGuide";
import { ShareRoom } from "./ShareRoom";
import { missionName, missionNotes, MAX_LEVEL } from "@dsc/shared";

export function Lobby() {
  const { room, youId, startGame, addBot, removeBot, kick, setLevel, leave } = useGame();
  const [showGuide, setShowGuide] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [baseUrl, setBaseUrl] = useState(() => window.location.origin);

  // Ask the server for its LAN address so the shared link works from other phones
  // (window.location.origin may be "localhost" on the host machine).
  useEffect(() => {
    fetch("/api/lan")
      .then((r) => r.json())
      .then((d: { baseUrl?: string }) => {
        if (d.baseUrl) setBaseUrl(d.baseUrl);
      })
      .catch(() => {});
  }, []);

  if (!room) return null;
  const joinUrl = `${baseUrl}/?join=${room.code}`;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 1800);
    } catch {
      setShowShare(true); // clipboard blocked — show the modal with the URL instead
    }
  }
  const isHost = room.hostId === youId;
  const canStart = room.players.length >= room.minPlayers;
  const botCount = room.players.filter((p) => p.isBot).length;
  const roomFull = room.players.length >= room.maxPlayers;

  return (
    <div className="screen lobby">
      <header className="lobby-head">
        <button className="btn link" onClick={leave}>
          ← Leave
        </button>
        <div className="code-share">
          <div className="code-badge">
            <span>Room code</span>
            <strong>{room.code}</strong>
          </div>
          <button className="btn chip" onClick={() => setShowShare(true)} aria-label="Show QR code">
            ▣ QR
          </button>
          <button className="btn chip" onClick={copyLink} aria-label="Copy join link">
            {linkCopied ? "✓ Copied" : "🔗 Link"}
          </button>
        </div>
      </header>

      <div className="campaign-banner">
        <span className="cb-name">🚩 {room.campaignName}</span>
        <span className="cb-stats">
          {room.cleared} cleared · {room.attempts} attempts
        </span>
      </div>

      <div className="level-picker">
        <div className="lp-row">
          {isHost && (
            <button
              className="btn chip"
              disabled={room.level <= 0}
              onClick={() => setLevel(room.level - 1)}
              aria-label="Previous level"
            >
              −
            </button>
          )}
          <div className="lp-center">
            <span className="lp-num">Level {room.level + 1}</span>
            <span className="lp-name">{missionName(room.level)}</span>
          </div>
          {isHost && (
            <button
              className="btn chip"
              disabled={room.level >= MAX_LEVEL}
              onClick={() => setLevel(room.level + 1)}
              aria-label="Next level"
            >
              +
            </button>
          )}
        </div>
        <ul className="lp-notes">
          {missionNotes(room.level).map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
        <button className="btn link" onClick={() => setShowGuide(true)}>
          🗺️ Level guide
        </button>
      </div>

      <h2>Crew ({room.players.length}/{room.maxPlayers})</h2>
      <ul className="crew-list">
        {room.players.map((p) => (
          <li key={p.id} className={p.connected ? "" : "offline"}>
            <span className="diver-dot" />
            <span className="diver-name">{p.name}</span>
            {p.isBot && <span className="tag bot">bot</span>}
            {p.id === room.hostId && <span className="tag">host</span>}
            {p.id === youId && <span className="tag you">you</span>}
            {isHost && p.id !== room.hostId && (
              <button className="kick-btn" onClick={() => kick(p.id)} aria-label={`Remove ${p.name}`}>
                ✕
              </button>
            )}
          </li>
        ))}
        {Array.from({ length: room.maxPlayers - room.players.length }).map((_, i) => (
          <li key={`empty-${i}`} className="empty-seat">
            <span className="diver-dot ghost" />
            <span className="diver-name muted">waiting…</span>
          </li>
        ))}
      </ul>

      {isHost && (
        <div className="bot-controls">
          <button className="btn chip" disabled={roomFull} onClick={addBot}>
            + Add bot
          </button>
          <button className="btn chip" disabled={botCount === 0} onClick={removeBot}>
            − Remove bot
          </button>
        </div>
      )}

      {isHost ? (
        <button className="btn primary big" disabled={!canStart} onClick={() => startGame()}>
          {canStart ? `Begin Mission ${room.level + 1}` : `Need ${room.minPlayers - room.players.length} more`}
        </button>
      ) : (
        <p className="hint center">Waiting for the host to begin the dive…</p>
      )}

      {showShare && (
        <ShareRoom code={room.code} joinUrl={joinUrl} onClose={() => setShowShare(false)} />
      )}

      {showGuide && (
        <LevelGuide
          currentLevel={room.level}
          onClose={() => setShowGuide(false)}
          onPick={
            isHost
              ? (lv) => {
                  setLevel(lv);
                  setShowGuide(false);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
