"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  GripVertical,
  Lock,
  Sparkles,
  Users,
} from "lucide-react";
import { AnswerPayload, MarketLot, Player, SpotlightState } from "@/types/game";

interface QuestionConstructorProps {
  lot: MarketLot;
  spotlight: SpotlightState;
  player: Player;
  teamPlayers: Player[];
  busy?: boolean;
  onVote: (answer: AnswerPayload) => void;
  onSubmit: (answer: AnswerPayload) => void;
}

export function QuestionConstructor({
  lot,
  spotlight,
  player,
  teamPlayers,
  busy = false,
  onVote,
  onSubmit,
}: QuestionConstructorProps) {
  const isCaptain = player.role === "captain";
  const myExistingVote = spotlight.analystVotes[player.id];

  const [singleId, setSingleId] = useState<string>("");
  const [multiIds, setMultiIds] = useState<string[]>([]);
  const [orderedIds, setOrderedIds] = useState<string[]>(() =>
    lot.questionType === "order" ? lot.items.map((i) => i.id) : []
  );
  const [pairs, setPairs] = useState<Record<string, string>>({});
  const [buckets, setBuckets] = useState<Record<string, string>>({});
  const [draggedOrderId, setDraggedOrderId] = useState<string | null>(null);
  const orderItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const orderedIdsRef = useRef<string[]>(orderedIds);
  const activeDragPointerIdRef = useRef<number | null>(null);

  orderedIdsRef.current = orderedIds;

  useEffect(() => {
    setSingleId("");
    setMultiIds([]);
    const initialOrder = lot.questionType === "order" ? lot.items.map((i) => i.id) : [];
    orderedIdsRef.current = initialOrder;
    setOrderedIds(initialOrder);
    setPairs({});
    setBuckets({});
    setDraggedOrderId(null);
    activeDragPointerIdRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lot.id]);

  // Clear hidden options from current selection when 50/50 activates
  useEffect(() => {
    if (spotlight.hiddenOptionIds.length === 0) return;
    setSingleId((prev) =>
      spotlight.hiddenOptionIds.includes(prev) ? "" : prev
    );
    setMultiIds((prev) =>
      prev.filter((id) => !spotlight.hiddenOptionIds.includes(id))
    );
  }, [spotlight.hiddenOptionIds]);

  // Apply Insider 50/50 hints cleanly across match, classify, and order
  useEffect(() => {
    if (spotlight.revealedPairIds.length === 0) return;
    if (lot.questionType === "match") {
      setPairs((prev) => {
        const next = { ...prev };
        for (const lid of spotlight.revealedPairIds) {
          next[lid] = lot.correctPairs[lid];
        }
        return next;
      });
    } else if (lot.questionType === "classify") {
      setBuckets((prev) => {
        const next = { ...prev };
        for (const iid of spotlight.revealedPairIds) {
          next[iid] = lot.correctBuckets[iid];
        }
        return next;
      });
    } else if (lot.questionType === "order") {
      const lockedPrefix = spotlight.revealedPairIds.filter((id) =>
        lot.items.some((i) => i.id === id)
      );
      setOrderedIds((prev) => {
        const rest = prev.filter((id) => !lockedPrefix.includes(id));
        return [...lockedPrefix, ...rest];
      });
    }
  }, [spotlight.revealedPairIds, lot]);

  const votesList = useMemo(
    () =>
      Object.entries(spotlight.analystVotes).map(([pid, ans]) => ({
        playerId: pid,
        playerName: teamPlayers.find((p) => p.id === pid)?.name ?? "Учасник",
        isAnalyst: teamPlayers.find((p) => p.id === pid)?.role !== "captain",
        answer: ans,
      })),
    [spotlight.analystVotes, teamPlayers]
  );

  const optionVoteCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const { answer } of votesList) {
      if (answer.type === "single") {
        counts[answer.optionId] = (counts[answer.optionId] ?? 0) + 1;
      } else if (answer.type === "multi") {
        for (const id of answer.optionIds) {
          counts[id] = (counts[id] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [votesList]);

  const matchVoteCounts = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const { answer } of votesList) {
      if (answer.type === "match") {
        for (const [lid, rid] of Object.entries(answer.pairs)) {
          if (!rid) continue;
          if (!map[lid]) map[lid] = {};
          map[lid][rid] = (map[lid][rid] ?? 0) + 1;
        }
      }
    }
    return map;
  }, [votesList]);

  const classifyVoteCounts = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const { answer } of votesList) {
      if (answer.type === "classify") {
        for (const [iid, bid] of Object.entries(answer.buckets)) {
          if (!bid) continue;
          if (!map[iid]) map[iid] = {};
          map[iid][bid] = (map[iid][bid] ?? 0) + 1;
        }
      }
    }
    return map;
  }, [votesList]);

  const currentPayload: AnswerPayload | null = useMemo(() => {
    if (lot.questionType === "single") {
      return singleId && !spotlight.hiddenOptionIds.includes(singleId)
        ? { type: "single", optionId: singleId }
        : null;
    }
    if (lot.questionType === "multi") {
      const clean = multiIds.filter(
        (id) => !spotlight.hiddenOptionIds.includes(id)
      );
      return clean.length === lot.requiredCount
        ? { type: "multi", optionIds: clean }
        : null;
    }
    if (lot.questionType === "order") {
      return orderedIds.length === lot.items.length
        ? { type: "order", orderedIds }
        : null;
    }
    if (lot.questionType === "match") {
      const ready = lot.leftItems.every((l) => Boolean(pairs[l.id]));
      return ready ? { type: "match", pairs } : null;
    }
    if (lot.questionType === "classify") {
      const ready = lot.items.every((i) => Boolean(buckets[i.id]));
      return ready ? { type: "classify", buckets } : null;
    }
    if (lot.questionType === "open") {
      return { type: "open", text: "Усна відповідь команди" };
    }
    return null;
  }, [
    lot,
    singleId,
    multiIds,
    orderedIds,
    pairs,
    buckets,
    spotlight.hiddenOptionIds,
  ]);

  const applyAnswerDraft = (p: AnswerPayload) => {
    if (p.type === "single" && !spotlight.hiddenOptionIds.includes(p.optionId)) {
      setSingleId(p.optionId);
    }
    if (p.type === "multi") {
      setMultiIds(
        p.optionIds.filter((id) => !spotlight.hiddenOptionIds.includes(id))
      );
    }
    if (p.type === "order" && lot.questionType === "order") {
      const lockedPrefix = spotlight.revealedPairIds.filter((id) =>
        lot.items.some((i) => i.id === id)
      );
      const rest = p.orderedIds.filter((id) => !lockedPrefix.includes(id));
      setOrderedIds([...lockedPrefix, ...rest]);
    }
    if (p.type === "match" && lot.questionType === "match") {
      const merged = { ...p.pairs };
      for (const lid of spotlight.revealedPairIds) {
        merged[lid] = lot.correctPairs[lid];
      }
      setPairs(merged);
    }
    if (p.type === "classify" && lot.questionType === "classify") {
      const merged = { ...p.buckets };
      for (const iid of spotlight.revealedPairIds) {
        merged[iid] = lot.correctBuckets[iid];
      }
      setBuckets(merged);
    }
  };

  const applyMajorityVote = () => {
    if (votesList.length === 0) return;
    const pool = votesList.some((v) => v.isAnalyst)
      ? votesList.filter((v) => v.isAnalyst)
      : votesList;
    const freq = new Map<string, { count: number; payload: AnswerPayload }>();
    for (const v of pool) {
      const key = JSON.stringify(v.answer);
      const prev = freq.get(key);
      freq.set(key, { count: (prev?.count ?? 0) + 1, payload: v.answer });
    }
    let top: { count: number; payload: AnswerPayload } | null = null;
    for (const entry of freq.values()) {
      if (!top || entry.count > top.count) top = entry;
    }
    if (top) applyAnswerDraft(top.payload);
  };

  const matchDuplicateValues = useMemo(() => {
    if (lot.questionType !== "match") return new Set<string>();
    const seen = new Set<string>();
    const dupes = new Set<string>();
    for (const val of Object.values(pairs)) {
      if (!val) continue;
      if (seen.has(val)) dupes.add(val);
      seen.add(val);
    }
    return dupes;
  }, [lot.questionType, pairs]);

  return (
    <div className="space-y-4">
      {/* Team recommendation bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-orange-200 bg-orange-50 px-3.5 py-2.5 text-xs text-[#5E4636]">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Users className="h-4 w-4 text-orange-700" />
          Голосів у команді:{" "}
          <strong className="font-mono-num text-[#231710]">
            {votesList.length}
          </strong>
        </span>
        {isCaptain && votesList.length > 0 && (
          <button
            type="button"
            onClick={applyMajorityVote}
            className="btn-press min-h-[34px] rounded-lg border border-orange-300 bg-white px-3 py-1 text-xs font-bold text-orange-900 hover:bg-orange-100"
          >
            Взяти вибір більшості
          </button>
        )}
        {!isCaptain && myExistingVote && (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-800">
            <Check className="h-3.5 w-3.5" /> Рекомендацію надіслано
          </span>
        )}
      </div>

      {/* 1. SINGLE CHOICE */}
      {lot.questionType === "single" && (
        <div className="space-y-2.5">
          {lot.options.map((opt) => {
            const hidden = spotlight.hiddenOptionIds.includes(opt.id);
            const selected = singleId === opt.id;
            const votes = optionVoteCounts[opt.id] ?? 0;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={hidden}
                onClick={() => {
                  setSingleId(opt.id);
                  onVote({ type: "single", optionId: opt.id });
                }}
                className={`btn-press flex min-h-[52px] w-full items-start justify-between gap-3 rounded-2xl border p-3.5 text-left ${
                  hidden
                    ? "cursor-not-allowed border-orange-100 bg-orange-50/40 text-[#826754] opacity-40 line-through"
                    : selected
                    ? "border-orange-600 bg-orange-50 text-[#231710] shadow-[0_0_0_2px_rgba(194,65,12,0.22)]"
                    : "border-orange-200 bg-white text-[#231710] hover:border-orange-400 hover:bg-orange-50/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono-num text-xs font-bold ${
                      selected
                        ? "bg-orange-700 text-white"
                        : "bg-orange-100 text-orange-900"
                    }`}
                  >
                    {opt.label}
                  </span>
                  <span className="text-sm leading-relaxed">{opt.text}</span>
                </div>
                {votes > 0 && (
                  <span className="shrink-0 rounded-full border border-orange-300 bg-orange-100 px-2.5 py-0.5 font-mono-num text-xs font-bold text-orange-900">
                    {votes} гол.
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 2. MULTI SELECT */}
      {lot.questionType === "multi" && (
        <div className="space-y-2.5">
          <div className="text-xs font-bold text-orange-900">
            Оберіть рівно {lot.requiredCount} варіанти (обрано {multiIds.length}/
            {lot.requiredCount})
          </div>
          {lot.options.map((opt) => {
            const hidden = spotlight.hiddenOptionIds.includes(opt.id);
            const selected = multiIds.includes(opt.id);
            const votes = optionVoteCounts[opt.id] ?? 0;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={hidden}
                onClick={() => {
                  const next = selected
                    ? multiIds.filter((id) => id !== opt.id)
                    : multiIds.length < lot.requiredCount
                    ? [...multiIds, opt.id]
                    : [...multiIds.slice(1), opt.id];
                  setMultiIds(next);
                  if (next.length === lot.requiredCount) {
                    onVote({ type: "multi", optionIds: next });
                  }
                }}
                className={`btn-press flex min-h-[52px] w-full items-start justify-between gap-3 rounded-2xl border p-3.5 text-left ${
                  hidden
                    ? "cursor-not-allowed border-orange-100 bg-orange-50/40 text-[#826754] opacity-40 line-through"
                    : selected
                    ? "border-orange-600 bg-orange-50 text-[#231710] shadow-[0_0_0_2px_rgba(194,65,12,0.22)]"
                    : "border-orange-200 bg-white text-[#231710] hover:border-orange-400"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                      selected
                        ? "bg-orange-700 text-white"
                        : "bg-orange-100 text-orange-900"
                    }`}
                  >
                    {selected ? <Check className="h-4 w-4" /> : opt.label}
                  </span>
                  <span className="text-sm leading-relaxed">{opt.text}</span>
                </div>
                {votes > 0 && (
                  <span className="shrink-0 rounded-full border border-orange-300 bg-orange-100 px-2.5 py-0.5 font-mono-num text-xs font-bold text-orange-900">
                    {votes} гол.
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* 3. ORDER SEQUENCE */}
      {lot.questionType === "order" && (
        <div className="space-y-2.5">
          <div className="text-xs font-medium text-[#5E4636]">
            Затисніть і перетягніть картку (або скористайтеся стрілками ↑ / ↓),
            щоб виставити кроки від 1 до {lot.items.length}:
          </div>

          {votesList.some((v) => v.answer.type === "order") && (
            <div className="space-y-1.5 rounded-2xl border border-orange-200 bg-orange-50/70 p-3 text-xs">
              <div className="font-bold text-orange-950">
                Рекомендації команди:
              </div>
              {votesList.map((v) => {
                if (v.answer.type !== "order") return null;
                const seqText = v.answer.orderedIds
                  .map((oid) => lot.items.find((i) => i.id === oid)?.label ?? oid)
                  .join(" → ");
                return (
                  <div
                    key={v.playerId}
                    className="flex items-center justify-between gap-2 rounded-xl border border-orange-100 bg-white px-2.5 py-1.5"
                  >
                    <span className="truncate font-semibold text-[#5E4636]">
                      {v.playerName}:{" "}
                      <strong className="font-mono-num text-[#231710]">
                        {seqText}
                      </strong>
                    </span>
                    {isCaptain && (
                      <button
                        type="button"
                        onClick={() => applyAnswerDraft(v.answer)}
                        className="btn-press shrink-0 rounded-lg border border-orange-300 bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-orange-900 hover:bg-orange-100"
                      >
                        Взяти
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {orderedIds.map((id, idx) => {
            const item = lot.items.find((i) => i.id === id);
            if (!item) return null;
            const lockedPrefixCount = spotlight.revealedPairIds.filter((rid) =>
              lot.items.some((i) => i.id === rid)
            ).length;
            const isHinted =
              spotlight.revealedPairIds.includes(id) &&
              idx < lockedPrefixCount &&
              lot.correctOrder[idx] === id;
            const isDraggingThis = draggedOrderId === id;

            const move = (dir: -1 | 1) => {
              const targetIdx = idx + dir;
              if (
                targetIdx < lockedPrefixCount ||
                targetIdx >= orderedIds.length
              ) {
                return;
              }
              const copy = [...orderedIds];
              [copy[idx], copy[targetIdx]] = [copy[targetIdx], copy[idx]];
              orderedIdsRef.current = copy;
              setOrderedIds(copy);
              onVote({ type: "order", orderedIds: copy });
            };

            const handlePointerDown = (
              e: React.PointerEvent<HTMLDivElement>
            ) => {
              if (isHinted) return;
              if (e.pointerType === "mouse" && e.button !== 0) return;
              if ((e.target as HTMLElement).closest("button")) return;
              e.preventDefault();
              activeDragPointerIdRef.current = e.pointerId;
              setDraggedOrderId(id);
              try {
                e.currentTarget.setPointerCapture(e.pointerId);
              } catch {
                // Ignore if pointer capture is unavailable
              }
            };

            const handlePointerMove = (
              e: React.PointerEvent<HTMLDivElement>
            ) => {
              if (
                draggedOrderId !== id ||
                activeDragPointerIdRef.current !== e.pointerId
              ) {
                return;
              }
              const current = orderedIdsRef.current;
              const currentIdx = current.indexOf(id);
              if (currentIdx === -1) return;

              let targetIdx = currentIdx;
              for (let i = lockedPrefixCount; i < currentIdx; i++) {
                const rect = orderItemRefs.current[current[i]]?.getBoundingClientRect();
                if (rect && e.clientY < rect.top + rect.height / 2) {
                  targetIdx = i;
                  break;
                }
              }
              if (targetIdx === currentIdx) {
                for (let i = current.length - 1; i > currentIdx; i--) {
                  const rect = orderItemRefs.current[current[i]]?.getBoundingClientRect();
                  if (rect && e.clientY > rect.top + rect.height / 2) {
                    targetIdx = i;
                    break;
                  }
                }
              }

              if (targetIdx !== currentIdx) {
                const next = [...current];
                next.splice(currentIdx, 1);
                next.splice(targetIdx, 0, id);
                orderedIdsRef.current = next;
                setOrderedIds(next);
              }
            };

            const handlePointerUpOrCancel = (
              e: React.PointerEvent<HTMLDivElement>
            ) => {
              if (activeDragPointerIdRef.current !== e.pointerId) return;
              activeDragPointerIdRef.current = null;
              setDraggedOrderId(null);
              try {
                if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                  e.currentTarget.releasePointerCapture(e.pointerId);
                }
              } catch {
                // Ignore release errors
              }
              onVote({ type: "order", orderedIds: orderedIdsRef.current });
            };

            return (
              <div
                key={id}
                ref={(el) => {
                  orderItemRefs.current[id] = el;
                }}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUpOrCancel}
                onPointerCancel={handlePointerUpOrCancel}
                className={`flex items-center justify-between gap-2 rounded-2xl border p-3 transition-shadow select-none ${
                  isHinted
                    ? "cursor-default border-emerald-400 bg-emerald-50"
                    : isDraggingThis
                    ? "relative z-20 scale-[1.02] cursor-grabbing border-orange-500 bg-orange-50 shadow-lg ring-2 ring-orange-400/70 touch-none"
                    : "cursor-grab border-orange-200 bg-white hover:border-orange-300 touch-none"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                    {isHinted ? (
                      <Lock className="h-4 w-4 text-emerald-700" />
                    ) : (
                      <GripVertical
                        className={`h-4 w-4 ${
                          isDraggingThis ? "text-orange-700" : "text-orange-400"
                        }`}
                      />
                    )}
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono-num text-xs font-bold ${
                        isHinted
                          ? "bg-emerald-700 text-white"
                          : isDraggingThis
                          ? "bg-orange-700 text-white"
                          : "bg-orange-100 text-orange-900"
                      }`}
                    >
                      {idx + 1}
                    </span>
                  </div>
                  <div className="text-sm leading-snug text-[#231710]">
                    <span className="mr-1.5 font-mono-num text-xs font-semibold text-[#826754]">
                      [{item.label}]
                    </span>
                    {item.text}
                    {isHinted && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900">
                        <Sparkles className="h-3 w-3" /> Інсайд: крок №{idx + 1}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5">
                  <button
                    type="button"
                    disabled={isHinted || idx <= lockedPrefixCount}
                    onClick={() => move(-1)}
                    className="btn-press flex h-9 w-9 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 text-orange-900 hover:bg-orange-100 disabled:opacity-30"
                    aria-label={`Перемістити крок ${item.label} вище`}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={isHinted || idx === orderedIds.length - 1}
                    onClick={() => move(1)}
                    className="btn-press flex h-9 w-9 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 text-orange-900 hover:bg-orange-100 disabled:opacity-30"
                    aria-label={`Перемістити крок ${item.label} нижче`}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 4. MATCH PAIRS */}
      {lot.questionType === "match" && (
        <div className="space-y-3">
          {matchDuplicateValues.size > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              Зверніть увагу: один із варіантів справа обрано для кількох пунктів одночасно.
            </div>
          )}
          {lot.leftItems.map((left) => {
            const lockedHint = spotlight.revealedPairIds.includes(left.id);
            const selectedRight = pairs[left.id] ?? "";
            const isDup =
              Boolean(selectedRight) && matchDuplicateValues.has(selectedRight);
            const selectId = `match-${lot.id}-${left.id}`;
            const rowVotes = matchVoteCounts[left.id] ?? {};
            const usedElsewhere = new Set(
              Object.entries(pairs)
                .filter(([k, v]) => k !== left.id && Boolean(v))
                .map(([, v]) => v)
            );

            return (
              <div
                key={left.id}
                className={`rounded-2xl border p-3.5 ${
                  lockedHint
                    ? "border-emerald-400 bg-emerald-50"
                    : isDup
                    ? "border-amber-400 bg-amber-50/50"
                    : "border-orange-200 bg-white"
                }`}
              >
                <label
                  htmlFor={selectId}
                  className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-[#231710]"
                >
                  <span>
                    {left.label}. {left.text}
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {Object.entries(rowVotes).map(([rid, count]) => {
                      const ro = lot.rightOptions.find((r) => r.id === rid);
                      return (
                        <span
                          key={rid}
                          className="rounded-full border border-orange-300 bg-orange-100 px-2 py-0.5 font-mono-num text-[11px] font-bold text-orange-900"
                        >
                          {ro?.label ?? rid}: {count}
                        </span>
                      );
                    })}
                    {lockedHint && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800">
                        <Sparkles className="h-3.5 w-3.5" /> Інсайд
                      </span>
                    )}
                  </div>
                </label>
                <select
                  id={selectId}
                  value={selectedRight}
                  disabled={lockedHint}
                  onChange={(e) => {
                    const next = { ...pairs, [left.id]: e.target.value };
                    setPairs(next);
                    if (lot.leftItems.every((l) => Boolean(next[l.id]))) {
                      onVote({ type: "match", pairs: next });
                    }
                  }}
                  className="min-h-[44px] w-full rounded-xl border border-orange-300 bg-[#FFF8F2] px-3 py-2 text-base text-[#231710] sm:text-sm"
                >
                  <option value="">— Оберіть відповідність —</option>
                  {lot.rightOptions.map((ro) => (
                    <option key={ro.id} value={ro.id}>
                      {ro.label}) {ro.text}
                      {usedElsewhere.has(ro.id) ? " ✓ (вже обрано)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      {/* 5. CLASSIFY INTO BUCKETS */}
      {lot.questionType === "classify" && (
        <div className="space-y-3">
          {lot.items.map((item) => {
            const lockedHint = spotlight.revealedPairIds.includes(item.id);
            const currentBucket = buckets[item.id];
            const itemVotes = classifyVoteCounts[item.id] ?? {};
            return (
              <div
                key={item.id}
                className={`rounded-2xl border p-3.5 ${
                  lockedHint
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-orange-200 bg-white"
                }`}
              >
                <div className="mb-2.5 flex items-start justify-between gap-2 text-sm font-medium text-[#231710]">
                  <div>
                    <span className="mr-1.5 font-mono-num text-xs font-bold text-[#826754]">
                      {item.label}.
                    </span>
                    {item.text}
                  </div>
                  {lockedHint && (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-800">
                      <Sparkles className="h-3.5 w-3.5" /> Інсайд
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {lot.buckets.map((b) => {
                    const active = currentBucket === b.id;
                    const count = itemVotes[b.id] ?? 0;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        disabled={lockedHint}
                        onClick={() => {
                          const next = { ...buckets, [item.id]: b.id };
                          setBuckets(next);
                          if (lot.items.every((i) => Boolean(next[i.id]))) {
                            onVote({ type: "classify", buckets: next });
                          }
                        }}
                        className={`btn-press flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-bold ${
                          active
                            ? "border-orange-700 bg-orange-700 text-white"
                            : "border-orange-200 bg-orange-50/70 text-[#231710] hover:border-orange-400"
                        }`}
                      >
                        <span>{b.title}</span>
                        {count > 0 && (
                          <span
                            className={`rounded-full px-1.5 py-0.5 font-mono-num text-[10px] font-extrabold ${
                              active
                                ? "bg-white/20 text-white"
                                : "bg-orange-200/80 text-orange-950"
                            }`}
                          >
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 6. OPEN ORAL ANSWER TO HOST */}
      {lot.questionType === "open" && (
        <div className="space-y-3">
          {spotlight.revealedPairIds.length > 0 &&
            lot.samplePoints[0] && (
              <div className="rounded-2xl border border-emerald-400 bg-emerald-50 p-3.5 text-xs text-emerald-950">
                <div className="mb-1 flex items-center gap-1.5 font-extrabold text-emerald-900">
                  <Sparkles className="h-3.5 w-3.5" /> Інсайд 50/50 (ключовий
                  орієнтир):
                </div>
                <p className="font-medium leading-relaxed">
                  {lot.samplePoints[0]}
                </p>
              </div>
            )}

          <div className="rounded-2xl border border-orange-200 bg-orange-50/70 p-4 text-xs leading-relaxed text-[#5E4636]">
            <div className="mb-1 text-sm font-extrabold text-orange-950">
              🎤 Усна відповідь ведучому
            </div>
            <p>
              У цьому завданні не потрібно нічого друкувати. Обговоріть
              аргументи в команді та дайте усну відповідь викладачу наживо!
            </p>
          </div>
        </div>
      )}

      {isCaptain ? (
        <button
          type="button"
          disabled={!currentPayload || busy}
          onClick={() => currentPayload && onSubmit(currentPayload)}
          className="btn-press flex min-h-[50px] w-full items-center justify-center gap-2 rounded-2xl bg-orange-700 px-4 py-3 text-sm font-extrabold text-white shadow-md shadow-orange-900/15 hover:bg-orange-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <CheckCircle2 className="h-4 w-4" />
          {lot.questionType === "open"
            ? "Готові відповідати ведучому"
            : "Підтвердити відповідь команди"}
        </button>
      ) : (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-orange-200 bg-orange-50/80 px-4 py-3 text-xs font-medium text-[#5E4636]">
          <Lock className="h-3.5 w-3.5 text-orange-700" />
          {lot.questionType === "open"
            ? "Обговоріть позицію команди — капітан або команда озвучує відповідь ведучому"
            : "Ваші рекомендації бачить Капітан команди в реальному часі"}
        </div>
      )}
    </div>
  );
}
