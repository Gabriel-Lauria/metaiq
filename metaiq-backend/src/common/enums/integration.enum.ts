export enum IntegrationProvider {
  META = 'META',
}

export enum IntegrationStatus {
  NOT_CONNECTED = 'NOT_CONNECTED',
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  EXPIRED = 'EXPIRED',
  ERROR = 'ERROR',
}

export enum SyncStatus {
  NEVER_SYNCED = 'NEVER_SYNCED',
  IN_PROGRESS = 'IN_PROGRESS',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
  FAILED_RECOVERABLE = 'FAILED_RECOVERABLE',
}
