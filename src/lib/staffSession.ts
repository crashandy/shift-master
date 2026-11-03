'use client';

// 員工入口的登入狀態（存在這台裝置的瀏覽器裡）
import { useCallback, useEffect, useState } from 'react';

export type StoreId = 'store1' | 'store2';

// 分店通行碼 → 分店
export const STORE_CODES: Record<string, StoreId> = {
  '88652358': 'store1',
  '00084258': 'store2',
};

export const STORE_NAMES: Record<StoreId, string> = {
  store1: '一號店',
  store2: '二號店',
};

export interface StaffSession {
  store: StoreId;
  employeeId?: string;
  employeeName?: string;
}

const KEY = '18c_staff_session';

export function getSession(): StaffSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as StaffSession;
    return s.store === 'store1' || s.store === 'store2' ? s : null;
  } catch {
    return null;
  }
}

export function saveSession(s: StaffSession) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 無法儲存時忽略 */
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* 忽略 */
  }
}

export function useStaffSession() {
  const [session, setSession] = useState<StaffSession | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(getSession());
    setReady(true);
  }, []);

  const update = useCallback((s: StaffSession) => {
    saveSession(s);
    setSession(s);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  return { session, ready, update, logout };
}
