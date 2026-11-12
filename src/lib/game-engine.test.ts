import { describe, expect, it } from "vitest";
import { MARKET_LOTS } from "@/data/question-bank";
import {
  generateCsvReport,
  generateStudentCsvReport,
  generateStudentTsvTable,
  getStudentSummaryRows,
} from "@/lib/formatters";
import {
  applyGameAction,
  canAdvanceToRound,
  createInitialGameState,
  evaluateAnswer,
  evaluateAnswerBreakdown,
  getNetWorth,
  getRemainingLotsInRound,
} from "@/lib/game-engine";
import { generateQrMatrix, qrMatrixToSvgPath } from "@/lib/qr-svg";
import { AnswerPayload, GameState, MarketLot } from "@/types/game";

function getOfficialPayload(lot: MarketLot): AnswerPayload {
  if (lot.questionType === "single") {
    return { type: "single", optionId: lot.correctOptionId };
  }
  if (lot.questionType === "multi") {
    return { type: "multi", optionIds: lot.correctOptionIds };
  }
  if (lot.questionType === "order") {
    return { type: "order", orderedIds: lot.correctOrder };
  }
  if (lot.questionType === "match") {
    return { type: "match", pairs: lot.correctPairs };
  }
  if (lot.questionType === "classify") {
    return { type: "classify", buckets: lot.correctBuckets };
  }
  return { type: "open", text: lot.samplePoints.join("; ") };
}

function finishCurrentRoundLots(startState: GameState): GameState {
  let state = startState;
  if (state.phase === "spotlight") {
    const lot = MARKET_LOTS.find((l) => l.id === state.spotlight?.lotId)!;
    state = applyGameAction(state, {
      type: "SUBMIT_ANSWER",
      teamId: state.spotlight!.buyerTeamId,
      answer: getOfficialPayload(lot),
    });
  }
  if (state.phase === "review") {
    state = applyGameAction(state, {
      type: "HOST_GRADE_OPEN_ANSWER",
      isCorrect: true,
    });
  }
  if (state.phase === "reveal") {
    state = applyGameAction(state, { type: "NEXT_AFTER_REVEAL" });
  }
  while (getRemainingLotsInRound(state, state.round).length > 0) {
    const nextLot = getRemainingLotsInRound(state, state.round)[0];
    const teamId = state.draftQueue[state.draftPointer];
    state = applyGameAction(state, {
      type: "BUY_LOT",
      teamId,
      lotId: nextLot.id,
    });
    state = applyGameAction(state, {
      type: "SUBMIT_ANSWER",
      teamId,
      answer: getOfficialPayload(nextLot),
    });
    if (state.phase === "review") {
      state = applyGameAction(state, {
        type: "HOST_GRADE_OPEN_ANSWER",
        isCorrect: true,
      });
    }
    state = applyGameAction(state, { type: "NEXT_AFTER_REVEAL" });
  }
  return state;
}

describe("Question Bank & Game Engine", () => {
  it("contains 28 lots (7 per round across 4 rounds) with valid answers", () => {
    expect(MARKET_LOTS).toHaveLength(28);
    for (const round of [1, 2, 3, 4] as const) {
      const lots = MARKET_LOTS.filter((l) => l.round === round);
      expect(lots).toHaveLength(7);
      expect(lots.filter((l) => l.riskTier === "cheap")).toHaveLength(2);
      expect(lots.filter((l) => l.riskTier === "bond")).toHaveLength(2);
      expect(lots.filter((l) => l.riskTier === "derivative")).toHaveLength(2);
      expect(lots.filter((l) => l.riskTier === "toxic")).toHaveLength(1);
    }

    // Every lot's official answer must evaluate to true
    for (const lot of MARKET_LOTS) {
      if (lot.questionType === "single") {
        expect(
          evaluateAnswer(lot, { type: "single", optionId: lot.correctOptionId })
        ).toBe(true);
      } else if (lot.questionType === "multi") {
        expect(
          evaluateAnswer(lot, { type: "multi", optionIds: lot.correctOptionIds })
        ).toBe(true);
      } else if (lot.questionType === "order") {
        expect(
          evaluateAnswer(lot, { type: "order", orderedIds: lot.correctOrder })
        ).toBe(true);
      } else if (lot.questionType === "match") {
        expect(
          evaluateAnswer(lot, { type: "match", pairs: lot.correctPairs })
        ).toBe(true);
      } else if (lot.questionType === "classify") {
        expect(
          evaluateAnswer(lot, { type: "classify", buckets: lot.correctBuckets })
        ).toBe(true);
      } else if (lot.questionType === "open") {
        expect(lot.samplePoints.length).toBeGreaterThanOrEqual(2);
        expect(lot.correctSummary.length).toBeGreaterThan(0);
      }
    }
  });

  it("handles Captain + Analysts join, outsider-first draft, and derivative Short-Squeeze", () => {
    let state = createInitialGameState("test-room");
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p1",
      name: "Олена",
      teamId: "team-1",
    });
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p2",
      name: "Максим",
      teamId: "team-1",
    });
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p3",
      name: "Ірина",
      teamId: "team-2",
    });
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p4",
      name: "Тарас",
      teamId: "team-3",
    });

    expect(state.players["p1"].role).toBe("captain");
    expect(state.players["p2"].role).toBe("analyst");

    // Make team-3 an outsider before starting
    state = applyGameAction(state, {
      type: "ADJUST_BALANCE",
      teamId: "team-3",
      delta: -2000,
    });
    state = applyGameAction(state, { type: "START_GAME" });
    expect(state.phase).toBe("marketplace");
    expect(state.draftQueue[0]).toBe("team-3");

    // Team-3 buys derivative D-105 ($3000)
    state = applyGameAction(state, {
      type: "BUY_LOT",
      teamId: "team-3",
      lotId: "lot-1-5",
    });
    expect(state.phase).toBe("spotlight");
    expect(state.teams["team-3"].balance).toBe(5000);

    // Team-1 and Team-2 open Short bets ($1000 each) -> triggers Short-Squeeze on correct answer
    state = applyGameAction(state, {
      type: "PLACE_BET",
      teamId: "team-1",
      side: "short",
      amount: 1000,
    });
    state = applyGameAction(state, {
      type: "PLACE_BET",
      teamId: "team-2",
      side: "short",
      amount: 1000,
    });

    // Team-3 answers correctly!
    state = applyGameAction(state, {
      type: "SUBMIT_ANSWER",
      teamId: "team-3",
      answer: { type: "multi", optionIds: ["1", "3", "4"] },
    });

    expect(state.phase).toBe("reveal");
    expect(state.spotlight?.isCorrect).toBe(true);
    expect(state.spotlight?.shortSqueezeTriggered).toBe(true);
    // Team-3 gets back $3000 + $4500 reward + 2 * $1500 squeeze = $10500 => 5000 + 10500 = 15500
    expect(state.teams["team-3"].balance).toBe(15500);
    // Team-1 and Team-2 lose $1000 stake + $500 extra squeeze penalty = $8500
    expect(state.teams["team-1"].balance).toBe(8500);
    expect(state.teams["team-2"].balance).toBe(8500);
  });

  it("triggers Sanation (NBU crisis loan) when balance drops below $500 and blocks derivatives", () => {
    let state = createInitialGameState("test-room");
    state = applyGameAction(state, { type: "START_GAME" });
    state = applyGameAction(state, {
      type: "ADJUST_BALANCE",
      teamId: "team-1",
      delta: -9700, // balance 300 < 500 -> triggers sanation +2500 balance, +3250 debt
    });

    expect(state.teams["team-1"].balance).toBe(2800);
    expect(state.teams["team-1"].debt).toBe(3250);
    expect(state.teams["team-1"].sanationCount).toBe(1);
    expect(getNetWorth(state.teams["team-1"])).toBe(-450);

    // Try buying toxic lot while under sanation -> blocked!
    const before = state;
    state = applyGameAction(state, {
      type: "BUY_LOT",
      teamId: "team-1",
      lotId: "lot-1-7",
    });
    expect(state).toBe(before);

    // Buying cheap lot works
    state = applyGameAction(state, {
      type: "BUY_LOT",
      teamId: "team-1",
      lotId: "lot-1-1",
    });
    expect(state.phase).toBe("spotlight");
  });

  it("generates UTF-8 BOM CSV report cleanly", () => {
    const state = createInitialGameState("test-room");
    const csv = generateCsvReport(state);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Альфа-Капітал");
    expect(csv).toContain("Успішність 3.9.4");
  });

  it("supports Black Market Default Insurance & Insider 50/50 during spotlight", () => {
    let state = createInitialGameState("test-room");
    state = applyGameAction(state, { type: "START_GAME" });
    state = applyGameAction(state, { type: "OPEN_BLACK_MARKET" });
    state = applyGameAction(state, {
      type: "BUY_BLACK_MARKET_ITEM",
      teamId: "team-1",
      itemId: "default_insurance",
    });
    expect(state.teams["team-1"].balance).toBe(9100);
    expect(state.teams["team-1"].inventory).toContain("default_insurance");

    state = applyGameAction(state, { type: "CLOSE_BLACK_MARKET" });
    state = applyGameAction(state, {
      type: "BUY_LOT",
      teamId: "team-1",
      lotId: "lot-1-5", // derivative: price 3000, penalty 600
    });
    state = applyGameAction(state, {
      type: "USE_POWERUP",
      teamId: "team-1",
      itemId: "default_insurance",
    });
    // Submit wrong answer -> insurance cancels -600 penalty and refunds 50% (1500)
    state = applyGameAction(state, {
      type: "SUBMIT_ANSWER",
      teamId: "team-1",
      answer: { type: "multi", optionIds: ["2", "5", "6"] },
    });
    expect(state.spotlight?.isCorrect).toBe(false);
    // 9100 - 3000 + 1500 = 7600
    expect(state.teams["team-1"].balance).toBe(7600);
  });

  it("excludes empty teams (no players) from draftQueue, Roulette, and active leaderboard", () => {
    let state = createInitialGameState("test-room");
    // Only team-2 and team-4 have players
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p-a",
      name: "Аня",
      teamId: "team-2",
    });
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p-b",
      name: "Богдан",
      teamId: "team-4",
    });
    state = applyGameAction(state, { type: "START_GAME" });

    expect(state.draftQueue).toEqual(["team-2", "team-4"]);

    // Roulette should only pick/affect active teams
    state = applyGameAction(state, { type: "OPEN_ROULETTE" });
    state = applyGameAction(state, { type: "SPIN_ROULETTE" });
    expect(["team-2", "team-4"]).toContain(state.roulette.targetTeamId);

    state = applyGameAction(state, { type: "APPLY_ROULETTE_RESULT" });
    // Empty teams remain completely untouched at $10,000
    expect(state.teams["team-1"].balance).toBe(10000);
    expect(state.teams["team-3"].balance).toBe(10000);
    expect(state.teams["team-5"].balance).toBe(10000);
    expect(state.teams["team-1"].inventory).toHaveLength(0);

    // Reopening roulette clears previous spin result
    state = applyGameAction(state, { type: "CLOSE_ROULETTE" });
    state = applyGameAction(state, { type: "OPEN_ROULETTE" });
    expect(state.roulette.targetSectorId).toBeNull();
    expect(state.roulette.applied).toBe(false);
  });

  it("carries over leverage_x2 from round_summary to next round and guards short_veto / short-squeeze", () => {
    let state = createInitialGameState("test-room");
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p1",
      name: "Капітан",
      teamId: "team-1",
    });
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p2",
      name: "Аналітик",
      teamId: "team-1",
    });
    state = applyGameAction(state, { type: "START_GAME" });

    // Enable Short-Squeeze mode on a cheap lot WITHOUT any short bets -> should NOT mark shortSqueezeTriggered
    state = applyGameAction(state, { type: "TOGGLE_SHORT_SQUEEZE" });
    state = applyGameAction(state, {
      type: "BUY_LOT",
      teamId: "team-1",
      lotId: "lot-1-1",
    });
    state = applyGameAction(state, {
      type: "SUBMIT_ANSWER",
      teamId: "team-1",
      answer: { type: "single", optionId: "b" },
    });
    expect(state.spotlight?.shortSqueezeTriggered).toBe(false);

    // Trying to go to Round 2 after only 1 lot is blocked while 6 lots remain
    state = applyGameAction(state, { type: "NEXT_AFTER_REVEAL" });
    expect(state.phase).toBe("marketplace");
    expect(canAdvanceToRound(state, 2)).toBe(false);
    expect(applyGameAction(state, { type: "GO_TO_ROUND", round: 2 })).toBe(state);

    // Play the remaining 6 lots in Round 1 -> transitions cleanly to round_summary
    state = finishCurrentRoundLots(state);
    expect(state.phase).toBe("round_summary");
    expect(canAdvanceToRound(state, 2)).toBe(true);

    // Simulate Roulette landing on leverage_x2 during round_summary
    state = applyGameAction(state, { type: "OPEN_ROULETTE" });
    state = {
      ...state,
      roulette: {
        spinId: 1,
        isSpinning: true,
        targetSectorId: "leverage_x2",
        targetTeamId: "team-1",
        applied: false,
        effectLog: null,
      },
    };
    state = applyGameAction(state, { type: "APPLY_ROULETTE_RESULT" });
    expect(state.pendingLeverageMultiplier).toBe(2);

    state = applyGameAction(state, { type: "CLOSE_ROULETTE" });
    state = applyGameAction(state, { type: "GO_TO_ROUND", round: 2 });
    expect(state.round).toBe(2);
    expect(state.roundLeverageMultiplier).toBe(2);
    expect(state.pendingLeverageMultiplier).toBe(1);

    // Black market analyst recommendation + short_veto guard on non-betting lot
    state = applyGameAction(state, { type: "TOGGLE_SHORT_SQUEEZE" }); // turn OFF
    state = applyGameAction(state, { type: "OPEN_BLACK_MARKET" });
    state = applyGameAction(state, {
      type: "RECOMMEND_BLACK_MARKET",
      playerId: "p2",
      itemId: "short_veto",
    });
    expect(state.blackMarketRecommendations?.["p2"]).toBe("short_veto");

    state = applyGameAction(state, {
      type: "BUY_BLACK_MARKET_ITEM",
      teamId: "team-1",
      itemId: "short_veto",
    });
    state = applyGameAction(state, { type: "CLOSE_BLACK_MARKET" });
    state = applyGameAction(state, {
      type: "BUY_LOT",
      teamId: "team-1",
      lotId: "lot-2-1", // cheap lot, short squeeze OFF -> short_veto cannot be wasted!
    });
    const beforePowerup = state;
    state = applyGameAction(state, {
      type: "USE_POWERUP",
      teamId: "team-1",
      itemId: "short_veto",
    });
    expect(state).toBe(beforePowerup);
  });

  it("reveals first 2 steps for order lots and 2 wrong options for 3-of-6 multi lots on insider_5050", () => {
    let state = createInitialGameState("test-room");
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p1",
      name: "Капітан",
      teamId: "team-1",
    });
    state = applyGameAction(state, { type: "START_GAME" });
    state = applyGameAction(state, { type: "OPEN_BLACK_MARKET" });
    state = applyGameAction(state, {
      type: "BUY_BLACK_MARKET_ITEM",
      teamId: "team-1",
      itemId: "insider_5050",
    });
    state = applyGameAction(state, { type: "CLOSE_BLACK_MARKET" });

    // Multi 3-of-6 lot (D-105)
    state = applyGameAction(state, {
      type: "BUY_LOT",
      teamId: "team-1",
      lotId: "lot-1-5",
    });
    state = applyGameAction(state, {
      type: "USE_POWERUP",
      teamId: "team-1",
      itemId: "insider_5050",
    });
    expect(state.spotlight?.hiddenOptionIds).toHaveLength(2);

    // Finish remaining Round 1 lots cleanly before advancing to Round 2 (D-206)
    state = finishCurrentRoundLots(state);
    expect(state.phase).toBe("round_summary");

    // Order lot (D-206) in Round 2
    state = applyGameAction(state, { type: "GO_TO_ROUND", round: 2 });
    state = applyGameAction(state, { type: "OPEN_BLACK_MARKET" });
    state = applyGameAction(state, {
      type: "BUY_BLACK_MARKET_ITEM",
      teamId: "team-1",
      itemId: "insider_5050",
    });
    state = applyGameAction(state, { type: "CLOSE_BLACK_MARKET" });
    state = applyGameAction(state, {
      type: "BUY_LOT",
      teamId: "team-1",
      lotId: "lot-2-6",
    });
    state = applyGameAction(state, {
      type: "USE_POWERUP",
      teamId: "team-1",
      itemId: "insider_5050",
    });
    expect(state.spotlight?.revealedPairIds).toEqual(["sB", "sE"]);
  });

  it("removes leaving player cleanly with LEAVE_PLAYER, promotes next captain, and updates draftQueue", () => {
    let state = createInitialGameState("test-room");
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p-cap",
      name: "Капітан",
      teamId: "team-1",
    });
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p-ana",
      name: "Аналітик",
      teamId: "team-1",
    });
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p-other",
      name: "Ігор",
      teamId: "team-2",
    });
    state = applyGameAction(state, { type: "START_GAME" });
    expect(state.draftQueue).toEqual(["team-1", "team-2"]);
    expect(state.players["p-cap"].role).toBe("captain");
    expect(state.players["p-ana"].role).toBe("analyst");

    // Captain of team-1 leaves -> p-ana becomes captain, team-1 stays in draftQueue
    state = applyGameAction(state, {
      type: "LEAVE_PLAYER",
      playerId: "p-cap",
    });
    expect(state.players["p-cap"]).toBeUndefined();
    expect(state.players["p-ana"].role).toBe("captain");
    expect(state.draftQueue).toEqual(["team-1", "team-2"]);

    // Last player of team-1 leaves -> team-1 removed from draftQueue
    state = applyGameAction(state, {
      type: "LEAVE_PLAYER",
      playerId: "p-ana",
    });
    expect(state.draftQueue).toEqual(["team-2"]);
  });

  it("routes open questions through host review phase and settles on HOST_GRADE_OPEN_ANSWER", () => {
    let state = createInitialGameState("test-room");
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p1",
      name: "Аліна",
      teamId: "team-1",
    });
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p2",
      name: "Тарас",
      teamId: "team-2",
    });
    state = applyGameAction(state, { type: "START_GAME" });
    state = applyGameAction(state, { type: "OPEN_BLACK_MARKET" });
    state = applyGameAction(state, {
      type: "BUY_BLACK_MARKET_ITEM",
      teamId: "team-1",
      itemId: "insider_5050",
    });
    state = applyGameAction(state, { type: "CLOSE_BLACK_MARKET" });

    // Buy open bond lot (C-104: price 1500, reward 1500, penalty 0)
    state = applyGameAction(state, {
      type: "BUY_LOT",
      teamId: "team-1",
      lotId: "lot-1-4",
    });
    state = applyGameAction(state, {
      type: "USE_POWERUP",
      teamId: "team-1",
      itemId: "insider_5050",
    });
    expect(state.spotlight?.revealedPairIds).toEqual(["0"]);

    // Submitting open text transitions to "review", not immediate reveal
    state = applyGameAction(state, {
      type: "SUBMIT_ANSWER",
      teamId: "team-1",
      answer: {
        type: "open",
        text: "Збалансування вартісного руху фінансових ресурсів із матеріально-речовим потоком ВВП і національного доходу.",
      },
    });
    expect(state.phase).toBe("review");
    expect(state.spotlight?.isCorrect).toBeNull();

    // Host approves the open answer -> returns stake (1500) + reward (1500)
    const balanceBeforeApprove = state.teams["team-1"].balance;
    state = applyGameAction(state, {
      type: "HOST_GRADE_OPEN_ANSWER",
      isCorrect: true,
    });
    expect(state.phase).toBe("reveal");
    expect(state.spotlight?.isCorrect).toBe(true);
    expect(state.teams["team-1"].balance).toBe(balanceBeforeApprove + 1500 + 1500);

    // Host rejects a timed-out toxic open question (X-107: price 800, penalty 400)
    state = applyGameAction(state, { type: "NEXT_AFTER_REVEAL" });
    state = applyGameAction(state, {
      type: "BUY_LOT",
      teamId: "team-2",
      lotId: "lot-1-7",
    });
    state = applyGameAction(state, { type: "FORCE_REVEAL" });
    expect(state.phase).toBe("review");

    state = applyGameAction(state, {
      type: "HOST_GRADE_OPEN_ANSWER",
      isCorrect: false,
    });
    expect(state.phase).toBe("reveal");
    expect(state.spotlight?.isCorrect).toBe(false);
    // 10000 - 800 (price) - 400 (penalty) = 8800
    expect(state.teams["team-2"].balance).toBe(8800);
  });

  it("cycles draftQueue across teams until all 7 lots in a round are finished before allowing next round", () => {
    let state = createInitialGameState("test-room");
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p1",
      name: "Аня",
      teamId: "team-1",
    });
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p2",
      name: "Богдан",
      teamId: "team-2",
    });
    state = applyGameAction(state, { type: "START_GAME" });
    expect(state.draftQueue).toEqual(["team-1", "team-2"]);

    // SKIP_DRAFT_TURN cycles to team-2 and wraps back to index 0 while lots remain
    state = applyGameAction(state, { type: "SKIP_DRAFT_TURN" });
    expect(state.phase).toBe("marketplace");
    expect(state.draftPointer).toBe(1);
    state = applyGameAction(state, { type: "SKIP_DRAFT_TURN" });
    expect(state.phase).toBe("marketplace");
    expect(state.draftPointer).toBe(0);

    // Completing 2 lots (one full pass of 2 teams) still stays in Round 1 marketplace!
    const round1Lots = MARKET_LOTS.filter((l) => l.round === 1);
    for (let i = 0; i < 2; i++) {
      const tid = state.draftQueue[state.draftPointer];
      const lot = round1Lots[i];
      state = applyGameAction(state, { type: "BUY_LOT", teamId: tid, lotId: lot.id });
      state = applyGameAction(state, {
        type: "SUBMIT_ANSWER",
        teamId: tid,
        answer: getOfficialPayload(lot),
      });
      state = applyGameAction(state, { type: "NEXT_AFTER_REVEAL" });
    }
    expect(state.phase).toBe("marketplace");
    expect(getRemainingLotsInRound(state, 1)).toHaveLength(5);
    expect(canAdvanceToRound(state, 2)).toBe(false);
    expect(applyGameAction(state, { type: "GO_TO_ROUND", round: 2 })).toBe(state);

    // Finish all remaining 5 lots -> round_summary and Round 2 unlocks
    state = finishCurrentRoundLots(state);
    expect(getRemainingLotsInRound(state, 1)).toHaveLength(0);
    expect(state.phase).toBe("round_summary");
    expect(canAdvanceToRound(state, 2)).toBe(true);
    expect(canAdvanceToRound(state, 3)).toBe(false); // Round 2 still unplayed

    state = applyGameAction(state, { type: "GO_TO_ROUND", round: 2 });
    expect(state.round).toBe(2);
    expect(state.phase).toBe("marketplace");
  });

  it("awards partial credit when correct items outnumber wrong ones (reduced loss on >50%, small bonus on >=75%)", () => {
    // Breakdown sanity checks on 4-of-6 lot (lot-3-6)
    const lot36 = MARKET_LOTS.find((l) => l.id === "lot-3-6")!;
    expect(
      evaluateAnswerBreakdown(lot36, { type: "multi", optionIds: ["1", "2", "3", "5"] })
    ).toEqual({ isExact: false, correctCount: 3, totalCount: 4, ratio: 0.75 });
    expect(
      evaluateAnswerBreakdown(lot36, { type: "multi", optionIds: ["1", "2", "5", "6"] })
    ).toEqual({ isExact: false, correctCount: 2, totalCount: 4, ratio: 0.5 });

    // 1) Moderate majority (2/3 on lot-1-5): no default penalty + 2/3 stake rescue (-1000 instead of -3600)
    let state = createInitialGameState("test-room");
    state = applyGameAction(state, { type: "JOIN_PLAYER", playerId: "p1", name: "Оля", teamId: "team-1" });
    state = applyGameAction(state, { type: "JOIN_PLAYER", playerId: "p2", name: "Макс", teamId: "team-2" });
    state = applyGameAction(state, { type: "START_GAME" });

    state = applyGameAction(state, { type: "BUY_LOT", teamId: "team-1", lotId: "lot-1-5" });
    state = applyGameAction(state, {
      type: "PLACE_BET",
      teamId: "team-2",
      side: "short",
      amount: 1000,
    });
    state = applyGameAction(state, {
      type: "SUBMIT_ANSWER",
      teamId: "team-1",
      answer: { type: "multi", optionIds: ["1", "3", "5"] }, // 2 of 3 correct
    });

    expect(state.phase).toBe("reveal");
    expect(state.spotlight?.isCorrect).toBe(false);
    expect(state.spotlight?.isPartialCredit).toBe(true);
    expect(state.spotlight?.scoreCorrect).toBe(2);
    expect(state.spotlight?.scoreTotal).toBe(3);
    // 10000 - 3000 (price) + 2000 (rescued 2/3 stake) = 9000 (no -600 penalty)
    expect(state.teams["team-1"].balance).toBe(9000);
    // Bets refunded on partial outcome
    expect(state.teams["team-2"].balance).toBe(10000);

    // 2) Finish rounds 1 and 2 to test >=75% partial bonus on lot-3-6 (3/4 correct -> +25% reward)
    state = finishCurrentRoundLots(state);
    state = applyGameAction(state, { type: "GO_TO_ROUND", round: 2 });
    state = finishCurrentRoundLots(state);
    state = applyGameAction(state, { type: "GO_TO_ROUND", round: 3 });

    const activeTid = state.draftQueue[state.draftPointer];
    const balanceBefore = state.teams[activeTid].balance;
    state = applyGameAction(state, { type: "BUY_LOT", teamId: activeTid, lotId: "lot-3-6" });
    state = applyGameAction(state, {
      type: "SUBMIT_ANSWER",
      teamId: activeTid,
      answer: { type: "multi", optionIds: ["1", "2", "3", "5"] }, // 3 of 4 correct
    });

    expect(state.spotlight?.isCorrect).toBe(false);
    expect(state.spotlight?.isPartialCredit).toBe(true);
    expect(state.spotlight?.scoreCorrect).toBe(3);
    expect(state.spotlight?.scoreTotal).toBe(4);
    // Returns 3000 stake + 25% of 4500 reward = +1125 net
    expect(state.teams[activeTid].balance).toBe(balanceBefore + 1125);
  });

  it("allows FORCE_END_ROUND to unlock next round early and REPAY_DEBT / RENAME_TEAM cleanly", () => {
    let state = createInitialGameState("test-room");
    state = applyGameAction(state, { type: "JOIN_PLAYER", playerId: "p1", name: "Оля", teamId: "team-1" });
    state = applyGameAction(state, { type: "START_GAME" });

    // Rename team updates both name (28-char cap) and shortName
    state = applyGameAction(state, {
      type: "RENAME_TEAM",
      teamId: "team-1",
      name: "Супер Фінансові Титани України",
    });
    expect(state.teams["team-1"].name).toBe("Супер Фінансові Титани Украї");
    expect(state.teams["team-1"].shortName).toBe("Супер Фінансов…");

    // Cannot go to round 2 yet
    expect(canAdvanceToRound(state, 2)).toBe(false);

    // Force-ending round 1 switches to round_summary and unlocks round 2
    state = applyGameAction(state, { type: "FORCE_END_ROUND" });
    expect(state.phase).toBe("round_summary");
    expect(state.forceClosedRounds).toContain(1);
    expect(canAdvanceToRound(state, 2)).toBe(true);

    // Sanation debt triggers below $500, then REPAY_DEBT clears debt once balance >= debt + 500
    state = applyGameAction(state, {
      type: "ADJUST_BALANCE",
      teamId: "team-1",
      delta: -9700,
    });
    expect(state.teams["team-1"].debt).toBe(3250);
    expect(state.teams["team-1"].balance).toBe(2800);

    // Add +$2000 so balance (4800) >= debt (3250) + 500
    state = applyGameAction(state, {
      type: "ADJUST_BALANCE",
      teamId: "team-1",
      delta: 2000,
    });
    state = applyGameAction(state, { type: "REPAY_DEBT", teamId: "team-1" });
    expect(state.teams["team-1"].debt).toBe(0);
    expect(state.teams["team-1"].balance).toBe(1550);
  });

  it("generates valid QR code matrices with finder patterns and SVG path", () => {
    const shortQr = generateQrMatrix("http://localhost:3000/play");
    expect(shortQr.size).toBeGreaterThanOrEqual(25);
    // Top-left 7x7 finder outer corners & center
    expect(shortQr.modules[0][0]).toBe(true);
    expect(shortQr.modules[0][6]).toBe(true);
    expect(shortQr.modules[3][3]).toBe(true);
    expect(shortQr.modules[1][1]).toBe(false);
    // Top-right & bottom-left finder corners + fixed dark module
    expect(shortQr.modules[0][shortQr.size - 1]).toBe(true);
    expect(shortQr.modules[shortQr.size - 1][0]).toBe(true);
    expect(shortQr.modules[shortQr.size - 8][8]).toBe(true);

    const longQr = generateQrMatrix(
      "https://classroom.example.com/play?roomId=finance-10a-spring-2026"
    );
    expect(longQr.size).toBeGreaterThanOrEqual(33);
    const path = qrMatrixToSvgPath(longQr.modules);
    expect(path.startsWith("M")).toBe(true);
  });

  it("records individual votes from buyer-team students into studentResponses and exports student CSV/TSV tables", () => {
    let state = createInitialGameState("test-room");
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p1",
      name: "Капітан1",
      teamId: "team-1",
    });
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p2",
      name: "Аналітик1",
      teamId: "team-1",
      wantCaptain: false,
    });
    state = applyGameAction(state, {
      type: "JOIN_PLAYER",
      playerId: "p3",
      name: "Капітан2",
      teamId: "team-2",
    });
    state = applyGameAction(state, { type: "START_GAME" });

    // Team-1 buys single-choice lot-1-1
    const lot11 = MARKET_LOTS.find((l) => l.id === "lot-1-1")!;
    const correctAns = getOfficialPayload(lot11);
    const wrongAns: AnswerPayload =
      lot11.questionType === "single"
        ? {
            type: "single",
            optionId: lot11.options.find((o) => o.id !== lot11.correctOptionId)!.id,
          }
        : correctAns;

    state = applyGameAction(state, {
      type: "BUY_LOT",
      teamId: "team-1",
      lotId: "lot-1-1",
    });

    // Rival p3 cannot vote on team-1's bought lot (bets on derivatives instead)
    const afterRivalVote = applyGameAction(state, {
      type: "VOTE_ANSWER",
      playerId: "p3",
      answer: wrongAns,
    });
    expect(afterRivalVote).toBe(state);

    // Inside buyer team-1: Analyst votes wrong, Captain submits correct
    state = applyGameAction(state, {
      type: "VOTE_ANSWER",
      playerId: "p2",
      answer: wrongAns,
    });
    state = applyGameAction(state, {
      type: "SUBMIT_ANSWER",
      teamId: "team-1",
      answer: correctAns,
    });
    expect(state.spotlight?.isCorrect).toBe(true);

    // Next turn, team-2 buys lot-1-2 and p3 submits right
    state = applyGameAction(state, { type: "NEXT_AFTER_REVEAL" });
    const lot12 = MARKET_LOTS.find((l) => l.id === "lot-1-2")!;
    state = applyGameAction(state, {
      type: "BUY_LOT",
      teamId: "team-2",
      lotId: "lot-1-2",
    });
    state = applyGameAction(state, {
      type: "SUBMIT_ANSWER",
      teamId: "team-2",
      answer: getOfficialPayload(lot12),
    });

    const summary = getStudentSummaryRows(state);
    const s1 = summary.find((s) => s.playerId === "p1")!;
    const s2 = summary.find((s) => s.playerId === "p2")!;
    const s3 = summary.find((s) => s.playerId === "p3")!;
    expect(s1.exactCount).toBe(1);
    expect(s1.accuracyPct).toBe(100);
    expect(s2.votedCount).toBe(1);
    expect(s2.wrongCount).toBe(1);
    expect(s2.accuracyPct).toBe(0);
    expect(s3.votedCount).toBe(1);
    expect(s3.exactCount).toBe(1);

    const tsv = generateStudentTsvTable(state);
    expect(tsv).toContain("Студент\tКоманда");
    expect(tsv).toContain("Аналітик1");
    expect(tsv).toContain("T-101");

    const csv = generateStudentCsvReport(state);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("Капітан2");
  });
});
