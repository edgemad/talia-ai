export interface AppSettings {
  offline: boolean;
  offlineLocked: boolean;
}

export declare function isLocalUrl(url: string): boolean;
export declare function getSettings(): Promise<AppSettings>;
export declare function isOffline(): Promise<boolean>;
export declare function setOffline(on: boolean): Promise<AppSettings>;
export declare function offlineError(what: string): string;
