import {
  BLACK_MARKET_ITEMS,
  createInitialTeams,
  getLotById,
  MARKET_LOTS,
  ROULETTE_SECTORS,
  SANATION_CREDIT,
  SANATION_DEBT,
  SANATION_THRESHOLD,
  TEAM_ORDER,
} from "@/data/question-bank";
import {
  AnswerPayload,
  GameAction,
  GameState,
  MarketLot,
  Player,
  RoundNumber,
  SettlementEntry,
  TeamId,
  TeamState,
} from "@/types/game";

export function getNetWorth(team: TeamState): number {
  return team.balance - team.debt;
}

export function getRemainingLotsInRound(
  state: Pick<GameState, "purchasedLotIds">,
  round: RoundNumber
): MarketLot[] {
  return MARKET_LOTS.filter(
    (l) => l.round === round && !state.purchasedLotIds.includes(l.id)
  );
}

export function canAdvanceToRound(
  state: Pick<GameState, "phase" | "round" | "purchasedLotIds" | "forceClosedRounds">,
  targetRound: RoundNumber
): boolean {
  if (
    state.phase === "lobby" ||
    state.phase === "spotlight" ||
    state.phase === "review" ||
    state.phase === "reveal"
  ) {
    return false;
  }
  if (targetRound === state.round) return false;
  const isRoundFinished = (r: RoundNumber) =>
    getRemainingLotsInRound(state, r).length === 0 ||
    Boolean(state.forceClosedRounds?.includes(r));

  if (!isRoundFinished(state.round)) {
    return false;
  }
  for (let r = 1; r < targetRound; r++) {
    if (!isRoundFinished(r as RoundNumber)) {
      return false;
    }
  }
  return true;
}

export function getActiveTeamIds(
  teams: Record<TeamId, TeamState>,
  players: Record<string, Player>
): TeamId[] {
  const playersList = Object.values(players);
  if (playersList.length === 0) {
    return [...TEAM_ORDER];
  }
  const active = TEAM_ORDER.filter(
    (tid) =>
      playersList.some((p) => p.teamId === tid) || teams[tid].lotsBought > 0
  );
  return active.length > 0 ? active : [...TEAM_ORDER];
}

export function buildDraftQueue(
  teams: Record<TeamId, TeamState>,
  players: Record<string, Player> = {}
): TeamId[] {
  const active = getActiveTeamIds(teams, players);
  return [...active].sort((a, b) => {
    const diff = getNetWorth(teams[a]) - getNetWorth(teams[b]);
    if (diff !== 0) return diff;
    return TEAM_ORDER.indexOf(a) - TEAM_ORDER.indexOf(b);
  });
}

export function createInitialGameState(roomId = "default-room"): GameState {
  const teams = createInitialTeams();
  return {
    roomId,
    version: 1,
    updatedAt: Date.now(),
    phase: "lobby",
    previousPhase: null,
    round: 1,
    draftQueue: buildDraftQueue(teams),
    draftPointer: 0,
    purchasedLotIds: [],
    lotRecommendations: {},
    blackMarketRecommendations: {},
    shortSqueezeEventActive: false,
    roundLeverageMultiplier: 1,
    pendingLeverageMultiplier: 1,
    jackpotPool: 0,
    teams,
    players: {},
    spotlight: null,
    roulette: {
      spinId: 0,
      isSpinning: false,
      targetSectorId: null,
      targetTeamId: null,
      applied: false,
      effectLog: null,
    },
    history: [],
    lastAnnouncement: null,
  };
}

export interface AnswerBreakdown {
  isExact: boolean;
  correctCount: number;
  totalCount: number;
  ratio: number;
}

export function evaluateAnswerBreakdown(
  lot: MarketLot,
  answer: AnswerPayload
): AnswerBreakdown {
  if (lot.questionType === "single" && answer.type === "single") {
    const ok = answer.optionId === lot.correctOptionId;
    return { isExact: ok, correctCount: ok ? 1 : 0, totalCount: 1, ratio: ok ? 1 : 0 };
  }
  if (lot.questionType === "multi" && answer.type === "multi") {
    const expected = [...lot.correctOptionIds].sort();
    const actual = [...new Set(answer.optionIds)].sort();
    const totalCount = expected.length;
    const rawHits = actual.filter((val) => expected.includes(val)).length;
    const extraSelected = Math.max(0, actual.length - totalCount);
    const correctCount = Math.max(0, rawHits - extraSelected);
    const isExact =
      expected.length === actual.length &&
      expected.every((val, idx) => val === actual[idx]);
    return {
      isExact,
      correctCount,
      totalCount,
      ratio: totalCount > 0 ? correctCount / totalCount : 0,
    };
  }
  if (lot.questionType === "order" && answer.type === "order") {
    const totalCount = lot.correctOrder.length;
    const correctCount = lot.correctOrder.filter(
      (val, idx) => answer.orderedIds[idx] === val
    ).length;
    const isExact =
      lot.correctOrder.length === answer.orderedIds.length &&
      correctCount === totalCount;
    return {
      isExact,
      correctCount,
      totalCount,
      ratio: totalCount > 0 ? correctCount / totalCount : 0,
    };
  }
  if (lot.questionType === "match" && answer.type === "match") {
    const totalCount = lot.leftItems.length;
    const correctCount = lot.leftItems.filter(
      (item) => answer.pairs[item.id] === lot.correctPairs[item.id]
    ).length;
    return {
      isExact: correctCount === totalCount,
      correctCount,
      totalCount,
      ratio: totalCount > 0 ? correctCount / totalCount : 0,
    };
  }
  if (lot.questionType === "classify" && answer.type === "classify") {
    const totalCount = lot.items.length;
    const correctCount = lot.items.filter(
      (item) => answer.buckets[item.id] === lot.correctBuckets[item.id]
    ).length;
    return {
      isExact: correctCount === totalCount,
      correctCount,
      totalCount,
      ratio: totalCount > 0 ? correctCount / totalCount : 0,
    };
  }
  return { isExact: false, correctCount: 0, totalCount: 1, ratio: 0 };
}

export function evaluateAnswer(lot: MarketLot, answer: AnswerPayload): boolean {
  return evaluateAnswerBreakdown(lot, answer).isExact;
}

function applySanationIfNeeded(team: TeamState): boolean {
  if (team.balance < SANATION_THRESHOLD) {
    team.balance += SANATION_CREDIT;
    team.debt += SANATION_DEBT;
    team.sanationCount += 1;
    return true;
  }
  return false;
}

function getMajorityAnalystAnswer(
  votes: Record<string, AnswerPayload>
): AnswerPayload | null {
  const entries = Object.values(votes).filter((v) =>
    v.type === "open" ? v.text.trim().length > 0 : true
  );
  if (entries.length === 0) return null;
  const counts = new Map<string, { count: number; payload: AnswerPayload }>();
  for (const payload of entries) {
    const key = JSON.stringify(payload);
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, { count: 1, payload });
    }
  }
  let best: { count: number; payload: AnswerPayload } | null = null;
  for (const entry of counts.values()) {
    if (!best || entry.count > best.count) {
      best = entry;
    }
  }
  return best ? best.payload : null;
}

function submitOrStageReview(
  state: GameState,
  finalAnswer: AnswerPayload | null,
  now: number
): GameState {
  if (!state.spotlight) return state;
  const lot = getLotById(state.spotlight.lotId);
  if (!lot) return state;

  if (lot.questionType === "open") {
    const isOralReady = finalAnswer?.type === "open";
    const teamName = state.teams[state.spotlight.buyerTeamId].name;
    return {
      ...state,
      version: state.version + 1,
      updatedAt: now,
      phase: "review",
      spotlight: {
        ...state.spotlight,
        submittedAnswer: isOralReady ? finalAnswer : null,
        submittedAt: now,
        isTimedOut: !isOralReady,
        timerPausedRemainingMs: 0,
      },
      lastAnnouncement: isOralReady
        ? `🎤 ${teamName} готова давати усну відповідь — рішення за викладачем!`
        : `🎤 Час вийшов (${teamName}) — команда відповідає усно, рішення за викладачем.`,
    };
  }

  return settleSpotlight(state, finalAnswer, now);
}

function settleSpotlight(
  state: GameState,
  finalAnswer: AnswerPayload | null,
  now: number,
  hostVerdict?: boolean
): GameState {
  if (!state.spotlight) return state;
  const lot = getLotById(state.spotlight.lotId);
  if (!lot) return state;

  const teams = structuredClone(state.teams);
  const buyer = teams[state.spotlight.buyerTeamId];
  const breakdown: AnswerBreakdown =
    typeof hostVerdict === "boolean"
      ? {
          isExact: hostVerdict,
          correctCount: hostVerdict ? 1 : 0,
          totalCount: 1,
          ratio: hostVerdict ? 1 : 0,
        }
      : finalAnswer
      ? evaluateAnswerBreakdown(lot, finalAnswer)
      : { isExact: false, correctCount: 0, totalCount: 1, ratio: 0 };

  const isCorrect = breakdown.isExact;
  const isPartialCredit =
    !isCorrect &&
    typeof hostVerdict !== "boolean" &&
    breakdown.totalCount > 1 &&
    breakdown.ratio > 0.5;
  const isTimedOut =
    typeof hostVerdict === "boolean"
      ? !isCorrect && state.spotlight.isTimedOut
      : finalAnswer === null;

  buyer.stats[lot.topic].attempted += 1;
  if (isCorrect) {
    buyer.stats[lot.topic].correct += 1;
    buyer.correctAnswers += 1;
  }

  const activePowerUps = state.spotlight.activePowerUps;
  const hasDoubleLeverage = activePowerUps.includes("double_leverage");
  const hasInsurance = activePowerUps.includes("default_insurance");
  const leverageMult =
    (hasDoubleLeverage ? 2 : 1) * state.roundLeverageMultiplier;

  const settlements: SettlementEntry[] = [];
  let buyerDelta = 0;
  let jackpotAwarded = 0;
  let nextJackpotPool = state.jackpotPool;

  const betsList = Object.values(state.spotlight.bets);
  const shortBets = betsList.filter((b) => b.side === "short");
  const shortSqueezeTriggered =
    isCorrect &&
    ((state.shortSqueezeEventActive && shortBets.length >= 1) ||
      shortBets.length >= 2);

  if (isCorrect) {
    const rewardAmount = lot.reward * leverageMult;
    if (lot.riskTier === "derivative" && nextJackpotPool > 0) {
      jackpotAwarded = nextJackpotPool;
      nextJackpotPool = 0;
    }
    const grossReturn = lot.price + rewardAmount + jackpotAwarded;
    buyer.balance += grossReturn;
    buyerDelta += grossReturn;

    let squeezeBonusTotal = 0;

    for (const bet of betsList) {
      const bettor = teams[bet.teamId];
      if (bet.side === "long") {
        const winProfit = Math.round(bet.amount * 0.8);
        const totalBack = bet.amount + winProfit;
        bettor.balance += totalBack;
        bettor.betProfit += winProfit;
        settlements.push({
          teamId: bet.teamId,
          deltaBalance: winProfit,
          deltaDebt: 0,
          reason: `Long-ставка зіграла (+$${winProfit})`,
        });
      } else {
        // Short bettors lose their stake (already deducted); extra penalty on Short-Squeeze
        const extraPenalty = shortSqueezeTriggered
          ? Math.round(bet.amount * 0.5)
          : 0;
        if (extraPenalty > 0) {
          bettor.balance -= extraPenalty;
          squeezeBonusTotal += bet.amount + extraPenalty;
        }
        bettor.betProfit -= bet.amount + extraPenalty;
        const sanated = applySanationIfNeeded(bettor);
        settlements.push({
          teamId: bet.teamId,
          deltaBalance: -(bet.amount + extraPenalty),
          deltaDebt: sanated ? SANATION_DEBT : 0,
          reason: shortSqueezeTriggered
            ? `Шорт-сквіз! Збиток -$${bet.amount + extraPenalty}`
            : `Short-ставка не зіграла (-$${bet.amount})`,
          sanationTriggered: sanated,
        });
      }
    }

    if (squeezeBonusTotal > 0) {
      buyer.balance += squeezeBonusTotal;
      buyerDelta += squeezeBonusTotal;
    }

    const netBuyerChange = buyerDelta - lot.price;
    settlements.unshift({
      teamId: buyer.id,
      deltaBalance: netBuyerChange,
      deltaDebt: 0,
      reason: `Правильно! Чистий прибуток +$${netBuyerChange}${
        jackpotAwarded > 0 ? ` (вкл. Джекпот $${jackpotAwarded})` : ""
      }${squeezeBonusTotal > 0 ? ` (вкл. Шорт-сквіз $${squeezeBonusTotal})` : ""}`,
    });
  } else if (isPartialCredit) {
    // Majority of elements are correct (> 50%), with 1..few mistakes:
    // No default penalty; high accuracy (>= 75%) grants full stake + 25% bonus,
    // moderate majority (50% < ratio < 75%) rescues proportional stake so loss is much smaller.
    const ratioPct = Math.round(breakdown.ratio * 100);
    if (breakdown.ratio >= 0.75) {
      const partialBonus = Math.round(lot.reward * leverageMult * 0.25);
      const grossReturn = lot.price + partialBonus;
      buyer.balance += grossReturn;
      buyerDelta += grossReturn;
      const buyerSanated = applySanationIfNeeded(buyer);
      settlements.unshift({
        teamId: buyer.id,
        deltaBalance: buyerDelta - lot.price,
        deltaDebt: buyerSanated ? SANATION_DEBT : 0,
        reason: `Частковий залік (${breakdown.correctCount}/${breakdown.totalCount} · ${ratioPct}%): повернено вхід + бонус +$${partialBonus}`,
        sanationTriggered: buyerSanated,
      });
    } else {
      const rescuedStake = Math.max(
        Math.round(lot.price * breakdown.ratio),
        hasInsurance ? Math.round(lot.price * 0.5) : 0
      );
      buyer.balance += rescuedStake;
      buyerDelta += rescuedStake;
      const buyerSanated = applySanationIfNeeded(buyer);
      settlements.unshift({
        teamId: buyer.id,
        deltaBalance: buyerDelta - lot.price,
        deltaDebt: buyerSanated ? SANATION_DEBT : 0,
        reason: `Частковий залік (${breakdown.correctCount}/${breakdown.totalCount} · ${ratioPct}%): без штрафу, повернено $${rescuedStake} із входу`,
        sanationTriggered: buyerSanated,
      });
    }

    // Refund Long/Short bets as a neutral push on partial outcome
    for (const bet of betsList) {
      const bettor = teams[bet.teamId];
      bettor.balance += bet.amount;
      settlements.push({
        teamId: bet.teamId,
        deltaBalance: 0,
        deltaDebt: 0,
        reason: "Частковий результат — ставку повернуто",
      });
    }
  } else {
    let extraPenalty = lot.defaultPenalty;
    let refund = 0;

    if (hasInsurance) {
      extraPenalty = 0;
      refund = Math.round(lot.price * 0.5);
      buyer.balance += refund;
      buyerDelta += refund;
    } else if (hasDoubleLeverage) {
      extraPenalty = Math.round(lot.defaultPenalty * 1.5 + lot.price * 0.5);
    }

    if (extraPenalty > 0) {
      buyer.balance -= extraPenalty;
      buyerDelta -= extraPenalty;
    }

    const buyerSanated = applySanationIfNeeded(buyer);

    settlements.unshift({
      teamId: buyer.id,
      deltaBalance: buyerDelta - lot.price,
      deltaDebt: buyerSanated ? SANATION_DEBT : 0,
      reason: `${isTimedOut ? "Час вийшов" : "Помилка"}${
        hasInsurance
          ? ` (Страховка повернула $${refund})`
          : extraPenalty > 0
          ? ` (Дефолт-штраф -$${extraPenalty})`
          : ""
      }`,
      sanationTriggered: buyerSanated,
    });

    for (const bet of betsList) {
      const bettor = teams[bet.teamId];
      if (bet.side === "short") {
        const profitMult = state.shortSqueezeEventActive ? 1.5 : 1;
        const winProfit = Math.round(bet.amount * profitMult);
        bettor.balance += bet.amount + winProfit;
        bettor.betProfit += winProfit;
        settlements.push({
          teamId: bet.teamId,
          deltaBalance: winProfit,
          deltaDebt: 0,
          reason: `Short-ставка зіграла (+$${winProfit})`,
        });
      } else {
        bettor.betProfit -= bet.amount;
        const sanated = applySanationIfNeeded(bettor);
        settlements.push({
          teamId: bet.teamId,
          deltaBalance: -bet.amount,
          deltaDebt: sanated ? SANATION_DEBT : 0,
          reason: `Long-ставка згоріла (-$${bet.amount})`,
          sanationTriggered: sanated,
        });
      }
    }
  }

  const netBuyerOutcome = buyerDelta - lot.price;

  return {
    ...state,
    version: state.version + 1,
    updatedAt: now,
    phase: "reveal",
    jackpotPool: nextJackpotPool,
    teams,
    spotlight: {
      ...state.spotlight,
      submittedAnswer: finalAnswer,
      submittedAt: now,
      isTimedOut,
      timerPausedRemainingMs: 0,
      isCorrect,
      isPartialCredit,
      scoreCorrect: breakdown.correctCount,
      scoreTotal: breakdown.totalCount,
      shortSqueezeTriggered,
      settlements,
    },
    history: [
      ...state.history,
      {
        id: `hist-${now}-${lot.id}`,
        timestamp: now,
        round: lot.round,
        topic: lot.topic,
        lotId: lot.id,
        lotTitle: `[${lot.ticker}] ${lot.title}`,
        buyerTeamId: buyer.id,
        isCorrect,
        netDelta: netBuyerOutcome,
        summary: isCorrect
          ? "Прибуток"
          : isPartialCredit
          ? `Частковий залік (${breakdown.correctCount}/${breakdown.totalCount})`
          : "Збиток / Дефолт",
      },
    ],
  };
}

export function applyGameAction(
  state: GameState,
  action: GameAction,
  now = Date.now()
): GameState {
  switch (action.type) {
    case "JOIN_PLAYER": {
      const trimmed = action.name.trim().slice(0, 28);
      if (!trimmed) return state;

      const existing = state.players[action.playerId];
      const teamPlayers = Object.values(state.players).filter(
        (p) => p.teamId === action.teamId && p.id !== action.playerId
      );
      const hasCaptain = teamPlayers.some((p) => p.role === "captain");

      const role: Player["role"] =
        existing && existing.teamId === action.teamId && existing.role === "captain"
          ? "captain"
          : !hasCaptain && (action.wantCaptain ?? true)
          ? "captain"
          : action.wantCaptain && !hasCaptain
          ? "captain"
          : "analyst";

      const nextPlayers: Record<string, Player> = {
        ...state.players,
        [action.playerId]: {
          id: action.playerId,
          name: trimmed,
          teamId: action.teamId,
          role,
          joinedAt: existing?.joinedAt ?? now,
        },
      };

      let nextDraftQueue = state.draftQueue;
      let nextDraftPointer = state.draftPointer;

      if (state.phase === "marketplace") {
        if (Object.keys(state.players).length === 0) {
          nextDraftQueue = [action.teamId];
          nextDraftPointer = 0;
        } else if (!state.draftQueue.includes(action.teamId)) {
          nextDraftQueue = [...state.draftQueue, action.teamId];
        }
      }

      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        players: nextPlayers,
        draftQueue: nextDraftQueue,
        draftPointer: nextDraftPointer,
      };
    }

    case "LEAVE_PLAYER": {
      const leaving = state.players[action.playerId];
      if (!leaving) return state;

      const nextPlayers = { ...state.players };
      delete nextPlayers[action.playerId];

      // If the captain left and teammates remain, promote the earliest joined member
      if (leaving.role === "captain") {
        const remainingTeammates = Object.values(nextPlayers)
          .filter((p) => p.teamId === leaving.teamId)
          .sort((a, b) => a.joinedAt - b.joinedAt);
        if (remainingTeammates.length > 0) {
          const promoted = remainingTeammates[0];
          nextPlayers[promoted.id] = {
            ...promoted,
            role: "captain",
          };
        }
      }

      const nextLotRecs = { ...state.lotRecommendations };
      delete nextLotRecs[action.playerId];
      const nextBmRecs = { ...(state.blackMarketRecommendations ?? {}) };
      delete nextBmRecs[action.playerId];

      let nextPhase = state.phase;
      let nextDraftQueue = state.draftQueue;
      let nextDraftPointer = state.draftPointer;

      if (state.phase === "lobby") {
        nextDraftQueue = buildDraftQueue(state.teams, nextPlayers);
        nextDraftPointer = 0;
      } else if (state.phase === "marketplace") {
        const activeIds = new Set(getActiveTeamIds(state.teams, nextPlayers));
        const filteredQueue: TeamId[] = [];
        let adjustedPointer = state.draftPointer;

        state.draftQueue.forEach((tid, idx) => {
          if (activeIds.has(tid)) {
            filteredQueue.push(tid);
          } else if (idx < state.draftPointer) {
            adjustedPointer = Math.max(0, adjustedPointer - 1);
          }
        });

        if (filteredQueue.length === 0) {
          nextDraftQueue = buildDraftQueue(state.teams, nextPlayers);
          nextDraftPointer = 0;
        } else if (adjustedPointer >= filteredQueue.length) {
          nextDraftQueue = filteredQueue;
          nextDraftPointer = filteredQueue.length;
          nextPhase = "round_summary";
        } else {
          nextDraftQueue = filteredQueue;
          nextDraftPointer = adjustedPointer;
        }
      }

      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        phase: nextPhase,
        players: nextPlayers,
        lotRecommendations: nextLotRecs,
        blackMarketRecommendations: nextBmRecs,
        draftQueue: nextDraftQueue,
        draftPointer: nextDraftPointer,
      };
    }

    case "ASSIGN_CAPTAIN": {
      const target = state.players[action.playerId];
      if (!target || target.teamId !== action.teamId) return state;
      const updatedPlayers = { ...state.players };
      for (const pid of Object.keys(updatedPlayers)) {
        if (updatedPlayers[pid].teamId === action.teamId) {
          updatedPlayers[pid] = {
            ...updatedPlayers[pid],
            role: pid === action.playerId ? "captain" : "analyst",
          };
        }
      }
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        players: updatedPlayers,
      };
    }

    case "RENAME_TEAM": {
      const clean = action.name.trim().slice(0, 28);
      if (!clean) return state;
      const shortName = clean.length > 14 ? `${clean.slice(0, 14)}…` : clean;
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        teams: {
          ...state.teams,
          [action.teamId]: {
            ...state.teams[action.teamId],
            name: clean,
            shortName,
          },
        },
      };
    }

    case "START_GAME": {
      const teams = structuredClone(state.teams);
      for (const tid of TEAM_ORDER) {
        teams[tid].usedBlackMarketThisRound = false;
      }
      const queue = buildDraftQueue(teams, state.players);
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        phase: "marketplace",
        previousPhase: null,
        round: 1,
        draftQueue: queue,
        draftPointer: 0,
        lotRecommendations: {},
        blackMarketRecommendations: {},
        teams,
        lastAnnouncement: "Раунд 1 відкрито! Аутсайдери обирають активи першими.",
      };
    }

    case "GO_TO_ROUND": {
      if (!canAdvanceToRound(state, action.round)) {
        return state;
      }
      const teams = structuredClone(state.teams);
      for (const tid of TEAM_ORDER) {
        teams[tid].usedBlackMarketThisRound = false;
      }
      const queue = buildDraftQueue(teams, state.players);
      const nextRoundMult = state.pendingLeverageMultiplier ?? 1;
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        phase: "marketplace",
        previousPhase: null,
        round: action.round,
        draftQueue: queue,
        draftPointer: 0,
        lotRecommendations: {},
        blackMarketRecommendations: {},
        roundLeverageMultiplier: nextRoundMult,
        pendingLeverageMultiplier: 1,
        teams,
        spotlight: null,
        lastAnnouncement:
          nextRoundMult === 2
            ? `Раунд ${action.round} розпочато з Плечем x2!`
            : `Раунд ${action.round} розпочато!`,
      };
    }

    case "FORCE_END_ROUND": {
      if (state.phase === "lobby" || state.phase === "finished") return state;
      if (
        state.phase === "spotlight" ||
        state.phase === "review" ||
        state.phase === "reveal"
      ) {
        return state;
      }
      const nextClosed = state.forceClosedRounds?.includes(state.round)
        ? state.forceClosedRounds
        : [...(state.forceClosedRounds ?? []), state.round];
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        phase: "round_summary",
        previousPhase: null,
        forceClosedRounds: nextClosed,
        lotRecommendations: {},
        blackMarketRecommendations: {},
        spotlight: null,
        lastAnnouncement: `Раунд ${state.round} достроково завершено ведучим.`,
      };
    }

    case "SKIP_DRAFT_TURN": {
      if (state.phase !== "marketplace") return state;
      const roundLotsLeft = getRemainingLotsInRound(state, state.round).length > 0;
      if (!roundLotsLeft) {
        return {
          ...state,
          version: state.version + 1,
          updatedAt: now,
          phase: "round_summary",
          lotRecommendations: {},
          lastAnnouncement: `Раунд ${state.round} завершено! Усі лоти розіграно.`,
        };
      }
      const rawNextPtr = state.draftPointer + 1;
      const wrapAround = rawNextPtr >= state.draftQueue.length;
      const nextQueue = wrapAround
        ? buildDraftQueue(state.teams, state.players)
        : state.draftQueue;
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        draftQueue: nextQueue,
        draftPointer: wrapAround ? 0 : rawNextPtr,
        lotRecommendations: {},
      };
    }

    case "RECOMMEND_LOT": {
      if (state.phase !== "marketplace") return state;
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        lotRecommendations: {
          ...state.lotRecommendations,
          [action.playerId]: action.lotId,
        },
      };
    }

    case "BUY_LOT": {
      if (state.phase !== "marketplace") return state;
      const activeDraftTeam = state.draftQueue[state.draftPointer];
      if (activeDraftTeam !== action.teamId) return state;
      if (state.purchasedLotIds.includes(action.lotId)) return state;

      const lot = getLotById(action.lotId);
      if (!lot || lot.round !== state.round) return state;

      const team = state.teams[action.teamId];
      if (team.balance < lot.price) return state;
      if (
        team.debt > 0 &&
        (lot.riskTier === "derivative" || lot.riskTier === "toxic")
      ) {
        return state;
      }

      const updatedTeams = structuredClone(state.teams);
      updatedTeams[action.teamId].balance -= lot.price;
      updatedTeams[action.teamId].lotsBought += 1;

      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        phase: "spotlight",
        purchasedLotIds: [...state.purchasedLotIds, lot.id],
        lotRecommendations: {},
        teams: updatedTeams,
        spotlight: {
          lotId: lot.id,
          buyerTeamId: action.teamId,
          startedAt: now,
          timerEndsAt: now + lot.timerSeconds * 1000,
          timerPausedRemainingMs: null,
          analystVotes: {},
          lotRecommendations: {},
          submittedAnswer: null,
          submittedAt: null,
          isTimedOut: false,
          bets: {},
          betVotes: {},
          activePowerUps: [],
          hiddenOptionIds: [],
          revealedPairIds: [],
          isCorrect: null,
          shortSqueezeTriggered: false,
          settlements: [],
        },
        lastAnnouncement: `${team.name} купує [${lot.ticker}] ${lot.title}!`,
      };
    }

    case "VOTE_ANSWER": {
      if (state.phase !== "spotlight" || !state.spotlight) return state;
      const player = state.players[action.playerId];
      if (!player || player.teamId !== state.spotlight.buyerTeamId) return state;
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        spotlight: {
          ...state.spotlight,
          analystVotes: {
            ...state.spotlight.analystVotes,
            [action.playerId]: action.answer,
          },
        },
      };
    }

    case "SUBMIT_ANSWER": {
      if (state.phase !== "spotlight" || !state.spotlight) return state;
      if (state.spotlight.buyerTeamId !== action.teamId) return state;
      if (state.spotlight.submittedAnswer !== null) return state;
      return submitOrStageReview(state, action.answer, now);
    }

    case "USE_POWERUP": {
      if (state.phase !== "spotlight" || !state.spotlight) return state;
      if (state.spotlight.buyerTeamId !== action.teamId) return state;
      if (state.spotlight.activePowerUps.includes(action.itemId)) return state;

      const team = state.teams[action.teamId];
      const idx = team.inventory.indexOf(action.itemId);
      if (idx === -1) return state;

      const lot = getLotById(state.spotlight.lotId);
      if (!lot) return state;

      if (
        action.itemId === "short_veto" &&
        lot.riskTier !== "derivative" &&
        !state.shortSqueezeEventActive
      ) {
        return state;
      }

      const nextInventory = [...team.inventory];
      nextInventory.splice(idx, 1);

      let hiddenOptionIds = [...state.spotlight.hiddenOptionIds];
      let revealedPairIds = [...state.spotlight.revealedPairIds];
      const nextBets = { ...state.spotlight.bets };
      const nextTeams = structuredClone(state.teams);
      nextTeams[action.teamId].inventory = nextInventory;

      if (action.itemId === "insider_5050") {
        if (lot.questionType === "single") {
          const wrongIds = lot.options
            .filter((o) => o.id !== lot.correctOptionId)
            .map((o) => o.id);
          hiddenOptionIds = wrongIds.slice(0, 2);
        } else if (lot.questionType === "multi") {
          const wrongIds = lot.options
            .filter((o) => !lot.correctOptionIds.includes(o.id))
            .map((o) => o.id);
          hiddenOptionIds = wrongIds.slice(0, wrongIds.length > 2 ? 2 : 1);
        } else if (lot.questionType === "match") {
          revealedPairIds = lot.leftItems.slice(0, 2).map((i) => i.id);
        } else if (lot.questionType === "classify") {
          revealedPairIds = lot.items.slice(0, 2).map((i) => i.id);
        } else if (lot.questionType === "order") {
          revealedPairIds = lot.correctOrder.slice(0, 2);
        } else if (lot.questionType === "open") {
          revealedPairIds = ["0"];
        }
      } else if (action.itemId === "short_veto") {
        // Refund and remove all existing Short bets on this lot
        for (const [betTeamId, bet] of Object.entries(nextBets)) {
          if (bet.side === "short") {
            nextTeams[bet.teamId].balance += bet.amount;
            delete nextBets[betTeamId];
          }
        }
      }

      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        teams: nextTeams,
        spotlight: {
          ...state.spotlight,
          bets: nextBets,
          activePowerUps: [...state.spotlight.activePowerUps, action.itemId],
          hiddenOptionIds,
          revealedPairIds,
        },
        lastAnnouncement: `${team.name} активує спецможливість!`,
      };
    }

    case "VOTE_BET": {
      if (state.phase !== "spotlight" || !state.spotlight) return state;
      const player = state.players[action.playerId];
      if (!player || player.teamId === state.spotlight.buyerTeamId) return state;
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        spotlight: {
          ...state.spotlight,
          betVotes: {
            ...state.spotlight.betVotes,
            [action.playerId]: { side: action.side, amount: action.amount },
          },
        },
      };
    }

    case "PLACE_BET": {
      if (state.phase !== "spotlight" || !state.spotlight) return state;
      if (action.teamId === state.spotlight.buyerTeamId) return state;
      if (state.spotlight.bets[action.teamId]) return state;

      const lot = getLotById(state.spotlight.lotId);
      if (!lot) return state;

      const bettingAllowed =
        lot.riskTier === "derivative" || state.shortSqueezeEventActive;
      if (!bettingAllowed) return state;

      if (
        action.side === "short" &&
        state.spotlight.activePowerUps.includes("short_veto")
      ) {
        return state;
      }

      if (action.amount !== 500 && action.amount !== 1000) return state;
      const bettor = state.teams[action.teamId];
      if (bettor.balance < action.amount) return state;

      const nextTeams = structuredClone(state.teams);
      nextTeams[action.teamId].balance -= action.amount;

      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        teams: nextTeams,
        spotlight: {
          ...state.spotlight,
          bets: {
            ...state.spotlight.bets,
            [action.teamId]: {
              teamId: action.teamId,
              side: action.side,
              amount: action.amount,
              placedAt: now,
            },
          },
        },
      };
    }

    case "ADD_TIMER_SECONDS": {
      if (state.phase !== "spotlight" || !state.spotlight) return state;
      if (state.spotlight.timerPausedRemainingMs !== null) {
        return {
          ...state,
          version: state.version + 1,
          updatedAt: now,
          spotlight: {
            ...state.spotlight,
            timerPausedRemainingMs: Math.max(
              1000,
              state.spotlight.timerPausedRemainingMs + action.seconds * 1000
            ),
          },
        };
      }
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        spotlight: {
          ...state.spotlight,
          timerEndsAt:
            Math.max(now, state.spotlight.timerEndsAt) + action.seconds * 1000,
        },
      };
    }

    case "TOGGLE_PAUSE_TIMER": {
      if (state.phase !== "spotlight" || !state.spotlight) return state;
      if (state.spotlight.timerPausedRemainingMs === null) {
        const remaining = Math.max(0, state.spotlight.timerEndsAt - now);
        return {
          ...state,
          version: state.version + 1,
          updatedAt: now,
          spotlight: {
            ...state.spotlight,
            timerPausedRemainingMs: remaining,
          },
        };
      }
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        spotlight: {
          ...state.spotlight,
          timerEndsAt: now + state.spotlight.timerPausedRemainingMs,
          timerPausedRemainingMs: null,
        },
      };
    }

    case "FORCE_REVEAL": {
      if (state.phase !== "spotlight" || !state.spotlight) return state;
      const fallback = getMajorityAnalystAnswer(state.spotlight.analystVotes);
      return submitOrStageReview(state, fallback, now);
    }

    case "HOST_GRADE_OPEN_ANSWER": {
      if (state.phase !== "review" || !state.spotlight) return state;
      return settleSpotlight(
        state,
        state.spotlight.submittedAnswer,
        now,
        action.isCorrect
      );
    }

    case "NEXT_AFTER_REVEAL": {
      if (state.phase !== "reveal") return state;
      const roundLotsLeft = getRemainingLotsInRound(state, state.round).length > 0;
      if (!roundLotsLeft) {
        return {
          ...state,
          version: state.version + 1,
          updatedAt: now,
          phase: "round_summary",
          spotlight: null,
          lotRecommendations: {},
          lastAnnouncement: `Раунд ${state.round} завершено! Усі лоти розіграно.`,
        };
      }
      const rawNextPtr = state.draftPointer + 1;
      const wrapAround = rawNextPtr >= state.draftQueue.length;
      const nextQueue = wrapAround
        ? buildDraftQueue(state.teams, state.players)
        : state.draftQueue;
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        phase: "marketplace",
        draftQueue: nextQueue,
        draftPointer: wrapAround ? 0 : rawNextPtr,
        spotlight: null,
        lotRecommendations: {},
      };
    }

    case "TOGGLE_SHORT_SQUEEZE": {
      const nextVal = !state.shortSqueezeEventActive;
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        shortSqueezeEventActive: nextVal,
        lastAnnouncement: nextVal
          ? "📉 Активовано режим ШОРТ-СКВІЗ! Ставки відкрито на всі активи!"
          : "Режим Шорт-сквіз деактивовано.",
      };
    }

    case "OPEN_BLACK_MARKET": {
      if (state.phase === "black_market") return state;
      const basePrevious =
        state.phase === "roulette"
          ? state.previousPhase ?? "round_summary"
          : state.phase;
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        previousPhase: basePrevious,
        phase: "black_market",
        blackMarketRecommendations: {},
        roulette: {
          ...state.roulette,
          isSpinning: false,
        },
        lastAnnouncement: "🛒 Відкрито Чорний ринок! Команди можуть придбати 1 спецзасіб.",
      };
    }

    case "CLOSE_BLACK_MARKET": {
      if (state.phase !== "black_market") return state;
      const resumePhase = state.previousPhase ?? "round_summary";
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        phase:
          resumePhase === "black_market" || resumePhase === "roulette"
            ? "round_summary"
            : resumePhase,
        previousPhase: null,
        blackMarketRecommendations: {},
      };
    }

    case "RECOMMEND_BLACK_MARKET": {
      if (state.phase !== "black_market") return state;
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        blackMarketRecommendations: {
          ...(state.blackMarketRecommendations ?? {}),
          [action.playerId]: action.itemId,
        },
      };
    }

    case "BUY_BLACK_MARKET_ITEM": {
      if (state.phase !== "black_market") return state;
      const team = state.teams[action.teamId];
      if (team.usedBlackMarketThisRound) return state;
      const item = BLACK_MARKET_ITEMS.find((i) => i.id === action.itemId);
      if (!item || team.balance < item.price) return state;

      const nextTeams = structuredClone(state.teams);
      nextTeams[action.teamId].balance -= item.price;
      nextTeams[action.teamId].inventory.push(item.id);
      nextTeams[action.teamId].usedBlackMarketThisRound = true;
      const sanated = applySanationIfNeeded(nextTeams[action.teamId]);

      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        teams: nextTeams,
        lastAnnouncement: `🛒 ${team.name} придбала «${item.name}»${
          sanated ? " (спрацювала Санація НБУ)" : ""
        }!`,
      };
    }

    case "OPEN_ROULETTE": {
      if (state.phase === "roulette") return state;
      const basePrevious =
        state.phase === "black_market"
          ? state.previousPhase ?? "round_summary"
          : state.phase;
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        previousPhase: basePrevious,
        phase: "roulette",
        roulette: {
          ...state.roulette,
          isSpinning: false,
          targetSectorId: null,
          targetTeamId: null,
          applied: false,
          effectLog: null,
        },
        lastAnnouncement: "🎡 Час Фінансової рулетки!",
      };
    }

    case "SPIN_ROULETTE": {
      if (state.phase !== "roulette") return state;
      const sectorIdx = Math.floor(Math.random() * ROULETTE_SECTORS.length);
      const sector = ROULETTE_SECTORS[sectorIdx];
      const activeIds = getActiveTeamIds(state.teams, state.players);
      const randomTeam =
        activeIds[Math.floor(Math.random() * activeIds.length)];
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        roulette: {
          spinId: state.roulette.spinId + 1,
          isSpinning: true,
          targetSectorId: sector.id,
          targetTeamId: randomTeam,
          applied: false,
          effectLog: null,
        },
      };
    }

    case "APPLY_ROULETTE_RESULT": {
      if (state.phase !== "roulette" || !state.roulette.targetSectorId) {
        return state;
      }
      if (state.roulette.applied) return state;

      const nextTeams = structuredClone(state.teams);
      let nextJackpot = state.jackpotPool;
      let nextMult = state.roundLeverageMultiplier;
      let nextPendingMult = state.pendingLeverageMultiplier ?? 1;
      let effectLog = "";

      const activeIds = getActiveTeamIds(nextTeams, state.players);
      const sortedByNet = [...activeIds].sort(
        (a, b) => getNetWorth(nextTeams[b]) - getNetWorth(nextTeams[a])
      );
      const leaderId = sortedByNet[0];
      const outsiderId = sortedByNet[sortedByNet.length - 1];

      switch (state.roulette.targetSectorId) {
        case "black_swan": {
          for (const tid of activeIds) {
            const cut = Math.max(0, Math.round(nextTeams[tid].balance * 0.15));
            nextTeams[tid].balance -= cut;
            applySanationIfNeeded(nextTeams[tid]);
          }
          effectLog = "🦢 Чорний Лебідь: усі команди втратили 15% готівкового балансу.";
          break;
        }
        case "insider_trading": {
          const luckyId =
            state.roulette.targetTeamId &&
            activeIds.includes(state.roulette.targetTeamId)
              ? state.roulette.targetTeamId
              : outsiderId;
          nextTeams[luckyId].balance += 1200;
          nextTeams[luckyId].inventory.push("insider_5050");
          effectLog = `🕵️ Інсайдерська торгівля: ${nextTeams[luckyId].name} отримує +$1 200 та «Інсайд 50/50»!`;
          break;
        }
        case "tax_audit": {
          const tax = Math.max(
            0,
            Math.round(nextTeams[leaderId].balance * 0.12)
          );
          nextTeams[leaderId].balance -= tax;
          nextJackpot += tax;
          applySanationIfNeeded(nextTeams[leaderId]);
          effectLog = `🧾 Податкова перевірка: лідер ${nextTeams[leaderId].name} сплатив $${tax} у Джекпот-фонд (Разом: $${nextJackpot}).`;
          break;
        }
        case "leverage_x2": {
          if (state.previousPhase === "round_summary" && state.round < 4) {
            nextPendingMult = 2;
            effectLog = `📈 Кредитне плече x2: чистий прибуток угод у Раунді ${
              state.round + 1
            } буде подвоєно!`;
          } else {
            nextMult = 2;
            effectLog =
              "📈 Кредитне плече x2: чистий прибуток угод у поточному раунді подвоєно!";
          }
          break;
        }
        case "nbu_refinance": {
          nextTeams[outsiderId].balance += 1500;
          effectLog = `🏦 Рефінансування НБУ: аутсайдер ${nextTeams[outsiderId].name} отримує +$1 500!`;
          break;
        }
        case "dividend_boom": {
          const recipients: string[] = [];
          for (const tid of activeIds) {
            if (nextTeams[tid].debt === 0) {
              const div = Math.max(
                0,
                Math.round(nextTeams[tid].balance * 0.1)
              );
              nextTeams[tid].balance += div;
              recipients.push(nextTeams[tid].shortName);
            }
          }
          effectLog =
            recipients.length > 0
              ? `💎 Дивідендний бум: +10% отримали ${recipients.join(", ")}.`
              : "💎 Дивідендний бум: жодна команда без боргу не знайдена.";
          break;
        }
      }

      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        teams: nextTeams,
        jackpotPool: nextJackpot,
        roundLeverageMultiplier: nextMult,
        pendingLeverageMultiplier: nextPendingMult,
        roulette: {
          ...state.roulette,
          isSpinning: false,
          applied: true,
          effectLog,
        },
        lastAnnouncement: effectLog,
      };
    }

    case "CLOSE_ROULETTE": {
      if (state.phase !== "roulette") return state;
      const resumePhase = state.previousPhase ?? "round_summary";
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        phase:
          resumePhase === "roulette" || resumePhase === "black_market"
            ? "round_summary"
            : resumePhase,
        previousPhase: null,
        roulette: {
          ...state.roulette,
          isSpinning: false,
        },
      };
    }

    case "REPAY_DEBT": {
      const team = state.teams[action.teamId];
      if (team.debt <= 0 || team.balance < team.debt + 500) return state;
      const nextTeams = structuredClone(state.teams);
      nextTeams[action.teamId].balance -= team.debt;
      nextTeams[action.teamId].debt = 0;
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        teams: nextTeams,
        lastAnnouncement: `${team.name} достроково погасила кредит санації!`,
      };
    }

    case "ADJUST_BALANCE": {
      const nextTeams = structuredClone(state.teams);
      nextTeams[action.teamId].balance += action.delta;
      applySanationIfNeeded(nextTeams[action.teamId]);
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        teams: nextTeams,
        lastAnnouncement:
          action.reason ??
          `Коригування балансу ${nextTeams[action.teamId].name}: ${
            action.delta >= 0 ? "+" : ""
          }$${action.delta}`,
      };
    }

    case "FINISH_GAME": {
      return {
        ...state,
        version: state.version + 1,
        updatedAt: now,
        phase: "finished",
        previousPhase: null,
        spotlight: null,
        lastAnnouncement: "Торги завершено! Підсумковий рейтинг активів.",
      };
    }

    case "RESET_GAME": {
      const fresh = createInitialGameState(state.roomId);
      // Preserve connected players if resetting between sessions? Clean full reset:
      return {
        ...fresh,
        version: state.version + 1,
        updatedAt: now,
      };
    }

    default:
      return state;
  }
}

export function isRoundNumber(value: number): value is RoundNumber {
  return value === 1 || value === 2 || value === 3 || value === 4;
}
