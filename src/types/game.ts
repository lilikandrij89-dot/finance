export type TeamId = "team-1" | "team-2" | "team-3" | "team-4" | "team-5";

export type TopicCode = "3.9.1" | "3.9.2" | "3.9.3" | "3.9.4";

export type RiskTier = "cheap" | "bond" | "derivative" | "toxic";

export type RoundNumber = 1 | 2 | 3 | 4;

export type PlayerRole = "captain" | "analyst";

export type BlackMarketItemId =
  | "insider_5050"
  | "default_insurance"
  | "short_veto"
  | "double_leverage";

export type RouletteSectorId =
  | "black_swan"
  | "insider_trading"
  | "tax_audit"
  | "leverage_x2"
  | "nbu_refinance"
  | "dividend_boom";

export type QuestionType =
  | "single"
  | "multi"
  | "order"
  | "match"
  | "classify"
  | "open";

export type AnswerPayload =
  | { type: "single"; optionId: string }
  | { type: "multi"; optionIds: string[] }
  | { type: "order"; orderedIds: string[] }
  | { type: "match"; pairs: Record<string, string> }
  | { type: "classify"; buckets: Record<string, string> }
  | { type: "open"; text: string };

export interface QuestionOption {
  id: string;
  label: string;
  text: string;
}

export interface QuestionBase {
  id: string;
  ticker: string;
  title: string;
  round: RoundNumber;
  topic: TopicCode;
  riskTier: RiskTier;
  price: number;
  reward: number;
  defaultPenalty: number; // Extra penalty beyond losing the lot price (e.g. 600 for derivatives, 400 for toxic)
  timerSeconds: number;
  isMystery?: boolean; // Hidden prompt on marketplace for toxic lots
  prompt: string;
  teacherExplanation: string;
  correctSummary: string;
}

export interface SingleQuestion extends QuestionBase {
  questionType: "single";
  options: QuestionOption[];
  correctOptionId: string;
}

export interface MultiQuestion extends QuestionBase {
  questionType: "multi";
  options: QuestionOption[];
  requiredCount: number;
  correctOptionIds: string[];
}

export interface OrderQuestion extends QuestionBase {
  questionType: "order";
  items: QuestionOption[];
  correctOrder: string[];
}

export interface MatchQuestion extends QuestionBase {
  questionType: "match";
  leftItems: QuestionOption[];
  rightOptions: QuestionOption[];
  correctPairs: Record<string, string>;
}

export interface ClassifyQuestion extends QuestionBase {
  questionType: "classify";
  buckets: { id: string; title: string }[];
  items: QuestionOption[];
  correctBuckets: Record<string, string>;
}

export interface OpenQuestion extends QuestionBase {
  questionType: "open";
  samplePoints: string[];
}

export type MarketLot =
  | SingleQuestion
  | MultiQuestion
  | OrderQuestion
  | MatchQuestion
  | ClassifyQuestion
  | OpenQuestion;

export interface Player {
  id: string;
  name: string;
  teamId: TeamId;
  role: PlayerRole;
  joinedAt: number;
}

export interface TopicStats {
  attempted: number;
  correct: number;
}

export interface TeamState {
  id: TeamId;
  name: string;
  shortName: string;
  color: string;
  balance: number;
  debt: number;
  sanationCount: number;
  inventory: BlackMarketItemId[];
  usedBlackMarketThisRound: boolean;
  stats: Record<TopicCode, TopicStats>;
  lotsBought: number;
  correctAnswers: number;
  betProfit: number;
}

export type GamePhase =
  | "lobby"
  | "marketplace"
  | "spotlight"
  | "review"
  | "reveal"
  | "round_summary"
  | "black_market"
  | "roulette"
  | "finished";

export interface TeamBet {
  teamId: TeamId;
  side: "long" | "short";
  amount: number;
  placedAt: number;
}

export interface SettlementEntry {
  teamId: TeamId;
  deltaBalance: number;
  deltaDebt: number;
  reason: string;
  sanationTriggered?: boolean;
}

export interface SpotlightState {
  lotId: string;
  buyerTeamId: TeamId;
  startedAt: number;
  timerEndsAt: number;
  timerPausedRemainingMs: number | null;
  analystVotes: Record<string, AnswerPayload>; // playerId -> vote
  lotRecommendations: Record<string, string>; // playerId -> lotId (on marketplace)
  submittedAnswer: AnswerPayload | null;
  submittedAt: number | null;
  isTimedOut: boolean;
  bets: Record<string, TeamBet>; // teamId -> bet
  betVotes: Record<string, { side: "long" | "short"; amount: number }>; // playerId -> vote
  activePowerUps: BlackMarketItemId[];
  hiddenOptionIds: string[]; // for 50/50 insider hint
  revealedPairIds: string[]; // for 50/50 hint on match/classify
  isCorrect: boolean | null;
  isPartialCredit?: boolean;
  scoreCorrect?: number;
  scoreTotal?: number;
  shortSqueezeTriggered: boolean;
  settlements: SettlementEntry[];
}

export interface RouletteState {
  spinId: number;
  isSpinning: boolean;
  targetSectorId: RouletteSectorId | null;
  targetTeamId: TeamId | null;
  applied: boolean;
  effectLog: string | null;
}

export interface HistoryRecord {
  id: string;
  timestamp: number;
  round: RoundNumber;
  topic: TopicCode;
  lotId: string;
  lotTitle: string;
  buyerTeamId: TeamId;
  isCorrect: boolean;
  netDelta: number;
  summary: string;
}

export interface GameState {
  roomId: string;
  version: number;
  updatedAt: number;
  phase: GamePhase;
  previousPhase: GamePhase | null;
  round: RoundNumber;
  forceClosedRounds?: RoundNumber[];
  draftQueue: TeamId[];
  draftPointer: number;
  purchasedLotIds: string[];
  lotRecommendations: Record<string, string>; // playerId -> lotId during marketplace
  blackMarketRecommendations?: Record<string, BlackMarketItemId>; // playerId -> itemId
  shortSqueezeEventActive: boolean;
  roundLeverageMultiplier: 1 | 2;
  pendingLeverageMultiplier?: 1 | 2;
  jackpotPool: number;
  teams: Record<TeamId, TeamState>;
  players: Record<string, Player>;
  spotlight: SpotlightState | null;
  roulette: RouletteState;
  history: HistoryRecord[];
  lastAnnouncement: string | null;
}

export interface BlackMarketItemDef {
  id: BlackMarketItemId;
  name: string;
  price: number;
  description: string;
  whenUsable: string;
}

export interface RouletteSectorDef {
  id: RouletteSectorId;
  label: string;
  shortLabel: string;
  color: string;
  description: string;
}

export type GameAction =
  | { type: "JOIN_PLAYER"; playerId: string; name: string; teamId: TeamId; wantCaptain?: boolean }
  | { type: "LEAVE_PLAYER"; playerId: string }
  | { type: "ASSIGN_CAPTAIN"; teamId: TeamId; playerId: string }
  | { type: "RENAME_TEAM"; teamId: TeamId; name: string }
  | { type: "START_GAME" }
  | { type: "GO_TO_ROUND"; round: RoundNumber }
  | { type: "FORCE_END_ROUND" }
  | { type: "SKIP_DRAFT_TURN" }
  | { type: "RECOMMEND_LOT"; playerId: string; lotId: string }
  | { type: "BUY_LOT"; teamId: TeamId; lotId: string }
  | { type: "VOTE_ANSWER"; playerId: string; answer: AnswerPayload }
  | { type: "SUBMIT_ANSWER"; teamId: TeamId; answer: AnswerPayload }
  | { type: "USE_POWERUP"; teamId: TeamId; itemId: BlackMarketItemId }
  | { type: "VOTE_BET"; playerId: string; side: "long" | "short"; amount: number }
  | { type: "PLACE_BET"; teamId: TeamId; side: "long" | "short"; amount: number }
  | { type: "ADD_TIMER_SECONDS"; seconds: number }
  | { type: "TOGGLE_PAUSE_TIMER" }
  | { type: "FORCE_REVEAL" }
  | { type: "HOST_GRADE_OPEN_ANSWER"; isCorrect: boolean }
  | { type: "NEXT_AFTER_REVEAL" }
  | { type: "TOGGLE_SHORT_SQUEEZE" }
  | { type: "OPEN_BLACK_MARKET" }
  | { type: "CLOSE_BLACK_MARKET" }
  | { type: "RECOMMEND_BLACK_MARKET"; playerId: string; itemId: BlackMarketItemId }
  | { type: "BUY_BLACK_MARKET_ITEM"; teamId: TeamId; itemId: BlackMarketItemId }
  | { type: "OPEN_ROULETTE" }
  | { type: "SPIN_ROULETTE" }
  | { type: "APPLY_ROULETTE_RESULT" }
  | { type: "CLOSE_ROULETTE" }
  | { type: "REPAY_DEBT"; teamId: TeamId }
  | { type: "ADJUST_BALANCE"; teamId: TeamId; delta: number; reason?: string }
  | { type: "FINISH_GAME" }
  | { type: "RESET_GAME" };
