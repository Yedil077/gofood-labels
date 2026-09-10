/**
 * Пресеты оформления этикетки. Выбор — настройка `brand.preset`.
 * Логотип грузится caller-ом по имени: `/logo-<logo>.png` (web) или `assets/logo-<logo>.png` (агент).
 */

export const BRAND_PRESETS = {
  gofood: {
    name: 'gofood',
    logo: 'gofood',
    tagline: 'Больше энергии — больше возможностей',
    color: '#F2661F',
  },
  greencity: {
    name: 'GreenCity',
    logo: 'greencity',
    tagline: 'Вкусно и полезно',
    color: '#81D326', // фирменный зелёный greencity.kz
  },
};

/** Возвращает активный бренд. При `custom` — из отдельных полей brand.*. */
export function resolveBrand(settings = {}) {
  const preset = settings['brand.preset'] || 'gofood';
  if (preset !== 'custom' && BRAND_PRESETS[preset]) return { ...BRAND_PRESETS[preset] };
  return {
    name: settings['brand.name'] || 'gofood',
    logo: settings['brand.logo'] || 'gofood',
    tagline: settings['brand.tagline'] || '',
    color: settings['brand.primaryColor'] || '#F2661F',
  };
}
