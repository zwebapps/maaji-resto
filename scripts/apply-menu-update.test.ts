import { describe, expect, it } from "vitest";
import { buildPlan, normaliseName } from "./apply-menu-update";

/**
 * The matcher is the only interesting part of the script: everything else is
 * Prisma writes. What these cover is the property the script lives or dies on
 * — running it twice must be a no-op, because a second pairing that drifts
 * would re-create dishes and drop their photos.
 */

type DraftArgs = Parameters<typeof buildPlan>[1];

function item(
  name: string,
  over: Partial<DraftArgs[0]["items"][0]> = {},
): DraftArgs[0]["items"][0] {
  return {
    id: `id-${name}`,
    name,
    description: null,
    priceCents: 100,
    orderIndex: 100,
    isAvailable: true,
    allergens: [],
    traces: [],
    dietary: [],
    spice: 0,
    photoMediaId: `photo-${name}`,
    offerPriceCents: null,
    deletedAt: null,
    ...over,
  };
}

function category(name: string, items: DraftArgs[0]["items"], orderIndex = 100): DraftArgs[0] {
  return { id: `cat-${name}`, name, orderIndex, items };
}

describe("normaliseName", () => {
  it("ignores case, umlauts, ß and punctuation", () => {
    expect(normaliseName("Mix Pakora-Groß (für 2-3 Personen)")).toBe(
      normaliseName("mix pakora groß, für 2–3 personen"),
    );
    expect(normaliseName("Hähnchen Gerichte")).toBe(normaliseName("HAEHNCHEN GERICHTE"));
  });
});

describe("buildPlan", () => {
  const menu = {
    categories: [
      {
        id: "bier-alkoholfrei",
        name: "Bier alkoholfrei",
        matchNames: ["Bier"],
        items: [
          {
            id: "i1",
            number: null,
            name: "Fürstenberg Pils alkoholfrei 0,5l",
            description: null,
            priceCents: 400,
            allergens: ["gluten"],
            traces: [],
            dietary: [],
            spice: 0,
          },
        ],
      },
      {
        id: "bier",
        name: "Bier",
        items: [
          {
            id: "i2",
            number: null,
            name: "Hefeweizen 0,5l",
            description: null,
            priceCents: 510,
            allergens: ["gluten"],
            traces: [],
            dietary: [],
            spice: 0,
          },
        ],
      },
    ],
  };

  it("lets a renamed category claim its predecessor before a new namesake does", () => {
    const draft = [category("Bier", [item("Fürstenberg Pils alkoholfrei 0,5l")])];
    const plan = buildPlan(menu, draft, "union");

    const renamed = plan.categories.find((c) => c.newCategory.id === "bier-alkoholfrei");
    expect(renamed?.kind).toBe("update");
    expect(renamed?.renamedFrom).toBe("Bier");
    expect(plan.categories.find((c) => c.newCategory.id === "bier")?.kind).toBe("create");
    // the existing beer keeps its row (and therefore its photo)
    expect(plan.items.filter((i) => i.kind === "create")).toHaveLength(1);
    expect(plan.softDeletes).toHaveLength(0);
  });

  it("is a no-op on the state its own first run produces", () => {
    const draft = [
      category(
        "Bier alkoholfrei",
        [item("Fürstenberg Pils alkoholfrei 0,5l", { priceCents: 400, allergens: ["gluten"] })],
        100,
      ),
      category("Bier", [item("Hefeweizen 0,5l", { priceCents: 510, allergens: ["gluten"] })], 200),
    ];
    const plan = buildPlan(menu, draft, "union");

    expect(plan.items).toHaveLength(0);
    expect(plan.softDeletes).toHaveLength(0);
    expect(plan.categories.every((c) => c.kind === "update" && !c.renamedFrom)).toBe(true);
  });

  it("revives a soft-deleted row rather than creating a twin", () => {
    const draft = [
      category("Bier alkoholfrei", [
        item("Fürstenberg Pils alkoholfrei 0,5l", {
          priceCents: 400,
          allergens: ["gluten"],
          deletedAt: new Date(),
        }),
      ]),
    ];
    const plan = buildPlan(menu, draft, "union");
    const revived = plan.items.find((i) => i.newItem.id === "i1");
    expect(revived?.kind).toBe("revive");
    expect(revived?.draft?.photoMediaId).toBe("photo-Fürstenberg Pils alkoholfrei 0,5l");
  });

  // The printed card is the declaration of record: the owner reviewed the 25
  // dishes whose footnotes are thinner than the old data and confirmed the
  // card. So "replace" is the default and "union" is the deliberate opt-out.
  const withExtraAllergen = (): Parameters<typeof buildPlan>[1] => [
    category("Bier alkoholfrei", [
      item("Fürstenberg Pils alkoholfrei 0,5l", {
        priceCents: 400,
        allergens: ["gluten", "milk"],
      }),
    ]),
  ];

  it("drops an allergen the printed card does not code", () => {
    const planned = buildPlan(menu, withExtraAllergen()).items.find((i) => i.newItem.id === "i1");
    expect(planned?.data.allergens).toEqual(["gluten"]);
    expect(planned?.changes.join(" ")).toContain("allergens [gluten,milk] → [gluten]");
  });

  it("uses replace when no mode is passed", () => {
    expect(buildPlan(menu, withExtraAllergen())).toEqual(
      buildPlan(menu, withExtraAllergen(), "replace"),
    );
  });

  it("--allergens=union keeps the extra allergen instead", () => {
    expect(
      buildPlan(menu, withExtraAllergen(), "union").items.find((i) => i.newItem.id === "i1"),
    ).toBeUndefined();
  });

  it("warns when a running offer would no longer sit below the new price", () => {
    const draft = [
      category("Bier alkoholfrei", [
        item("Fürstenberg Pils alkoholfrei 0,5l", {
          priceCents: 400,
          allergens: ["gluten"],
          offerPriceCents: 450,
        }),
      ]),
    ];
    expect(buildPlan(menu, draft, "union").warnings).toHaveLength(1);
  });
});

describe("a card that replaces the whole menu", () => {
  const dish = (id: string, name: string, over: Record<string, unknown> = {}) => ({
    id,
    number: null,
    name,
    description: null,
    priceCents: 100,
    allergens: [],
    traces: [],
    dietary: [],
    spice: 0,
    ...over,
  });
  const draft = [
    { id: "wine", name: "Weine", orderIndex: 100, items: [item("Merlot")] },
    {
      id: "veg",
      name: "Gerichte",
      orderIndex: 200,
      photoMediaId: "cat-photo",
      items: [item("Palak Paneer"), item("Thali", { deletedAt: new Date() })],
    },
  ];

  it("hides the dishes of categories the card no longer has, only when asked", () => {
    const menu = {
      categories: [{ id: "g", name: "Gerichte", items: [dish("a", "Palak Paneer")] }],
    };
    expect(buildPlan(menu, draft, "union").softDeletes).toEqual([]);
    const plan = buildPlan(menu, draft, "union", { hideOrphanCategories: true });
    expect(plan.softDeletes.map((d) => d.name)).toEqual(["Merlot"]);
  });

  it("lends a photo to a new dish and category, hidden dishes included", () => {
    const plan = buildPlan(
      {
        categories: [
          {
            id: "g",
            name: "Gerichte",
            items: [
              dish("a", "Palak Paneer"),
              dish("b", "Saag Paneer", { photoFrom: "Palak Paneer" }),
              dish("c", "Abend-Thali", { photoFrom: "Thali" }),
            ],
          },
          { id: "n", name: "Neu", photoFrom: "Gerichte", items: [] },
        ],
      },
      draft,
      "union",
    );
    const photo = (name: string) =>
      plan.items.find((i) => i.newItem.name === name)?.data.photoMediaId;
    expect(photo("Saag Paneer")).toBe("photo-Palak Paneer");
    expect(photo("Abend-Thali")).toBe("photo-Thali");
    expect(plan.categories.find((c) => c.newCategory.id === "n")?.photoMediaId).toBe("cat-photo");
  });

  it("marks a renamed or rewritten row's translations stale, and leaves untouched text alone", () => {
    const plan = buildPlan(
      {
        categories: [
          {
            id: "g",
            name: "Maaji Gerichte",
            matchNames: ["Gerichte"],
            items: [dish("a", "Saag Paneer", { matchNames: ["Palak Paneer"] })],
          },
        ],
      },
      draft,
      "union",
    );
    expect(plan.staleTranslations).toEqual([
      { entityType: "category", entityId: "veg" },
      { entityType: "item", entityId: "id-Palak Paneer" },
    ]);
  });

  it("ends an inherited offer only when asked", () => {
    const withOffer = [
      {
        id: "veg",
        name: "Gerichte",
        orderIndex: 100,
        items: [item("Pakoras", { offerPriceCents: 490, orderIndex: 100 })],
      },
    ];
    const menu = {
      categories: [
        {
          id: "g",
          name: "Gerichte",
          items: [dish("a", "Pakora-Bowl", { matchNames: ["Pakoras"], priceCents: 890 })],
        },
      ],
    };
    const offered = (p: ReturnType<typeof buildPlan>) => p.items[0]!.changes.join();
    expect(offered(buildPlan(menu, withOffer, "union"))).not.toContain("offer");
    expect(offered(buildPlan(menu, withOffer, "union", { clearOffers: true }))).toContain(
      "offer 490 ended",
    );
  });

  it("is a no-op the second time round", () => {
    const menu = {
      categories: [
        {
          id: "g",
          name: "Gerichte",
          items: [dish("a", "Palak Paneer", { availableDays: [0, 1], photoFrom: "Merlot" })],
        },
      ],
    };
    const once = [
      {
        id: "veg",
        name: "Gerichte",
        orderIndex: 100,
        items: [item("Palak Paneer", { availableDays: [0, 1], orderIndex: 100 })],
      },
    ];
    const plan = buildPlan(menu, once, "union", { hideOrphanCategories: true });
    expect(plan.items).toEqual([]);
    expect(plan.staleTranslations).toEqual([]);
  });
});
