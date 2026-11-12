"use client";

import { useEffect, useRef, useState } from "react";
import { ROULETTE_SECTORS } from "@/data/question-bank";
import { RouletteSectorId } from "@/types/game";

interface RouletteWheelProps {
  spinId: number;
  targetSectorId: RouletteSectorId | null;
  isSpinning: boolean;
  size?: number;
}

export function RouletteWheel({
  spinId,
  targetSectorId,
  isSpinning,
  size = 340,
}: RouletteWheelProps) {
  const [rotation, setRotation] = useState(0);
  const lastSpinRef = useRef(0);

  useEffect(() => {
    if (!targetSectorId || spinId === lastSpinRef.current) return;
    lastSpinRef.current = spinId;

    const index = ROULETTE_SECTORS.findIndex((s) => s.id === targetSectorId);
    if (index === -1) return;

    const sliceAngle = 360 / ROULETTE_SECTORS.length;
    const targetCenter = index * sliceAngle + sliceAngle / 2;
    const baseAngle = (360 - targetCenter) % 360;
    const fullSpins = 360 * 6;
    const currentMod = rotation % 360;
    const delta = fullSpins + ((baseAngle - currentMod + 360) % 360);

    setRotation((prev) => prev + delta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinId, targetSectorId]);

  const count = ROULETTE_SECTORS.length;
  const slice = 360 / count;
  const radius = 150;
  const center = 160;

  return (
    <div className="relative flex flex-col items-center justify-center">
      <div
        className="z-20 -mb-3 h-0 w-0 border-x-[14px] border-t-[26px] border-x-transparent border-t-orange-700 drop-shadow-[0_4px_8px_rgba(194,65,12,0.35)]"
        aria-hidden="true"
      />
      <div
        className="relative aspect-square max-w-full rounded-full border-4 border-orange-300 bg-white p-2 shadow-[0_14px_38px_-10px_rgba(194,65,12,0.28)]"
        style={{ width: size }}
      >
        <svg
          viewBox="0 0 320 320"
          className="h-full w-full"
          style={{
            transform: `rotate(${rotation}deg)`,
            transition: isSpinning
              ? "transform 4.2s cubic-bezier(0.12, 0.85, 0.18, 1)"
              : "transform 0.5s ease-out",
          }}
        >
          {ROULETTE_SECTORS.map((sector, i) => {
            const startDeg = i * slice - 90;
            const endDeg = (i + 1) * slice - 90;
            const startRad = (startDeg * Math.PI) / 180;
            const endRad = (endDeg * Math.PI) / 180;
            const x1 = center + radius * Math.cos(startRad);
            const y1 = center + radius * Math.sin(startRad);
            const x2 = center + radius * Math.cos(endRad);
            const y2 = center + radius * Math.sin(endRad);

            const midDeg = startDeg + slice / 2;
            const midRad = (midDeg * Math.PI) / 180;
            const textX = center + radius * 0.64 * Math.cos(midRad);
            const textY = center + radius * 0.64 * Math.sin(midRad);
            const words = sector.shortLabel.split(" ");
            const line1 = words.slice(0, Math.ceil(words.length / 2)).join(" ");
            const line2 = words.slice(Math.ceil(words.length / 2)).join(" ");

            return (
              <g key={sector.id}>
                <path
                  d={`M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2} Z`}
                  fill={sector.color}
                  fillOpacity={0.94}
                  stroke="#FFF8F2"
                  strokeWidth="3"
                />
                <text
                  x={textX}
                  y={textY}
                  fill="#ffffff"
                  fontSize="10"
                  fontWeight="800"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  transform={`rotate(${midDeg + 90}, ${textX}, ${textY})`}
                >
                  <tspan x={textX} dy={line2 ? "-0.45em" : "0"}>
                    {line1}
                  </tspan>
                  {line2 && (
                    <tspan x={textX} dy="1.15em">
                      {line2}
                    </tspan>
                  )}
                </text>
              </g>
            );
          })}
          <circle
            cx={center}
            cy={center}
            r="28"
            fill="#FFF8F2"
            stroke="#C2410C"
            strokeWidth="4"
          />
          <text
            x={center}
            y={center + 1}
            fill="#9A3412"
            fontSize="11"
            fontWeight="800"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            ШТОРМ
          </text>
        </svg>
      </div>
    </div>
  );
}
