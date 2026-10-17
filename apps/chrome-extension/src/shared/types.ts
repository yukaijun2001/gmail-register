import type { RegistrationStep, TaskStatus } from '@gmail-manager/contracts';

export interface ExtensionSettings {
  apiBaseUrl: string;
}

export interface WorkerIdentity {
  workerId: string;
  workerToken: string;
  profileIdentifier: string;
}

export interface ActiveTask {
  id: string;
  workerId: string;
  status: TaskStatus;
  currentStep: RegistrationStep;
  leaseToken: string;
  leaseVersion: number;
  leaseExpiresAt: string;
  account: {
    desiredUsername: string;
    firstName: string;
    lastName: string;
    birthday: string;
    gender: string;
    phoneReference: string;
    recoveryEmail?: string;
  };
  usernameRetryCount?: number;
  lastSyncTime: string;
}

export type AccountPreview = ActiveTask['account'] & {
  id: string;
  createdAt: string;
};

export interface PopupSnapshot {
  state: ExtensionState;
  accounts: AccountPreview[];
}

export interface ExtensionState {
  settings?: ExtensionSettings;
  identity?: WorkerIdentity;
  activeTask?: ActiveTask;
  automationTabId?: number;
  lastDetection?: {
    step: RegistrationStep;
    requiresUser: boolean;
    reason?: string;
  };
  paused: boolean;
  lastError?: string;
}
