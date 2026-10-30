// Локальное сохранение: настройки и рекорд. Хранилище может быть недоступно — тогда просто работаем без него.
export interface Settings {
  vhs: boolean;
  sound: boolean;
}

const KEY = 'deskpin.v1';

interface Save {
  settings: Settings;
  bestThrow: number;
}

function load(): Save {
  const def: Save = { settings: { vhs: true, sound: true }, bestThrow: 0 };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return def;
    const s = JSON.parse(raw) as Partial<Save>;
    return { settings: { ...def.settings, ...s.settings }, bestThrow: s.bestThrow ?? 0 };
  } catch {
    return def;
  }
}

export const save: Save = load();

export function persist(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    /* хранилище недоступно — не страшно */
  }
}
