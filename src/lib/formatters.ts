import { TEAM_ORDER } from "@/data/question-bank";
import { getActiveTeamIds, getNetWorth } from "@/lib/game-engine";
import { GameState, RiskTier, TopicCode } from "@/types/game";

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
