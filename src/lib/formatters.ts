import { getLotById, TEAM_ORDER } from "@/data/question-bank";
import { getActiveTeamIds, getNetWorth } from "@/lib/game-engine";
import {
  GameState,
  RiskTier,
  StudentVoteRecord,
  TeamId,
  TopicCode,
} from "@/types/game";

export function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const abs = Math.abs(Math.round(amount));
  return `${sign}$${abs.toLocaleString("uk-UA").replace(/\u00a0/g, " ")}`;
}

export function formatDelta(amount: number): string {
  const prefix = amount > 0 ? "+" : "";
  return `${prefix}${formatMoney(amount)}`;
}

export function getRiskTierMeta(tier: RiskTier): {
  label: string;
  badgeClass: string;
  borderClass: string;
  accentHex: string;
} {
  switch (tier) {
    case "cheap":
      return {
        label: "База · Низький ризик",
        badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-300",
        borderClass: "border-emerald-300/80",
        accentHex: "#047857",
      };
    case "bond":
      return {
        label: "Облігація · Середній ризик",
        badgeClass: "bg-orange-100 text-orange-900 border-orange-300",
        borderClass: "border-orange-300",
        accentHex: "#C2410C",
      };
    case "derivative":
      return {
        label: "Дериватив · Long/Short",
        badgeClass: "bg-rose-50 text-rose-800 border-rose-300",
        borderClass: "border-rose-300",
        accentHex: "#BE123C",
      };
    case "toxic":
      return {
        label: "Кіт у мішку · Секрет",
        badgeClass: "bg-violet-50 text-violet-800 border-violet-300",
        borderClass: "border-violet-300",
        accentHex: "#6D28D9",
      };
  }
}

export function getLeaderboard(state: GameState, includeEmpty = false) {
  const ids = includeEmpty
    ? TEAM_ORDER
    : getActiveTeamIds(state.teams, state.players);
  return [...ids]
    .map((id) => state.teams[id])
    .sort((a, b) => getNetWorth(b) - getNetWorth(a));
}

export function generateCsvReport(state: GameState): string {
  const topics: TopicCode[] = ["3.9.1", "3.9.2", "3.9.3", "3.9.4"];
  const header = [
    "Місце",
    "Команда",
    "Баланс ($)",
    "Борг санації ($)",
    "Чистий капітал ($)",
    "Санацій",
    "Куплено лотів",
    "Правильних відповідей",
    "Прибуток від ставок ($)",
    "Успішність 3.9.1",
    "Успішність 3.9.2",
    "Успішність 3.9.3",
    "Успішність 3.9.4",
    "Учасники",
  ];

  const sorted = getLeaderboard(state, false);
  const rows = sorted.map((team, index) => {
    const members = Object.values(state.players)
      .filter((p) => p.teamId === team.id)
      .map((p) => `${p.name}${p.role === "captain" ? " (Капітан)" : ""}`)
      .join("; ");

    const topicCols = topics.map((t) => {
      const s = team.stats[t];
      return s.attempted > 0 ? `${s.correct}/${s.attempted}` : "—";
    });

    return [
      index + 1,
      team.name,
      team.balance,
      team.debt,
      getNetWorth(team),
      team.sanationCount,
      team.lotsBought,
      team.correctAnswers,
      team.betProfit,
      ...topicCols,
      members || "—",
    ]
      .map((val) => `"${String(val).replace(/"/g, '""')}"`)
      .join(",");
  });

  // UTF-8 BOM for clean Excel import with Cyrillic
  return "\uFEFF" + [header.join(","), ...rows].join("\n");
}

export interface StudentSummaryRow {
  playerId: string;
  name: string;
  teamId: TeamId;
  teamName: string;
  roleLabel: string;
  votedCount: number;
  exactCount: number;
  partialCount: number;
  wrongCount: number;
  accuracyPct: number;
  byLot: Record<string, StudentVoteRecord>;
}

export function getEvaluatedLotColumns(state: GameState): Array<{
  lotId: string;
  ticker: string;
  topic: TopicCode;
}> {
  const seen = new Set<string>();
  const cols: Array<{ lotId: string; ticker: string; topic: TopicCode }> = [];

  for (const h of state.history) {
    const lot = getLotById(h.lotId);
    if (!lot || lot.questionType === "open" || seen.has(lot.id)) continue;
    seen.add(lot.id);
    cols.push({ lotId: lot.id, ticker: lot.ticker, topic: lot.topic });
  }

  for (const playerVotes of Object.values(state.studentResponses ?? {})) {
    for (const rec of Object.values(playerVotes)) {
      if (seen.has(rec.lotId)) continue;
      seen.add(rec.lotId);
      cols.push({ lotId: rec.lotId, ticker: rec.ticker, topic: rec.topic });
    }
  }

  return cols;
}

export function getStudentSummaryRows(state: GameState): StudentSummaryRow[] {
  const responses = state.studentResponses ?? {};
  const studentMeta = new Map<
    string,
    { name: string; teamId: TeamId; roleLabel: string }
  >();

  for (const p of Object.values(state.players)) {
    studentMeta.set(p.id, {
      name: p.name,
      teamId: p.teamId,
      roleLabel: p.role === "captain" ? "Капітан" : "Аналітик",
    });
  }

  for (const [pid, byLot] of Object.entries(responses)) {
    if (studentMeta.has(pid)) continue;
    const first = Object.values(byLot)[0];
    if (first) {
      studentMeta.set(pid, {
        name: first.playerName,
        teamId: first.teamId,
        roleLabel: "Учасник (вийшов)",
      });
    }
  }

  const rows: StudentSummaryRow[] = [];
  for (const [playerId, meta] of studentMeta.entries()) {
    const byLot = responses[playerId] ?? {};
    const records = Object.values(byLot);
    const votedCount = records.length;
    const exactCount = records.filter((r) => r.isExact).length;
    const partialCount = records.filter((r) => !r.isExact && r.isPartial).length;
    const wrongCount = votedCount - exactCount - partialCount;
    const accuracyPct =
      votedCount > 0 ? Math.round((exactCount / votedCount) * 100) : 0;

    rows.push({
      playerId,
      name: meta.name,
      teamId: meta.teamId,
      teamName: state.teams[meta.teamId]?.shortName ?? meta.teamId,
      roleLabel: meta.roleLabel,
      votedCount,
      exactCount,
      partialCount,
      wrongCount,
      accuracyPct,
      byLot,
    });
  }

  return rows.sort((a, b) => {
    const teamDiff =
      TEAM_ORDER.indexOf(a.teamId) - TEAM_ORDER.indexOf(b.teamId);
    if (teamDiff !== 0) return teamDiff;
    return a.name.localeCompare(b.name, "uk");
  });
}

function buildStudentTableMatrix(state: GameState): {
  header: string[];
  rows: string[][];
} {
  const lotCols = getEvaluatedLotColumns(state);
  const students = getStudentSummaryRows(state);

  const header = [
    "Студент",
    "Команда",
    "Роль",
    "Відповідей",
    "Точних",
    "Часткових",
    "Помилок",
    "Точність (%)",
    ...lotCols.map((c) => `${c.ticker} (${c.topic})`),
  ];

  const rows = students.map((st) => {
    const lotCells = lotCols.map((c) => {
      const rec = st.byLot[c.lotId];
      if (!rec) return "—";
      const mark = rec.isExact
        ? "✓"
        : rec.isPartial
        ? `~ ${rec.correctCount}/${rec.totalCount}`
        : "✕";
      return `${mark} (${rec.answerSummary})`;
    });

    return [
      st.name,
      st.teamName,
      st.roleLabel,
      String(st.votedCount),
      String(st.exactCount),
      String(st.partialCount),
      String(st.wrongCount),
      st.votedCount > 0 ? `${st.accuracyPct}%` : "—",
      ...lotCells,
    ];
  });

  return { header, rows };
}

export function generateStudentCsvReport(state: GameState): string {
  const { header, rows } = buildStudentTableMatrix(state);
  const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
  return (
    "\uFEFF" +
    [
      header.map(escape).join(","),
      ...rows.map((r) => r.map(escape).join(",")),
    ].join("\n")
  );
}

export function generateStudentTsvTable(state: GameState): string {
  const { header, rows } = buildStudentTableMatrix(state);
  const clean = (val: string) => val.replace(/[\t\r\n]+/g, " ");
  return [
    header.map(clean).join("\t"),
    ...rows.map((r) => r.map(clean).join("\t")),
  ].join("\n");
}
