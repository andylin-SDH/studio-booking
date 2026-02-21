/** 錄音室名稱（與 API 的 studio 參數對應） */
export const STUDIOS = {
  big: "盛德好錄音室-大間",
  small: "盛德好錄音室-小間",
} as const;

export type StudioId = keyof typeof STUDIOS;
