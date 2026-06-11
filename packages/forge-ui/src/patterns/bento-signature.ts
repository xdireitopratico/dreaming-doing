/** Padrão Bento assimétrico — células com spans variados, nunca grid uniforme 3×3. */

export const BENTO_LAYOUT_PRESETS = {
  showcase: [
    { span: "md:col-span-2 md:row-span-2" },
    { span: "md:col-span-1" },
    { span: "md:col-span-1" },
    { span: "md:col-span-2" },
    { span: "md:col-span-1 md:row-span-2" },
    { span: "md:col-span-1" },
  ],
  editorial: [
    { span: "md:col-span-3" },
    { span: "md:col-span-1 md:row-span-2" },
    { span: "md:col-span-2" },
    { span: "md:col-span-1" },
    { span: "md:col-span-2" },
  ],
  product: [
    { span: "md:col-span-2" },
    { span: "md:col-span-1 md:row-span-2" },
    { span: "md:col-span-1" },
    { span: "md:col-span-1" },
    { span: "md:col-span-2 md:row-span-1" },
  ],
} as const;

export type BentoPreset = keyof typeof BENTO_LAYOUT_PRESETS;
