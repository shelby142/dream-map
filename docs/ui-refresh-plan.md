# Dream Map UI refresh plan

## Scope and direction

The first UI refresh makes the map the primary working surface while keeping the existing navy, cream, and coral palette and English interface. It covers the approved first-round priorities: layout, dream cards, and map controls. It also repairs the map/list interactions needed for that design to work.

This refresh builds on commit `05ad451`. The existing scroll fix and product review are part of this delivery.

## Implementation sequence

1. **Layout:** use a compact exploration column and a larger map by default. Mount the detail panel only when a dream or creation form is open. Keep the corrected desktop height constraints and independent list/detail scrolling. On phones, keep the working page scroll and present selected dream details in an accessible bottom sheet; creation still allows moving between form and map.
2. **Cards:** put dreamer and city first, then title and the existing description, with status, hashtag, and support count as supporting information. Use only existing record fields; do not invent next steps, photographs, or progress percentages. Improve spacing, typography, selection, hover, loading, and empty states.
3. **Map controls:** group zoom/reset vertically at the lower right, lighten the legend and grid, and replace the permanent instruction banner with concise context. Highlight hovered/selected points and show the selected dream's name and destination. Keep point size and hit areas stable in screen pixels.
4. **Linked interactions:** make map and list use the same country/text/status filters; scroll a selected map point's card into view; preserve selected context when filters change. Repair pointer capture so clicks select and drags pan. Add Escape closure and prevent location-picking state from leaking into browsing.
5. **Validation:** build and check types, then inspect desktop and phone layouts. Verify list scrolling, marker clicks, filtering, selection/closing, and destination display.
6. **Synchronization:** review the exact diff; update README and this plan with final behavior and verification. Commit only source/docs changes, excluding local databases, dependencies, build output, and screenshots. Fetch again before pushing; preserve any new remote work. Push normally to main and verify local HEAD, remote main, and working-tree state match.

## Acceptance criteria

- The default desktop has no empty third column; the map and controls fit in the available screen height.
- All dreams remain reachable by scrolling; mobile has no accidental horizontal overflow.
- Clicking a map point and its list card opens the same dream; dragging does not accidentally open details.
- Status/text/country filters produce consistent map and list results.
- Selected and hovered dreams have visible map feedback; markers have practical pointer targets.
- Existing creation, votes, help offers, and owner status updates remain available.
- No database migrations, dependency changes, or hosted deployment are part of this round.
- The final local source and GitHub main point at the same verified commit.

## Delivery status

Implemented. `pnpm lint`, `pnpm exec tsc --noEmit`, and `pnpm build` passed. Local browser checks at 1440×900 and 390×844 confirmed the desktop map/list fit, no phone horizontal overflow, card and marker selection, detail opening, and matching status-filter counts for list and map. The browser checks did not cover every interaction in the acceptance criteria; creation, voting, help offers, owner updates, touch gestures, and hosted behavior still need end-to-end verification.
