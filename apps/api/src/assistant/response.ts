import { z } from "../openapi";

// Assistant responses carry ISO strings, so the exported types match what the
// browser receives, including over SSE where no client typing converts dates.
const isoTimestamp = z.string().openapi({ format: "date-time" });

export const assistantStatusSchema = z
  .object({
    enabled: z.boolean().openapi({
      description:
        "Whether a saved OpenRouter key can be decrypted, so members can chat. A key OpenRouter rejected last time still counts; `reason` reports that.",
    }),
    reason: z
      .enum([
        "not_configured",
        "key_unreadable",
        "key_rejected",
        "out_of_credits",
      ])
      .nullable()
      .openapi({
        description:
          "Why the assistant is unavailable or degraded. not_configured: no key saved. key_unreadable: the key can no longer be decrypted (AUTH_SECRET changed); an admin must enter it again. key_rejected and out_of_credits: OpenRouter's last answer for this key; they clear when an admin saves the settings again. Null when nothing is wrong.",
      }),
    model: z.string().nullable().openapi({
      description: "The saved model id, or null when no key is saved.",
    }),
    canManage: z.boolean().openapi({
      description:
        "Whether the caller has workspace:manage_settings and can configure the assistant.",
    }),
  })
  .openapi({
    description:
      "Whether the workspace assistant is available. Never includes the key or its hint.",
  })
  .openapi("AssistantStatus");

export const assistantSettingsSchema = z
  .object({
    configured: z.boolean().openapi({
      description: "Whether an OpenRouter key is saved for the workspace.",
    }),
    keyHint: z.string().nullable().openapi({
      description:
        "The last four characters of the saved key after an ellipsis, or null. The key itself is never returned.",
    }),
    keyState: z
      .enum(["ok", "rejected", "out_of_credits", "unreadable"])
      .nullable()
      .openapi({
        description:
          "ok: the key can be used. rejected and out_of_credits: OpenRouter's last answer for this key. unreadable: the key can no longer be decrypted (AUTH_SECRET changed) and must be entered again. Null when no key is saved.",
      }),
    model: z.string().openapi({
      description: "The saved model id, or the default when no key is saved.",
    }),
    defaultModel: z.string(),
    allowDataCollection: z.boolean().openapi({
      description:
        "Whether OpenRouter may route requests to providers that collect or train on prompts.",
    }),
    lastError: z
      .object({
        code: z.string().openapi({
          description: "OPENROUTER_KEY_INVALID or OPENROUTER_CREDITS.",
        }),
        at: isoTimestamp,
      })
      .nullable(),
    updatedAt: isoTimestamp.nullable(),
    updatedBy: z
      .object({ id: z.string(), name: z.string() })
      .nullable()
      .openapi({
        description:
          "Who last saved the settings, or null when unknown or deleted.",
      }),
    modelUnverified: z.boolean().optional().openapi({
      description:
        "Only on save: true when OpenRouter's model list could not be loaded, so the model was saved without being checked.",
    }),
  })
  .openapi({
    description:
      "The workspace's assistant configuration, for admins. Never includes the key.",
  })
  .openapi("AssistantSettings");

export const assistantKeyUsageSchema = z
  .object({
    usageUsd: z.number().openapi({
      description: "Credits the key has used, in US dollars.",
    }),
    limitUsd: z.number().nullable().openapi({
      description: "The key's credit limit in US dollars, or null for none.",
    }),
    limitRemainingUsd: z.number().nullable().openapi({
      description: "Credits left under the limit, or null without a limit.",
    }),
    isFreeTier: z.boolean(),
  })
  .openapi({
    description:
      "Credit usage of the saved OpenRouter key, as OpenRouter reports it. Cached for up to 60 seconds.",
  })
  .openapi("AssistantKeyUsage");

export const assistantModelSchema = z
  .object({
    id: z.string().openapi({ example: "anthropic/claude-sonnet-5.5" }),
    name: z.string(),
    contextLength: z.number().int().nonnegative(),
    promptPerMTokUsd: z.number().nullable().openapi({
      description:
        "US dollars per million prompt tokens, or null when OpenRouter gives no fixed price.",
    }),
    completionPerMTokUsd: z.number().nullable().openapi({
      description:
        "US dollars per million completion tokens, or null when OpenRouter gives no fixed price.",
    }),
    recommended: z.boolean(),
  })
  .openapi("AssistantModel");

export const assistantModelListSchema = z
  .object({
    models: z.array(assistantModelSchema).openapi({
      description:
        "OpenRouter models that support tool calling through chat completions: recommended models first, then by name. Cached for up to an hour.",
    }),
  })
  .openapi("AssistantModelList");

const proposalFieldSchema = z.object({
  key: z.string(),
  kind: z.enum(["text", "markdown", "ref", "date", "list"]),
  value: z.string(),
  from: z.string().nullable().optional(),
});

const nestedTaskSchema = z
  .object({
    title: z.string().openapi({
      description:
        "A new draft's title, or linked work as its ticket id and title, such as `KAN-12 Fix login`.",
    }),
    type: z.enum(["task", "bug"]).nullable().openapi({
      description:
        "A draft's type; null when it takes the default (task), and for linked work.",
    }),
    estimateSeconds: z.number().int().nullable().openapi({
      description:
        "A draft's estimate; null when it has none, and for linked work.",
    }),
    existing: z.boolean().openapi({
      description:
        "True for existing work the change links, false for a new draft.",
    }),
  })
  .openapi("AssistantNestedTask");

export const assistantProposalPreviewSchema = z
  .object({
    target: z.string().nullable().openapi({
      description: "What the change is about, by name.",
    }),
    targetKey: z.string().nullable().openapi({
      description:
        "The argument whose value `target` already shows, so a card can leave that field out. Null when there is no target.",
    }),
    fields: z.array(proposalFieldSchema),
    diff: z.object({ before: z.string(), after: z.string() }).nullable(),
    nested: z
      .object({
        milestones: z.array(
          z.object({
            title: z.string(),
            leadLabel: z.string().nullable(),
            releaseLabel: z.string().nullable(),
            priority: z.string().nullable(),
            tasks: z.array(nestedTaskSchema),
          }),
        ),
        tasks: z.array(nestedTaskSchema).openapi({
          description: "Work outside any milestone.",
        }),
        unassignedReleaseLabel: z.string().nullable().openapi({
          description: "The release that new work outside any milestone joins.",
        }),
      })
      .nullable()
      .openapi({
        description:
          "The milestones and tasks a new Feature or milestone creates or links along with it; null when there are none.",
      }),
  })
  .openapi("AssistantProposalPreview");

export const assistantMessageSchema = z
  .object({
    id: z.string(),
    role: z.enum(["user", "assistant", "tool"]),
    content: z.string().openapi({
      description:
        "Text of user and assistant messages; empty for tool steps. Read results and reasoning are never returned.",
    }),
    status: z.enum(["complete", "interrupted"]),
    createdAt: isoTimestamp,
    toolCalls: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .nullable(),
    toolCallId: z.string().nullable(),
    toolName: z.string().nullable(),
    approval: z.enum(["pending", "approved", "rejected", "skipped"]).nullable(),
    isError: z.boolean(),
    errorText: z.string().nullable(),
    preview: assistantProposalPreviewSchema.nullable(),
    resultSummary: z
      .object({ label: z.string(), href: z.string().nullable() })
      .nullable(),
  })
  .openapi("AssistantMessage");

const chatTitle = z.string().openapi({
  description:
    "The chat's first message on one line, cut to at most 80 characters.",
});
const pendingCount = z.number().int().nonnegative().openapi({
  description: "Proposed changes in the chat that wait for approval.",
});

export const assistantChatSummarySchema = z
  .object({
    id: z.string(),
    title: chatTitle,
    updatedAt: isoTimestamp.openapi({
      description: "When the chat last had a turn.",
    }),
    busy: z.boolean().openapi({
      description: "Whether a turn is answering in this chat right now.",
    }),
    pendingCount,
  })
  .openapi("AssistantChatSummary");

export const assistantChatListSchema = z
  .object({
    chats: z.array(assistantChatSummarySchema).openapi({
      description:
        "The caller's chats in the workspace, latest activity first.",
    }),
    nextCursor: z.string().nullable().openapi({
      description:
        "Pass as `before` to get the next page; null on the last page.",
    }),
  })
  .openapi("AssistantChatList");

export const assistantChatDetailSchema = z
  .object({
    chat: z.object({
      id: z.string(),
      title: chatTitle,
      createdAt: isoTimestamp,
      updatedAt: isoTimestamp,
    }),
    messages: z.array(assistantMessageSchema).openapi({
      description: "The latest 300 messages, oldest first.",
    }),
    hasOlder: z.boolean().openapi({
      description: "Whether the chat has messages before the first one here.",
    }),
    pendingCount,
    busy: z.boolean().openapi({
      description:
        "Whether a turn is answering in this chat right now. New messages, Continue and delete are refused until it ends.",
    }),
    resumable: z.boolean().openapi({
      description:
        "Whether Continue can resume the chat: no turn is answering, nothing waits for approval and the transcript stops short of a final answer, after tool results or an interrupted or failed step.",
    }),
  })
  .openapi("AssistantChatDetail");

export const assistantChatDeletedSchema = z
  .object({ success: z.literal(true) })
  .openapi("AssistantChatDeleted");

export const assistantDecisionsResultSchema = z
  .object({
    messages: z.array(assistantMessageSchema).openapi({
      description:
        "The tool messages this request decided, in the order they were proposed. A rejected change has approval `rejected`. An approved one has approval `approved` and then either a `resultSummary` (it ran), `isError` with `errorText` (it failed and wrote nothing, or `Outcome unknown; check before retrying.` when the request timed out, lost its connection or got a gateway error), or neither while its outcome is unknown.",
    }),
    pendingCount,
    resumable: z.boolean().openapi({
      description:
        "Whether Continue can now resume the answer: true once nothing waits for approval.",
    }),
  })
  .openapi("AssistantDecisionsResult");

export type AssistantStatus = z.infer<typeof assistantStatusSchema>;
export type AssistantStatusReason = AssistantStatus["reason"];
export type AssistantSettings = z.infer<typeof assistantSettingsSchema>;
export type AssistantKeyState = AssistantSettings["keyState"];
export type AssistantKeyUsage = z.infer<typeof assistantKeyUsageSchema>;
export type AssistantModel = z.infer<typeof assistantModelSchema>;
export type AssistantMessageDto = z.infer<typeof assistantMessageSchema>;
export type AssistantChatSummary = z.infer<typeof assistantChatSummarySchema>;
export type AssistantChatList = z.infer<typeof assistantChatListSchema>;
export type AssistantChatDetail = z.infer<typeof assistantChatDetailSchema>;
export type AssistantDecisionsResult = z.infer<
  typeof assistantDecisionsResultSchema
>;
