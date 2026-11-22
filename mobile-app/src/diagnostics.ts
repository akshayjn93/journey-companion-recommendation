import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Breadcrumbs for test builds. Before each risky step we save its name on the
 * phone. If the app dies, the next launch can show which step it died on.
 */
const STEP_KEY = 'journey-companion:last-step';
const ERROR_KEY = 'journey-companion:last-error';

export type LastRun = { step: string | null; error: string | null };

export async function markStep(step: string): Promise<void> {
  try {
    await AsyncStorage.setItem(STEP_KEY, `${step} (${new Date().toLocaleTimeString()})`);
  } catch {
    // Diagnostics must never break the app.
  }
}

export async function clearLastRun(): Promise<void> {
  try {
    await AsyncStorage.multiRemove([STEP_KEY, ERROR_KEY]);
  } catch {
    // ignore
  }
}

export async function readLastRun(): Promise<LastRun> {
  try {
    const [[, step], [, error]] = await AsyncStorage.multiGet([STEP_KEY, ERROR_KEY]);
    return { step, error };
  } catch {
    return { step: null, error: null };
  }
}

function describe(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}\n${(error.stack ?? '').split('\n').slice(0, 6).join('\n')}`;
  }
  return String(error);
}

export async function recordError(where: string, error: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(ERROR_KEY, `${where}: ${describe(error)}`);
  } catch {
    // ignore
  }
}

let installed = false;

/** Saves any uncaught JavaScript error before the app goes down. */
export function installGlobalErrorHandler() {
  if (installed) return;
  installed = true;
  const previous = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error, isFatal) => {
    recordError(isFatal ? 'Fatal JS error' : 'JS error', error).finally(() => {
      previous?.(error, isFatal);
    });
  });
}
