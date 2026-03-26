import { Capacitor } from '@capacitor/core';

export async function hapticLight() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    // @ts-ignore - plugin may not be installed
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {}
}

export async function hapticMedium() {
  if (!Capacitor.isNativePlatform()) return;
  try {
    // @ts-ignore - plugin may not be installed
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {}
}
