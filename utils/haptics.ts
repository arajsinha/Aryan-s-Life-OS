export const haptic = {
    light() {
      navigator.vibrate?.(10);
    },
    medium() {
      navigator.vibrate?.(30);
    },
    heavy() {
      navigator.vibrate?.(60);
    },
    success() {
      navigator.vibrate?.([20, 10, 20]);
    },
    error() {
      navigator.vibrate?.([60, 20, 60]);
    }
  };
  