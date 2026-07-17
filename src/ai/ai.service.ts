import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { SearchResult } from 'cliper-memory';

@Injectable()
export class AiService {
  private client?: OpenAI;

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }

    return this.client;
  }

  private formatSection(
    title: string,
    memories: SearchResult['files'],
  ): string {
    if (!memories.length) return '';

    return `## ${title}

${memories
  .map(
    (m) =>
      `### ${m.title} [${m.id}]

${m.content}`,
  )
  .join('\n\n')}
`;
  }

  async answer(
    question: string,
    search: SearchResult,
    audience?: string,
  ): Promise<string> {
    const context = `
${this.formatSection('Architecture', search.architecture)}

${this.formatSection('Files', search.files)}

${this.formatSection('Dependencies', search.dependencies)}

${this.formatSection('Packages', search.packages)}

${this.formatSection('Repository', search.repository)}

${this.formatSection('Commits', search.commits)}

${this.formatSection('Gaps', search.gaps)}
`;

    const response = await this.getClient().responses.create({
      model: process.env.PRECURE_MODEL ?? 'gpt-5.5-2026-04-23',
      input: [
        {
          role: 'system',
          content: `
You are Precure, a repository-memory assistant.

You answer questions ONLY using the repository memories provided.

The memories are grouped by category.

Rules:
- Use Architecture for design questions.
- Use Files for implementation questions.
- Use Dependencies for package/module questions.
- Use Packages for external library and npm package questions.
- Use Repository for project-level questions.
- Use Commits only for history or recent changes.
- Use Gaps only when discussing missing documentation or issues.
- Never invent files, APIs or behavior.
- If the memories don't contain the answer, say so.
- Cite the supporting memory IDs in square brackets, for example [architecture:src/sdk/init.ts].
- Ignore unrelated sections.
- Summarize instead of copying large chunks.
- Start with a plain-English answer suitable for the stated audience. The audience
  may be marketing, design, DevOps, HR, product, leadership, engineering, or a
  mixed team. Explain technical terms briefly when they are necessary, then provide
  technical detail and supporting references.
- By default, lead with 3–5 concise, high-signal points and keep the answer under
  500 words. Offer to expand on a specific area instead of dumping every detail.
`,
        },
        {
          role: 'user',
          content: `
Question:

${question}

Audience:

${audience?.trim() || 'a mixed cross-functional team'}

Repository Memory:

${context}
`,
        },
      ],
    });

    return response.output_text;
  }
}
