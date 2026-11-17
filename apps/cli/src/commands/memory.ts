import React from 'react';
import { render } from 'ink';
import type { MemoryCategory, MemoryItem } from '@evolve/core';
import { MemoryList, type MemoryEntry } from '../components/MemoryList.js';
import { CliContext } from '../context.js';
import { Theme } from '../components/Theme.js';

export interface MemoryCommandOptions {
  subcommand?: string | undefined;
  args?: string[] | undefined;
  add?: boolean | undefined;
  category?: string | undefined;
  key?: string | undefined;
  content?: string | undefined;
}

function toEntry(m: MemoryItem): MemoryEntry {
  return {
    id: m.id,
    category: m.category,
    key: m.key,
    content: m.content,
    confidence: m.confidence,
    sourceType: m.sourceType,
    verificationStatus: m.verificationStatus,
    accessCount: m.accessCount,
    supersededBy: m.supersededBy,
    projectId: m.projectId,
  };
}

export async function runMemoryCommand(options?: MemoryCommandOptions): Promise<void> {
  const context = new CliContext();
  const subcommand = options?.subcommand || 'list';
  const args = options?.args || [];

  try {
    // 1. Direct explicit add
    if (options?.add && options.category && options.key && options.content) {
      const candidate = context.memoryExtractor.extractFromUserInstruction(options.content) || {
        category: (options.category as MemoryCategory) || 'user_preference',
        key: options.key,
        content: options.content,
        projectId: options.category === 'user_preference' ? undefined : context.projectId,
        sourceType: 'explicit_user' as const,
        confidence: 1.0,
        verificationStatus: 'verified' as const,
      };

      const saved = context.memoryConsolidator.consolidate(candidate);
      console.log(
        `\n${Theme.icons.check} Stored memory: [${saved.category}] ${saved.key} -> "${saved.content}"\n`,
      );
      return;
    }

    switch (subcommand.toLowerCase()) {
      case 'add': {
        const [cat, k, ...rest] = args;
        const text = rest.join(' ');
        if (!cat || !k || !text) {
          console.log(`\nUsage: evolve memory add <user_preference|project_rule|experience> <key> <content>\n`);
          return;
        }
        const saved = context.memoryConsolidator.consolidate({
          category: cat as MemoryCategory,
          key: k,
          content: text,
          projectId: cat === 'user_preference' ? undefined : context.projectId,
          sourceType: 'explicit_user',
          confidence: 1.0,
          verificationStatus: 'verified',
        });
        console.log(`\n${Theme.icons.check} Added memory [${saved.category}] ${saved.key}\n`);
        break;
      }

      case 'search': {
        const query = args.join(' ');
        if (!query) {
          console.log('\nUsage: evolve memory search <keywords>\n');
          return;
        }
        const results = context.memoryRetriever.retrieve({
          prompt: query,
          projectId: context.projectId,
          maxTokens: 3000,
        });

        const app = render(
          React.createElement(MemoryList, {
            memories: results.memories.map(toEntry),
            title: `SEARCH RESULTS FOR "${query}"`,
          }),
          { patchConsole: false },
        );
        app.unmount();
        break;
      }

      case 'user':
      case 'preferences': {
        const prefs = context.memoryService.listPreferences();
        const app = render(
          React.createElement(MemoryList, {
            memories: prefs.map(toEntry),
            title: 'USER PREFERENCES (GLOBAL)',
          }),
          { patchConsole: false },
        );
        app.unmount();
        break;
      }

      case 'project':
      case 'architecture': {
        const rules = context.memoryService.listProjectRules(context.projectId);
        const decs = context.memoryService.listDecisions(context.projectId);
        const app = render(
          React.createElement(MemoryList, {
            memories: [...rules, ...decs].map(toEntry),
            title: `PROJECT ARCHITECTURE & RULES (${context.projectId})`,
          }),
          { patchConsole: false },
        );
        app.unmount();
        break;
      }

      case 'experience':
      case 'solutions': {
        const exps = context.memoryService.listExperiences(context.projectId);
        const app = render(
          React.createElement(MemoryList, {
            memories: exps.map(toEntry),
            title: 'VERIFIED DEVELOPMENT EXPERIENCES',
          }),
          { patchConsole: false },
        );
        app.unmount();
        break;
      }

      case 'failed':
      case 'attempts': {
        const failed = context.memoryService.listFailedAttempts(context.projectId);
        const app = render(
          React.createElement(MemoryList, {
            memories: failed.map(toEntry),
            title: 'FAILED APPROACHES & POSTMORTEMS',
          }),
          { patchConsole: false },
        );
        app.unmount();
        break;
      }

      case 'review':
      case 'proposed': {
        const proposed = context.memoryService.listProposed(context.projectId);
        const app = render(
          React.createElement(MemoryList, {
            memories: proposed.map(toEntry),
            title: 'PROPOSED MEMORIES PENDING USER REVIEW',
          }),
          { patchConsole: false },
        );
        app.unmount();
        break;
      }

      case 'inspect': {
        const id = args[0];
        if (!id) {
          console.log('\nUsage: evolve memory inspect <memoryId>\n');
          return;
        }
        const mem = context.memoryService.findById(id);
        if (!mem) {
          console.log(`\n${Theme.icons.cross} Memory not found: ${id}\n`);
          return;
        }
        console.log('\n--- Memory Record ---');
        console.log(JSON.stringify(mem, null, 2));
        console.log('---------------------\n');
        break;
      }

      case 'approve':
      case 'verify': {
        const id = args[0];
        if (!id) {
          console.log('\nUsage: evolve memory approve <memoryId>\n');
          return;
        }
        const updated = context.memoryService.updateStatus(id, 'verified');
        if (updated) {
          console.log(`\n${Theme.icons.check} Approved memory: ${id} is now 'verified'\n`);
        } else {
          console.log(`\n${Theme.icons.cross} Memory not found: ${id}\n`);
        }
        break;
      }

      case 'deprecate': {
        const id = args[0];
        if (!id) {
          console.log('\nUsage: evolve memory deprecate <memoryId>\n');
          return;
        }
        const updated = context.memoryService.deprecate(id);
        if (updated) {
          console.log(`\n${Theme.icons.check} Deprecated memory: ${id}\n`);
        } else {
          console.log(`\n${Theme.icons.cross} Memory not found: ${id}\n`);
        }
        break;
      }

      case 'delete':
      case 'remove': {
        const id = args[0];
        if (!id) {
          console.log('\nUsage: evolve memory delete <memoryId>\n');
          return;
        }
        const deleted = context.memoryService.delete(id);
        if (deleted) {
          console.log(`\n${Theme.icons.check} Deleted memory: ${id}\n`);
        } else {
          console.log(`\n${Theme.icons.cross} Memory not found: ${id}\n`);
        }
        break;
      }

      case 'list':
      default: {
        const raw = context.memoryService.search('', {
          projectId: context.projectId,
          limit: 50,
        });
        const app = render(
          React.createElement(MemoryList, {
            memories: raw.map(toEntry),
            title: `ALL PERSISTENT MEMORIES (${context.projectId})`,
          }),
          { patchConsole: false },
        );
        app.unmount();
        break;
      }
    }
  } finally {
    context.close();
  }
}
