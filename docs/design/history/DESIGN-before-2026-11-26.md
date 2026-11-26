> **SUPERSEDED — historis, bukan aturan aktif.** Digantikan oleh [Design System RESORA](../../design-system.md) pada 26 November 2026. Simpan hanya sebagai bukti arah lama; tautan relatif di salinan lama mungkin tidak berlaku.

# DESIGN.md — RESORA Studio Design System

> Visual authority and design baseline for RESORA web applications.
> Detailed documentation: see [active Design System](../../design-system.md).

## World: Google AI Studio PaaS Console (with RESORA Red Accent)

- **Mode**: Operate (authenticated console, administration, events, attendance, accounts)
- **Palette**:
  - Dark Canvas: `#131314` | Dark Surface: `#1e1f20` | Dark Border: `#3c4043`
  - Light Canvas: `#f3f5f8` | Light Surface: `#ffffff` | Light Border: `#dadce0`
  - Brand Red: `#d93025` (light) / `#ea4335` (dark) | Brand Soft: `#fce8e6` / `rgba(234, 67, 53, 0.15)`
- **Typography**: Sans-serif (`Geist Sans`, system fallback), fixed-rem scale, tabular numerals for IDs, dates, and GPS coordinates.
- **Elevation**: Tonal surface stepping + `1px` hairline dividers (`border-border`), no heavy skeuomorphic drop shadows.
- **Controls**:
  - Filter bar: `.resora-studio-toolbar` with search and compact selects.
  - KPI Strips: `.resora-studio-kpi`.
  - Tables: Hairline borders (`divide-y divide-border`), dot status pills (`• Aktif`, `• Draft`), round row-action buttons.
  - Modals: `rounded-2xl` containers, `bg-black/55 backdrop-blur-[2px]`, round `✕` close button, header/footer dividers.
- **Untouched surfaces**: `/` (`welcome-page.tsx`) and `/login` (`login-form.tsx`) must remain identical to `dev`.
