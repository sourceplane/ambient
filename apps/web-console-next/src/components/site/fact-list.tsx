"use client";

import type { PublicFact } from "@saas/contracts/community";
import { cn } from "@/lib/cn";
import { interestingShare } from "@/lib/site-title";
import { SpoilerVeil } from "./spoiler-veil";

/**
 * Trivia, goofs, quotes and the rest.
 *
 * Quotes render as structured dialogue because the API stores them that way —
 * speaker and line, not a blob with newlines in it. That is the whole reason
 * the schema has a `title_quote_lines` table.
 */
export function FactList({
  facts,
  revealAll,
  className,
}: {
  facts: PublicFact[];
  revealAll?: boolean;
  className?: string;
}) {
  if (facts.length === 0) return null;
  return (
    <ul className={cn("space-y-4", className)}>
      {facts.map((fact) => (
        <li key={fact.id} className="site-hairline border-b pb-4 last:border-0 last:pb-0">
          <SpoilerVeil revealed={revealAll || !fact.hasSpoilers}>
            <FactBody fact={fact} />
          </SpoilerVeil>
          <FactVotes fact={fact} />
        </li>
      ))}
    </ul>
  );
}

function FactBody({ fact }: { fact: PublicFact }) {
  if (fact.kind === "quote" && fact.quoteLines.length > 0) {
    return (
      <dl className="space-y-1 text-sm leading-relaxed">
        {fact.quoteLines.map((line, index) => (
          <div key={index} className="flex gap-2">
            {line.speaker ? (
              <dt className="shrink-0 font-semibold">{line.speaker}:</dt>
            ) : null}
            <dd className="min-w-0">{line.line}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return <p className="whitespace-pre-line text-sm leading-relaxed">{fact.body}</p>;
}

function FactVotes({ fact }: { fact: PublicFact }) {
  const share = interestingShare(fact.interestingVotes, fact.totalVotes);
  if (share === null) return null;
  return (
    <p className="site-meta site-num mt-2 text-xs">
      {share}% of {fact.totalVotes} found this interesting
    </p>
  );
}
