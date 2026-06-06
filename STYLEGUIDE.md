# Deep Sea Crew — Visual Style Guide

A consistent ocean/deep-sea theme. Graphics are CSS-driven (no image assets) for fast
loads on phones and a single source of truth. All tokens live in `:root` in
`client/src/styles.css`.

## Theme
Deep-ocean descent: dark teal→abyssal-navy gradient background with a faint drifting
plankton field. Gold is the single accent (calls-to-action, the active turn, highlights).

## Color tokens
| Token | Hex | Use |
|---|---|---|
| `--abyss` | `#04141f` | page base, deepest background |
| `--deep` | `#082b3a` | panels, overlays |
| `--mid` / `--surface` | `#0e4257` / `#135872` | gradient mids, raised surfaces |
| `--foam` / `--foam-dim` | `#e9f6fb` / `#a9cdd9` | primary / secondary text |
| `--gold` / `--gold-deep` | `#f2c14e` / `#c9971f` | accent, primary buttons, active turn |
| `--ok` / `--danger` | `#4fd1a5` / `#e7585b` | success (won/done) / failure (lost/fail) |

### Suit colors (semantic — keep stable)
| Suit | In-game name | Token | Glyph |
|---|---|---|---|
| blue | Current | `--blue #2f7fd1` | ≈ |
| green | Kelp | `--green #2bb38a` | ❀ |
| pink | Coral | `--pink #e0589b` | ✦ |
| yellow | Sand | `--yellow #e0b13a` | ◐ |
| sub | Sub (trump) | `--sub #1b2733`, gold border | ⬡ |

## Typography
- Family: Trebuchet MS / Segoe UI / system-ui fallback stack.
- Scale: page title ~2rem (2.4rem ≥600px); `h2` overlay titles ~1.4rem; `h3` ~0.95rem
  gold; body 0.9–1.05rem; labels/meta 0.7–0.72rem uppercase, letter-spacing 0.08–0.12em,
  color `--foam-dim`.
- Weights: 600 body emphasis, 700–800 headings/buttons/values.

## Spacing & shape
- Layout gap rhythm: 12–16px between board sections; 8–10px inside groups.
- Radius: cards 10px (8px small), panels/controls 12–14px, pills 999px.
- Shadow: `--shadow` (`0 8px 24px rgba(0,0,0,.35)`).
- Screens are centered, `max-width: 720px`, with `env(safe-area-inset-*)` respected.

## Components
- **Card** (`CardView`): 58×84 (66×96 ≥600px), 42×60 small. Suit gradient fill, value in
  TL/BR corners, centered glyph. States: `card-playable` (lifts on hover/active),
  `card-disabled` (desaturated), `card-selected` (gold outline, used for sonar pick).
- **Buttons**: `.primary` (gold gradient), `.ghost` (translucent outline), `.link`
  (text), `.chip` (compact pill; `.danger` variant red). Min height 48px for tap targets.
- **Overlays**: full-screen scrim, centered card, scrollable for tall content. Variants
  tint the border: `.won`→ok, `.lost`→danger, `.paused`→gold.
- **Player chip / task / trick**: translucent `--deep` surfaces; active turn = gold ring;
  done task = `--ok` tint + ✓; failed = `--danger` tint.

## Motion
Subtle only: background drift (24s), active-turn pulse (1.6s), toast rise, card lift on
interaction. Nothing that blocks input or distracts on mobile.

## Accessibility
≥48px touch targets; `aria-label` on cards; color paired with text/glyph (not color
alone) for suits and task states; gold-on-dark and foam-on-dark meet contrast for text.

## Adding visuals
Prefer CSS gradients/glyphs over raster images. If an asset is ever added, match the
palette above and keep it optional (lazy, with a CSS fallback) to preserve mobile load.
