# Item-to-photograph mapping — what still needs your confirmation

`contact-sheet.jpg` in this folder is the numbered sheet to read alongside
this list. Every photograph is shown at its **real pixel size**, which is the
constraint that shapes the whole menu design.

## What was searched before asking

The brief asked me not to assume no mapping exists. I checked:

- `cladium-research/data/menu.json` — every key in the file. There is no
  image, photo, or asset field on any item, group or category. The only
  `source_assets` entry is the list of eight printed menu **pages**.
- `cladium-research/data/business-profile.json` and the approved operations
  knowledge — no item imagery.
- `src/modules/menu/media-mapping.ts` — `menuCategoryMedia` maps 12
  **categories**; `menuItemMedia` is empty.
- The eight printed menu pages themselves, opened and read.

The pages settle it. Each photograph sits beside a **category block**, not
beside a single dish: on one page a single pasta photograph sits next to six
different pastas, a wok photograph next to nine rice dishes, and a salad
photograph next to six sides. Nothing in the artwork ties a photograph to a
row.

**Conclusion: no item-level mapping exists anywhere.** So the carousel ships
in State B — category imagery, clearly labelled as such, with typographic
item selectors.

## What I need from you

For any row below, either name the exact menu item or say "category only".
Only a confirmed answer will be used as that dish's photograph; a guess from
appearance is exactly what the brief forbids and what I have avoided.

| Sheet ref | Currently used as              | Question                                                                            |
| --------- | ------------------------------ | ----------------------------------------------------------------------------------- |
| C01       | Sandwiches category            | Is this one specific sandwich on the menu, or the category generally?               |
| C02       | Steaks category                | Which steak, if any?                                                                |
| C03       | Desi Cuisine category          | Which karahi, if any?                                                               |
| C04       | Exclusive Beef Entree category | 882x144 — a very wide crop. Which entree, if any?                                   |
| C05       | Italian category               | Which pasta? The photo shows penne with chicken and broccoli.                       |
| C06       | Chinese category               | Which rice dish?                                                                    |
| C07       | Extra Side category            | Is this the Fresh Salad specifically?                                               |
| C08       | Starters category              | Which starter or platter?                                                           |
| C09       | Soup category                  | Is this the Chicken Corn Soup specifically?                                         |
| C10       | Burgers category               | Which burger?                                                                       |
| C11       | Bar Menu category              | Any specific drink, or the range?                                                   |
| C12       | BBQ category                   | Which platter or skewer?                                                            |
| D01–D07   | Homepage food thumbnails only  | Do any of these show a specific menu item? They are not used in the carousel today. |

There is also a naan basket photographed on the Extra Side page that is not
currently cropped or used. If it depicts one of Plain / Roghni / Garlic Naan,
say which and I will add it.

## Why this matters to the design, not just the data

The carousel has two complete states already built:

- **State A — confirmed dish photo.** `menuItemMedia` gains an entry, the
  featured stage shows that photograph with `provenance: 'item'`, the
  "photograph of this category" caption disappears automatically, and the
  selector rail switches to circular photographic thumbnails. No further code
  change is required.
- **State B — category photo only.** What is live now: the category
  photograph with a visible caption saying so, and numbered typographic
  selectors carrying full readable dish names.

So the honest answer today is State B, and it is not a placeholder — it is a
finished design for the assets that actually exist.

## Resolution ceiling — please read before asking for a bigger dish

The category photographs are 176–235px wide (the beef crop is 882x144). They
were cropped from the printed pages, and the photographs occupy roughly that
much space on the page itself, so **there is no higher-resolution version to
recover.** Re-exporting them larger would only enlarge the same pixels.

That is why the featured dish is presented as a mounted print on a lit
plinth rather than as a full-bleed photograph: the mount, the arc and the
contact shadow give the composition presence while the photograph itself
stays at 1x and stays sharp. If you want a genuinely large dish image, the
only real fix is new photography, not a different layout.

New photography would ideally be: each dish shot from directly overhead on a
plain background, at 1500px or more on the long edge. That is also the shape
that would let the selector rail become circular photographic thumbnails, as
in the reference clip, because a round plate shot from above crops to a
circle without cutting through the food.
