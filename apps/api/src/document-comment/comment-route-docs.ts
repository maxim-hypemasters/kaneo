import { errorResponse } from "../openapi";

// Pages and Feature documents expose the same comment operations under
// different paths and permissions, so their OpenAPI text is written once.
export function commentRouteDocs(
  subject: "project page" | "Feature document",
  permission: "document" | "feature",
) {
  const read = `Needs ${permission}:read.`;
  const write = `Needs ${permission}:update.`;
  return {
    list: {
      summary: `List comments on a ${subject}`,
      description: `Returns every comment thread on the ${subject}, open and resolved, oldest first. A thread is a root comment, the text it is attached to (anchor) and its replies in order. The anchor is the commented text as the reader sees it plus a little of the text on each side; the body itself carries no comment markers, so clients find the anchor in the current text and show the thread as detached when it is gone. ${read}`,
    },
    create: {
      summary: `Comment on part of a ${subject}`,
      description: `Starts a thread on a part of the ${subject}. anchor.quote is the selected text as rendered; anchor.prefix and anchor.suffix are the text just before and after it. The anchor is stored as sent. The body and its revision do not change, so commenting never conflicts with someone's unsaved edits. Returns the new thread. ${write}`,
    },
    reply: {
      summary: `Reply to a comment thread on a ${subject}`,
      description: `Adds a reply to a thread. commentId must be the thread's root comment on this ${subject}: replies cannot be replied to, and a reply id or a comment of another document returns 404. Replying to a resolved thread reopens it. Returns the whole thread. ${write}`,
    },
    update: {
      summary: `Edit a comment on a ${subject}`,
      description: `Changes the text of a root comment or a reply and sets its editedAt. Only the author may edit; anyone else gets 403. The anchor and resolution stay as they are. Returns the whole thread. ${write}`,
    },
    remove: {
      summary: `Delete a comment on a ${subject}`,
      description: `Only the author may delete; anyone else gets 403. Deleting a thread's root comment deletes the whole thread, including replies written by other people; deletedCount counts every comment removed. ${write}`,
    },
    resolution: {
      summary: `Resolve or reopen a comment thread on a ${subject}`,
      description: `Resolves the thread or reopens it. Anyone who may edit the ${subject} can do either, not only the author. commentId must be the thread's root comment; a reply id returns 404. Asking for the state the thread already has changes nothing. Returns the whole thread. ${write}`,
    },
  };
}

const sharedErrors = {
  404: errorResponse("Document or comment not found"),
  409: errorResponse("Changed at the same time as another edit; retry"),
};
export const commentReadErrors = {
  403: errorResponse("No access or missing permission"),
  503: errorResponse("The read took too long; retry later"),
  ...sharedErrors,
};
export const commentWriteErrors = {
  400: errorResponse("Invalid comment"),
  402: errorResponse("Workspace plan expired"),
  403: errorResponse("No access, missing permission, or not the author"),
  ...sharedErrors,
};
