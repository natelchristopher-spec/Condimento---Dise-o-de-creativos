import { BrandKit } from '@/app/types';

export function buildBrandKitContext(brandKit: BrandKit): string {
  const referencesSection = brandKit.referencePiecesStyle
    ? `\nESTILO DE PIEZAS ANTERIORES APROBADAS (seguir este estilo):\n${brandKit.referencePiecesStyle}`
    : '';

  const logoSection = (brandKit.logoColorBase64 || brandKit.logoWhiteBase64 || brandKit.logoDarkBase64)
    ? `\nLOGO — REGLA DE USO POR FONDO:\n- Fondo claro o blanco → usar logo color o logo oscuro\n- Fondo oscuro o imagen con producto → usar logo blanco (negativo)\n- NUNCA colocar el logo color sobre fondo oscuro — siempre la versión que garantice legibilidad`
    : '';

  const businessSection = brandKit.clientRequest
    ? `\nNEGOCIO — QUÉ VENDE Y A QUIÉN:\n${brandKit.clientRequest}`
    : '';

  const adjustmentsSection = brandKit.quickAdjustments && brandKit.quickAdjustments.length > 0
    ? `\nAJUSTES APROBADOS POR EL CLIENTE (aplicar siempre en los creativos):\n${brandKit.quickAdjustments.map(a => `- ${a}`).join('\n')}`
    : '';

  return `
MARCA: ${brandKit.name}
${businessSection}
PALETA PRIMARIA:
- Color 1: ${brandKit.primary1}
- Color 2: ${brandKit.primary2}
- Color 3: ${brandKit.primary3}

PALETA SECUNDARIA:
- Color 4: ${brandKit.secondary1}
- Color 5: ${brandKit.secondary2}
- Color 6: ${brandKit.secondary3}

TIPOGRAFÍA: ${brandKit.typography || 'No especificada'}

ESTILO Y REGLAS DE MARCA:
${brandKit.styleDescription}
${referencesSection}
${adjustmentsSection}
${logoSection}
`.trim();
}
