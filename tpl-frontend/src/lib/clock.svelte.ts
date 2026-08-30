// Reactive "now" for value evaluation. Value methods read clock.elapsedSeconds,
// so any $derived / template expression calling them re-runs when the clock ticks.
export const clock = $state({ elapsedSeconds: 0 });

export function setElapsed(seconds: number) {
  clock.elapsedSeconds = seconds;
}

export function resetClock() {
  clock.elapsedSeconds = 0;
}
