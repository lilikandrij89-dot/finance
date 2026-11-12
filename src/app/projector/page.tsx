"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import {
  AlertTriangle,
  Award,
  Clock,
  Crown,
  Flame,
  Landmark,
  Lock,
  Radio,
  ShieldAlert,
  ShoppingBag,
  Smartphone,
  Sparkles,
  TrendingDown,
  TrendingUp,
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
  getLeaderboard,
  getRiskTierMeta,
} from "@/lib/formatters";
import { getNetWorth } from "@/lib/game-engine";
import {
  buildPlayJoinUrl,
  generateQrMatrix,
  PUBLIC_APP_URL,
  qrMatrixToSvgPath,
} from "@/lib/qr-svg";
import { isSupabaseConfigured } from "@/lib/supabase";
import { GamePhase } from "@/types/game";

const PHASE_LABELS: Record<GamePhase, string> = {
  lobby: "Реєстрація команд",
  marketplace: "Вітрина активів · Вибір лота",
  spotlight: "Активне питання та ставки",
  review: "Перевірка відповіді викладачем",
  reveal: "Розбір відповіді та виплати",
  round_summary: "Підсумок раунду",
  black_market: "Чорний ринок інсайдерів",
  roulette: "Фінансова рулетка",
  finished: "Підсумки сесії",
};

export default function ProjectorPage() {
  const roomId = useRoomId();
  const { state, connected, clockOffsetMs } = useGameRoom(roomId);
  const { totalSeconds, isPaused } = useCountdown(
    state?.spotlight ?? null,
    clockOffsetMs
  );
  const celebratedRef = useRef<string | null>(null);
  const [joinOrigin, setJoinOrigin] = useState<string>(PUBLIC_APP_URL);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setJoinOrigin(window.location.origin);
    }
  }, []);

  const joinUrl = useMemo(
    () => buildPlayJoinUrl(roomId, joinOrigin),
    [joinOrigin, roomId]
  );

  const qrMatrix = useMemo(() => generateQrMatrix(joinUrl), [joinUrl]);
  const qrPath = useMemo(() => qrMatrixToSvgPath(qrMatrix.modules), [qrMatrix]);

  useEffect(() => {
    if (!state) return;
    if (
      state.phase === "reveal" &&
      state.spotlight?.isCorrect &&
      celebratedRef.current !== state.spotlight.lotId
    ) {
      celebratedRef.current = state.spotlight.lotId;
      confetti({
        particleCount: 90,
        spread: 75,
        origin: { y: 0.65 },
      });
    } else if (state.phase === "finished" && celebratedRef.current !== "finished") {
      celebratedRef.current = "finished";
      confetti({
        particleCount: 160,
        spread: 110,
        origin: { y: 0.5 },
      });
    }
  }, [state]);

  if (!state) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-base font-medium text-[#5E4636]">
        Підключення до біржового термінала…
      </div>
    );
  }

  const allTeamsLobby = getLeaderboard(state, true);
  const leaderboard = getLeaderboard(state, state.phase === "lobby");
  const maxNet = Math.max(12000, ...leaderboard.map((t) => getNetWorth(t)));
  const roundMeta = ROUND_METADATA[state.round];
  const roundLots = getLotsForRound(state.round);
  const activeDraftTeamId = state.draftQueue[state.draftPointer];
  const activeDraftTeam = activeDraftTeamId
    ? state.teams[activeDraftTeamId]
    : null;
  const spotlightLot = state.spotlight
    ? getLotById(state.spotlight.lotId)
    : undefined;
  const buyerTeam = state.spotlight
    ? state.teams[state.spotlight.buyerTeamId]
    : undefined;

  const activeRouletteSector = state.roulette.targetSectorId
    ? ROULETTE_SECTORS.find((s) => s.id === state.roulette.targetSectorId)
    : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1600px] flex-col justify-between px-5 py-5 lg:px-8">
      {/* Top Header */}
      <header className="surface-card mb-5 flex flex-wrap items-center justify-between gap-4 rounded-3xl px-6 py-4">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-700 text-white shadow-sm">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-lg font-bold tracking-tight text-[#231710] lg:text-xl">
                ФІНАНСОВИЙ ШТОРМ
              </h1>
              <span className="rounded-full border border-orange-300 bg-orange-100 px-3 py-0.5 text-xs font-bold text-orange-900">
                {PHASE_LABELS[state.phase]}
              </span>
            </div>
            <div className="mt-0.5 text-xs text-[#5E4636] lg:text-sm">
              {roundMeta.title} — {roundMeta.subtitle}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Round stepper */}
          <div className="hidden items-center gap-1 rounded-xl border border-orange-200 bg-orange-50 p-1 sm:flex">
            {([1, 2, 3, 4] as const).map((r) => (
              <span
                key={r}
                className={`rounded-lg px-2.5 py-1 font-mono-num text-xs font-bold ${
                  state.round === r
                    ? "bg-orange-700 text-white"
                    : "text-[#826754]"
                }`}
              >
                Р{r}
              </span>
            ))}
          </div>

          {state.shortSqueezeEventActive && (
            <span className="inline-flex animate-pulse items-center gap-1.5 rounded-full border border-rose-300 bg-rose-50 px-3.5 py-1.5 text-xs font-bold text-rose-800">
              <Flame className="h-4 w-4" /> ШОРТ-СКВІЗ
            </span>
          )}
          {state.roundLeverageMultiplier === 2 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-300 bg-violet-50 px-3.5 py-1.5 text-xs font-bold text-violet-800">
              <Sparkles className="h-4 w-4" /> Плече x2
            </span>
          )}
          {state.jackpotPool > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-300 bg-orange-100 px-3.5 py-1.5 font-mono-num text-xs font-bold text-orange-900">
              <Award className="h-4 w-4" /> Джекпот: {formatMoney(state.jackpotPool)}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
              connected
                ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                : "border-rose-300 bg-rose-50 text-rose-800"
            }`}
          >
            <Radio className="h-3.5 w-3.5" />
            {connected ? "Онлайн" : "Офлайн"}
          </span>
        </div>
      </header>

      {/* Main Layout */}
      <div className="grid flex-1 gap-6 lg:grid-cols-12">
        {/* LEFT STAGE */}
        <main className="surface-card flex min-w-0 flex-col justify-between rounded-3xl p-6 lg:col-span-8 lg:p-7">
          {state.lastAnnouncement && (
            <div className="mb-5 flex items-center gap-2.5 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-semibold text-orange-950">
              <Sparkles className="h-4 w-4 shrink-0 text-orange-700" />
              <span>{state.lastAnnouncement}</span>
            </div>
          )}

          {/* PHASE: LOBBY */}
          {state.phase === "lobby" && (
            <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
              <div className="mb-8 flex w-full max-w-4xl flex-col items-center justify-between gap-6 rounded-3xl border border-orange-200 bg-[#FFFDFB] p-6 text-left shadow-sm md:flex-row">
                <div className="min-w-0 flex-1 space-y-3">
                  <div className="inline-flex items-center gap-2 rounded-full border border-orange-300 bg-orange-100 px-3.5 py-1 text-xs font-bold text-orange-900">
                    <Smartphone className="h-3.5 w-3.5" />
                    <span>
                      Підключайтесь зі смартфонів
                      {roomId !== "default-room" ? ` · Кімната: ${roomId}` : ""}
                    </span>
                  </div>
                  <h2 className="font-display text-3xl font-bold text-[#231710] lg:text-4xl">
                    Збираємо гравців у команди
                  </h2>
                  <p className="text-base leading-relaxed text-[#5E4636]">
                    Стартовий капітал кожної команди —{" "}
                    <strong className="font-mono-num text-orange-800">
                      $10 000
                    </strong>
                    . Порожні команди без підключених гравців не беруть участі
                    в торгах.
                  </p>
                  <a
                    href={joinUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block max-w-full break-all rounded-xl border border-orange-200 bg-orange-50/80 px-3.5 py-2 font-mono-num text-sm font-bold text-orange-950 underline decoration-orange-300 underline-offset-4 transition hover:bg-orange-100"
                  >
                    {joinUrl}
                  </a>
                </div>
                <div className="flex shrink-0 flex-col items-center gap-2.5 rounded-2xl border-2 border-orange-200 bg-white p-4 shadow-md">
                  <svg
                    viewBox={`0 0 ${qrMatrix.size + 8} ${qrMatrix.size + 8}`}
                    className="h-52 w-52 sm:h-56 sm:w-56"
                    shapeRendering="crispEdges"
                    role="img"
                    aria-label={`QR-код для входу до гри (${joinUrl})`}
                  >
                    <rect
                      x={0}
                      y={0}
                      width={qrMatrix.size + 8}
                      height={qrMatrix.size + 8}
                      fill="#ffffff"
                    />
                    <g transform="translate(4,4)">
                      <path d={qrPath} fill="#000000" />
                    </g>
                  </svg>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#231710]">
                    Скануйте камерою
                  </span>
                </div>
              </div>

              <div className="grid w-full max-w-4xl grid-cols-2 gap-3.5 sm:grid-cols-5">
                {allTeamsLobby.map((team) => {
                  const members = Object.values(state.players).filter(
                    (p) => p.teamId === team.id
                  );
                  const isActive = members.length > 0;
                  return (
                    <div
                      key={team.id}
                      className={`rounded-2xl border p-4 text-left transition ${
                        isActive
                          ? "border-orange-300 bg-orange-50/70 shadow-sm"
                          : "border-orange-100 bg-[#FFFDFB] opacity-70"
                      }`}
                    >
                      <div className="mb-2 flex items-center gap-2">
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: team.color }}
                        />
                        <span className="truncate text-sm font-bold text-[#231710]">
                          {team.shortName}
                        </span>
                      </div>
                      <div className="font-mono-num text-xl font-extrabold text-orange-800">
                        {members.length}
                        <span className="text-xs font-medium text-[#826754]">
                          {" "}
                          / 5 осіб
                        </span>
                      </div>
                      <div className="mt-2.5 space-y-1 text-xs text-[#5E4636]">
                        {members.length === 0 ? (
                          <span className="text-[11px] text-[#826754]">
                            Очікуємо гравців…
                          </span>
                        ) : (
                          members.slice(0, 5).map((m) => (
                            <div key={m.id} className="truncate font-medium">
                              {m.role === "captain" ? "👑 " : "• "}
                              {m.name}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PHASE: MARKETPLACE */}
          {state.phase === "marketplace" && (
            <div className="flex flex-1 flex-col">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-2xl font-bold text-[#231710]">
                    Вітрина активів · Раунд {state.round}
                  </h2>
                  <p className="mt-1 text-sm text-[#5E4636]">
                    Крок вибору{" "}
                    <strong className="font-mono-num text-[#231710]">
                      {state.draftPointer + 1}
                    </strong>{" "}
                    з{" "}
                    <strong className="font-mono-num text-[#231710]">
                      {state.draftQueue.length}
                    </strong>{" "}
                    · першими обирають команди з нижчим капіталом
                  </p>
                </div>

                {activeDraftTeam && (
                  <div
                    className="flex items-center gap-3 rounded-2xl border-2 bg-orange-50 px-5 py-3 shadow-sm"
                    style={{ borderColor: activeDraftTeam.color }}
                  >
                    <span className="text-xs font-bold text-[#5E4636]">
                      Зараз обирає:
                    </span>
                    <span className="font-display text-lg font-bold text-[#231710]">
                      {activeDraftTeam.name}
                    </span>
                  </div>
                )}
              </div>

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {roundLots.map((lot) => {
                  const soldRecord = state.history.find((h) => h.lotId === lot.id);
                  const isSold = state.purchasedLotIds.includes(lot.id);
                  const tierMeta = getRiskTierMeta(lot.riskTier);
                  const buyer = soldRecord
                    ? state.teams[soldRecord.buyerTeamId]
                    : null;

                  return (
                    <div
                      key={lot.id}
                      className={`flex flex-col justify-between rounded-2xl border p-4 transition ${
                        isSold
                          ? "border-orange-100 bg-orange-50/40 opacity-55"
                          : `${tierMeta.borderClass} bg-[#FFFDFB] shadow-sm`
                      }`}
                    >
                      <div>
                        <div className="mb-2.5 flex items-center justify-between gap-2">
                          <span
                            className={`rounded-lg border px-2.5 py-0.5 text-[11px] font-bold ${tierMeta.badgeClass}`}
                          >
                            {tierMeta.label}
                          </span>
                          <span className="font-mono-num text-xs font-bold text-[#826754]">
                            {lot.ticker}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-[#231710]">
                          {lot.title}
                        </h3>
                        <p className="mt-1.5 text-xs leading-relaxed text-[#5E4636]">
                          {lot.isMystery
                            ? "Секретний лот: умова відкривається після купівлі"
                            : lot.questionType === "single"
                            ? "Формат: тест / практичний кейс"
                            : lot.questionType === "multi"
                            ? "Формат: конструктор вибору"
                            : lot.questionType === "order"
                            ? "Формат: конструктор послідовності"
                            : lot.questionType === "match"
                            ? "Формат: конструктор пар"
                            : lot.questionType === "open"
                            ? "Формат: усна відповідь ведучому"
                            : "Формат: матриця класифікації"}
                        </p>
                      </div>

                      <div className="mt-4 flex items-end justify-between border-t border-orange-100 pt-3">
                        <div>
                          <div className="text-[11px] font-medium text-[#826754]">
                            Ціна входу
                          </div>
                          <div className="font-mono-num text-lg font-extrabold text-orange-800">
                            {formatMoney(lot.price)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[11px] font-medium text-[#826754]">
                            Прибуток
                          </div>
                          <div className="font-mono-num text-base font-extrabold text-emerald-700">
                            +{formatMoney(lot.reward * state.roundLeverageMultiplier)}
                          </div>
                        </div>
                      </div>

                      {isSold && (
                        <div className="mt-2.5 flex items-center justify-between rounded-xl bg-orange-100/70 px-3 py-1.5 text-xs font-bold text-[#5E4636]">
                          <span className="inline-flex items-center gap-1">
                            <Lock className="h-3.5 w-3.5" /> Викуплено
                          </span>
                          {buyer && (
                            <span style={{ color: buyer.color }}>
                              {buyer.shortName}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* PHASE: SPOTLIGHT, REVIEW & REVEAL */}
          {(state.phase === "spotlight" ||
            state.phase === "review" ||
            state.phase === "reveal") &&
            spotlightLot &&
            buyerTeam && (
              <div className="flex flex-1 flex-col justify-between space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-orange-200 pb-4">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-4 w-4 shrink-0 rounded-full"
                      style={{ backgroundColor: buyerTeam.color }}
                    />
                    <div>
                      <div className="text-xs font-bold text-[#826754]">
                        [{spotlightLot.ticker}]{" "}
                        {getRiskTierMeta(spotlightLot.riskTier).label}
                      </div>
                      <h2 className="font-display text-xl font-bold text-[#231710] lg:text-2xl">
                        {buyerTeam.name} — {spotlightLot.title}
                      </h2>
                    </div>
                  </div>

                  {state.phase === "spotlight" ? (
                    <div
                      className={`flex items-center gap-2 rounded-2xl border-2 px-5 py-2 font-mono-num text-2xl font-extrabold ${
                        totalSeconds <= 10
                          ? "animate-pulse border-rose-400 bg-rose-50 text-rose-800"
                          : "border-orange-300 bg-orange-100 text-orange-900"
                      }`}
                    >
                      <Clock className="h-6 w-6" />
                      {isPaused ? "ПАУЗА" : `${totalSeconds}с`}
                    </div>
                  ) : state.phase === "review" ? (
                    <div className="rounded-2xl border-2 border-amber-400 bg-amber-50 px-5 py-2 font-display text-base font-bold text-amber-900">
                      НА ПЕРЕВІРЦІ У ВЕДУЧОГО
                    </div>
                  ) : (
                    <div
                      className={`rounded-2xl border-2 px-5 py-2 font-display text-base font-bold ${
                        state.spotlight?.isCorrect
                          ? "border-emerald-400 bg-emerald-50 text-emerald-800"
                          : state.spotlight?.isPartialCredit
                          ? "border-amber-400 bg-amber-50 text-amber-900"
                          : "border-rose-400 bg-rose-50 text-rose-800"
                      }`}
                    >
                      {state.spotlight?.isCorrect
                        ? "УГОДА УСПІШНА"
                        : state.spotlight?.isPartialCredit
                        ? `ЧАСТКОВИЙ ЗАЛІК (${
                            state.spotlight.scoreCorrect ?? 0
                          }/${state.spotlight.scoreTotal ?? 0})`
                        : "ДЕФОЛТ ПО УГОДІ"}
                    </div>
                  )}
                </div>

                {/* Question card */}
                <div className="rounded-2xl border border-orange-200 bg-[#FFFBF7] p-6">
                  <p className="text-lg font-bold leading-relaxed text-[#231710] lg:text-xl">
                    {spotlightLot.prompt}
                  </p>

                  {spotlightLot.questionType === "open" && (
                    <div className="mt-5 space-y-3">
                      {state.phase === "spotlight" ? (
                        <div className="space-y-2.5">
                          <div className="rounded-2xl border border-orange-200 bg-orange-50/70 px-4 py-3 text-sm font-semibold text-[#5E4636]">
                            🎤 Усне питання: команда обговорює аргументи та
                            відповідатиме наживо ведучому.
                          </div>
                          {state.spotlight?.revealedPairIds.includes("0") &&
                            spotlightLot.samplePoints[0] && (
                              <div className="rounded-xl border border-purple-300 bg-purple-50 px-4 py-2.5 text-sm text-purple-900">
                                <strong>Інсайд-орієнтир:</strong>{" "}
                                {spotlightLot.samplePoints[0]}
                              </div>
                            )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="rounded-2xl border-2 border-orange-300 bg-white p-4">
                            <div className="mb-1 text-xs font-extrabold uppercase tracking-wider text-orange-800">
                              Усна відповідь команди {buyerTeam.shortName}:
                            </div>
                            <p className="text-base font-medium leading-relaxed text-[#231710]">
                              {state.phase === "review"
                                ? "🎤 Команда озвучує аргументовану відповідь наживо — ведучий приймає рішення."
                                : "Усна відповідь команди оцінена ведучим."}
                            </p>
                          </div>
                          {state.phase === "reveal" && (
                            <div className="rounded-2xl border border-emerald-300 bg-emerald-50/70 p-4">
                              <div className="mb-2 text-xs font-extrabold uppercase tracking-wider text-emerald-900">
                                Ключові орієнтири відповіді:
                              </div>
                              <ul className="space-y-1.5 text-sm text-[#231710]">
                                {spotlightLot.samplePoints.map((pt, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="font-bold text-emerald-700">
                                      {i + 1}.
                                    </span>
                                    <span>{pt}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {(spotlightLot.questionType === "single" ||
                    spotlightLot.questionType === "multi") && (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {spotlightLot.options.map((opt) => {
                        const isHidden = state.spotlight?.hiddenOptionIds.includes(
                          opt.id
                        );
                        const isRevealCorrect =
                          state.phase === "reveal" &&
                          ((spotlightLot.questionType === "single" &&
                            spotlightLot.correctOptionId === opt.id) ||
                            (spotlightLot.questionType === "multi" &&
                              spotlightLot.correctOptionIds.includes(opt.id)));

                        const submitted = state.spotlight?.submittedAnswer;
                        const wasChosenByTeam =
                          state.phase === "reveal" &&
                          ((submitted?.type === "single" &&
                            submitted.optionId === opt.id) ||
                            (submitted?.type === "multi" &&
                              submitted.optionIds.includes(opt.id)));
                        const isWrongTeamPick = wasChosenByTeam && !isRevealCorrect;

                        return (
                          <div
                            key={opt.id}
                            className={`flex items-start justify-between gap-2 rounded-2xl border p-3.5 text-sm ${
                              isRevealCorrect
                                ? "border-emerald-500 bg-emerald-50 font-semibold text-emerald-950"
                                : isWrongTeamPick
                                ? "border-rose-400 bg-rose-50 text-rose-950"
                                : isHidden
                                ? "border-orange-100 bg-orange-50/40 text-[#826754] opacity-35 line-through"
                                : "border-orange-200 bg-white text-[#231710]"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono-num text-xs font-bold ${
                                  isRevealCorrect
                                    ? "bg-emerald-700 text-white"
                                    : isWrongTeamPick
                                    ? "bg-rose-700 text-white"
                                    : "bg-orange-100 text-orange-900"
                                }`}
                              >
                                {opt.label}
                              </span>
                              <span className="leading-snug">{opt.text}</span>
                            </div>
                            {wasChosenByTeam && (
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  isRevealCorrect
                                    ? "bg-emerald-200 text-emerald-950"
                                    : "bg-rose-200 text-rose-950"
                                }`}
                              >
                                Вибір команди
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {spotlightLot.questionType === "order" && (
                    <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                      {(state.phase === "reveal"
                        ? spotlightLot.correctOrder
                            .map((id) =>
                              spotlightLot.items.find((i) => i.id === id)
                            )
                            .filter((x): x is NonNullable<typeof x> => Boolean(x))
                        : spotlightLot.items
                      ).map((item, idx) => (
                        <div
                          key={item.id}
                          className={`rounded-xl border p-3 text-sm ${
                            state.phase === "reveal"
                              ? "border-emerald-400 bg-emerald-50 text-emerald-950"
                              : "border-orange-200 bg-white text-[#231710]"
                          }`}
                        >
                          <strong className="mr-1.5 text-orange-800">
                            {state.phase === "reveal"
                              ? `${idx + 1}. [${item.label}]`
                              : `${item.label}.`}
                          </strong>
                          {item.text}
                        </div>
                      ))}
                    </div>
                  )}

                  {spotlightLot.questionType === "match" && (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        {spotlightLot.leftItems.map((l) => {
                          const correctRight =
                            state.phase === "reveal"
                              ? spotlightLot.rightOptions.find(
                                  (r) => r.id === spotlightLot.correctPairs[l.id]
                                )
                              : null;
                          return (
                            <div
                              key={l.id}
                              className={`rounded-xl border px-3.5 py-2.5 text-sm font-semibold ${
                                correctRight
                                  ? "border-emerald-400 bg-emerald-50 text-emerald-950"
                                  : "border-orange-200 bg-white text-[#231710]"
                              }`}
                            >
                              <div>
                                <strong className="text-orange-800">
                                  {l.label}.
                                </strong>{" "}
                                {l.text}
                              </div>
                              {correctRight && (
                                <div className="mt-1 text-xs font-bold text-emerald-800">
                                  → {correctRight.label}) {correctRight.text}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <div className="space-y-2">
                        {spotlightLot.rightOptions.map((r) => (
                          <div
                            key={r.id}
                            className="rounded-xl border border-orange-200 bg-orange-50/60 px-3.5 py-2.5 text-xs text-[#5E4636]"
                          >
                            <strong className="text-orange-900">{r.label})</strong>{" "}
                            {r.text}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {spotlightLot.questionType === "classify" &&
                    (state.phase === "reveal" ? (
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {spotlightLot.buckets.map((bucket) => (
                          <div
                            key={bucket.id}
                            className="rounded-2xl border border-emerald-400 bg-emerald-50/70 p-3.5"
                          >
                            <div className="mb-2 text-xs font-extrabold text-emerald-900">
                              {bucket.title}
                            </div>
                            <div className="space-y-1.5">
                              {spotlightLot.items
                                .filter(
                                  (item) =>
                                    spotlightLot.correctBuckets[item.id] ===
                                    bucket.id
                                )
                                .map((item) => (
                                  <div
                                    key={item.id}
                                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-medium text-[#231710]"
                                  >
                                    <strong className="text-emerald-800">
                                      {item.label}.
                                    </strong>{" "}
                                    {item.text}
                                  </div>
                                ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        <div className="flex flex-wrap gap-2">
                          {spotlightLot.buckets.map((b) => (
                            <span
                              key={b.id}
                              className="rounded-xl border border-orange-300 bg-orange-100 px-3 py-1 text-xs font-bold text-orange-950"
                            >
                              Категорія: {b.title}
                            </span>
                          ))}
                        </div>
                        <div className="grid gap-2.5 sm:grid-cols-2">
                          {spotlightLot.items.map((item) => (
                            <div
                              key={item.id}
                              className="rounded-xl border border-orange-200 bg-white px-3.5 py-2.5 text-xs font-medium text-[#231710]"
                            >
                              <strong className="text-orange-800">
                                {item.label}.
                              </strong>{" "}
                              {item.text}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                </div>

                {/* Bets, Review Status, or Reveal Settlement */}
                {state.phase === "spotlight" ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3">
                    <div className="text-sm font-semibold text-[#5E4636]">
                      {spotlightLot.riskTier === "derivative" ||
                      state.shortSqueezeEventActive ? (
                        <span className="inline-flex items-center gap-2 text-rose-800">
                          <Flame className="h-4 w-4" /> Ставки Long / Short
                          відкрито на смартфонах інших команд
                        </span>
                      ) : (
                        <span>
                          Очікуємо відповідь команди{" "}
                          <strong className="text-[#231710]">
                            {buyerTeam.name}
                          </strong>
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.values(state.spotlight?.bets ?? {}).map((bet) => (
                        <span
                          key={bet.teamId}
                          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-mono-num text-xs font-bold ${
                            bet.side === "long"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                              : "border-rose-300 bg-rose-50 text-rose-800"
                          }`}
                        >
                          {bet.side === "long" ? (
                            <TrendingUp className="h-3.5 w-3.5" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5" />
                          )}
                          {state.teams[bet.teamId].shortName}:{" "}
                          {bet.side.toUpperCase()} {formatMoney(bet.amount)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : state.phase === "review" ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3.5">
                    <div className="text-sm font-bold text-amber-950">
                      Ведучий оцінює відкриту відповідь команди{" "}
                      <span className="underline">{buyerTeam.name}</span> у пульті
                      керування…
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Object.values(state.spotlight?.bets ?? {}).map((bet) => (
                        <span
                          key={bet.teamId}
                          className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-mono-num text-xs font-bold ${
                            bet.side === "long"
                              ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                              : "border-rose-300 bg-rose-50 text-rose-800"
                          }`}
                        >
                          {bet.side === "long" ? (
                            <TrendingUp className="h-3.5 w-3.5" />
                          ) : (
                            <TrendingDown className="h-3.5 w-3.5" />
                          )}
                          {state.teams[bet.teamId].shortName}:{" "}
                          {bet.side.toUpperCase()} {formatMoney(bet.amount)}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`space-y-3 rounded-2xl border p-5 ${
                      state.spotlight?.isPartialCredit
                        ? "border-amber-300 bg-amber-50/70"
                        : "border-emerald-300 bg-emerald-50/70"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div
                        className={`text-base font-extrabold ${
                          state.spotlight?.isPartialCredit
                            ? "text-amber-950"
                            : "text-emerald-900"
                        }`}
                      >
                        Правильна відповідь: {spotlightLot.correctSummary}
                      </div>
                      {state.spotlight?.shortSqueezeTriggered && (
                        <span className="rounded-full border border-rose-300 bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
                          📉 Спрацював ШОРТ-СКВІЗ
                        </span>
                      )}
                    </div>
                    {state.spotlight?.isPartialCredit &&
                      state.spotlight.settlements[0] && (
                        <div className="rounded-xl border border-amber-300 bg-white/80 px-3.5 py-2 text-xs font-bold text-amber-900">
                          {state.spotlight.settlements[0].reason}
                        </div>
                      )}
                    <p className="text-sm leading-relaxed text-[#231710]">
                      {spotlightLot.teacherExplanation}
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {state.spotlight?.settlements.map((s) => (
                        <div
                          key={s.teamId}
                          className="rounded-xl border border-orange-200 bg-white px-3.5 py-2 text-xs shadow-xs"
                        >
                          <span className="font-bold text-[#231710]">
                            {state.teams[s.teamId].shortName}:{" "}
                          </span>
                          <span
                            className={`font-mono-num font-extrabold ${
                              s.deltaBalance >= 0
                                ? "text-emerald-700"
                                : "text-rose-700"
                            }`}
                          >
                            {formatDelta(s.deltaBalance)}
                          </span>
                          {s.sanationTriggered && (
                            <span className="ml-1.5 font-semibold text-orange-800">
                              (Санація НБУ)
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

          {/* PHASE: ROUND SUMMARY */}
          {state.phase === "round_summary" && (
            <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
              <div className="mb-3 rounded-full border border-emerald-300 bg-emerald-50 px-4 py-1 text-xs font-bold text-emerald-800">
                Раунд {state.round} завершено
              </div>
              <h2 className="font-display mb-3 text-3xl font-bold text-[#231710]">
                Перерва між раундами
              </h2>
              <p className="max-w-lg text-base leading-relaxed text-[#5E4636]">
                Викладач може запустити 🎡 Фінансову рулетку, відкрити 🛒 Чорний
                ринок або розпочати наступний раунд.
              </p>
            </div>
          )}

          {/* PHASE: BLACK MARKET */}
          {state.phase === "black_market" && (
            <div className="flex flex-1 flex-col justify-center">
              <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-800">
                    <ShoppingBag className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="font-display text-2xl font-bold text-[#231710]">
                      Чорний ринок інсайдерів
                    </h2>
                    <p className="text-sm text-[#5E4636]">
                      Кожна команда може придбати 1 спецзасіб зі смартфона Капітана
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {leaderboard.map((team) => (
                    <span
                      key={team.id}
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${
                        team.usedBlackMarketThisRound
                          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                          : "border-orange-200 bg-white text-[#5E4636]"
                      }`}
                    >
                      {team.shortName}:{" "}
                      {team.usedBlackMarketThisRound ? "✓ Куплено" : "Обирає…"}
                    </span>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {BLACK_MARKET_ITEMS.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-[#231710]">
                        {item.name}
                      </h3>
                      <span className="font-mono-num rounded-lg bg-violet-700 px-2.5 py-1 text-xs font-bold text-white">
                        {formatMoney(item.price)}
                      </span>
                    </div>
                    <p className="text-sm leading-relaxed text-[#5E4636]">
                      {item.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* PHASE: ROULETTE */}
          {state.phase === "roulette" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-8 py-4 lg:flex-row">
              <RouletteWheel
                spinId={state.roulette.spinId}
                targetSectorId={state.roulette.targetSectorId}
                isSpinning={state.roulette.isSpinning}
                size={340}
              />
              <div className="max-w-sm space-y-3 text-center lg:text-left">
                <div className="font-display text-2xl font-bold text-orange-800">
                  ФІНАНСОВА РУЛЕТКА
                </div>
                {state.roulette.isSpinning && !state.roulette.applied ? (
                  <div className="rounded-2xl border border-orange-300 bg-orange-50 p-5">
                    <div className="text-base font-extrabold text-orange-950">
                      Колесо обертається…
                    </div>
                    <p className="mt-1 text-sm text-[#5E4636]">
                      Тримаємо інтригу! Сектор визначиться після зупинки
                      стрілки.
                    </p>
                  </div>
                ) : activeRouletteSector && state.roulette.applied ? (
                  <div className="space-y-2.5 rounded-2xl border border-emerald-400 bg-emerald-50 p-5 text-left">
                    <div>
                      <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-800">
                        Випав сектор:
                      </div>
                      <div className="mt-0.5 text-2xl font-extrabold text-[#231710]">
                        {activeRouletteSector.label}
                      </div>
                    </div>
                    {state.roulette.effectLog && (
                      <div className="rounded-xl border border-emerald-200 bg-white px-3.5 py-2.5 text-sm font-bold text-emerald-950">
                        {state.roulette.effectLog}
                      </div>
                    )}
                    <p className="text-sm leading-relaxed text-[#5E4636]">
                      <strong className="text-[#231710]">Що це дає:</strong>{" "}
                      {activeRouletteSector.description}
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-[#5E4636]">
                    Очікуємо запуск колеса фортуни з пульта викладача…
                  </p>
                )}
              </div>
            </div>
          )}

          {/* PHASE: FINISHED */}
          {state.phase === "finished" && (
            <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
              <Crown className="mb-3 h-12 w-12 text-orange-700" />
              <h2 className="font-display mb-2 text-3xl font-bold text-[#231710]">
                Підсумки біржової сесії
              </h2>
              <p className="mb-6 text-sm text-[#5E4636]">
                Переможець визначається за чистим капіталом (Баланс мінус
                непогашений кредит санації)
              </p>
              <div className="grid w-full max-w-2xl gap-3">
                {leaderboard.slice(0, 3).map((team, idx) => (
                  <div
                    key={team.id}
                    className={`flex items-center justify-between rounded-2xl border p-4 ${
                      idx === 0
                        ? "border-orange-500 bg-orange-100/80 shadow-md"
                        : "border-orange-200 bg-[#FFFBF7]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-display text-2xl font-extrabold text-orange-800">
                        #{idx + 1}
                      </span>
                      <div className="text-left">
                        <div className="font-bold text-[#231710]">
                          {team.name}
                        </div>
                        <div className="text-xs text-[#5E4636]">
                          Правильних: {team.correctAnswers}/{team.lotsBought} ·
                          Ставки: {formatDelta(team.betProfit)}
                        </div>
                      </div>
                    </div>
                    <div className="font-mono-num text-2xl font-extrabold text-emerald-700">
                      {formatMoney(getNetWorth(team))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>

        {/* RIGHT SIDEBAR: LEADERBOARD */}
        <aside className="surface-card flex flex-col justify-between rounded-3xl p-5 lg:col-span-4">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-base font-bold text-[#231710]">
                Рейтинг капіталу
              </h2>
              <span className="text-xs font-semibold text-[#826754]">
                Чистий капітал
              </span>
            </div>

            <div className="space-y-3">
              {leaderboard.map((team, idx) => {
                const net = getNetWorth(team);
                const barWidth = Math.max(
                  6,
                  Math.min(100, Math.round((net / maxNet) * 100))
                );
                const isTurn =
                  state.phase === "marketplace" &&
                  activeDraftTeamId === team.id;

                return (
                  <div
                    key={team.id}
                    className={`rounded-2xl border p-3.5 transition-colors duration-300 ${
                      isTurn
                        ? "border-orange-500 bg-orange-50 shadow-sm"
                        : "border-orange-100 bg-[#FFFDFB]"
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="font-mono-num text-sm font-extrabold text-[#826754]">
                          #{idx + 1}
                        </span>
                        <span
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{ backgroundColor: team.color }}
                        />
                        <span className="truncate font-bold text-[#231710]">
                          {team.name}
                        </span>
                      </div>
                      <div className="font-mono-num text-lg font-extrabold text-[#231710]">
                        {formatMoney(net)}
                      </div>
                    </div>

                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-orange-100">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${barWidth}%`,
                          backgroundColor: team.color,
                        }}
                      />
                    </div>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs text-[#5E4636]">
                      <span>Кеш: {formatMoney(team.balance)}</span>
                      {team.debt > 0 ? (
                        <span className="inline-flex items-center gap-1 font-bold text-rose-700">
                          <Landmark className="h-3.5 w-3.5" /> Санація: -
                          {formatMoney(team.debt)}
                        </span>
                      ) : (
                        <span>
                          Угод: {team.correctAnswers}/{team.lotsBought}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="surface-tint mt-5 rounded-2xl p-3.5 text-xs text-[#5E4636]">
            <div className="mb-1 flex items-center gap-1.5 font-bold text-orange-950">
              <ShieldAlert className="h-4 w-4 text-orange-700" />
              Аутсайдер обирає актив першим
            </div>
            {state.history.length > 0 && (
              <div className="flex items-center gap-1.5 truncate text-[11px] text-[#826754]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Остання угода: {state.history[state.history.length - 1].lotTitle}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
