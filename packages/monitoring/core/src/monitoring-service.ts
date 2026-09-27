export type MonitoringContext = Record<string, unknown>;

export type UserTraits = Record<string, unknown>;

export interface MonitoringService {
  captureException(error: Error, context?: MonitoringContext): void;
  captureEvent(name: string, data?: Record<string, unknown>): void;
  identify(userId: string, traits?: UserTraits): void;
  initializeMonitoring(): Promise<void>;
}
