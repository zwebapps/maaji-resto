# Maaji-Karte 08/2026 – offene Punkte für den Inhaber

Quelle: `DV_Maaji_Karte_A4_08-2026 (1).pdf` → `maaji-menu-2026-08.json`. Angewendet mit
`scripts/apply-menu-update.ts --allergens=union --hide-orphan-categories --clear-offers`.

## Bitte prüfen: „vegan“ auf der Karte, aber Milch in den Angaben

Diese Gerichte tragen auf der Karte V / „vegan“, aber auch einen Milch-Code oder Sahne.
Online stehen sie als **vegetarisch**, nicht als vegan, bis das geklärt ist.

- 30. Gemischter Salat (Codes: h1 h4 h6 g1 g2 a2)
- 34. Indischer Salat (Codes: g1 g2 a2)
- 43. Naan (Codes: a1 g1)
- 44. Garlic Naan (Codes: a1 g1)
- 46. Peshawari Naan (Codes: a1 g1)
- 82. Gemüse-Wrap (Codes: a1 g2)
- 100. Bengen Ka Bharta (Codes: g1)
- 101. Bengen Bharta Mater Masala (Codes: keine)
- 130. Dal Tarka vegan (Codes: a1 g2)
- 120. Tofu Palak, 121. Tofu Shahi: Karte sagt VEGAN, die bisherigen Daten nennen Milch (bleibt als Warnung)

## Bitte prüfen: Allergene, die der Text nennt, der Code aber nicht

Die Karte nennt die Zutat, aber nicht den Code. Online ist das Allergen **ergänzt**, damit
keine Warnung fehlt.

- 26. Chili Paneer: Milch (Codes auf der Karte: keine)
- 27. Chili Tofu: Soja (Codes auf der Karte: keine)
- 41. Butter Roti: Milch (Codes auf der Karte: a1)
- 50. Chicken Naan: Milch (Codes auf der Karte: a1 h9)
- 51. Keema Naan: Milch (Codes auf der Karte: a1 h9)
- 72. Maaji 3 Chicken: Milch (Codes auf der Karte: keine)
- 74. Maaji 2 Chicken mit Mango-Lassi 0,3l: Milch (Codes auf der Karte: keine)
- 75. Maaji 3 Chicken mit Mango-Lassi 0,3l: Milch (Codes auf der Karte: keine)
- 101. Bengen Bharta Mater Masala: Milch (Codes auf der Karte: keine)
- 112. Saag Paneer: Milch (Codes auf der Karte: keine)
- 143. Chicken Kräuter / Butter Chicken Mix: Milch (Codes auf der Karte: keine)
- 157. Butter-Chicken Dal: Nüsse (Codes auf der Karte: g1)
- 175. Malai Kofta: Nüsse (Codes auf der Karte: g1 d)
- 244. Kinder Portion Prawn: Krebstiere (Codes auf der Karte: g1 h4)
- 191. Lamm-Chicken-Butter-Mix: Milch (Codes auf der Karte: keine)
- 207. Lamm Anari: Milch (Codes auf der Karte: keine)
- 225. Prawn-Anari: Krebstiere (Codes auf der Karte: g1)
- 230. Prawn Bhuna: Krebstiere (Codes auf der Karte: g1 d h4)
- 234. Mix Biryani: Krebstiere (Codes auf der Karte: h4 g1)
- 500. Special-Thali Vegetarisch und vegan: Milch (Codes auf der Karte: keine)
- 510. Special-Thali Chicken und Lamm: Milch (Codes auf der Karte: keine)
- 532. Abend-Thali Maaji 3 Chicken: Milch (Codes auf der Karte: keine)
- 350. Maaji Chinese Vegetarisch: Gluten (Codes auf der Karte: h4 c f g1)
- 351. Maaji Chinese-Chicken: Gluten (Codes auf der Karte: h4 c f g1)
- 352. Maaji Chinese-Lamm: Gluten (Codes auf der Karte: h4 c f g1)
- 353. Maaji Chinese-Prawn: Gluten (Codes auf der Karte: h4 c f b g1)
- 368. Fried Rice Prawn: Krebstiere (Codes auf der Karte: h4 c f g1)
- 301. Gulab Jamun: Milch (Codes auf der Karte: keine)
- 302. Eis: Milch (Codes auf der Karte: keine)
- 303. Halwa: Gluten (Codes auf der Karte: keine)

## Vermutliche Druckfehler auf der Karte

- **Nr. 230 gibt es zweimal**: Prawn Bhuna und Sabzi Biryani. Online wie gedruckt.
- 175 Malai Kofta (vegetarisch) trägt Code d = Fisch. Online wie gedruckt, also mit Fisch-Warnung.
- 230 Prawn Bhuna trägt Code d = Fisch, aber kein b = Krebstiere (ergänzt).
- Der Code h9 (Chicken Naan, Keema Naan) fehlt in der Legende; online als Sesam, weil der Text Sesam nennt.
- Kulfi: Code „2“ fehlt in der Legende; online als h5 Pistazien, weil der Text Pistazien nennt.
- Diese Tippfehler sind online korrigiert: „hicken“ → Chicken (184), „Hähchen“ → Hähnchen (180–183),
  „suer“ → sauer (167), „Inwer“ → Ingwer (Eistee), „Seehk“ → Seekh (20, 160), „Vindalo“ → Vindaloo (164),
  „Kokosrapseln“ → Kokosraspeln (233), „für 2 Person“ → Personen (181–183), „Granadapfel“ → Granatapfel.

## Was online anders funktioniert als auf Papier

- **Mittagsmenü 70–75**: nur Mo–Fr sichtbar. Die Uhrzeit 11.30–14.30 steht nur in der Überschrift; das System kann ein Gericht nicht nach Uhrzeit ausblenden.
- **„mit Salat + €3,90“**: im Warenkorb nicht wählbar. Gäste können 7. Beilagensalat (€3,90) dazubestellen.
- **Auswahl** bei 1, 2, 105, 302 und Special-Thali 500/510: steht in der Beschreibung; der Gast kann sie beim Bestellen nicht anklicken.
- **Sammelzeilen** auf der Getränkeseite sind einzelne Artikel (z. B. Cola 0,33l, Fanta 0,33l, Lassi je Größe).
- **Codes h6/h7/h8** (Kichererbsen, Kokos, Süßmittel) hat im System kein eigenes Allergen und erscheint nur, wenn es im Text steht.
