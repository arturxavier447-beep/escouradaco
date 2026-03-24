import React, { useEffect, useMemo, useState } from "react";

type Coord = { r: number; c: number };

type ShipType = {
  id: string;
  name: string;
  size: number;
};

type ShipInstance = {
  id: string;
  typeId: string;
  name: string;
  size: number;
  cells: Coord[];
  hits: number;
  sunkAt?: number;
};

type Orientation = "H" | "V";

type Phase = "placement" | "battle" | "gameover";

type Board = {
  size: number;
  ships: ShipInstance[];
  shipByCell: (string | null)[][];
  attacks: { attacked: boolean; hit: boolean }[][];
};

const BOARD_SIZE = 10;

const SHIP_TYPES: ShipType[] = [
  { id: "carrier", name: "Carrier", size: 5 },
  { id: "battleship", name: "Battleship", size: 4 },
  { id: "cruiser", name: "Cruiser", size: 3 },
  { id: "submarine", name: "Submarine", size: 3 },
  { id: "destroyer", name: "Destroyer", size: 2 },
];

function inBounds(size: number, r: number, c: number) {
  return r >= 0 && c >= 0 && r < size && c < size;
}

function coordKey(p: Coord) {
  return `${p.r},${p.c}`;
}

function cloneBoard(b: Board): Board {
  return {
    size: b.size,
    ships: b.ships.map((s) => ({ ...s, cells: s.cells.map((c) => ({ ...c })) })),
    shipByCell: b.shipByCell.map((row) => row.slice()),
    attacks: b.attacks.map((row) => row.map((x) => ({ ...x }))),
  };
}

function makeEmptyBoard(size = BOARD_SIZE): Board {
  return {
    size,
    ships: [],
    shipByCell: Array.from({ length: size }, () => Array.from({ length: size }, () => null)),
    attacks: Array.from({ length: size }, () => Array.from({ length: size }, () => ({ attacked: false, hit: false }))),
  };
}

function cellsForPlacement(start: Coord, orient: Orientation, len: number): Coord[] {
  const out: Coord[] = [];
  for (let i = 0; i < len; i++) {
    out.push({ r: start.r + (orient === "V" ? i : 0), c: start.c + (orient === "H" ? i : 0) });
  }
  return out;
}

function canPlace(board: Board, cells: Coord[]) {
  for (const p of cells) {
    if (!inBounds(board.size, p.r, p.c)) return false;
    if (board.shipByCell[p.r][p.c]) return false;
  }
  return true;
}

function placeShip(board: Board, shipType: ShipType, cells: Coord[]): Board {
  const b = cloneBoard(board);
  const id = `${shipType.id}-${Math.random().toString(16).slice(2)}`;
  const inst: ShipInstance = {
    id,
    typeId: shipType.id,
    name: shipType.name,
    size: shipType.size,
    cells,
    hits: 0,
  };
  b.ships.push(inst);
  for (const p of cells) b.shipByCell[p.r][p.c] = id;
  return b;
}

function removeShip(board: Board, shipId: string): Board {
  const b = cloneBoard(board);
  b.ships = b.ships.filter((s) => s.id !== shipId);
  for (let r = 0; r < b.size; r++) {
    for (let c = 0; c < b.size; c++) {
      if (b.shipByCell[r][c] === shipId) b.shipByCell[r][c] = null;
    }
  }
  return b;
}

function attackCell(board: Board, p: Coord, now: number): { board: Board; hit: boolean; sunkShip?: ShipInstance } {
  const b = cloneBoard(board);
  if (b.attacks[p.r][p.c].attacked) return { board: b, hit: b.attacks[p.r][p.c].hit };

  const shipId = b.shipByCell[p.r][p.c];
  const hit = !!shipId;
  b.attacks[p.r][p.c] = { attacked: true, hit };

  let sunkShip: ShipInstance | undefined;
  if (shipId) {
    const ship = b.ships.find((s) => s.id === shipId);
    if (ship) {
      ship.hits += 1;
      if (ship.hits >= ship.size && ship.sunkAt == null) {
        ship.sunkAt = now;
        sunkShip = { ...ship, cells: ship.cells.map((c) => ({ ...c })) };
      }
    }
  }
  return { board: b, hit, sunkShip };
}

function allSunk(board: Board) {
  return board.ships.length > 0 && board.ships.every((s) => s.hits >= s.size);
}

function randInt(n: number) {
  return Math.floor(Math.random() * n);
}

function randomOrientation(): Orientation {
  return Math.random() < 0.5 ? "H" : "V";
}

function generateRandomFleet(size = BOARD_SIZE): Board {
  let b = makeEmptyBoard(size);
  for (const st of SHIP_TYPES) {
    let placed = false;
    let guard = 0;
    while (!placed && guard++ < 5000) {
      const orient = randomOrientation();
      const start = { r: randInt(size), c: randInt(size) };
      const cells = cellsForPlacement(start, orient, st.size);
      if (!canPlace(b, cells)) continue;
      b = placeShip(b, st, cells);
      placed = true;
    }
    if (!placed) {
      // fallback: restart
      return generateRandomFleet(size);
    }
  }
  return b;
}

function pickComputerShot(playerBoard: Board): Coord {
  // Simple hunt/target: prefer neighbors of known hits that aren't fully resolved
  const size = playerBoard.size;
  const hits: Coord[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const a = playerBoard.attacks[r][c];
      if (a.attacked && a.hit) hits.push({ r, c });
    }
  }

  const candidates: Coord[] = [];
  for (const h of hits) {
    const shipId = playerBoard.shipByCell[h.r][h.c];
    const ship = shipId ? playerBoard.ships.find((s) => s.id === shipId) : undefined;
    if (ship && ship.hits >= ship.size) continue; // ship sunk, don't chase
    const neigh = [
      { r: h.r - 1, c: h.c },
      { r: h.r + 1, c: h.c },
      { r: h.r, c: h.c - 1 },
      { r: h.r, c: h.c + 1 },
    ].filter((p) => inBounds(size, p.r, p.c));

    for (const p of neigh) {
      if (!playerBoard.attacks[p.r][p.c].attacked) candidates.push(p);
    }
  }

  if (candidates.length) return candidates[randInt(candidates.length)];

  const pool: Coord[] = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!playerBoard.attacks[r][c].attacked) pool.push({ r, c });
    }
  }
  return pool[randInt(pool.length)];
}

function letters(n: number) {
  return Array.from({ length: n }, (_, i) => String.fromCharCode("A".charCodeAt(0) + i));
}

function fmtCoord(p: Coord) {
  return `${String.fromCharCode(65 + p.c)}${p.r + 1}`;
}

function classNames(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function useNowTick(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

function Cell({
  sizePx,
  children,
  onClick,
  onEnter,
  onLeave,
  disabled,
  className,
  title,
}: {
  sizePx: number;
  children?: React.ReactNode;
  onClick?: () => void;
  onEnter?: () => void;
  onLeave?: () => void;
  disabled?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={disabled ? undefined : onClick}
      onMouseEnter={disabled ? undefined : onEnter}
      onMouseLeave={disabled ? undefined : onLeave}
      className={classNames(
        "relative grid place-items-center rounded-md border text-xs transition",
        "focus:outline-none focus:ring-2 focus:ring-sky-400/60",
        disabled ? "cursor-not-allowed opacity-80" : "cursor-pointer hover:brightness-110 active:scale-[0.98]",
        className
      )}
      style={{ width: sizePx, height: sizePx }}
    >
      {children}
    </button>
  );
}

export function App() {
  const now = useNowTick(120);

  const [phase, setPhase] = useState<Phase>("placement");
  const [orientation, setOrientation] = useState<Orientation>("H");
  const [playerBoard, setPlayerBoard] = useState<Board>(() => makeEmptyBoard());
  const [enemyBoard, setEnemyBoard] = useState<Board>(() => generateRandomFleet());

  const [selectedShipTypeId, setSelectedShipTypeId] = useState<string>(SHIP_TYPES[0].id);
  const selectedShipType = useMemo(
    () => SHIP_TYPES.find((s) => s.id === selectedShipTypeId) ?? SHIP_TYPES[0],
    [selectedShipTypeId]
  );

  const [hover, setHover] = useState<Coord | null>(null);
  const [hoverEnemy, setHoverEnemy] = useState<Coord | null>(null);

  const [log, setLog] = useState<Array<{ id: string; text: string }>>(() => [
    { id: "welcome", text: "Place your fleet. Click cells to place the selected ship." },
  ]);

  const [turn, setTurn] = useState<"player" | "enemy">("player");
  const [busy, setBusy] = useState(false);

  const playerPlacedTypeIds = useMemo(() => new Set(playerBoard.ships.map((s) => s.typeId)), [playerBoard.ships]);
  const allPlayerPlaced = useMemo(() => SHIP_TYPES.every((st) => playerPlacedTypeIds.has(st.id)), [playerPlacedTypeIds]);

  const cellSize = 34;

  function addLog(text: string) {
    setLog((l) => [{ id: `${Date.now()}-${Math.random()}`, text }, ...l].slice(0, 12));
  }

  function resetGame() {
    setPhase("placement");
    setOrientation("H");
    setPlayerBoard(makeEmptyBoard());
    setEnemyBoard(generateRandomFleet());
    setSelectedShipTypeId(SHIP_TYPES[0].id);
    setHover(null);
    setHoverEnemy(null);
    setTurn("player");
    setBusy(false);
    setLog([{ id: "welcome", text: "Place your fleet. Click cells to place the selected ship." }]);
  }

  function randomizePlayer() {
    setPlayerBoard(generateRandomFleet());
    addLog("Randomized your fleet.");
  }

  function startBattle() {
    if (!allPlayerPlaced) {
      addLog("Place all ships before starting.");
      return;
    }
    setPhase("battle");
    setTurn("player");
    addLog("Battle started. Attack the enemy grid (fog of war). Good hunting.");
  }

  function onPlaceAt(p: Coord) {
    if (phase !== "placement") return;
    const type = selectedShipType;
    if (playerPlacedTypeIds.has(type.id)) {
      addLog(`${type.name} already placed.`);
      return;
    }
    const cells = cellsForPlacement(p, orientation, type.size);
    if (!canPlace(playerBoard, cells)) {
      addLog("Invalid placement (overlap or out of bounds).");
      return;
    }
    setPlayerBoard((b) => placeShip(b, type, cells));
    addLog(`Placed ${type.name}.`);

    const next = SHIP_TYPES.find((st) => !playerPlacedTypeIds.has(st.id) && st.id !== type.id);
    if (next) setSelectedShipTypeId(next.id);
  }

  function onRemoveShip(shipId: string) {
    if (phase !== "placement") return;
    const ship = playerBoard.ships.find((s) => s.id === shipId);
    setPlayerBoard((b) => removeShip(b, shipId));
    if (ship) addLog(`Removed ${ship.name}.`);
  }

  async function playerAttack(p: Coord) {
    if (phase !== "battle") return;
    if (turn !== "player" || busy) return;
    if (enemyBoard.attacks[p.r][p.c].attacked) return;

    setBusy(true);
    const res = attackCell(enemyBoard, p, Date.now());
    setEnemyBoard(res.board);
    addLog(`You fired at ${fmtCoord(p)}: ${res.hit ? "HIT" : "miss"}.`);
    if (res.sunkShip) addLog(`Enemy ${res.sunkShip.name} sunk!`);

    if (allSunk(res.board)) {
      setPhase("gameover");
      addLog("You win. All enemy ships sunk.");
      setBusy(false);
      return;
    }

    // enemy turn
    setTurn("enemy");
    await new Promise((r) => setTimeout(r, res.hit ? 500 : 650));

    const shot = pickComputerShot(playerBoard);
    const res2 = attackCell(playerBoard, shot, Date.now());
    setPlayerBoard(res2.board);
    addLog(`Enemy fired at ${fmtCoord(shot)}: ${res2.hit ? "HIT" : "miss"}.`);
    if (res2.sunkShip) addLog(`Your ${res2.sunkShip.name} sunk!`);

    if (allSunk(res2.board)) {
      setPhase("gameover");
      addLog("Defeat. Your fleet has been sunk.");
      setBusy(false);
      return;
    }

    setTurn("player");
    setBusy(false);
  }

  // keyboard helpers
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "r" || e.key === "R") randomizePlayer();
      if (e.key === " ") {
        e.preventDefault();
        setOrientation((o) => (o === "H" ? "V" : "H"));
      }
      if (e.key === "Enter" && phase === "placement") startBattle();
      if (e.key === "Escape") setHover(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, playerBoard, enemyBoard]);

  const placementPreview = useMemo(() => {
    if (phase !== "placement" || !hover) return [] as Coord[];
    if (playerPlacedTypeIds.has(selectedShipType.id)) return [] as Coord[];
    return cellsForPlacement(hover, orientation, selectedShipType.size);
  }, [phase, hover, orientation, selectedShipType, playerPlacedTypeIds]);

  const placementOk = useMemo(() => {
    if (!placementPreview.length) return false;
    return canPlace(playerBoard, placementPreview);
  }, [placementPreview, playerBoard]);

  const playerSunkCells = useMemo(() => {
    const set = new Set<string>();
    for (const s of playerBoard.ships) if (s.hits >= s.size) for (const c of s.cells) set.add(coordKey(c));
    return set;
  }, [playerBoard.ships]);

  const enemySunkCells = useMemo(() => {
    const set = new Set<string>();
    for (const s of enemyBoard.ships) if (s.hits >= s.size) for (const c of s.cells) set.add(coordKey(c));
    return set;
  }, [enemyBoard.ships]);

  const playerSinkingCells = useMemo(() => {
    const set = new Set<string>();
    for (const s of playerBoard.ships) {
      if (s.sunkAt != null && now - s.sunkAt < 1100) for (const c of s.cells) set.add(coordKey(c));
    }
    return set;
  }, [playerBoard.ships, now]);

  const enemySinkingCells = useMemo(() => {
    const set = new Set<string>();
    for (const s of enemyBoard.ships) {
      if (s.sunkAt != null && now - s.sunkAt < 1100) for (const c of s.cells) set.add(coordKey(c));
    }
    return set;
  }, [enemyBoard.ships, now]);

  function BoardGrid({
    title,
    board,
    mode,
  }: {
    title: string;
    board: Board;
    mode: "player" | "enemy";
  }) {
    const size = board.size;

    const colLetters = useMemo(() => letters(size), [size]);

    function cellContent(r: number, c: number) {
      const atk = board.attacks[r][c];
      const hasShip = !!board.shipByCell[r][c];

      if (mode === "enemy") {
        // fog of war: only show markers for attacked cells
        if (!atk.attacked) return null;
        if (atk.hit) return <div className="h-2.5 w-2.5 rounded-full bg-rose-200 shadow-[0_0_0_3px_rgba(244,63,94,0.25)]" />;
        return <div className="h-2.5 w-2.5 rounded-full bg-slate-200" />;
      }

      // player board
      if (!atk.attacked && hasShip) return <div className="h-3 w-3 rounded-sm bg-slate-200/70" />;
      if (atk.attacked && atk.hit) return <div className="h-2.5 w-2.5 rounded-full bg-rose-200 shadow-[0_0_0_3px_rgba(244,63,94,0.25)]" />;
      if (atk.attacked && !atk.hit) return <div className="h-2.5 w-2.5 rounded-full bg-slate-300" />;
      return null;
    }

    function cellClass(r: number, c: number) {
      const atk = board.attacks[r][c];
      const shipId = board.shipByCell[r][c];
      const hasShip = !!shipId;

      const isPreview =
        mode === "player" &&
        phase === "placement" &&
        placementPreview.some((p) => p.r === r && p.c === c) &&
        !playerPlacedTypeIds.has(selectedShipType.id);

      const previewOk = isPreview && placementOk;
      const previewBad = isPreview && !placementOk;

      const isSunk = mode === "player" ? playerSunkCells.has(`${r},${c}`) : enemySunkCells.has(`${r},${c}`);
      const isSinking = mode === "player" ? playerSinkingCells.has(`${r},${c}`) : enemySinkingCells.has(`${r},${c}`);

      const base =
        "border-slate-700/20 bg-gradient-to-b from-slate-900/5 to-slate-900/0";
      const ownShip =
        mode === "player" && hasShip && phase !== "gameover" && !atk.attacked
          ? "bg-gradient-to-b from-slate-900/10 to-slate-900/5"
          : "";

      const attacked = atk.attacked ? "bg-slate-900/5" : "";

      const clickable =
        mode === "enemy" && phase === "battle" && turn === "player" && !busy && !atk.attacked
          ? "hover:border-sky-400/60 hover:bg-sky-500/10"
          : "";

      const sunk = isSunk ? "bg-rose-500/10 border-rose-500/30" : "";
      const sinking = isSinking ? "bs-sink" : "";

      const preview = previewOk
        ? "border-emerald-400/60 bg-emerald-500/10"
        : previewBad
          ? "border-rose-400/60 bg-rose-500/10"
          : "";

      return classNames(base, ownShip, attacked, clickable, sunk, sinking, preview);
    }

    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-100">{title}</div>
            <div className="text-xs text-slate-300">
              {mode === "enemy"
                ? phase === "battle"
                  ? "Fog of war: ships appear only when hit/sunk"
                  : "Enemy grid"
                : phase === "placement"
                  ? "Click to place; click a ship to remove"
                  : "Your fleet"}
            </div>
          </div>
          {mode === "enemy" && phase === "battle" ? (
            <div className={classNames(
              "text-xs rounded-full px-2 py-1 border",
              turn === "player" ? "border-sky-400/40 bg-sky-500/10 text-sky-200" : "border-amber-400/40 bg-amber-500/10 text-amber-200"
            )}>
              {turn === "player" ? (busy ? "Resolving…" : "Your turn") : "Enemy turn"}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-[28px_1fr] gap-2">
          <div />
          <div className="grid" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))`, gap: 6 }}>
            {colLetters.map((L) => (
              <div key={L} className="text-[10px] text-slate-400 text-center select-none">{L}</div>
            ))}
          </div>

          <div className="grid" style={{ gridTemplateRows: `repeat(${size}, minmax(0, 1fr))`, gap: 6 }}>
            {Array.from({ length: size }, (_, i) => (
              <div key={i} className="text-[10px] text-slate-400 text-center select-none leading-[34px]">{i + 1}</div>
            ))}
          </div>

          <div className="grid" style={{ gridTemplateColumns: `repeat(${size}, ${cellSize}px)`, gap: 6 }}>
            {Array.from({ length: size }, (_, r) =>
              Array.from({ length: size }, (_, c) => {
                const shipId = board.shipByCell[r][c];
                const cellAtk = board.attacks[r][c];
                const disabled =
                  mode === "enemy"
                    ? phase !== "battle" || turn !== "player" || busy || cellAtk.attacked
                    : phase !== "placement";

                const isHover = mode === "enemy" ? hoverEnemy?.r === r && hoverEnemy?.c === c : hover?.r === r && hover?.c === c;

                let title = "";
                if (mode === "enemy") {
                  title = cellAtk.attacked ? (cellAtk.hit ? "Hit" : "Miss") : "Unscouted";
                } else {
                  title = shipId ? "Ship" : "Water";
                }

                return (
                  <Cell
                    key={`${r}-${c}`}
                    sizePx={cellSize}
                    disabled={disabled}
                    title={title}
                    className={classNames(cellClass(r, c), isHover ? "ring-2 ring-sky-400/20" : "")}
                    onEnter={() => {
                      if (mode === "enemy") setHoverEnemy({ r, c });
                      else setHover({ r, c });
                    }}
                    onLeave={() => {
                      if (mode === "enemy") setHoverEnemy(null);
                      else setHover(null);
                    }}
                    onClick={() => {
                      if (mode === "enemy") {
                        playerAttack({ r, c });
                      } else {
                        // placement grid: place or remove
                        if (phase !== "placement") return;
                        if (shipId) onRemoveShip(shipId);
                        else onPlaceAt({ r, c });
                      }
                    }}
                  >
                    {cellContent(r, c)}
                  </Cell>
                );
              })
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(1200px_600px_at_20%_10%,rgba(56,189,248,0.18),transparent),radial-gradient(900px_500px_at_80%_20%,rgba(244,63,94,0.14),transparent),linear-gradient(to_bottom,rgba(2,6,23,1),rgba(15,23,42,1))] text-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Battleship</h1>
            <p className="text-sm text-slate-300">
              Placement → Fog-of-war battle. Space toggles orientation. R randomizes. Enter starts.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
              onClick={() => setOrientation((o) => (o === "H" ? "V" : "H"))}
            >
              Orientation: <span className="font-semibold">{orientation === "H" ? "Horizontal" : "Vertical"}</span>
            </button>

            {phase === "placement" ? (
              <>
                <button
                  type="button"
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                  onClick={randomizePlayer}
                >
                  Randomize (R)
                </button>
                <button
                  type="button"
                  className={classNames(
                    "rounded-lg px-3 py-2 text-sm border",
                    allPlayerPlaced
                      ? "border-sky-400/40 bg-sky-500/15 hover:bg-sky-500/20"
                      : "border-white/10 bg-white/5 opacity-70"
                  )}
                  onClick={startBattle}
                >
                  Start Battle (Enter)
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
                onClick={resetGame}
              >
                New Game
              </button>
            )}
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.7)]">
              <BoardGrid title="Your Waters" board={playerBoard} mode="player" />
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.7)]">
              <BoardGrid title="Enemy Waters" board={enemyBoard} mode="enemy" />
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Fleet</div>
                  <div className="text-xs text-slate-300">
                    {phase === "placement" ? "Select a ship, then click to place." : "Status overview"}
                  </div>
                </div>
                <div className="text-xs text-slate-300">
                  {phase === "placement" ? `${playerBoard.ships.length}/${SHIP_TYPES.length} placed` : ""}
                </div>
              </div>

              <div className="mt-3 grid gap-2">
                {SHIP_TYPES.map((st) => {
                  const placed = playerPlacedTypeIds.has(st.id);
                  const playerShip = playerBoard.ships.find((s) => s.typeId === st.id);
                  const hp = playerShip ? `${playerShip.hits}/${playerShip.size}` : `0/${st.size}`;

                  return (
                    <button
                      key={st.id}
                      type="button"
                      disabled={phase !== "placement"}
                      onClick={() => setSelectedShipTypeId(st.id)}
                      className={classNames(
                        "w-full rounded-xl border px-3 py-2 text-left transition",
                        selectedShipTypeId === st.id && phase === "placement"
                          ? "border-sky-400/40 bg-sky-500/10"
                          : "border-white/10 bg-white/0 hover:bg-white/5",
                        placed ? "opacity-70" : ""
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-sm font-medium">
                          {st.name} <span className="text-xs text-slate-300">({st.size})</span>
                        </div>
                        <div className="text-xs text-slate-300">
                          {phase === "placement" ? (placed ? "placed" : "unplaced") : hp}
                        </div>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                        <div
                          className={classNames(
                            "h-full rounded-full transition-all",
                            phase === "placement"
                              ? placed
                                ? "w-full bg-slate-200/40"
                                : "w-0 bg-slate-200/40"
                              : "bg-rose-300/70"
                          )}
                          style={
                            phase === "placement"
                              ? undefined
                              : { width: `${Math.max(0, Math.min(100, ((playerShip?.hits ?? 0) / st.size) * 100))}%` }
                          }
                        />
                      </div>
                    </button>
                  );
                })}
              </div>

              {phase === "placement" ? (
                <div className="mt-3 text-xs text-slate-300">
                  Preview shows where the selected ship will land. Green = valid, red = invalid.
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Combat Log</div>
                  <div className="text-xs text-slate-300">Hit/miss markers appear on attacked cells.</div>
                </div>
                {phase === "gameover" ? (
                  <div className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                    Game Over
                  </div>
                ) : null}
              </div>
              <div className="mt-3 space-y-2">
                {log.map((l) => (
                  <div key={l.id} className="rounded-lg border border-white/10 bg-black/10 px-3 py-2 text-xs text-slate-200">
                    {l.text}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-sm font-semibold">Legend</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-300">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-sm bg-slate-200/70" /> <span>Your ship</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-slate-300" /> <span>Miss</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-rose-200 shadow-[0_0_0_3px_rgba(244,63,94,0.25)]" /> <span>Hit</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-md border border-rose-500/30 bg-rose-500/10" /> <span>Sunk (animates)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center text-xs text-slate-400">
          Tip: During placement, click a placed ship cell to remove that ship.
        </div>
      </div>
    </div>
  );
}
