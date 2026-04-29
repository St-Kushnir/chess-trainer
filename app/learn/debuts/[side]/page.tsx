import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DebutSideToggle } from "@/components/learn/DebutSideToggle";
import { DebutVideoCard } from "@/components/learn/DebutVideoCard";
import {
  debutSideLabel,
  debutVideosForSide,
  isDebutSideId,
  type DebutSideId,
} from "@/lib/learn/debutVideos";

type Props = {
  params: Promise<{ side: string }>;
};

export function generateStaticParams() {
  return [{ side: "blacks" as const }, { side: "whites" as const }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { side } = await params;
  if (!isDebutSideId(side)) {
    return { title: "Дебюти" };
  }
  const color = debutSideLabel(side);
  return {
    title: `Дебюти — ${color.toLowerCase()}`,
    description: `Відео про дебютні ідеї та пастки, коли ти граєш ${side === "whites" ? "білими" : "чорними"} фігурами.`,
  };
}

export default async function DebutsSidePage({ params }: Props) {
  const { side: raw } = await params;
  if (!isDebutSideId(raw)) {
    notFound();
  }
  const side = raw as DebutSideId;
  const videos = debutVideosForSide(side);
  const label = debutSideLabel(side);

  return (
    <div className="mx-auto w-full max-w-[min(100%,90rem)] flex-1 px-4 py-12 sm:px-6 sm:py-16">
      <nav className="text-sm text-muted-foreground">
        <Link href="/learn" className="text-primary hover:underline">
          Навчання
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <Link href="/learn/debuts" className="text-primary hover:underline">
          Дебюти
        </Link>
        <span aria-hidden className="mx-2">
          /
        </span>
        <span className="text-foreground">{label}</span>
      </nav>

      <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Дебюти — {label.toLowerCase()}
          </h1>
          <div
            className="mt-3 h-1 w-14 rounded-full bg-primary"
            aria-hidden
          />
        </div>
        <DebutSideToggle activeSide={side} />
      </div>
      <p className="mt-6 max-w-2xl text-base leading-relaxed text-muted-foreground">
        Натисни на картку, щоб відкрити відео. На широкому екрані ролик відкриється в
        модальному вікні; можна гортати сусідні відео стрілками.
      </p>

      <ul className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {videos.map((item, videoIndex) => (
          <li key={item.id} className="flex h-full min-h-0 min-w-0">
            <DebutVideoCard
              side={side}
              item={item}
              videoIndex={videoIndex}
              allVideos={videos}
            />
          </li>
        ))}
      </ul>

      <p className="mt-10">
        <Link
          href="/learn/debuts"
          className="text-sm font-medium text-primary hover:underline"
        >
          ← Огляд дебютів
        </Link>
      </p>
    </div>
  );
}
