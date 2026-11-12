"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  Clock,
  Crown,
  Flame,
  Info,
  Landmark,
  Lock,
  LogOut,
  Pencil,
  Shield,
  ShoppingBag,
  Sparkles,
  ThumbsUp,
  TrendingDown,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { QuestionConstructor } from "@/components/QuestionConstructor";
import {
  BLACK_MARKET_ITEMS,
  getLotById,
  getLotsForRound,
  ROULETTE_SECTORS,
  ROUND_METADATA,
  TEAM_ORDER,
} from "@/data/question-bank";
import { useCountdown } from "@/hooks/useCountdown";
import { useGameRoom } from "@/hooks/useGameRoom";
import { useRoomId } from "@/hooks/useRoomId";
import {
  formatDelta,
  formatMoney,
  getLeaderboard,
  getRiskTierMeta,
} from "@/lib/formatters";
import { getNetWorth } from "@/lib/game-engine";
import { BlackMarketItemId, TeamId, TopicCode } from "@/types/game";

const TOPIC_SHORT_LABELS: Record<TopicCode, string> = {
  "3.9.1": "Значення і завдання",
  "3.9.2": "Види фінпланування",
  "3.9.3": "Баланс доходів/витрат",
  "3.9.4": "Методи планування",
};

const STORAGE_PLAYER_ID = "fin-storm-player-id";
const STORAGE_PLAYER_NAME = "fin-storm-player-name";
const STORAGE_TEAM_ID = "fin-storm-team-id";

function getOrCreatePlayerId(): string {
  if (typeof window === "undefined") return "temp";
  let id = localStorage.getItem(STORAGE_PLAYER_ID);
  if (!id) {
    id = `p-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
    localStorage.setItem(STORAGE_PLAYER_ID, id);
  }
  return id;
}

export default function PlayPage() {
  const roomId = useRoomId();
  const { state, connected, busy, error, clockOffsetMs, dispatch } =
    useGameRoom(roomId);
  const { totalSeconds, isPaused } = useCountdown(
    state?.spotlight ?? null,
    clockOffsetMs
  );

  const [playerId, setPlayerId] = useState<string>("");
  const [nameInput, setNameInput] = useState<string>("");
  const [selectedTeamId, setSelectedTeamId] = useState<TeamId>("team-1");
  const [wantCaptain, setWantCaptain] = useState<boolean>(true);
  const [betAmount, setBetAmount] = useState<500 | 1000>(500);
  const [editingTeamName, setEditingTeamName] = useState<boolean>(false);
  const [teamNameDraft, setTeamNameDraft] = useState<string>("");
  const wasInRoomRef = useRef<boolean>(false);
  const autoRejoinRoomRef = useRef<string | null>(null);

  useEffect(() => {
    wasInRoomRef.current = false;
    autoRejoinRoomRef.current = null;
  }, [roomId]);

  useEffect(() => {
    const id = getOrCreatePlayerId();
    setPlayerId(id);
    const savedName = localStorage.getItem(STORAGE_PLAYER_NAME);
    const savedTeam = localStorage.getItem(STORAGE_TEAM_ID) as TeamId | null;
    const savedCap = localStorage.getItem("fin-storm-want-captain");
    if (savedName) setNameInput(savedName);
    if (savedTeam && TEAM_ORDER.includes(savedTeam)) setSelectedTeamId(savedTeam);
    if (savedCap !== null) setWantCaptain(savedCap === "1");
  }, []);

  const currentPlayer =
    state && playerId ? state.players[playerId] ?? null : null;

  useEffect(() => {
    if (!state || !playerId) return;

    if (currentPlayer) {
      wasInRoomRef.current = true;
      return;
    }

    // Player was previously in the room and disappeared (RESET_GAME or kicked)
    if (wasInRoomRef.current) {
      wasInRoomRef.current = false;
      localStorage.setItem("fin-storm-joined", "0");
      return;
    }

    if (autoRejoinRoomRef.current === roomId) return;

    const savedName = localStorage.getItem(STORAGE_PLAYER_NAME);
    const savedTeam = localStorage.getItem(STORAGE_TEAM_ID) as TeamId | null;
    const savedCap = localStorage.getItem("fin-storm-want-captain");
    if (savedName && savedTeam && TEAM_ORDER.includes(savedTeam)) {
      const wasActive = localStorage.getItem("fin-storm-joined") === "1";
      if (wasActive) {
        autoRejoinRoomRef.current = roomId;
        dispatch({
          type: "JOIN_PLAYER",
          playerId,
          name: savedName,
          teamId: savedTeam,
          wantCaptain: savedCap !== "0",
        });
      }
    }
  }, [state, playerId, currentPlayer, roomId, dispatch]);

  const leaderboard = useMemo(
    () => (state ? getLeaderboard(state) : []),
    [state]
  );

  if (!state) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-base font-medium text-[#5E4636]">
        Підключення до біржі…
      </div>
    );
  }

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim() || !playerId) return;
    localStorage.setItem(STORAGE_PLAYER_NAME, nameInput.trim());
    localStorage.setItem(STORAGE_TEAM_ID, selectedTeamId);
    localStorage.setItem("fin-storm-want-captain", wantCaptain ? "1" : "0");
    localStorage.setItem("fin-storm-joined", "1");
    await dispatch({
      type: "JOIN_PLAYER",
      playerId,
      name: nameInput.trim(),
      teamId: selectedTeamId,
      wantCaptain,
    });
  };

  const handleLeaveLocal = async () => {
    localStorage.removeItem("fin-storm-joined");
    if (playerId) {
      await dispatch({ type: "LEAVE_PLAYER", playerId });
    }
  };

  // JOIN SCREEN
  if (!currentPlayer) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
        <div className="surface-card rounded-3xl p-6">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-300 bg-orange-100 px-3 py-1 text-xs font-bold text-orange-900">
            <TrendingUp className="h-3.5 w-3.5" /> Вхід учасника
          </div>
          <h1 className="font-display mb-1.5 text-2xl font-bold text-[#231710]">
            ФІНАНСОВИЙ ШТОРМ
          </h1>
          <p className="mb-5 text-sm leading-relaxed text-[#5E4636]">
            Вкажіть ваше ім&apos;я та оберіть команду. Перший учасник стає
            Капітаном, решта — Аналітиками.
          </p>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label
                htmlFor="player-name"
                className="mb-1.5 block text-xs font-bold text-[#231710]"
              >
                Ваше ім&apos;я або нік
              </label>
              <input
                id="player-name"
                name="playerName"
                type="text"
                autoComplete="name"
                required
                maxLength={28}
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="Олена Коваль"
                className="min-h-[46px] w-full rounded-xl border border-orange-300 bg-white px-3.5 py-2.5 text-base text-[#231710] placeholder:text-[#826754]"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-bold text-[#231710]">
                Оберіть команду
              </span>
              <div className="space-y-2">
                {TEAM_ORDER.map((tid) => {
                  const team = state.teams[tid];
                  const members = Object.values(state.players).filter(
                    (p) => p.teamId === tid
                  );
                  const captain = members.find((m) => m.role === "captain");
                  const active = selectedTeamId === tid;
                  return (
                    <button
                      key={tid}
                      type="button"
                      onClick={() => setSelectedTeamId(tid)}
                      className={`btn-press flex min-h-[54px] w-full items-center justify-between rounded-2xl border px-3.5 py-2.5 text-left ${
                        active
                          ? "border-orange-600 bg-orange-50 shadow-[0_0_0_2px_rgba(194,65,12,0.2)]"
                          : "border-orange-200 bg-white hover:border-orange-400"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-full"
                          style={{ backgroundColor: team.color }}
                        />
                        <div>
                          <div className="text-sm font-bold text-[#231710]">
                            {team.name}
                          </div>
                          <div className="text-xs text-[#5E4636]">
                            {captain
                              ? `Капітан: ${captain.name}`
                              : "Місце Капітана вільне"}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono-num rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-900">
                        {members.length}/5
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-orange-200 bg-orange-50/70 px-3.5 py-2.5 text-xs font-medium text-[#231710]">
              <input
                type="checkbox"
                checked={wantCaptain}
                onChange={(e) => setWantCaptain(e.target.checked)}
                className="h-4 w-4 accent-orange-700"
              />
              Стати Капітаном команди (якщо місце вільне)
            </label>

            <button
              type="submit"
              disabled={busy}
              className="btn-press min-h-[48px] w-full rounded-2xl bg-orange-700 px-4 py-3 text-sm font-extrabold text-white shadow-md shadow-orange-900/15 hover:bg-orange-800 disabled:opacity-40"
            >
              Приєднатися до торгів
            </button>
          </form>
        </div>
      </main>
    );
  }

  const myTeam = state.teams[currentPlayer.teamId];
  const isCaptain = currentPlayer.role === "captain";
  const myTeamPlayers = Object.values(state.players).filter(
    (p) => p.teamId === myTeam.id
  );
  const myRank = Math.max(
    1,
    leaderboard.findIndex((t) => t.id === myTeam.id) + 1
  );
  const roundMeta = ROUND_METADATA[state.round];
  const roundLots = getLotsForRound(state.round);
  const activeDraftTeamId = state.draftQueue[state.draftPointer];
  const isMyDraftTurn =
    state.phase === "marketplace" && activeDraftTeamId === myTeam.id;

  const spotlightLot = state.spotlight
    ? getLotById(state.spotlight.lotId)
    : undefined;
  const activeRouletteSector = state.roulette.targetSectorId
    ? ROULETTE_SECTORS.find((s) => s.id === state.roulette.targetSectorId)
    : null;
  const isBuyerTeam =
    state.spotlight !== null && state.spotlight.buyerTeamId === myTeam.id;

  const myTeamLotRecCounts: Record<string, number> = {};
  for (const [pid, lid] of Object.entries(state.lotRecommendations)) {
    const p = state.players[pid];
    if (p && p.teamId === myTeam.id) {
      myTeamLotRecCounts[lid] = (myTeamLotRecCounts[lid] ?? 0) + 1;
    }
  }

  // Plain-language guidance banner text
  let guideText = "Слідкуйте за екраном проєктора.";
  if (state.phase === "lobby") {
    guideText = "Очікуйте, поки викладач відкриє Раунд 1.";
  } else if (state.phase === "marketplace") {
    guideText = isMyDraftTurn
      ? isCaptain
        ? "Ваш хід! Натисніть «Купити лот» на активі, який обере команда."
        : "Ваш хід! Натисніть «Раджу» біля найкращого лота для Капітана."
      : `Зараз обирає команда ${
          activeDraftTeamId ? state.teams[activeDraftTeamId].shortName : "…"
        }. Ознайомтесь із лотами нижче.`;
  } else if (state.phase === "spotlight" && spotlightLot) {
    if (isBuyerTeam) {
      guideText = isCaptain
        ? "Оберіть варіант, зберіть голоси аналітиків і підтвердьте відповідь."
        : "Натисніть свій варіант відповіді — Капітан побачить ваш голос.";
    } else if (
      spotlightLot.riskTier === "derivative" ||
      state.shortSqueezeEventActive
    ) {
      guideText =
        "Можна зробити ставку LONG (на успіх) або SHORT (на помилку команди)!";
    } else {
      guideText = `Відповідає команда ${
        state.spotlight ? state.teams[state.spotlight.buyerTeamId].shortName : ""
      }. Слухайте розбір на проєкторі.`;
    }
  } else if (state.phase === "review") {
    guideText =
      "Команда відповідає усно ведучому. Очікуйте на вердикт викладача.";
  } else if (state.phase === "roulette") {
    guideText =
      activeRouletteSector && state.roulette.applied
        ? `Випало: ${activeRouletteSector.label}!`
        : "Крутиться Фінансова рулетка — дивіться на проєктор!";
  } else if (state.phase === "reveal") {
    guideText = "Перевірте розрахунок виплат та пояснення викладача.";
  } else if (state.phase === "black_market") {
    guideText = isCaptain
      ? "Ви можете купити 1 спецзасіб для наступних раундів."
      : "Порадьте Капітану, чи варто купити спецзасіб.";
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col pb-10">
      {/* STICKY TOP WALLET HEADER */}
      <header className="sticky top-0 z-30 border-b border-orange-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="h-3.5 w-3.5 shrink-0 rounded-full"
              style={{ backgroundColor: myTeam.color }}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-extrabold text-[#231710]">
                  {myTeam.name}
                </span>
                <span className="rounded-md border border-orange-200 bg-orange-100 px-1.5 py-0.5 font-mono-num text-[11px] font-bold text-orange-900">
                  #{myRank}
                </span>
              </div>
              <div className="text-xs font-medium text-[#5E4636]">
                {isCaptain ? "👑 Капітан" : "📊 Аналітик"} ·{" "}
                {currentPlayer.name}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="font-mono-num text-base font-extrabold text-emerald-700">
                {formatMoney(myTeam.balance)}
              </div>
              {myTeam.debt > 0 && (
                <div className="font-mono-num text-[11px] font-bold text-rose-700">
                  Борг: -{formatMoney(myTeam.debt)}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleLeaveLocal}
              title="Вийти з команди"
              aria-label="Вийти з команди та змінити гравця"
              className="btn-press flex h-10 w-10 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-[#5E4636] hover:bg-orange-100 disabled:opacity-40"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 text-[#5E4636]">
            <span
              className={`h-2 w-2 rounded-full ${
                connected ? "bg-emerald-600" : "bg-rose-600"
              }`}
            />
            <span>{roundMeta.title}</span>
          </div>
          {myTeam.debt > 0 && isCaptain && myTeam.balance >= myTeam.debt + 500 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => dispatch({ type: "REPAY_DEBT", teamId: myTeam.id })}
              className="btn-press inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-800"
            >
              <Landmark className="h-3.5 w-3.5" /> Погасити борг (
              {formatMoney(myTeam.debt)})
            </button>
          )}
        </div>

        {myTeam.inventory.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {myTeam.inventory.map((itemId, i) => {
              const def = BLACK_MARKET_ITEMS.find((b) => b.id === itemId);
              return (
                <span
                  key={`${itemId}-${i}`}
                  className="rounded-md border border-violet-300 bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-800"
                >
                  🛒 {def?.name ?? itemId}
                </span>
              );
            })}
          </div>
        )}
      </header>

      <main className="flex-1 space-y-4 px-4 pt-4">
        {/* Clear Step Guidance Box */}
        <div
          role="status"
          className="flex items-start gap-2.5 rounded-2xl border border-orange-300 bg-orange-100/80 px-4 py-3 text-xs font-semibold leading-relaxed text-orange-950"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-orange-700" />
          <span>{guideText}</span>
        </div>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-2xl border border-rose-300 bg-rose-50 p-3.5 text-xs font-semibold text-rose-800"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* PHASE: LOBBY */}
        {state.phase === "lobby" && (
          <section className="surface-card space-y-3 rounded-3xl p-5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-orange-800">
                <Users className="h-5 w-5" />
                <h2 className="font-display text-base font-bold text-[#231710]">
                  Склад команди ({myTeamPlayers.length}/5)
                </h2>
              </div>
              {isCaptain && !editingTeamName && (
                <button
                  onClick={() => {
                    setTeamNameDraft(myTeam.name);
                    setEditingTeamName(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-xl border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-bold text-orange-900 hover:bg-orange-100"
                >
                  <Pencil className="h-3 w-3" />
                  Назва команди
                </button>
              )}
            </div>

            {isCaptain && editingTeamName && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const clean = teamNameDraft.trim();
                  if (!clean) return;
                  await dispatch({
                    type: "RENAME_TEAM",
                    teamId: myTeam.id,
                    name: clean,
                  });
                  setEditingTeamName(false);
                }}
                className="flex items-center gap-2 rounded-2xl border border-orange-200 bg-[#FFFBF7] p-2"
              >
                <input
                  type="text"
                  maxLength={28}
                  value={teamNameDraft}
                  onChange={(e) => setTeamNameDraft(e.target.value)}
                  placeholder="Введіть назву команди…"
                  className="min-w-0 flex-1 rounded-xl border border-orange-200 bg-white px-3 py-1.5 text-sm font-semibold text-[#231710] outline-none focus:border-orange-500"
                />
                <button
                  type="submit"
                  disabled={busy || !teamNameDraft.trim()}
                  className="inline-flex shrink-0 items-center gap-1 rounded-xl bg-orange-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-500 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  Зберегти
                </button>
              </form>
            )}

            <div className="space-y-2">
              {myTeamPlayers.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-xl border border-orange-100 bg-[#FFFBF7] px-3.5 py-2.5 text-sm"
                >
                  <span className="font-bold text-[#231710]">{p.name}</span>
                  <span
                    className={`text-xs font-bold ${
                      p.role === "captain"
                        ? "text-orange-800"
                        : "text-[#5E4636]"
                    }`}
                  >
                    {p.role === "captain" ? "👑 Капітан" : "Аналітик"}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* PHASE: MARKETPLACE */}
        {state.phase === "marketplace" && (
          <section className="space-y-3">
            {myTeam.debt > 0 && (
              <div className="rounded-2xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-semibold text-rose-800">
                Команда під санацією НБУ: Деривативи та Токсичні активи
                недоступні до погашення боргу.
              </div>
            )}

            {isCaptain &&
              isMyDraftTurn &&
              !roundLots.some((lot) => {
                const sold = state.purchasedLotIds.includes(lot.id);
                const blocked =
                  myTeam.debt > 0 &&
                  (lot.riskTier === "derivative" || lot.riskTier === "toxic");
                return !sold && !blocked && myTeam.balance >= lot.price;
              }) && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900">
                  У команди не вистачає коштів на доступні лоти. Попросіть
                  викладача натиснути «Пропустити хід команди».
                </div>
              )}

            <div className="space-y-3">
              {roundLots.map((lot) => {
                const isSold = state.purchasedLotIds.includes(lot.id);
                const tier = getRiskTierMeta(lot.riskTier);
                const blockedBySanation =
                  myTeam.debt > 0 &&
                  (lot.riskTier === "derivative" || lot.riskTier === "toxic");
                const cannotAfford = myTeam.balance < lot.price;
                const recCount = myTeamLotRecCounts[lot.id] ?? 0;
                const myRec =
                  state.lotRecommendations[currentPlayer.id] === lot.id;

                return (
                  <div
                    key={lot.id}
                    className={`surface-card rounded-2xl p-4 ${
                      isSold ? "opacity-50" : ""
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span
                        className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-bold ${tier.badgeClass}`}
                      >
                        {tier.label}
                      </span>
                      <span className="font-mono-num text-xs font-bold text-[#826754]">
                        [{lot.ticker}]
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-[#231710]">
                      {lot.title}
                    </h3>
                    {lot.isMystery && (
                      <p className="mt-1 text-xs font-medium text-violet-800">
                        Секретний лот: тема відкриється лише після купівлі
                      </p>
                    )}
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="font-mono-num font-extrabold text-orange-800">
                        Ціна: {formatMoney(lot.price)}
                      </span>
                      <span className="font-mono-num font-extrabold text-emerald-700">
                        Профіт: +
                        {formatMoney(lot.reward * state.roundLeverageMultiplier)}
                      </span>
                    </div>

                    {!isSold ? (
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-orange-100 pt-3">
                        <button
                          type="button"
                          onClick={() =>
                            dispatch({
                              type: "RECOMMEND_LOT",
                              playerId: currentPlayer.id,
                              lotId: lot.id,
                            })
                          }
                          className={`btn-press inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-bold ${
                            myRec
                              ? "border-orange-600 bg-orange-100 text-orange-900"
                              : "border-orange-200 bg-white text-[#5E4636] hover:bg-orange-50"
                          }`}
                        >
                          <ThumbsUp className="h-3.5 w-3.5" />
                          Раджу {recCount > 0 ? `(${recCount})` : ""}
                        </button>

                        {isCaptain && isMyDraftTurn && (
                          <button
                            type="button"
                            disabled={busy || blockedBySanation || cannotAfford}
                            onClick={() =>
                              dispatch({
                                type: "BUY_LOT",
                                teamId: myTeam.id,
                                lotId: lot.id,
                              })
                            }
                            className="btn-press min-h-[40px] rounded-xl bg-orange-700 px-4 py-1.5 text-xs font-extrabold text-white shadow-sm hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {blockedBySanation
                              ? "Санація"
                              : cannotAfford
                              ? "Мало коштів"
                              : "Купити лот"}
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[#826754]">
                        <Lock className="h-3.5 w-3.5" /> Лот уже викуплено
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* PHASE: SPOTLIGHT */}
        {state.phase === "spotlight" && spotlightLot && state.spotlight && (
          <section className="space-y-4">
            <div className="surface-card flex items-center justify-between rounded-2xl px-4 py-3">
              <div>
                <div className="text-xs font-semibold text-[#826754]">
                  [{spotlightLot.ticker}] Відповідає:
                </div>
                <div className="text-sm font-extrabold text-[#231710]">
                  {state.teams[state.spotlight.buyerTeamId].name}
                </div>
              </div>
              <div
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 font-mono-num text-lg font-extrabold ${
                  totalSeconds <= 10
                    ? "animate-pulse border-rose-300 bg-rose-50 text-rose-800"
                    : "border-orange-300 bg-orange-100 text-orange-900"
                }`}
              >
                <Clock className="h-4 w-4" />
                {isPaused ? "ПАУЗА" : `${totalSeconds}с`}
              </div>
            </div>

            <div className="surface-card rounded-2xl p-4">
              <div className="mb-1 text-xs font-bold text-orange-800">
                {spotlightLot.title}
              </div>
              <p className="text-base font-bold leading-relaxed text-[#231710]">
                {spotlightLot.prompt}
              </p>
            </div>

            {isBuyerTeam ? (
              <>
                {isCaptain && myTeam.inventory.length > 0 && (
                  <div className="rounded-2xl border border-violet-300 bg-violet-50 p-3.5">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-violet-900">
                      <Sparkles className="h-4 w-4" /> Спецзасоби Чорного ринку:
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(
                        Array.from(new Set(myTeam.inventory)) as BlackMarketItemId[]
                      ).map((itemId) => {
                        const def = BLACK_MARKET_ITEMS.find(
                          (b) => b.id === itemId
                        );
                        const alreadyUsed =
                          state.spotlight?.activePowerUps.includes(itemId);
                        const canBetOnLot =
                          spotlightLot.riskTier === "derivative" ||
                          state.shortSqueezeEventActive;
                        const unusableHere =
                          itemId === "short_veto" && !canBetOnLot;
                        return (
                          <button
                            key={itemId}
                            type="button"
                            disabled={busy || alreadyUsed || unusableHere}
                            onClick={() =>
                              dispatch({
                                type: "USE_POWERUP",
                                teamId: myTeam.id,
                                itemId,
                              })
                            }
                            className="btn-press min-h-[38px] rounded-xl border border-violet-300 bg-white px-3 py-1.5 text-xs font-bold text-violet-900 disabled:opacity-45"
                          >
                            {alreadyUsed
                              ? `✓ ${def?.name}`
                              : unusableHere
                              ? `${def?.name} (немає ставок)`
                              : `Активувати: ${def?.name}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <QuestionConstructor
                  lot={spotlightLot}
                  spotlight={state.spotlight}
                  player={currentPlayer}
                  teamPlayers={myTeamPlayers}
                  busy={busy}
                  onVote={(ans) =>
                    dispatch({
                      type: "VOTE_ANSWER",
                      playerId: currentPlayer.id,
                      answer: ans,
                    })
                  }
                  onSubmit={(ans) =>
                    dispatch({
                      type: "SUBMIT_ANSWER",
                      teamId: myTeam.id,
                      answer: ans,
                    })
                  }
                />
              </>
            ) : (
              <div className="surface-card space-y-3 rounded-2xl p-4">
                {spotlightLot.riskTier === "derivative" ||
                state.shortSqueezeEventActive ? (
                  <>
                    <div className="flex items-center gap-2 text-sm font-extrabold text-orange-900">
                      <Flame className="h-4 w-4 text-rose-700" /> Біржа ставок
                      (Long / Short)
                    </div>
                    <p className="text-xs leading-relaxed text-[#5E4636]">
                      Ставте на результат команди{" "}
                      <strong>
                        {state.teams[state.spotlight.buyerTeamId].shortName}
                      </strong>
                      : <strong>LONG (+80%)</strong> — відповідь правильна,{" "}
                      {state.shortSqueezeEventActive ? (
                        <strong className="text-rose-800">
                          SHORT (+150% при помилці / штраф -150% при Сквізі!)
                        </strong>
                      ) : (
                        <strong>SHORT (+100%)</strong>
                      )}
                      {!state.shortSqueezeEventActive && " — помилка."}
                    </p>

                    {state.spotlight.bets[myTeam.id] ? (
                      <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs font-bold text-emerald-900">
                        <UserCheck className="mr-1.5 inline h-4 w-4" />
                        Ставку зафіксовано:{" "}
                        {state.spotlight.bets[myTeam.id].side.toUpperCase()} на{" "}
                        {formatMoney(state.spotlight.bets[myTeam.id].amount)}
                      </div>
                    ) : (
                      <>
                        {state.spotlight.activePowerUps.includes(
                          "short_veto"
                        ) && (
                          <div className="rounded-xl border border-violet-300 bg-violet-50 p-2.5 text-xs font-semibold text-violet-900">
                            Власник активу застосував «Вето на шорти» — доступні
                            лише Long-ставки.
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          {[500, 1000].map((amt) => (
                            <button
                              key={amt}
                              type="button"
                              onClick={() => setBetAmount(amt as 500 | 1000)}
                              className={`btn-press min-h-[44px] rounded-xl border py-2 font-mono-num text-xs font-extrabold ${
                                betAmount === amt
                                  ? "border-orange-700 bg-orange-700 text-white"
                                  : "border-orange-200 bg-orange-50 text-[#231710]"
                              }`}
                            >
                              {formatMoney(amt)}
                            </button>
                          ))}
                        </div>
                        {(() => {
                          const teamBetVotes = Object.entries(
                            state.spotlight.betVotes
                          ).filter(
                            ([pid]) => state.players[pid]?.teamId === myTeam.id
                          );
                          const longVotes = teamBetVotes.filter(
                            ([, v]) => v.side === "long"
                          ).length;
                          const shortVotes = teamBetVotes.filter(
                            ([, v]) => v.side === "short"
                          ).length;
                          if (teamBetVotes.length === 0) return null;
                          return (
                            <div className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-[#5E4636]">
                              Голоси команди: LONG ({longVotes}) · SHORT (
                              {shortVotes})
                            </div>
                          );
                        })()}
                        {(() => {
                          const myBetVote =
                            state.spotlight.betVotes[currentPlayer.id];
                          return (
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                disabled={busy || myTeam.balance < betAmount}
                                onClick={() =>
                                  isCaptain
                                    ? dispatch({
                                        type: "PLACE_BET",
                                        teamId: myTeam.id,
                                        side: "long",
                                        amount: betAmount,
                                      })
                                    : dispatch({
                                        type: "VOTE_BET",
                                        playerId: currentPlayer.id,
                                        side: "long",
                                        amount: betAmount,
                                      })
                                }
                                className={`btn-press flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border py-3 text-xs font-extrabold disabled:opacity-40 ${
                                  !isCaptain && myBetVote?.side === "long"
                                    ? "border-emerald-700 bg-emerald-700 text-white shadow-sm"
                                    : "border-emerald-400 bg-emerald-50 text-emerald-900"
                                }`}
                              >
                                <TrendingUp className="h-4 w-4" />
                                {isCaptain
                                  ? "LONG (Успіх)"
                                  : myBetVote?.side === "long"
                                  ? "✓ Раджу LONG"
                                  : "Раджу LONG"}
                              </button>

                              <button
                                type="button"
                                disabled={
                                  busy ||
                                  myTeam.balance < betAmount ||
                                  state.spotlight.activePowerUps.includes(
                                    "short_veto"
                                  )
                                }
                                onClick={() =>
                                  isCaptain
                                    ? dispatch({
                                        type: "PLACE_BET",
                                        teamId: myTeam.id,
                                        side: "short",
                                        amount: betAmount,
                                      })
                                    : dispatch({
                                        type: "VOTE_BET",
                                        playerId: currentPlayer.id,
                                        side: "short",
                                        amount: betAmount,
                                      })
                                }
                                className={`btn-press flex min-h-[48px] items-center justify-center gap-1.5 rounded-xl border py-3 text-xs font-extrabold disabled:opacity-40 ${
                                  !isCaptain && myBetVote?.side === "short"
                                    ? "border-rose-700 bg-rose-700 text-white shadow-sm"
                                    : "border-rose-400 bg-rose-50 text-rose-900"
                                }`}
                              >
                                <TrendingDown className="h-4 w-4" />
                                {isCaptain
                                  ? "SHORT (Дефолт)"
                                  : myBetVote?.side === "short"
                                  ? "✓ Раджу SHORT"
                                  : "Раджу SHORT"}
                              </button>
                            </div>
                          );
                        })()}
                      </>
                    )}
                  </>
                ) : (
                  <div className="py-2 text-center text-xs font-medium text-[#5E4636]">
                    Зараз відповідає команда{" "}
                    <strong className="text-[#231710]">
                      {state.teams[state.spotlight.buyerTeamId].name}
                    </strong>
                    . Дивіться питання на проєкторі.
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* PHASE: REVIEW (ORAL ANSWER AWAITING HOST VERDICT) */}
        {state.phase === "review" && state.spotlight && spotlightLot && (
          <section className="surface-card space-y-3 rounded-3xl p-5">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-orange-300 bg-orange-100 px-3 py-1 text-xs font-bold text-orange-950">
              <Clock className="h-3.5 w-3.5" /> На оцінюванні у ведучого
            </div>
            <h2 className="text-base font-extrabold text-[#231710]">
              [{spotlightLot.ticker}] {spotlightLot.title}
            </h2>
            <div className="rounded-2xl border border-orange-200 bg-[#FFFBF7] p-4">
              <div className="mb-1 text-xs font-bold text-[#826754]">
                Усна відповідь команди{" "}
                {state.teams[state.spotlight.buyerTeamId].shortName}:
              </div>
              <p className="text-sm font-medium leading-relaxed text-[#231710]">
                🎤 Команда озвучує аргументовану відповідь наживо — ведучий
                визначає, чи зарахувати лот.
              </p>
            </div>
          </section>
        )}

        {/* PHASE: REVEAL */}
        {state.phase === "reveal" && state.spotlight && spotlightLot && (
          <section className="surface-card space-y-3 rounded-3xl p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div
                className={`text-lg font-extrabold ${
                  state.spotlight.isCorrect
                    ? "text-emerald-800"
                    : state.spotlight.isPartialCredit
                    ? "text-amber-800"
                    : "text-rose-800"
                }`}
              >
                {state.spotlight.isCorrect
                  ? "Угода успішна"
                  : state.spotlight.isPartialCredit
                  ? `Частковий залік (${state.spotlight.scoreCorrect ?? 0}/${
                      state.spotlight.scoreTotal ?? 0
                    })`
                  : state.spotlight.isTimedOut
                  ? "Час вийшов — дефолт"
                  : "Дефолт по угоді"}
              </div>
              {state.spotlight.shortSqueezeTriggered && (
                <span className="rounded-full border border-rose-300 bg-rose-50 px-2.5 py-0.5 text-[11px] font-bold text-rose-800">
                  📉 Спрацював Шорт-сквіз
                </span>
              )}
            </div>
            <div className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3.5 text-xs">
              <div className="mb-1 font-extrabold text-emerald-900">
                Правильно: {spotlightLot.correctSummary}
              </div>
              <p className="leading-relaxed text-[#231710]">
                {spotlightLot.teacherExplanation}
              </p>
            </div>
            <div className="space-y-1.5">
              {state.spotlight.settlements.map((s) => (
                <div
                  key={s.teamId}
                  className="rounded-xl border border-orange-100 bg-[#FFFBF7] px-3.5 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#231710]">
                      {state.teams[s.teamId].name}
                    </span>
                    <span
                      className={`font-mono-num font-extrabold ${
                        s.deltaBalance >= 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {formatDelta(s.deltaBalance)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] text-[#5E4636]">
                    {s.reason}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* PHASE: BLACK MARKET */}
        {state.phase === "black_market" && (
          <section className="space-y-3">
            <div className="rounded-2xl border border-violet-300 bg-violet-50 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-violet-900">
                <ShoppingBag className="h-4 w-4" /> Чорний ринок (1 покупка на
                раунд)
              </div>
              <p className="mt-1 text-xs text-[#5E4636]">
                {myTeam.usedBlackMarketThisRound
                  ? "Ваша команда вже придбала спецзасіб у цьому раунді."
                  : isCaptain
                  ? "Оберіть підсилення для наступних угод."
                  : "Натисніть «Раджу» біля спецзасобу — Капітан побачить ваш голос."}
              </p>
            </div>
            {BLACK_MARKET_ITEMS.map((item) => {
              const recCount = Object.entries(
                state.blackMarketRecommendations ?? {}
              ).filter(([pid, iid]) => {
                const p = state.players[pid];
                return p && p.teamId === myTeam.id && iid === item.id;
              }).length;
              const myRec =
                (state.blackMarketRecommendations ?? {})[currentPlayer.id] ===
                item.id;

              return (
                <div key={item.id} className="surface-card rounded-2xl p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-bold text-[#231710]">
                      {item.name}
                    </div>
                    <span className="font-mono-num rounded-lg bg-violet-100 px-2.5 py-1 text-xs font-extrabold text-violet-900">
                      {formatMoney(item.price)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-[#5E4636]">
                    {item.description}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-orange-100 pt-3">
                    {!myTeam.usedBlackMarketThisRound && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          dispatch({
                            type: "RECOMMEND_BLACK_MARKET",
                            playerId: currentPlayer.id,
                            itemId: item.id,
                          })
                        }
                        className={`btn-press inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-bold ${
                          myRec
                            ? "border-violet-600 bg-violet-100 text-violet-950"
                            : "border-orange-200 bg-white text-[#5E4636] hover:bg-orange-50"
                        }`}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" />
                        Раджу {recCount > 0 ? `(${recCount})` : ""}
                      </button>
                    )}

                    {isCaptain && (
                      <button
                        type="button"
                        disabled={
                          busy ||
                          myTeam.usedBlackMarketThisRound ||
                          myTeam.balance < item.price
                        }
                        onClick={() =>
                          dispatch({
                            type: "BUY_BLACK_MARKET_ITEM",
                            teamId: myTeam.id,
                            itemId: item.id,
                          })
                        }
                        className="btn-press min-h-[40px] flex-1 rounded-xl bg-violet-700 px-4 py-2 text-xs font-extrabold text-white hover:bg-violet-800 disabled:opacity-40"
                      >
                        {myTeam.usedBlackMarketThisRound
                          ? "Ліміт вичерпано"
                          : myTeam.balance < item.price
                          ? "Мало коштів"
                          : "Придбати"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* PHASE: ROUND SUMMARY / ROULETTE / FINISHED */}
        {(state.phase === "round_summary" ||
          state.phase === "roulette" ||
          state.phase === "finished") && (
          <section className="surface-card space-y-3 rounded-3xl p-6 text-center">
            <Shield className="mx-auto h-9 w-9 text-orange-700" />
            <h2 className="font-display text-lg font-bold text-[#231710]">
              {state.phase === "roulette"
                ? "Фінансова рулетка"
                : state.phase === "finished"
                ? "Підсумки сесії"
                : `Раунд ${state.round} завершено`}
            </h2>
            {state.phase === "roulette" && (
              <div className="text-left">
                {state.roulette.isSpinning && !state.roulette.applied ? (
                  <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-center text-xs font-semibold text-orange-950">
                    Колесо фортуни обертається… Дивіться на проєктор!
                  </div>
                ) : activeRouletteSector && state.roulette.applied ? (
                  <div className="space-y-2 rounded-2xl border border-emerald-400 bg-emerald-50 p-4">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
                      Випав сектор:
                    </div>
                    <div className="text-base font-extrabold text-[#231710]">
                      {activeRouletteSector.label}
                    </div>
                    {state.roulette.effectLog && (
                      <div className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-950">
                        {state.roulette.effectLog}
                      </div>
                    )}
                    <p className="text-xs leading-relaxed text-[#5E4636]">
                      <strong className="text-[#231710]">Що це дає:</strong>{" "}
                      {activeRouletteSector.description}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-orange-200 bg-[#FFFBF7] p-4 text-center text-xs text-[#5E4636]">
                    Очікуйте запуск колеса фортуни ведучим…
                  </div>
                )}
              </div>
            )}
            <p className="text-sm text-[#5E4636]">
              Чистий капітал команди:{" "}
              <strong className="font-mono-num text-emerald-700">
                {formatMoney(getNetWorth(myTeam))}
              </strong>{" "}
              (Місце #{myRank})
            </p>

            <div className="space-y-2 pt-2 text-left">
              <div className="text-center text-[11px] font-bold uppercase tracking-wider text-[#7A5E4B]">
                Матриця знань команди за темами
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["3.9.1", "3.9.2", "3.9.3", "3.9.4"] as TopicCode[]).map(
                  (topic) => {
                    const st = myTeam.stats[topic];
                    return (
                      <div
                        key={topic}
                        className="rounded-xl border border-orange-200 bg-[#FFFBF7] px-3 py-2"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-mono-num text-xs font-extrabold text-orange-900">
                            п. {topic}
                          </span>
                          <span className="font-mono-num text-xs font-extrabold text-[#231710]">
                            {st.correct}/{st.attempted}
                          </span>
                        </div>
                        <div className="mt-0.5 truncate text-[11px] text-[#5E4636]">
                          {TOPIC_SHORT_LABELS[topic]}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
