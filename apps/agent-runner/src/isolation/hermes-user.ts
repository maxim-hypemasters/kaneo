/** The unprivileged user Hermes, and git in its checkout, run as. */
export type HermesUser = { uid: number; gid: number };

export const ROOT: HermesUser = { uid: 0, gid: 0 };
