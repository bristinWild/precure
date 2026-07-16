import { SearchResult } from "cliper-memory";

function block(title: string, memories: any[]) {
    if (!memories.length) return "";

    return [
        `## ${title}`,
        "",
        ...memories.map(
            (m) => `[${m.type}] ${m.title}\n${m.content}`
        ),
    ].join("\n\n");
}

export function formatSearchResult(result: SearchResult): string {
    return [
        block("Architecture", result.architecture),
        block("Files", result.files),
        block("Dependencies", result.dependencies),
        block("Repository", result.repository),
        block("Commits", result.commits),
        block("Gaps", result.gaps),
    ]
        .filter(Boolean)
        .join("\n\n");
}