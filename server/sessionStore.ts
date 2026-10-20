import session from "express-session";
import { db } from "./db.js";

export class LocalSessionStore extends session.Store {
  get(
    sid: string,
    callback: (err: any, session?: session.SessionData | null) => void,
  ) {
    try {
      const row = db
        .prepare("SELECT data,expires FROM sessions WHERE sid=?")
        .get(sid) as any;
      if (!row) {
        callback(null, null);
        return;
      }
      if (row.expires < Date.now()) {
        this.destroy(sid, () => callback(null, null));
        return;
      }
      callback(null, JSON.parse(row.data));
    } catch (err) {
      callback(err as Error);
    }
  }
  set(sid: string, value: session.SessionData, callback?: (err?: any) => void) {
    try {
      const expires = value.cookie?.expires
        ? new Date(value.cookie.expires).getTime()
        : Date.now() + 86400000;
      db.prepare(
        "INSERT INTO sessions(sid,data,expires) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET data=excluded.data, expires=excluded.expires",
      ).run(sid, JSON.stringify(value), expires);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }
  destroy(sid: string, callback?: (err?: any) => void) {
    try {
      db.prepare("DELETE FROM sessions WHERE sid=?").run(sid);
      callback?.();
    } catch (err) {
      callback?.(err);
    }
  }
  touch(
    sid: string,
    value: session.SessionData,
    callback?: (err?: any) => void,
  ) {
    this.set(sid, value, callback);
  }
}
