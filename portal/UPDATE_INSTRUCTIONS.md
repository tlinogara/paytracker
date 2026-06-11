# UI refinement update — ship via GitHub web

No database changes this time. Upload these 3 files in your repo
(navigate to the folder → Add file → Upload files → commit), and
Vercel redeploys automatically:

    src/components/DealsTable.tsx   (changed — sortable columns)
    src/pages/Dashboard.tsx         (changed — compact team grid)
    src/styles.css                  (changed — styles for both)

## What changed
- Team list is now a compact grid (3–5 cards per row depending on screen
  width) showing the top 9 reps by commission, with a "Show all 23 reps"
  toggle. Spiff entry and deals are now roughly one scroll away instead
  of five.
- Every deals column header is clickable to sort. First click on money,
  unit, and date columns sorts biggest/newest first; text columns sort
  A→Z. Click again to reverse. The green arrow marks the active sort.
