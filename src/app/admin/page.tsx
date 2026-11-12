"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  Download,
  Flag,
  Flame,
  Gavel,
  Landmark,
  Lock,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  ShoppingBag,
  SkipForward,
  Sparkles,
  Trophy,
  Users,
} from "lucide-react";
import { RouletteWheel } from "@/components/RouletteWheel";
import {
  BLACK_MARKET_ITEMS,
  getLotById,
  getLotsForRound,
  ROULETTE_SECTORS,
  ROUND_METADATA,
} from "@/data/question-bank";
import { useCountdown } from "@/hooks/useCountdown";
import { useGameRoom } from "@/hooks/useGameRoom";
import { useRoomId } from "@/hooks/useRoomId";
import {
  formatDelta,
  formatMoney,
  generateCsvReport,
  generateStudentCsvReport,
  generateStudentTsvTable,
  getEvaluatedLotColumns,
  getLeaderboard,
  getRiskTierMeta,
  getStudentSummaryRows,
} from "@/lib/formatters";
import {
  canAdvanceToRound,
  getActiveTeamIds,
  getNetWorth,
  getRemainingLotsInRound,
} from "@/lib/game-engine";
import { buildPlayJoinUrl, PUBLIC_APP_URL } from "@/lib/qr-svg";
import { isSupabaseConfigured } from "@/lib/supabase";
import { AnswerPayload, MarketLot, RoundNumber, TopicCode } from "@/types/game";

function formatReadableVote(lot: MarketLot, ans: AnswerPayload): string {
  if (ans.type === "single" && lot.questionType === "single") {
    const opt = lot.options.find((o) => o.id === ans.optionId);
    return opt ? `Варіант ${opt.label}` : ans.optionId;
  }
  if (ans.type === "multi" && lot.questionType === "multi") {
    return ans.optionIds
      .map((id) => lot.options.find((o) => o.id === id)?.label ?? id)
      .sort()
      .join(", ");
  }
  if (ans.type === "order" && lot.questionType === "order") {
    return ans.orderedIds
      .map((id) => lot.items.find((i) => i.id === id)?.label ?? id)
      .join(" → ");
  }
  if (ans.type === "match" && lot.questionType === "match") {
    return lot.leftItems
      .map((l) => {
        const ro = lot.rightOptions.find((r) => r.id === ans.pairs[l.id]);
        return `${l.label}-${ro?.label ?? "?"}`;
      })
      .join(", ");
  }
  if (ans.type === "classify" && lot.questionType === "classify") {
    return lot.items
      .map(
        (item) =>
          `${item.label}:${ans.buckets[item.id] === "forecast" ? "Прг" : "Плн"}`
      )
      .join(" ");
  }
  if (ans.type === "open") {
    return ans.text.length > 75 ? `${ans.text.slice(0, 75)}…` : ans.text;
  }
  return "Обрано";
}

export default function AdminPage() {
  const roomId = useRoomId();
  const requiredPin = process.env.NEXT_PUBLIC_ADMIN_PIN?.trim() || "3434";
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    try {
      if (
        typeof window !== "undefined" &&
        window.sessionStorage.getItem("fin-storm-admin-pin") === requiredPin
      ) {
        setUnlocked(true);
      }
    } catch {
      // ignore storage failure
    }
  }, [requiredPin]);
  const [previewLotId, setPreviewLotId] = useState<string | null>(null);
  const [autoRevealOnZero, setAutoRevealOnZero] = useState<boolean>(true);
  const [copiedInvite, setCopiedInvite] = useState<boolean>(false);
  const [copiedStudentTable, setCopiedStudentTable] = useState<boolean>(false);
  const [renamingTeamId, setRenamingTeamId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState<string>("");
  const autoRevealedLotRef = useRef<string | null>(null);
  const autoAppliedSpinRef = useRef<number>(0);

  const { state, connected, busy, error, clockOffsetMs, dispatch } =
    useGameRoom(roomId);
  const { totalSeconds, isPaused } = useCountdown(
    state?.spotlight ?? null,
    clockOffsetMs
  );

  // Auto-reveal when countdown reaches 0s (unless paused or disabled)
  useEffect(() => {
    if (!state || state.phase !== "spotlight" || !state.spotlight) return;
    if (!autoRevealOnZero || isPaused || totalSeconds > 0 || busy) return;
    const key = `${state.spotlight.lotId}-${state.spotlight.startedAt}`;
    if (autoRevealedLotRef.current === key) return;
    autoRevealedLotRef.current = key;
    const id = setTimeout(() => {
      dispatch({ type: "FORCE_REVEAL" });
    }, 350);
    return () => clearTimeout(id);
  }, [state, autoRevealOnZero, isPaused, totalSeconds, busy, dispatch]);

  // Auto-apply Roulette effect right after the 4.2s wheel spin finishes
  const rouletteSpinId = state?.roulette.spinId ?? 0;
  const rouletteIsSpinning = state?.roulette.isSpinning ?? false;
  const rouletteApplied = state?.roulette.applied ?? false;
  const rouletteTargetSectorId = state?.roulette.targetSectorId ?? null;
  const currentPhase = state?.phase ?? null;

  useEffect(() => {
    if (
      currentPhase !== "roulette" ||
      !rouletteIsSpinning ||
      rouletteApplied ||
      !rouletteTargetSectorId
    ) {
      return;
    }
    if (autoAppliedSpinRef.current === rouletteSpinId) return;
    const id = setTimeout(() => {
      autoAppliedSpinRef.current = rouletteSpinId;
      dispatch({ type: "APPLY_ROULETTE_RESULT" });
    }, 4300);
    return () => clearTimeout(id);
  }, [
    currentPhase,
    rouletteSpinId,
    rouletteIsSpinning,
    rouletteApplied,
    rouletteTargetSectorId,
    dispatch,
  ]);

  const leaderboard = useMemo(
    () => (state ? getLeaderboard(state, state.phase === "lobby") : []),
    [state]
  );

  if (!unlocked) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-6">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (pinInput.trim() === requiredPin) {
              setPinError(false);
              try {
                window.sessionStorage.setItem(
                  "fin-storm-admin-pin",
                  requiredPin
                );
              } catch {
                // ignore storage failure
              }
              setUnlocked(true);
            } else {
              setPinError(true);
            }
          }}
          className="surface-card w-full max-w-sm rounded-3xl p-6"
        >
          <Lock className="mb-3 h-7 w-7 text-orange-700" />
          <h1 className="font-display mb-2 text-xl font-bold text-[#231710]">
            Вхід у пульт викладача
          </h1>
          <label
            htmlFor="admin-pin"
            className="mb-1.5 block text-xs font-bold text-[#5E4636]"
          >
            Пароль доступу
          </label>
          <input
            id="admin-pin"
            type="password"
            autoFocus
            value={pinInput}
            onChange={(e) => {
              setPinInput(e.target.value);
              if (pinError) setPinError(false);
            }}
            placeholder="Введіть пароль"
            className={`mb-2 min-h-[44px] w-full rounded-xl border bg-white px-3.5 py-2 text-base text-[#231710] outline-none focus:ring-2 ${
              pinError
                ? "border-rose-400 focus:ring-rose-200"
                : "border-orange-300 focus:ring-orange-200"
            }`}
          />
          {pinError && (
            <p className="mb-3 text-xs font-semibold text-rose-700">
              Невірний пароль. Спробуйте ще раз.
            </p>
          )}
          <button
            type="submit"
            className="btn-press mt-2 min-h-[44px] w-full rounded-xl bg-orange-700 py-2.5 text-sm font-bold text-white hover:bg-orange-800"
          >
            Увійти в пульт
          </button>
        </form>
      </main>
    );
  }

  if (!state) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-base font-medium text-[#5E4636]">
        Завантаження пульта викладача…
      </div>
    );
  }

  const roundMeta = ROUND_METADATA[state.round];
  const roundLots = getLotsForRound(state.round);
  const remainingRoundLots = getRemainingLotsInRound(state, state.round);
  const completedRoundLotsCount = roundLots.length - remainingRoundLots.length;
  const spotlightLot = state.spotlight
    ? getLotById(state.spotlight.lotId)
    : undefined;
  const previewInCurrentRound =
    previewLotId && roundLots.some((l) => l.id === previewLotId)
      ? getLotById(previewLotId)
      : undefined;
  const inspectedLot = spotlightLot ?? previewInCurrentRound ?? roundLots[0];

  const activeDraftTeamId = state.draftQueue[state.draftPointer];
  const activeRouletteSector = state.roulette.targetSectorId
    ? ROULETTE_SECTORS.find((s) => s.id === state.roulette.targetSectorId)
    : null;

  const downloadCsv = () => {
    const csv = generateCsvReport(state);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fin-storm-report-round-${state.round}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadStudentCsv = () => {
    const csv = generateStudentCsvReport(state);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fin-storm-students-round-${state.round}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyStudentTable = async () => {
    const tsv = generateStudentTsvTable(state);
    try {
      await navigator.clipboard.writeText(tsv);
      setCopiedStudentTable(true);
      setTimeout(() => setCopiedStudentTable(false), 2500);
    } catch {
      // ignore clipboard errors
    }
  };

  const studentRows = getStudentSummaryRows(state);
  const evaluatedLotCols = getEvaluatedLotColumns(state);
  const activeTeamIds = getActiveTeamIds(state.teams, state.players);

  return (
    <div className="mx-auto min-h-dvh max-w-[1600px] px-4 py-4 lg:px-6">
      {/* TOP BAR */}
      <header className="surface-card mb-4 flex flex-wrap items-center justify-between gap-3 rounded-3xl px-5 py-3.5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-lg font-bold text-[#231710]">
              Пульт викладача
            </h1>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                connected
                  ? "bg-emerald-50 text-emerald-800"
                  : "bg-rose-50 text-rose-800"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  connected ? "bg-emerald-600" : "bg-rose-600"
                }`}
              />
              {connected ? "Онлайн" : "Офлайн"}
            </span>
            {roomId !== "default-room" && (
              <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-bold text-orange-900">
                Кімната: {roomId}
              </span>
            )}
          </div>
          <div className="text-xs text-[#5E4636]">
            {roundMeta.title} · Завдань пройдено:{" "}
            <strong className="font-mono-num text-[#231710]">
              {completedRoundLotsCount}/{roundLots.length}
            </strong>{" "}
            · Активних команд:{" "}
            <strong className="font-mono-num text-[#231710]">
              {activeTeamIds.length}
            </strong>{" "}
            · Гравців:{" "}
            <strong className="font-mono-num text-[#231710]">
              {Object.keys(state.players).length}
            </strong>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={async () => {
              const full = buildPlayJoinUrl(
                roomId,
                isSupabaseConfigured() ? PUBLIC_APP_URL : window.location.origin
              );
              try {
                await navigator.clipboard.writeText(full);
                setCopiedInvite(true);
                setTimeout(() => setCopiedInvite(false), 2000);
              } catch {
                // ignore clipboard failure
              }
            }}
            className="btn-press inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-orange-300 bg-white px-3.5 py-1.5 text-xs font-bold text-orange-900 hover:bg-orange-50"
          >
            {copiedInvite ? (
              <Check className="h-3.5 w-3.5 text-emerald-700" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {copiedInvite ? "Посилання скопійовано" : "Посилання для студентів"}
          </button>

          <button
            type="button"
            onClick={downloadCsv}
            className="btn-press inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100"
          >
            <Download className="h-3.5 w-3.5" /> Експорт CSV
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => {
              if (
                window.confirm(
                  "Скинути гру та повернути всі баланси до $10 000?"
                )
              ) {
                dispatch({ type: "RESET_GAME" });
              }
            }}
            className="btn-press inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Нова гра
          </button>
        </div>
      </header>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-800"
        >
          Помилка синхронізації: {error}
        </div>
      )}

      {/* 3-COLUMN COCKPIT */}
      <div className="grid gap-4 xl:grid-cols-12">
        {/* LEFT COLUMN (3 cols): GAME FLOW & EVENTS */}
        <aside className="space-y-4 xl:col-span-3">
          <div className="surface-card space-y-3.5 rounded-3xl p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#231710]">
              <Gavel className="h-4 w-4 text-orange-700" /> Керування ходом гри
            </div>

            {state.phase === "lobby" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => dispatch({ type: "START_GAME" })}
                className="btn-press flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-orange-700 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-orange-800"
              >
                <Play className="h-4 w-4" /> Почати Раунд 1
              </button>
            )}

            {state.phase === "marketplace" && (
              <div className="space-y-2.5">
                <div className="rounded-xl border border-orange-300 bg-orange-50 p-3 text-xs text-orange-950">
                  Зараз обирає ({state.draftPointer + 1}/
                  {state.draftQueue.length}):{" "}
                  <strong>
                    {activeDraftTeamId
                      ? state.teams[activeDraftTeamId].name
                      : "—"}
                  </strong>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => dispatch({ type: "SKIP_DRAFT_TURN" })}
                  className="btn-press flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl border border-orange-200 bg-white py-2 text-xs font-bold text-[#231710] hover:bg-orange-50"
                >
                  <SkipForward className="h-3.5 w-3.5" /> Пропустити хід команди
                </button>
                {completedRoundLotsCount < roundLots.length && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Завершити Раунд ${state.round} достроково? Залишилось завдань: ${
                            roundLots.length - completedRoundLotsCount
                          }.`
                        )
                      ) {
                        dispatch({ type: "FORCE_END_ROUND" });
                      }
                    }}
                    className="btn-press flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 py-2 text-xs font-bold text-amber-900 hover:bg-amber-100"
                  >
                    <Flag className="h-3.5 w-3.5" /> Завершити раунд достроково
                  </button>
                )}
              </div>
            )}

            {state.phase === "spotlight" && state.spotlight && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5E4636]">
                    <Clock className="h-4 w-4 text-orange-700" /> Таймер
                  </span>
                  <span
                    className={`font-mono-num text-xl font-extrabold ${
                      totalSeconds <= 10 ? "text-rose-700" : "text-orange-900"
                    }`}
                  >
                    {isPaused ? "ПАУЗА" : `${totalSeconds}с`}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => dispatch({ type: "TOGGLE_PAUSE_TIMER" })}
                    className="btn-press inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl border border-orange-200 bg-white py-2 text-xs font-bold text-[#231710] hover:bg-orange-50"
                  >
                    {isPaused ? (
                      <>
                        <Play className="h-3.5 w-3.5" /> Продовжити
                      </>
                    ) : (
                      <>
                        <Pause className="h-3.5 w-3.5" /> Пауза
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      dispatch({ type: "ADD_TIMER_SECONDS", seconds: 15 })
                    }
                    className="btn-press inline-flex min-h-[40px] items-center justify-center gap-1 rounded-xl border border-orange-200 bg-white py-2 text-xs font-bold text-[#231710] hover:bg-orange-50"
                  >
                    <Plus className="h-3.5 w-3.5" /> +15 сек
                  </button>
                </div>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-orange-100 bg-orange-50/70 px-3 py-1.5 text-[11px] font-semibold text-[#5E4636]">
                  <input
                    type="checkbox"
                    checked={autoRevealOnZero}
                    onChange={(e) => setAutoRevealOnZero(e.target.checked)}
                    className="h-3.5 w-3.5 accent-orange-700"
                  />
                  Авторозкриття при 0с
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => dispatch({ type: "FORCE_REVEAL" })}
                  className={`btn-press min-h-[46px] w-full rounded-2xl py-2.5 text-xs font-extrabold text-white shadow-sm ${
                    totalSeconds === 0
                      ? "animate-pulse bg-rose-700 hover:bg-rose-800"
                      : "bg-orange-700 hover:bg-orange-800"
                  }`}
                >
                  {spotlightLot?.questionType === "open"
                    ? "Перейти до оцінювання усної відповіді"
                    : "Завершити і розкрити відповідь"}
                </button>
              </div>
            )}

            {state.phase === "black_market" && (
              <div className="space-y-2.5">
                <div className="rounded-xl border border-violet-300 bg-violet-50 p-3 text-xs text-violet-950">
                  Триває <strong>Чорний ринок</strong>. Купили спецзасіб:{" "}
                  <strong className="font-mono-num">
                    {
                      activeTeamIds.filter(
                        (tid) => state.teams[tid].usedBlackMarketThisRound
                      ).length
                    }
                    /{activeTeamIds.length}
                  </strong>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => dispatch({ type: "CLOSE_BLACK_MARKET" })}
                  className="btn-press min-h-[44px] w-full rounded-xl bg-violet-700 py-2 text-xs font-extrabold text-white hover:bg-violet-800"
                >
                  Закрити Чорний ринок
                </button>
              </div>
            )}

            {state.phase === "roulette" && (
              <div className="space-y-2.5">
                <div className="rounded-xl border border-orange-300 bg-orange-50 p-3 text-xs text-orange-950">
                  {state.roulette.isSpinning && !state.roulette.applied
                    ? "Колесо рулетки крутиться… результат застосується автоматично."
                    : state.roulette.applied
                    ? "Результат рулетки застосовано. Можна крутити ще або повернутися."
                    : "Натисніть «Крутити!» у блоці Спецподій нижче."}
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => dispatch({ type: "CLOSE_ROULETTE" })}
                  className="btn-press min-h-[42px] w-full rounded-xl border border-orange-200 bg-white py-2 text-xs font-bold text-[#231710] hover:bg-orange-50"
                >
                  Повернутися до торгів
                </button>
              </div>
            )}

            {state.phase === "review" && state.spotlight && spotlightLot && (
              <div className="space-y-2.5">
                <div className="rounded-xl border border-orange-300 bg-orange-50 p-3 text-xs font-semibold text-orange-950">
                  Очікується ваше рішення щодо відкритої відповіді команди{" "}
                  <strong>
                    {state.teams[state.spotlight.buyerTeamId].shortName}
                  </strong>
                  .
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      dispatch({
                        type: "HOST_GRADE_OPEN_ANSWER",
                        isCorrect: true,
                      })
                    }
                    className="btn-press min-h-[44px] rounded-xl bg-emerald-700 py-2 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:opacity-40"
                  >
                    Зарахувати
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      dispatch({
                        type: "HOST_GRADE_OPEN_ANSWER",
                        isCorrect: false,
                      })
                    }
                    className="btn-press min-h-[44px] rounded-xl bg-rose-700 py-2 text-xs font-extrabold text-white hover:bg-rose-800 disabled:opacity-40"
                  >
                    Не зарахувати
                  </button>
                </div>
              </div>
            )}

            {state.phase === "reveal" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => dispatch({ type: "NEXT_AFTER_REVEAL" })}
                className="btn-press flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-orange-700 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-orange-800"
              >
                <SkipForward className="h-4 w-4" /> Далі (наступний лот /
                підсумок)
              </button>
            )}

            {(state.phase === "round_summary" || state.phase === "finished") && (
              <div className="space-y-2.5">
                {state.round < 4 && state.phase !== "finished" && (
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !canAdvanceToRound(
                        state,
                        (state.round + 1) as RoundNumber
                      )
                    }
                    onClick={() =>
                      dispatch({
                        type: "GO_TO_ROUND",
                        round: (state.round + 1) as RoundNumber,
                      })
                    }
                    className="btn-press min-h-[48px] w-full rounded-2xl bg-orange-700 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Перейти до Раунду {state.round + 1}
                  </button>
                )}
                {state.phase !== "finished" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => dispatch({ type: "FINISH_GAME" })}
                    className="btn-press flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-xl border border-orange-300 bg-orange-50 py-2.5 text-xs font-bold text-orange-900 hover:bg-orange-100"
                  >
                    <Trophy className="h-4 w-4" /> Оголосити фінал і подіум
                  </button>
                )}
              </div>
            )}

            <div className="border-t border-orange-100 pt-3">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-[#826754]">
                <span>Швидкий перехід до раунду:</span>
                <span className="font-mono-num text-[#231710]">
                  {completedRoundLotsCount}/{roundLots.length}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {([1, 2, 3, 4] as const).map((r) => {
                  const canGo = canAdvanceToRound(state, r);
                  const isCurrent = state.round === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      disabled={busy || !canGo}
                      title={
                        isCurrent
                          ? `Поточний раунд ${r}`
                          : canGo
                          ? `Перейти до Раунду ${r}`
                          : `Спочатку завершіть усі завдання раунду ${state.round} (залишилось: ${remainingRoundLots.length})`
                      }
                      onClick={() => dispatch({ type: "GO_TO_ROUND", round: r })}
                      className={`btn-press inline-flex min-h-[38px] items-center justify-center gap-1 rounded-xl border font-mono-num text-xs font-bold ${
                        isCurrent
                          ? "border-orange-600 bg-orange-100 text-orange-950"
                          : canGo
                          ? "border-orange-200 bg-white text-[#5E4636] hover:bg-orange-50"
                          : "cursor-not-allowed border-orange-100 bg-orange-50/40 text-[#826754]/60 opacity-60"
                      }`}
                    >
                      {!isCurrent && !canGo && <Lock className="h-3 w-3" />}
                      Р{r}
                    </button>
                  );
                })}
              </div>
              {state.phase !== "lobby" && remainingRoundLots.length > 0 && (
                <p className="mt-2 text-[11px] leading-snug text-[#826754]">
                  Залишилось завдань у раунді {state.round}:{" "}
                  <strong className="font-mono-num text-[#231710]">
                    {remainingRoundLots.length}
                  </strong>
                  . Наступний раунд відкриється після проходження всіх лотів.
                </p>
              )}
            </div>
          </div>

          {/* Special Events */}
          <div className="surface-card space-y-2.5 rounded-3xl p-4">
            <div className="flex items-center gap-2 text-xs font-bold text-[#231710]">
              <Sparkles className="h-4 w-4 text-orange-700" /> Спецподії біржі
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => dispatch({ type: "TOGGLE_SHORT_SQUEEZE" })}
              className={`btn-press flex min-h-[42px] w-full items-center justify-between rounded-xl border px-3.5 py-2 text-xs font-bold ${
                state.shortSqueezeEventActive
                  ? "border-rose-400 bg-rose-50 text-rose-900"
                  : "border-orange-200 bg-white text-[#231710] hover:bg-orange-50"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                <Flame className="h-4 w-4 text-rose-700" /> Режим Шорт-сквіз
              </span>
              <span>{state.shortSqueezeEventActive ? "УВІМК" : "ВИМК"}</span>
            </button>
            <p className="px-1 text-[11px] leading-snug text-[#826754]">
              {state.shortSqueezeEventActive
                ? "Активно: ставки Long/Short відкрито на всі лоти, при помилці Short дає +150%, при успіху — штраф -150%."
                : "Коли вимкнено — ставки Long/Short доступні лише на Деривативах."}
            </p>

            {state.phase === "black_market" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => dispatch({ type: "CLOSE_BLACK_MARKET" })}
                className="btn-press min-h-[42px] w-full rounded-xl bg-violet-700 py-2 text-xs font-bold text-white hover:bg-violet-800"
              >
                Закрити Чорний ринок (
                {
                  activeTeamIds.filter(
                    (tid) => state.teams[tid].usedBlackMarketThisRound
                  ).length
                }
                /{activeTeamIds.length})
              </button>
            ) : (
              <button
                type="button"
                disabled={
                  busy ||
                  state.phase === "spotlight" ||
                  state.phase === "review"
                }
                onClick={() => dispatch({ type: "OPEN_BLACK_MARKET" })}
                className="btn-press flex min-h-[42px] w-full items-center justify-center gap-1.5 rounded-xl border border-violet-300 bg-violet-50 py-2 text-xs font-bold text-violet-900 hover:bg-violet-100 disabled:opacity-40"
              >
                <ShoppingBag className="h-4 w-4" /> Відкрити Чорний ринок
              </button>
            )}

            {state.phase === "roulette" ? (
              <div className="space-y-2.5 rounded-2xl border border-orange-300 bg-orange-50 p-3">
                <div className="flex justify-center">
                  <RouletteWheel
                    spinId={state.roulette.spinId}
                    targetSectorId={state.roulette.targetSectorId}
                    isSpinning={state.roulette.isSpinning}
                    size={185}
                  />
                </div>
                {state.roulette.isSpinning && !state.roulette.applied ? (
                  <div className="rounded-xl border border-orange-200 bg-white px-3 py-2 text-center text-xs font-semibold text-orange-900">
                    Колесо крутиться… результат з&apos;явиться за 4с
                  </div>
                ) : (
                  activeRouletteSector &&
                  state.roulette.applied && (
                    <div className="space-y-1 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-left text-xs text-[#231710]">
                      <div className="font-extrabold text-emerald-950">
                        Випав сектор: {activeRouletteSector.label}
                      </div>
                      {state.roulette.effectLog && (
                        <div className="font-semibold text-emerald-900">
                          {state.roulette.effectLog}
                        </div>
                      )}
                      <div className="text-[11px] leading-snug text-[#5E4636]">
                        <strong>Що це дає:</strong>{" "}
                        {activeRouletteSector.description}
                      </div>
                    </div>
                  )
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={
                      busy ||
                      (state.roulette.isSpinning && !state.roulette.applied)
                    }
                    onClick={() => dispatch({ type: "SPIN_ROULETTE" })}
                    className="btn-press min-h-[38px] rounded-xl bg-orange-700 py-2 text-xs font-extrabold text-white disabled:opacity-40"
                  >
                    {state.roulette.isSpinning && !state.roulette.applied
                      ? "Обертається…"
                      : "Крутити!"}
                  </button>
                  <button
                    type="button"
                    disabled={
                      busy ||
                      !state.roulette.targetSectorId ||
                      state.roulette.applied
                    }
                    onClick={() => dispatch({ type: "APPLY_ROULETTE_RESULT" })}
                    className="btn-press min-h-[38px] rounded-xl bg-emerald-700 py-2 text-xs font-extrabold text-white disabled:opacity-40"
                  >
                    {state.roulette.applied ? "Застосовано" : "Застосувати зараз"}
                  </button>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => dispatch({ type: "CLOSE_ROULETTE" })}
                  className="btn-press min-h-[36px] w-full rounded-xl border border-orange-200 bg-white py-1.5 text-xs font-semibold text-[#5E4636]"
                >
                  Повернутися до торгів
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={
                  busy ||
                  state.phase === "spotlight" ||
                  state.phase === "review"
                }
                onClick={() => dispatch({ type: "OPEN_ROULETTE" })}
                className="btn-press min-h-[42px] w-full rounded-xl border border-orange-300 bg-orange-50 py-2 text-xs font-bold text-orange-900 hover:bg-orange-100 disabled:opacity-40"
              >
                🎡 Запустити Фінансову рулетку
              </button>
            )}
          </div>
        </aside>

        {/* CENTER COLUMN (5 cols): TEACHER CHEAT SHEET */}
        <section className="space-y-4 xl:col-span-5">
          {state.phase === "review" && state.spotlight && spotlightLot && (
            <div className="surface-card rounded-3xl border-2 border-orange-500 bg-orange-50/60 p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="rounded-full border border-orange-400 bg-orange-100 px-3 py-0.5 text-xs font-extrabold text-orange-950">
                  ПОТРІБНА ОЦІНКА ВЕДУЧОГО
                </span>
                <span className="font-mono-num text-xs font-bold text-[#5E4636]">
                  {state.teams[state.spotlight.buyerTeamId].name}
                </span>
              </div>

              <div className="mb-3 rounded-2xl border border-orange-200 bg-white p-4">
                <div className="mb-1 text-xs font-bold text-[#826754]">
                  Усна відповідь команди:
                </div>
                <p className="text-sm font-semibold leading-relaxed text-[#231710]">
                  🎤 Команда{" "}
                  <strong>{state.teams[state.spotlight.buyerTeamId].name}</strong>{" "}
                  відповідає усно ведучому. Оцініть аргументи за ключовими тезами
                  нижче!
                </p>
              </div>

              {spotlightLot.questionType === "open" && (
                <div className="mb-4 rounded-2xl border border-emerald-300 bg-emerald-50/90 p-3.5 text-xs">
                  <div className="mb-1.5 font-extrabold text-emerald-900">
                    Ключові тези для перевірки:
                  </div>
                  <ul className="list-disc space-y-1 pl-4 text-[#231710]">
                    {spotlightLot.samplePoints.map((pt, idx) => (
                      <li key={idx}>{pt}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    dispatch({
                      type: "HOST_GRADE_OPEN_ANSWER",
                      isCorrect: true,
                    })
                  }
                  className="btn-press flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-40"
                >
                  Зарахувати (+{formatMoney(spotlightLot.reward)})
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    dispatch({
                      type: "HOST_GRADE_OPEN_ANSWER",
                      isCorrect: false,
                    })
                  }
                  className="btn-press flex min-h-[48px] items-center justify-center gap-1.5 rounded-2xl bg-rose-700 px-4 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-rose-800 disabled:opacity-40"
                >
                  Не зарахувати (Дефолт)
                </button>
              </div>
            </div>
          )}

          <div className="surface-card rounded-3xl p-5">
            <div className="mb-3.5 flex items-center justify-between gap-2 border-b border-orange-100 pb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-emerald-700" />
                <h2 className="font-display text-base font-bold text-[#231710]">
                  Шпаргалка викладача
                </h2>
              </div>
              {spotlightLot ? (
                <span className="rounded-full border border-orange-300 bg-orange-100 px-3 py-0.5 text-xs font-bold text-orange-900">
                  ЗАРАЗ В ЕФІРІ · {spotlightLot.ticker}
                </span>
              ) : (
                <span className="text-xs font-medium text-[#826754]">
                  Перегляд лота
                </span>
              )}
            </div>

            {inspectedLot && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`rounded-lg border px-2.5 py-0.5 text-xs font-bold ${
                      getRiskTierMeta(inspectedLot.riskTier).badgeClass
                    }`}
                  >
                    {getRiskTierMeta(inspectedLot.riskTier).label}
                  </span>
                  <span className="font-mono-num text-xs font-semibold text-[#5E4636]">
                    п. {inspectedLot.topic} · {formatMoney(inspectedLot.price)}{" "}
                    / +{formatMoney(inspectedLot.reward)}
                  </span>
                </div>

                <div>
                  <h3 className="text-base font-extrabold text-[#231710]">
                    [{inspectedLot.ticker}] {inspectedLot.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-[#5E4636]">
                    {inspectedLot.prompt}
                  </p>
                </div>

                {/* Highlighted Answer */}
                <div className="rounded-2xl border-2 border-emerald-400 bg-emerald-50 p-4">
                  <div className="mb-1 flex items-center gap-1.5 text-xs font-extrabold text-emerald-900">
                    <CheckCircle2 className="h-4 w-4" /> ПРАВИЛЬНА ВІДПОВІДЬ:
                  </div>
                  <div className="text-sm font-extrabold text-[#231710]">
                    {inspectedLot.correctSummary}
                  </div>
                  {inspectedLot.questionType === "open" && (
                    <ul className="mt-2 list-disc space-y-1 border-t border-emerald-200 pt-2 pl-4 text-xs text-[#231710]">
                      {inspectedLot.samplePoints.map((pt, i) => (
                        <li key={i}>{pt}</li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Academic Note */}
                <div className="surface-tint rounded-2xl p-4">
                  <div className="mb-1 text-xs font-bold text-orange-900">
                    Академічний коментар з конспекту:
                  </div>
                  <p className="text-sm leading-relaxed text-[#231710]">
                    {inspectedLot.teacherExplanation}
                  </p>
                </div>
              </div>
            )}

            <div className="mt-4 border-t border-orange-100 pt-3">
              <div className="mb-2 text-xs font-semibold text-[#826754]">
                Швидкий перегляд лотів Раунду {state.round}:
              </div>
              <div className="flex flex-wrap gap-1.5">
                {roundLots.map((lot) => {
                  const sold = state.purchasedLotIds.includes(lot.id);
                  const active = inspectedLot?.id === lot.id;
                  return (
                    <button
                      key={lot.id}
                      type="button"
                      onClick={() => setPreviewLotId(lot.id)}
                      className={`btn-press min-h-[34px] rounded-lg border px-2.5 py-1 font-mono-num text-xs font-bold ${
                        active
                          ? "border-emerald-500 bg-emerald-50 text-emerald-900"
                          : sold
                          ? "border-orange-100 bg-orange-50/40 text-[#826754] line-through"
                          : "border-orange-200 bg-white text-[#231710] hover:bg-orange-50"
                      }`}
                    >
                      {lot.ticker}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {state.phase === "spotlight" && state.spotlight && spotlightLot && (
            <div className="surface-card space-y-3 rounded-3xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold text-orange-900">
                  Живий зріз голосів команди «
                  {state.teams[state.spotlight.buyerTeamId].shortName}»:
                </div>
                <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 font-mono-num text-[11px] font-bold text-orange-900">
                  {Object.keys(state.spotlight.analystVotes).length}/
                  {
                    Object.values(state.players).filter(
                      (p) => p.teamId === state.spotlight?.buyerTeamId
                    ).length
                  }
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                {Object.entries(state.spotlight.analystVotes).length === 0 ? (
                  <div className="text-[#826754]">
                    {spotlightLot.questionType === "open"
                      ? "Відкрите питання — очікуйте усну відповідь команди."
                      : "Учасники ще обирають варіант…"}
                  </div>
                ) : (
                  Object.entries(state.spotlight.analystVotes).map(
                    ([pid, ans]) => {
                      const voter = state.players[pid];
                      const teamShort = voter
                        ? state.teams[voter.teamId]?.shortName
                        : null;
                      const isFromBuyer =
                        voter?.teamId === state.spotlight?.buyerTeamId;
                      return (
                        <div
                          key={pid}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                            isFromBuyer
                              ? "border-orange-300 bg-orange-50/70"
                              : "border-orange-100 bg-[#FFFBF7]"
                          }`}
                        >
                          <span className="truncate font-semibold text-[#231710]">
                            {voter?.name ?? pid}
                            {teamShort && (
                              <span className="ml-1.5 text-[11px] font-medium text-[#826754]">
                                ({teamShort}
                                {isFromBuyer ? " · актив" : ""})
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 font-mono-num font-bold text-orange-900">
                            {formatReadableVote(spotlightLot, ans)}
                          </span>
                        </div>
                      );
                    }
                  )
                )}
              </div>

              {Object.values(state.spotlight.bets).length > 0 && (
                <div className="border-t border-orange-100 pt-2.5">
                  <div className="mb-1.5 text-xs font-bold text-[#231710]">
                    Ставки інших команд (Long / Short):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.values(state.spotlight.bets).map((bet) => (
                      <span
                        key={bet.teamId}
                        className={`rounded-lg border px-2.5 py-1 font-mono-num text-[11px] font-bold ${
                          bet.side === "long"
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-rose-300 bg-rose-50 text-rose-800"
                        }`}
                      >
                        {state.teams[bet.teamId].shortName}:{" "}
                        {bet.side.toUpperCase()} {formatMoney(bet.amount)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* RIGHT COLUMN (4 cols): TEAMS & FORMATIVE MATRIX */}
        <aside className="space-y-4 xl:col-span-4">
          <div className="surface-card space-y-2.5 rounded-3xl p-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-[#231710]">
                <Users className="h-4 w-4 text-orange-700" /> Команди та баланси
              </span>
              <span className="text-xs text-[#826754]">Чистий капітал</span>
            </div>

            {leaderboard.map((team, idx) => {
              const members = Object.values(state.players).filter(
                (p) => p.teamId === team.id
              );
              return (
                <div
                  key={team.id}
                  className="rounded-2xl border border-orange-100 bg-[#FFFDFB] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="font-mono-num text-xs font-bold text-[#826754]">
                        #{idx + 1}
                      </span>
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: team.color }}
                      />
                      <span className="truncate text-xs font-extrabold text-[#231710]">
                        {team.name}
                      </span>
                      <button
                        type="button"
                        aria-label={`Перейменувати команду ${team.name}`}
                        onClick={() => {
                          setRenamingTeamId(team.id);
                          setRenameDraft(team.name);
                        }}
                        className="rounded p-0.5 text-[#826754] hover:bg-orange-100 hover:text-[#231710]"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono-num text-sm font-extrabold text-emerald-700">
                        {formatMoney(getNetWorth(team))}
                      </span>
                      <button
                        type="button"
                        aria-label={`Нарахувати +$500 команді ${team.name}`}
                        onClick={() =>
                          dispatch({
                            type: "ADJUST_BALANCE",
                            teamId: team.id,
                            delta: 500,
                            reason: `Бонус викладача команді ${team.shortName} (+$500)`,
                          })
                        }
                        className="btn-press rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 font-mono-num text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                      >
                        +$500
                      </button>
                      <button
                        type="button"
                        aria-label={`Списати -$500 у команди ${team.name}`}
                        onClick={() =>
                          dispatch({
                            type: "ADJUST_BALANCE",
                            teamId: team.id,
                            delta: -500,
                            reason: `Штраф викладача команді ${team.shortName} (-$500)`,
                          })
                        }
                        className="btn-press rounded-lg border border-rose-300 bg-rose-50 px-2 py-1 font-mono-num text-[11px] font-bold text-rose-800 hover:bg-rose-100"
                      >
                        -$500
                      </button>
                    </div>
                  </div>

                  {renamingTeamId === team.id && (
                    <form
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const clean = renameDraft.trim();
                        if (clean) {
                          await dispatch({
                            type: "RENAME_TEAM",
                            teamId: team.id,
                            name: clean,
                          });
                        }
                        setRenamingTeamId(null);
                      }}
                      className="mt-2 flex items-center gap-1.5"
                    >
                      <input
                        type="text"
                        maxLength={28}
                        value={renameDraft}
                        onChange={(e) => setRenameDraft(e.target.value)}
                        className="min-w-0 flex-1 rounded-lg border border-orange-300 bg-white px-2.5 py-1 text-xs font-semibold text-[#231710] outline-none focus:border-orange-500"
                      />
                      <button
                        type="submit"
                        disabled={busy || !renameDraft.trim()}
                        className="rounded-lg bg-orange-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-orange-500 disabled:opacity-50"
                      >
                        Ок
                      </button>
                    </form>
                  )}

                  {team.debt > 0 && (
                    <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[11px]">
                      <span className="inline-flex items-center gap-1 font-bold text-rose-800">
                        <Landmark className="h-3.5 w-3.5" />
                        Санація НБУ · Борг:{" "}
                        <span className="font-mono-num">
                          {formatMoney(team.debt)}
                        </span>
                      </span>
                      {team.balance >= team.debt + 500 && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            dispatch({ type: "REPAY_DEBT", teamId: team.id })
                          }
                          className="btn-press rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800 hover:bg-emerald-100"
                        >
                          Погасити борг
                        </button>
                      )}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {members.length === 0 ? (
                      <span className="text-[11px] text-[#826754]">
                        Порожня команда (не бере участі)
                      </span>
                    ) : (
                      members.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          title="Натисніть, щоб призначити Капітаном"
                          onClick={() =>
                            dispatch({
                              type: "ASSIGN_CAPTAIN",
                              teamId: team.id,
                              playerId: m.id,
                            })
                          }
                          className={`btn-press inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-semibold ${
                            m.role === "captain"
                              ? "border-orange-400 bg-orange-100 text-orange-950"
                              : "border-orange-200 bg-white text-[#5E4636] hover:bg-orange-50"
                          }`}
                        >
                          {m.role === "captain" && (
                            <Crown className="h-3 w-3 text-orange-700" />
                          )}
                          {m.name}
                        </button>
                      ))
                    )}
                  </div>

                  {team.inventory.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1 border-t border-orange-100 pt-1.5">
                      {team.inventory.map((itemId, i) => {
                        const def = BLACK_MARKET_ITEMS.find(
                          (b) => b.id === itemId
                        );
                        return (
                          <span
                            key={`${itemId}-${i}`}
                            className="rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold text-violet-900"
                          >
                            🛒 {def?.name ?? itemId}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Formative Assessment Matrix */}
          <div className="surface-card rounded-3xl p-4">
            <div className="mb-3 text-xs font-bold text-[#231710]">
              Матриця засвоєння тем (Формативне оцінювання)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-orange-200 text-[11px] text-[#826754]">
                    <th className="py-1.5 pr-2">Команда</th>
                    {(["3.9.1", "3.9.2", "3.9.3", "3.9.4"] as TopicCode[]).map(
                      (t) => (
                        <th key={t} className="px-1.5 py-1.5 text-center">
                          {t}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-orange-100">
                  {activeTeamIds.map((tid) => {
                    const team = state.teams[tid];
                    return (
                      <tr key={tid}>
                        <td className="py-2 pr-2 font-bold text-[#231710]">
                          {team.shortName}
                        </td>
                        {(
                          ["3.9.1", "3.9.2", "3.9.3", "3.9.4"] as TopicCode[]
                        ).map((topic) => {
                          const s = team.stats[topic];
                          const color =
                            s.attempted === 0
                              ? "text-[#826754]"
                              : s.correct === s.attempted
                              ? "text-emerald-700 font-extrabold"
                              : s.correct === 0
                              ? "text-rose-700 font-extrabold"
                              : "text-orange-800 font-extrabold";
                          return (
                            <td
                              key={topic}
                              className={`px-1.5 py-2 text-center font-mono-num ${color}`}
                            >
                              {s.attempted > 0
                                ? `${s.correct}/${s.attempted}`
                                : "—"}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {state.history.length > 0 && (
              <div className="mt-3 max-h-36 space-y-1.5 overflow-y-auto border-t border-orange-100 pt-2.5 text-[11px]">
                {[...state.history].reverse().map((h) => (
                  <div
                    key={h.id}
                    className="flex items-center justify-between gap-2 text-[#5E4636]"
                  >
                    <span className="truncate font-medium">
                      {state.teams[h.buyerTeamId].shortName}: {h.lotTitle}
                    </span>
                    <span
                      className={`font-mono-num shrink-0 font-bold ${
                        h.netDelta >= 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {formatDelta(h.netDelta)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* INDIVIDUAL STUDENT JOURNAL & COPYABLE TABLE */}
      <section className="surface-card mt-4 rounded-3xl p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-[#231710]">
              Індивідуальний журнал відповідей студентів (тести та конструктори)
            </h2>
            <p className="text-xs text-[#5E4636]">
              Фіксується голос кожного учасника тієї команди, яка купила
              завдання (хто що обрав). Відкриті усні питання викладач оцінює
              самостійно.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copyStudentTable}
              className="btn-press inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-orange-300 bg-orange-50 px-3.5 py-1.5 text-xs font-bold text-orange-950 hover:bg-orange-100"
            >
              {copiedStudentTable ? (
                <Check className="h-3.5 w-3.5 text-emerald-700" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copiedStudentTable
                ? "Таблицю скопійовано"
                : "Копіювати таблицю (Excel / Sheets)"}
            </button>
            <button
              type="button"
              onClick={downloadStudentCsv}
              className="btn-press inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100"
            >
              <Download className="h-3.5 w-3.5" /> CSV по студентах
            </button>
          </div>
        </div>

        {studentRows.length === 0 ? (
          <div className="rounded-2xl border border-orange-100 bg-[#FFFBF7] px-4 py-6 text-center text-xs text-[#826754]">
            Ще немає підключених студентів або зафіксованих відповідей.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead>
                <tr className="border-b border-orange-200 text-[11px] font-bold text-[#826754]">
                  <th className="py-2 pr-3">Студент</th>
                  <th className="px-2 py-2">Команда</th>
                  <th className="px-2 py-2 text-center">Точних / Всього</th>
                  {evaluatedLotCols.map((col) => (
                    <th
                      key={col.lotId}
                      className="px-2 py-2 text-center font-mono-num"
                      title={`Тема ${col.topic}`}
                    >
                      {col.ticker}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-orange-100">
                {studentRows.map((st) => (
                  <tr key={st.playerId} className="hover:bg-orange-50/40">
                    <td className="py-2 pr-3 font-bold text-[#231710]">
                      {st.name}
                      <span className="ml-1.5 text-[10px] font-medium text-[#826754]">
                        ({st.roleLabel})
                      </span>
                    </td>
                    <td className="px-2 py-2 font-medium text-[#5E4636]">
                      {st.teamName}
                    </td>
                    <td className="px-2 py-2 text-center font-mono-num font-extrabold text-[#231710]">
                      {st.votedCount > 0 ? (
                        <>
                          {st.exactCount}/{st.votedCount}{" "}
                          <span className="text-[11px] font-semibold text-orange-800">
                            ({st.accuracyPct}%)
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    {evaluatedLotCols.map((col) => {
                      const rec = st.byLot[col.lotId];
                      if (!rec) {
                        return (
                          <td
                            key={col.lotId}
                            className="px-2 py-2 text-center text-[#826754]"
                          >
                            —
                          </td>
                        );
                      }
                      const badgeCls = rec.isExact
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : rec.isPartial
                        ? "border-amber-300 bg-amber-50 text-amber-800"
                        : "border-rose-300 bg-rose-50 text-rose-800";
                      const badgeText = rec.isExact
                        ? "✓"
                        : rec.isPartial
                        ? `~${rec.correctCount}/${rec.totalCount}`
                        : "✕";
                      return (
                        <td key={col.lotId} className="px-1.5 py-2 text-center">
                          <span
                            title={`${rec.ticker}: ${rec.answerSummary}`}
                            className={`inline-block rounded-lg border px-2 py-0.5 font-mono-num text-[11px] font-bold ${badgeCls}`}
                          >
                            {badgeText} {rec.answerSummary}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
