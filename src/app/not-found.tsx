import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <div className="surface-card max-w-md rounded-3xl p-8">
        <h1 className="font-display mb-2 text-2xl font-bold text-[#231710]">
          Сторінку не знайдено
        </h1>
        <p className="mb-6 text-sm leading-relaxed text-[#5E4636]">
          Оберіть один із робочих екранів гри: проєктор, смартфон студента або
          пульт викладача.
        </p>
        <Link
          href="/"
          className="btn-press inline-flex min-h-[44px] items-center justify-center rounded-xl bg-orange-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-800"
        >
          Повернутися на головну
        </Link>
      </div>
    </main>
  );
}
