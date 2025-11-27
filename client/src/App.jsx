import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CheckCircle2,
  Copy,
  RefreshCw,
  Rocket,
  ShieldCheck,
  Skull,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
  X
} from "lucide-react";
import "./App.css";

const initialJoinCode = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get("lobby") || "";
};

const getWebSocketUrl = () => {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  // Use same host:port if available; only remap 5173->3001 for local dev
  const hostPort =
    window.location.port === "5173"
      ? `${window.location.hostname}:3001`
      : window.location.host; // host already includes port if present
  return `${protocol}://${hostPort}`;
};

const StatusPill = ({ icon: Icon, tone = "neutral", children }) => (
  <div className={`pill pill-${tone}`}>
    <Icon size={16} />
    <span>{children}</span>
  </div>
);

const SectionCard = ({ title, icon: Icon, children, action }) => (
  <motion.div
    className="card"
    initial={{ opacity: 0, y: 12 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
  >
    <div className="card-head">
      <div className="card-title">
        {Icon ? <Icon size={18} /> : null}
        <span>{title}</span>
      </div>
      {action || null}
    </div>
    {children}
  </motion.div>
);

function App() {
  const [ws, setWs] = useState(null);
  const [connection, setConnection] = useState("connecting");
  const [playerId, setPlayerId] = useState(null);
  const [dataset, setDataset] = useState([]);
  const [playerName, setPlayerName] = useState("");
  const [initialSharedCode] = useState(() => initialJoinCode());
  const [joinCode, setJoinCode] = useState(initialSharedCode);
  const [lobbyId, setLobbyId] = useState(null);
  const [hostId, setHostId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [players, setPlayers] = useState([]);
  const [themeIndex, setThemeIndex] = useState(0);
  const [impostors, setImpostors] = useState(1);
  const [order, setOrder] = useState([]);
  const [aliveIds, setAliveIds] = useState([]);
  const [voteTally, setVoteTally] = useState([]);
  const [voteStatus, setVoteStatus] = useState({ votedCount: 0, total: 0 });
  const [roleOverlay, setRoleOverlay] = useState({
    open: false,
    isImpostor: false,
    message: "",
    theme: "",
    secretWord: ""
  });
  const [elimination, setElimination] = useState(null);
  const [gameResult, setGameResult] = useState(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [myVote, setMyVote] = useState(null);
  const [alert, setAlert] = useState("");
  const [toast, setToast] = useState("");
  const [roleFlash, setRoleFlash] = useState({ visible: false, isImpostor: false });
  const flashTimer = useRef(null);
  const overlayTimer = useRef(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 2000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const url = getWebSocketUrl();
    const socket = new WebSocket(url);
    setWs(socket);

    socket.onopen = () => setConnection("online");
    socket.onerror = () => setConnection("error");
    socket.onclose = () => setConnection("offline");

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "hello") {
        setPlayerId(msg.playerId);
        setDataset(msg.dataset || []);
        return;
      }

      if (msg.type === "lobbyJoined") {
        setLobbyId(msg.lobby.lobbyId);
        setHostId(msg.lobby.hostId);
        setIsHost(msg.isHost);
        setPlayers(msg.lobby.players || []);
        setThemeIndex(msg.lobby.settings?.themeIndex ?? 0);
        setImpostors(msg.lobby.settings?.impostors ?? 1);
        setOrder([]);
        setAliveIds([]);
        setVoteTally([]);
        setVoteStatus({ votedCount: 0, total: 0 });
        setHasVoted(false);
        setMyVote(null);
        setElimination(null);
        setGameResult(null);
        setRoleOverlay((prev) => ({ ...prev, open: false }));
        setToast("Listo: lobby cargado");
        return;
      }

      if (msg.type === "lobbyUpdate") {
        setPlayers(msg.lobby.players || []);
        setHostId(msg.lobby.hostId);
        setThemeIndex((prev) => msg.lobby.settings?.themeIndex ?? prev);
        setImpostors((prev) => msg.lobby.settings?.impostors ?? prev);
        return;
      }

      if (msg.type === "roundStarted") {
        const alive = msg.alive || (msg.order || []).map((p) => p.id);
        setOrder(msg.order || []);
        setAliveIds(alive);
        setVoteTally([]);
        setVoteStatus({ votedCount: 0, total: alive.length });
        setHasVoted(false);
        setMyVote(null);
        setElimination(null);
        setGameResult(null);
        return;
      }

      if (msg.type === "roundAssigned") {
        if (flashTimer.current) clearTimeout(flashTimer.current);
        if (overlayTimer.current) clearTimeout(overlayTimer.current);
        setRoleFlash({ visible: true, isImpostor: msg.isImpostor });
        flashTimer.current = setTimeout(() => {
          setRoleFlash((prev) => ({ ...prev, visible: false }));
        }, 900);
        setRoleOverlay((prev) => ({
          ...prev,
          open: false,
          isImpostor: msg.isImpostor,
          message: msg.word,
          theme: msg.theme,
          secretWord: msg.secretWord
        }));
        overlayTimer.current = setTimeout(() => {
          setRoleOverlay((prev) => ({ ...prev, open: true }));
        }, 1000);
        setGameResult(null);
        return;
      }

      if (msg.type === "voteUpdate") {
        setVoteTally(msg.votes || []);
        setVoteStatus((prev) => ({
          votedCount: msg.votedCount || 0,
          total: msg.totalVoters ?? prev.total
        }));
        return;
      }

      if (msg.type === "elimination") {
        setAliveIds(msg.aliveIds || []);
        setOrder(msg.order || []);
        setElimination({
          name: msg.eliminatedName,
          votes: msg.votes,
          impostorsAlive: msg.impostorsAlive
        });
        setHasVoted(true);
        return;
      }

      if (msg.type === "votingReset") {
        const alive = msg.aliveIds || [];
        setAliveIds(alive);
        setOrder(msg.order || []);
        setVoteTally([]);
        setVoteStatus({ votedCount: 0, total: alive.length });
        setHasVoted(false);
        setMyVote(null);
        setElimination(null);
        setGameResult(null);
        return;
      }

      if (msg.type === "gameEnd") {
        setGameResult(msg.result);
        setRoleOverlay((prev) => ({ ...prev, open: true }));
        return;
      }

      if (msg.type === "error") {
        setAlert(msg.message || "Algo salió mal");
        setTimeout(() => setAlert(""), 2500);
      }
    };

    return () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
      if (overlayTimer.current) clearTimeout(overlayTimer.current);
      socket.close();
    };
  }, []);

  const sendMessage = (payload) => {
    if (ws?.readyState !== WebSocket.OPEN) {
      setAlert("No hay conexión con el servidor");
      return;
    }
    ws.send(JSON.stringify(payload));
  };

  const shareLink = useMemo(
    () => (lobbyId ? `${window.location.origin}?lobby=${lobbyId}` : ""),
    [lobbyId]
  );

  const hasDataset = dataset.length > 0;

  const aliveOrder = useMemo(() => {
    const aliveSet = new Set(aliveIds.length ? aliveIds : order.map((o) => o.id));
    return order.filter((o) => aliveSet.has(o.id));
  }, [aliveIds, order]);

  const canVote = aliveIds.length > 0 && order.length > 0;
  const roleLabel = roleOverlay.isImpostor ? "IMPOSTOR" : "INOCENTE";
  const roleDetail = roleOverlay.message
    ? roleOverlay.isImpostor
      ? (roleOverlay.message.includes("Pista:")
        ? roleOverlay.message.split("Pista:").pop().trim()
        : roleOverlay.message.replace("Eres el impostor.", "").trim())
      : roleOverlay.message.replace("Tu palabra es:", "").trim()
    : "";

  const handleCopy = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setToast("Link copiado");
    } catch {
      setAlert("No se pudo copiar");
    }
  };

  const handleCreateLobby = () => {
    if (!playerName.trim()) {
      setAlert("Pon tu nombre antes de crear el lobby");
      return;
    }
    sendMessage({
      type: "createLobby",
      name: playerName.trim(),
      themeIndex: Number(themeIndex) || 0,
      impostors: Number(impostors) || 1
    });
  };

  const hasSharedCode = !!initialSharedCode;

  const handleJoinLobby = () => {
    if (!joinCode.trim()) {
      setAlert("Ingresa el código del lobby");
      return;
    }
    if (!playerName.trim()) {
      setAlert("Pon tu nombre para entrar");
      return;
    }
    sendMessage({
      type: "joinLobby",
      lobbyId: joinCode.trim().toUpperCase(),
      name: playerName.trim()
    });
  };

  const updateSettings = (nextTheme, nextImpostors) => {
    if (!isHost || !lobbyId) return;
    sendMessage({
      type: "updateSettings",
      lobbyId,
      themeIndex: nextTheme ?? themeIndex,
      impostors: nextImpostors ?? impostors
    });
  };

  const handleStart = () => {
    if (!isHost || !lobbyId) return;
    sendMessage({
      type: "startGame",
      lobbyId,
      themeIndex: Number(themeIndex) || 0,
      impostors: Number(impostors) || 1
    });
  };

  const handleVote = (targetId) => {
    if (!lobbyId || hasVoted) return;
    sendMessage({ type: "vote", lobbyId, targetId });
    setHasVoted(true);
    setMyVote(targetId);
  };

  const handleCancelVote = () => {
    if (!lobbyId || !hasVoted) return;
    sendMessage({ type: "cancelVote", lobbyId });
    setHasVoted(false);
    setMyVote(null);
  };

  const renderVoteCards = () => (
    <div className="vote-grid">
      {aliveOrder.map((p, idx) => {
        const tally = voteTally.find((v) => v.id === p.id)?.votes || 0;
        const votedByMe = myVote === p.id;
        return (
          <div className={`vote-card ${votedByMe ? "active" : ""}`} key={p.id}>
            <div className="vote-name">
              <span className="muted">#{idx + 1}</span> {p.name || "Jugador"}
            </div>
            <div className="vote-meta">
              <div className="vote-pill">
                <Skull size={14} />
                {tally} votos
              </div>
              {votedByMe ? (
                <div className="vote-pill success">
                  <CheckCircle2 size={14} />
                  Tu voto
                </div>
              ) : null}
            </div>
            <button
              className="btn ghost"
              disabled={hasVoted}
              onClick={() => handleVote(p.id)}
            >
              Votar a {p.name || "Jugador"}
            </button>
          </div>
        );
      })}
      {aliveOrder.length === 0 ? (
        <div className="empty">Esperando que inicie la ronda...</div>
      ) : null}
    </div>
  );

  const connectionLabel =
    connection === "online" ? "Conectado" : connection === "connecting" ? "Conectando..." : "Sin conexión";
  const connectionTone = connection === "online" ? "success" : connection === "error" ? "warning" : "info";
  const ConnectionIcon = connection === "online" ? Wifi : WifiOff;

  return (
    <div className="page">
      <div className="glow glow-a" />
      <div className="glow glow-b" />

      <AnimatePresence>
        {roleFlash.visible ? (
          <motion.div
            className="role-flash"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1.06 }}
            exit={{ opacity: 0, scale: 1.2 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <div className={`role-flash-text ${roleFlash.isImpostor ? "impostor" : "civil"}`}>
              {roleFlash.isImpostor ? "IMPOSTOR" : "INOCENTE"}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <header className="top">
        <div>
          <p className="eyebrow">Impostor · DazaDev</p>
          <h1>Lobby</h1>
          <p className="lede">
            Version 2.0, para que vean que uno trabaja y hace las cosas mejor para ustedes, mal agradecidos mmvrgs.
          </p>
        </div>
        <div className="status-wrap">
          <StatusPill icon={ConnectionIcon} tone={connectionTone}>
            {connectionLabel}
          </StatusPill>
          {lobbyId ? (
            <StatusPill icon={ShieldCheck} tone="info">
              Lobby {lobbyId}
            </StatusPill>
          ) : null}
          {isHost ? (
            <StatusPill icon={Sparkles} tone="success">
              Eres host
            </StatusPill>
          ) : null}
        </div>
      </header>

      {toast ? <div className="toast">{toast}</div> : null}
      {alert ? <div className="alert">{alert}</div> : null}

      {!lobbyId ? (
        hasSharedCode ? (
          <SectionCard title="Unirme al lobby compartido" icon={Users}>
            <div className="pill pill-info">
              Código detectado: <strong>{joinCode}</strong>
            </div>
            <div className="field">
              <label>Tu nombre</label>
              <input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Pon tu nombre para entrar"
              />
            </div>
            <button className="btn primary" onClick={handleJoinLobby}>
              <Users size={16} />
              Entrar al lobby
            </button>
          </SectionCard>
        ) : (
          <div className="grid two">
            <SectionCard title="Crear lobby" icon={Rocket}>
              <div className="field">
                <label>Tu nombre</label>
                <input
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Escribe tu nombre"
                />
              </div>
              <div className="field">
                <label>Temática</label>
                <select
                  value={themeIndex}
                  disabled={!hasDataset}
                  onChange={(e) => setThemeIndex(Number(e.target.value))}
                >
                  {hasDataset ? (
                    dataset.map((item, idx) => (
                      <option key={item.name} value={idx}>
                        {item.name} · {item.words} palabras
                      </option>
                    ))
                  ) : (
                    <option value={0}>Cargando temáticas...</option>
                  )}
                </select>
              </div>
              <div className="field">
                <label>Impostores</label>
                <input
                  type="number"
                  min="1"
                  value={impostors}
                  onChange={(e) => setImpostors(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <button className="btn primary" onClick={handleCreateLobby}>
                <Rocket size={16} />
                Crear lobby
              </button>
            </SectionCard>

            <SectionCard title="Unirme a un lobby" icon={Users}>
              <div className="field">
                <label>Código de lobby</label>
                <input
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                />
              </div>
              <div className="field">
                <label>Tu nombre</label>
                <input
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Jugador"
                />
              </div>
              <button className="btn ghost" onClick={handleJoinLobby}>
                <Users size={16} />
                Entrar al lobby
              </button>
              <p className="muted small">
                ¿Te compartieron un link? El código viene después del parámetro <code>?lobby=</code>.
              </p>
            </SectionCard>
          </div>
        )
      ) : (
        <>
          <div className="grid three">
            <SectionCard
              title="Panel del host"
              icon={ShieldCheck}
              action={
                <div className="card-actions">
                  {shareLink ? (
                    <button
                      className="btn ghost icon-only"
                      onClick={handleCopy}
                      title="Copiar link"
                      aria-label="Copiar link"
                    >
                      <Copy size={16} />
                    </button>
                  ) : null}
                  <button
                    className="btn ghost icon-only"
                    onClick={() => setToast("Estado refrescado")}
                    title="Refrescar"
                    aria-label="Refrescar estado"
                  >
                    <RefreshCw size={16} />
                  </button>
                </div>
              }
            >
              <div className="pill-row">
                <div className="pill pill-muted">
                  Código: <strong>{lobbyId}</strong>
                </div>
              </div>
              <div className="field">
                <label>Temática</label>
                <select
                  value={themeIndex}
                  disabled={!isHost || !hasDataset}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setThemeIndex(value);
                    updateSettings(value, undefined);
                  }}
                >
                  {hasDataset ? (
                    dataset.map((item, idx) => (
                      <option key={item.name} value={idx}>
                        {item.name} · {item.words} palabras
                      </option>
                    ))
                  ) : (
                    <option value={0}>Cargando temáticas...</option>
                  )}
                </select>
              </div>
              <div className="field">
                <label>Impostores</label>
                <input
                  type="number"
                  min="1"
                  disabled={!isHost}
                  value={impostors}
                  onChange={(e) => {
                    const next = Math.max(1, Number(e.target.value) || 1);
                    setImpostors(next);
                    updateSettings(undefined, next);
                  }}
                />
              </div>
              {isHost ? (
                <button className="btn primary" onClick={handleStart}>
                  <Rocket size={16} />
                  Iniciar ronda
                </button>
              ) : (
                <p className="muted small">Esperando a que el host inicie la ronda.</p>
              )}
            </SectionCard>

            <SectionCard title="Jugadores" icon={Users}>
              <div className="list">
                {players.map((p) => (
                  <div className="player-row" key={p.id}>
                    <div className="player-name">{p.name || "Jugador"}</div>
                    <div className={`badge ${p.id === hostId ? "badge-host" : ""}`}>
                      {p.id === hostId ? "Host" : "Listo"}
                    </div>
                  </div>
                ))}
                {!players.length ? <div className="empty">Aún no hay jugadores conectados.</div> : null}
              </div>
            </SectionCard>

            <SectionCard title="Ronda en curso" icon={Skull}>
              <div className="order">
                {aliveOrder.map((p, idx) => (
                  <div className="order-chip" key={p.id}>
                    <span className="muted">#{idx + 1}</span> {p.name}
                  </div>
                ))}
                {!aliveOrder.length ? <div className="empty">Cuando inicie la partida verás el orden aquí.</div> : null}
              </div>
              <div className="vote-status">
                Votos registrados: {voteStatus.votedCount}/{voteStatus.total}
              </div>
              {elimination ? (
                <div className="banner">
                  {elimination.name || "Jugador"} fue eliminado con {elimination.votes || 0} votos.
                </div>
              ) : null}
              {canVote ? (
                <button className="btn ghost" onClick={() => setRoleOverlay((p) => ({ ...p, open: true }))}>
                  Abrir panel de votación
                </button>
              ) : null}
            </SectionCard>
          </div>
        </>
      )}

      <AnimatePresence>
        {roleOverlay.open ? (
          <motion.div
            className="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="modal"
              initial={{ scale: 0.96, y: 10, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
            >
              <div className="modal-head">
                <button className="btn ghost" onClick={() => setRoleOverlay((p) => ({ ...p, open: false }))}>
                  <X size={16} /> Cerrar
                </button>
              </div>

              <div className="role-hero">
                <div className={`role-label ${roleOverlay.isImpostor ? "impostor" : "civil"}`}>
                  {roleLabel}
                </div>
                <div className="role-detail">
                  {roleOverlay.isImpostor ? "Tu pista es: " : "Tu palabra es: "}
                  <strong>{roleDetail || "..."}</strong>
                </div>
              </div>

              {gameResult ? (
                <div className={`result ${gameResult === "impostor" ? "loss" : "win"}`}>
                  {gameResult === "impostor" ? "Ganó el impostor" : "Ganaron los inocentes"}
                </div>
              ) : null}

              {elimination ? (
                <div className="banner strong">
                  {elimination.name || "Jugador"} fue eliminado ({elimination.votes || 0} votos)
                </div>
              ) : null}

              {renderVoteCards()}

              <div className="modal-foot">
                <div className="vote-status">
                  Votos: {voteStatus.votedCount}/{voteStatus.total || aliveOrder.length}
                </div>
                {hasVoted ? (
                  <button className="btn ghost" onClick={handleCancelVote}>
                    Cancelar mi voto
                  </button>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default App;
