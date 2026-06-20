import React from 'react';

// Minimal, dependency-free markdown renderer for our own TRUSTED legal documents
// (sourced from /legal/*.md via Vite ?raw imports). Not a general CommonMark engine —
// it covers exactly what the legal docs use: #/##/### headings, **bold**, *italic*,
// [text](url) links, `code`, bullet lists, horizontal rules, and paragraphs. Content is
// rendered as React elements (never dangerouslySetInnerHTML).

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|\*([^*]+)\*|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`)/;
  let remaining = text;
  let i = 0;
  while (remaining.length) {
    const m = remaining.match(pattern);
    if (!m || m.index === undefined) { nodes.push(remaining); break; }
    if (m.index > 0) nodes.push(remaining.slice(0, m.index));
    const tok = m[0];
    const key = `${keyPrefix}-${i}`;
    if (tok.startsWith('**')) nodes.push(<strong key={key}>{m[2]}</strong>);
    else if (tok.startsWith('[')) nodes.push(<a key={key} href={m[5]} target="_blank" rel="noopener noreferrer" className="text-primary underline">{m[4]}</a>);
    else if (tok.startsWith('`')) nodes.push(<code key={key} className="px-1 py-0.5 rounded bg-muted text-sm">{m[6]}</code>);
    else nodes.push(<em key={key}>{m[3]}</em>);
    remaining = remaining.slice(m.index + tok.length);
    i += 1;
  }
  return nodes;
}

export function MarkdownView({ source }: { source: string }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: React.ReactNode[] = [];
  let para: string[] = [];
  let list: string[] = [];
  let k = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={`p${k}`} className="text-muted-foreground leading-relaxed">{renderInline(para.join(' '), `p${k}`)}</p>);
      k += 1; para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      blocks.push(
        <ul key={`u${k}`} className="list-disc pl-6 space-y-1 text-muted-foreground">
          {list.map((it, idx) => <li key={idx}>{renderInline(it, `l${k}-${idx}`)}</li>)}
        </ul>,
      );
      k += 1; list = [];
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushPara(); flushList();
      const lvl = Math.min(headingMatch[1].length, 4);
      const txt = headingMatch[2];
      const cls = lvl === 1 ? 'text-2xl font-bold mt-6 mb-2 text-foreground'
        : lvl === 2 ? 'text-xl font-semibold mt-5 mb-2 text-foreground'
        : 'text-lg font-semibold mt-4 mb-1 text-foreground';
      const Tag = (`h${lvl}` as unknown) as keyof JSX.IntrinsicElements;
      blocks.push(<Tag key={`h${k}`} className={cls}>{renderInline(txt, `h${k}`)}</Tag>);
      k += 1;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flushPara(); flushList(); blocks.push(<hr key={`hr${k}`} className="my-4 border-border" />); k += 1; continue; }
    if (/^\s*[-*]\s+/.test(line)) { flushPara(); list.push(line.replace(/^\s*[-*]\s+/, '')); continue; }
    if (line.trim() === '') { flushPara(); flushList(); continue; }
    flushList(); para.push(line.trim());
  }
  flushPara(); flushList();
  return <div className="space-y-3">{blocks}</div>;
}
