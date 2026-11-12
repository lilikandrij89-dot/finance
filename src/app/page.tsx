"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Check,
  Copy,
  MonitorPlay,
  ShieldCheck,
  Smartphone,
  TrendingUp,
} from "lucide-react";

export default function HomePage() {
  const [copied, setCopied] = useState(false);

  const copyPlayLink = () => {
    const url = `${window.location.origin}/play`;
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-6xl flex-col justify-center px-5 py-12">
      {/* Header / Hero */}
      <div className="mb-10 max-w-3xl space-y-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-orange-300 bg-orange-100 px-4 py-1.5 text-xs font-bold text-orange-900">
          <TrendingUp className="h-3.5 w-3.5" />
          Підсумкове заняття · «Фінансове планування та прогнозування» (п. 3.9.1–3.9.4)
        </div>
        <h1 className="font-display text-3xl font-bold leading-tight tracking-tight text-[#231710] sm:text-5xl">
          ФІНАНСОВИЙ ШТОРМ: Ринок Активів
        </h1>
        <p className="text-base leading-relaxed text-[#5E4636] sm:text-lg">
          Інтерактивний біржовий симулятор для 5 команд у реальному часі.
          Оберіть роль вашого пристрою нижче, щоб почати заняття.
        </p>
      </div>

      {/* 3 Role Cards */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* 1. Projector */}
        <section className="surface-card flex flex-col justify-between rounded-3xl p-6">
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-200 bg-orange-100 text-orange-800">
              <MonitorPlay className="h-6 w-6" />
            </div>
            <h2 className="font-display mb-2 text-xl font-bold text-[#231710]">
              Екран проєктора
            </h2>
            <p className="text-sm leading-relaxed text-[#5E4636]">
              Виведіть на великий екран аудиторії: вітрина активів, рейтинг
              капіталу, таймер, живі ставки та фінансова рулетка.
            </p>
          </div>
          <Link
            href="/projector"
            className="btn-press mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-300 bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-900 hover:bg-orange-100"
          >
            Відкрити /projector
          </Link>
        </section>

        {/* 2. Students (Primary entry CTA) */}
        <section className="surface-card flex flex-col justify-between rounded-3xl border-orange-400 p-6 ring-2 ring-orange-500/20">
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-orange-700 text-white">
              <Smartphone className="h-6 w-6" />
            </div>
            <h2 className="font-display mb-2 text-xl font-bold text-[#231710]">
              Смартфон студента
            </h2>
            <p className="text-sm leading-relaxed text-[#5E4636]">
              Вхід для 25 учасників (Капітан + Аналітики): купівля активів,
              голосування в конструкторах, ставки та Чорний ринок.
            </p>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            <Link
              href="/play"
              className="btn-press inline-flex min-h-[44px] flex-1 items-center justify-center rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-orange-800"
            >
              Увійти в /play
            </Link>
            <button
              type="button"
              onClick={copyPlayLink}
              className="btn-press inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-orange-200 bg-white px-3.5 py-2.5 text-xs font-bold text-[#5E4636] hover:bg-orange-50"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-700" /> Скопійовано
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Посилання
                </>
              )}
            </button>
          </div>
        </section>

        {/* 3. Teacher Admin */}
        <section className="surface-card flex flex-col justify-between rounded-3xl p-6">
          <div>
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-orange-200 bg-orange-100 text-orange-800">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="font-display mb-2 text-xl font-bold text-[#231710]">
              Пульт викладача
            </h2>
            <p className="text-sm leading-relaxed text-[#5E4636]">
              Панель керування грою: шпаргалка з відповідями та тезами конспекту,
              таймери, рулетка, матриця оцінювання та експорт CSV.
            </p>
          </div>
          <Link
            href="/admin"
            className="btn-press mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl border border-orange-300 bg-orange-50 px-4 py-2.5 text-sm font-bold text-orange-900 hover:bg-orange-100"
          >
            Відкрити /admin
          </Link>
        </section>
      </div>

      {/* Clear 3-step classroom guide */}
      <section className="surface-tint mt-8 rounded-3xl p-6">
        <h2 className="mb-3 text-sm font-bold text-[#231710]">
          Як провести пару за 3 кроки
        </h2>
        <div className="grid gap-4 text-sm text-[#5E4636] sm:grid-cols-3">
          <div>
            <strong className="text-orange-900">1. Підключіть екрани:</strong>{" "}
            відкрийте <code className="font-mono-num">/projector</code> на
            екрані аудиторії та <code className="font-mono-num">/admin</code> на
            ноутбуці викладача.
          </div>
          <div>
            <strong className="text-orange-900">2. Зберіть команди:</strong>{" "}
            роздайте студентам посилання на{" "}
            <code className="font-mono-num">/play</code> — порожні команди без
            гравців автоматично не беруть участі.
          </div>
          <div>
            <strong className="text-orange-900">3. Ведіть торги:</strong>{" "}
            натискайте головну кнопку в{" "}
            <code className="font-mono-num">/admin</code>, коментуйте результати
            за шпаргалкою та запускайте рулетку між раундами.
          </div>
        </div>
      </section>
    </main>
  );
}
