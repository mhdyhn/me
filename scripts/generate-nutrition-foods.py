"""
Builds shared/foods.ts from the USDA FoodData Central SR Legacy data.

USDA FoodData Central is public domain (CC0 1.0). The input is the USDA SR Legacy
food list as published in JSON (e.g. the copy in Kamesas/food-data, dist/foods.en.json).
The extra nutrients (sugar, fiber, sodium, ...) come from the SR28 text files
(USDA-SR28 on GitHub, also public domain), joined to the foods by their USDA description.
Run: python3 scripts/generate-nutrition-foods.py path/to/foods.en.json path/to/SR28-dir
Every value is per 100 g of the edible food, as USDA lists it. A nutrient USDA does not
publish for a food is written as null, never as 0.
"""
import json
import sys
from collections import defaultdict
from pathlib import Path

# (slug, Persian name, group, USDA id)
FOODS = [
    # پروتئین
    ("chicken-breast", "سینهٔ مرغ پخته", "protein", 171477),
    ("chicken-thigh", "ران مرغ پخته", "protein", 172388),
    ("turkey-breast", "سینهٔ بوقلمون پخته", "protein", 171496),
    ("beef-ground-90", "گوشت چرخ‌کرده (۹۰٪ خالص)", "protein", 174030),
    ("beef-sirloin", "استیک گوشت گاو (سیرلوین)", "protein", 168727),
    ("lamb-leg", "گوشت گوسفند (ران، خام)", "protein", 172486),
    ("salmon", "ماهی سالمون پخته", "protein", 175168),
    ("tuna-canned", "تن ماهی کنسروی در آب", "protein", 171986),
    ("sardines", "ساردین کنسروی در روغن", "protein", 175139),
    ("cod", "ماهی کاد پخته", "protein", 171956),
    ("shrimp", "میگو پخته", "protein", 175180),
    ("egg-whole", "تخم‌مرغ کامل", "protein", 171287),
    ("egg-white", "سفیدهٔ تخم‌مرغ", "protein", 172183),
    ("tofu", "توفو", "protein", 172475),
    ("lentils", "عدس پخته", "protein", 172421),
    ("chickpeas", "نخود پخته", "protein", 173757),
    ("kidney-beans", "لوبیا قرمز پخته", "protein", 175194),
    # لبنیات
    ("milk-whole", "شیر پرچرب ۳٪", "dairy", 171265),
    ("yogurt-low-fat", "ماست کم‌چرب", "dairy", 170886),
    ("kefir", "کفیر کم‌چرب", "dairy", 170904),
    ("cottage-cheese", "پنیر کوتیج کم‌چرب", "dairy", 172182),
    ("cheddar", "پنیر چدار", "dairy", 170899),
    ("mozzarella", "پنیر موزارلا", "dairy", 170847),
    ("parmesan", "پنیر پارمسان", "dairy", 171247),
    ("butter", "کره", "dairy", 173410),
    ("soy-milk", "شیر سویا", "dairy", 172456),
    ("almond-milk", "شیر بادام بدون شکر", "dairy", 174832),
    # غلات و نان
    ("rice-white-cooked", "برنج سفید پخته", "grain", 168880),
    ("pasta-cooked", "ماکارونی پخته", "grain", 169737),
    ("bread-white", "نان سفید", "grain", 167532),
    ("bread-whole-wheat", "نان گندم کامل", "grain", 172688),
    ("oatmeal-cooked", "جو دوسر پخته", "grain", 171675),
    ("bulgur-cooked", "بلغور پخته", "grain", 170287),
    ("quinoa-cooked", "کینوا پخته", "grain", 168917),
    ("couscous-cooked", "کوسکوس پخته", "grain", 169700),
    ("barley-cooked", "جو پرک پخته", "grain", 170285),
    ("corn-tortilla", "تورتیلای ذرت", "grain", 175036),
    ("cornflakes", "کورن‌فلکس", "grain", 174648),
    ("potato-boiled", "سیب‌زمینی پخته", "grain", 170438),
    ("sweet-potato-cooked", "سیب‌زمینی شیرین پخته", "grain", 168484),
    ("corn-cooked", "ذرت شیرین پخته", "grain", 169999),
    # میوه
    ("banana", "موز", "fruit", 173944),
    ("apple", "سیب (بدون پوست)", "fruit", 171689),
    ("orange", "پرتقال", "fruit", 169097),
    ("tangerine", "نارنگی", "fruit", 169105),
    ("kiwi", "کیوی", "fruit", 168153),
    ("mango", "انبه", "fruit", 169910),
    ("pear", "گلابی", "fruit", 169118),
    ("peach", "هلو", "fruit", 169928),
    ("cherries", "آلبالو / گیلاس", "fruit", 171719),
    ("grapes", "انگور", "fruit", 174683),
    ("pomegranate", "انار", "fruit", 169134),
    ("pineapple", "آناناس", "fruit", 169124),
    ("plum", "آلو", "fruit", 169949),
    ("apricot", "زردآلو", "fruit", 171697),
    ("cantaloupe", "خربزه", "fruit", 169092),
    ("grapefruit", "گریپ‌فروت", "fruit", 174673),
    ("avocado", "آووکادو", "fruit", 171705),
    ("dates", "خرمای مدجول", "fruit", 168191),
    ("figs-dried", "انجیر خشک", "fruit", 174665),
    ("raisins", "کشمش", "fruit", 168166),
    ("blueberries", "بلوبری", "fruit", 167640),
    ("blackberries", "تمشک", "fruit", 168982),
    ("coconut", "نارگیل تازه", "fruit", 170169),
    # سبزی
    ("tomato", "گوجه‌فرنگی", "vegetable", 170457),
    ("cucumber", "خیار", "vegetable", 168409),
    ("lettuce", "کاهو", "vegetable", 169249),
    ("carrot", "هویج", "vegetable", 168568),
    ("zucchini", "کدو سبز", "vegetable", 169291),
    ("mushroom", "قارچ", "vegetable", 169251),
    ("cabbage", "کلم سبز", "vegetable", 169975),
    ("green-beans", "لوبیا سبز", "vegetable", 169961),
    ("green-peas", "نخود فرنگی", "vegetable", 170419),
    ("broccoli", "بروکلی", "vegetable", 169330),
    ("onion", "پیاز", "vegetable", 170008),
    ("radish", "تربچه", "vegetable", 169276),
    ("leek", "تره", "vegetable", 169246),
    ("mint", "نعنا تازه", "vegetable", 173475),
    ("parsley", "جعفری", "vegetable", 170416),
    ("basil", "ریحان", "vegetable", 172232),
    ("cumin", "زیره", "vegetable", 170923),
    ("pickle", "خیارشور", "vegetable", 168558),
    ("olives", "زیتون کنسروی", "vegetable", 169094),
    ("lemon", "لیمو ترش", "vegetable", 167746),
    # چربی، آجیل و دانه
    ("olive-oil", "روغن زیتون", "fat", 171413),
    ("canola-oil", "روغن کانولا", "fat", 172336),
    ("coconut-oil", "روغن نارگیل", "fat", 171412),
    ("peanut-butter", "کرهٔ بادام زمینی", "fat", 172470),
    ("almonds", "بادام درختی", "fat", 170567),
    ("walnuts", "گردو", "fat", 170187),
    ("pistachio", "پسته", "fat", 170184),
    ("cashews", "بادام هندی", "fat", 170162),
    ("hazelnut", "فندق", "fat", 170581),
    ("peanuts", "بادام زمینی", "fat", 172430),
    ("sunflower-seeds", "تخمهٔ آفتابگردان", "fat", 170562),
    ("pumpkin-seeds", "تخمهٔ کدو", "fat", 170556),
    ("flaxseed", "دانهٔ کتان", "fat", 169414),
    ("chia-seeds", "دانهٔ چیا", "fat", 170554),
    ("hummus", "حمص", "fat", 174289),
    # شیرینی و تنقلات
    ("sugar", "شکر", "sweet", 169655),
    ("jam", "مربا", "sweet", 169641),
    ("dark-chocolate", "شکلات تلخ (۷۰٪)", "sweet", 170273),
    ("milk-chocolate", "شکلات شیری", "sweet", 167587),
    # نوشیدنی
    ("coffee", "قهوه بدون شکر", "drink", 171890),
    ("black-tea", "چای بدون شکر", "drink", 173227),
    ("cola", "نوشابه کولا", "drink", 174852),
    ("apple-juice", "آب سیب بدون شکر", "drink", 173933),
    ("orange-juice", "آب پرتقال", "drink", 169098),
]

# SR28 names that differ from the SR Legacy names in the input file.
SR28_NAME_OVERRIDES = {
    "Turkey, whole, breast, meat only, cooked, roasted": "Turkey, breast, from whole bird, meat only, roasted",
    "Lamb, leg, shank half, separable lean only, trimmed to 1/4\" fat, choice, raw": "Lamb, domestic, leg, shank half, separable lean only, trimmed to 1/4\" fat, choice, raw",
    "Crustaceans, shrimp, cooked": "Crustaceans, shrimp, cooked (not previously frozen)",
    "Yogurt, plain, low fat": "Yogurt, plain, low fat, 12 grams protein per 8 ounce",
    "Orange juice, raw (Includes foods for USDA's Food Distribution Program)": "Orange juice, raw",
}

# NUT_DATA Nutr_No -> (output field, unit label)
EXTRA_NUTRIENTS = {
    "269": "sugar",
    "291": "fiber",
    "606": "satFat",
    "601": "cholesterol",
    "307": "sodium",
    "301": "calcium",
    "303": "iron",
    "306": "potassium",
}
EXTRA_FIELDS = ["sugar", "fiber", "satFat", "cholesterol", "sodium", "calcium", "iron", "potassium"]

# Foods people count rather than weigh: slug -> (SR28 WEIGHT.txt measure, label shown in the app).
# The grams come from the same USDA measure, so 1 egg (large) = 50 g.
PIECE_RULES = {
    "egg-whole": ("large", "عدد"),
    "bread-white": ("slice", "تکه"),
    "bread-whole-wheat": ("slice", "تکه"),
    "corn-tortilla": ("tortilla", "عدد"),
    "banana": ('medium (7" to 7-7/8" long)', "عدد"),
    "apple": ('medium (3" dia)', "عدد"),
    "orange": ('fruit (2-5/8" dia)', "عدد"),
    "tangerine": ('medium (2-1/2" dia)', "عدد"),
    "kiwi": ('fruit (2" dia)', "عدد"),
    "pear": ("medium", "عدد"),
    "peach": ('medium (2-2/3" dia)', "عدد"),
    "plum": ('fruit (2-1/8" dia)', "عدد"),
    "tomato": ('medium whole (2-3/5" dia)', "عدد"),
    "dates": ("date, pitted", "عدد"),
    "cheddar": ("slice (1 oz)", "تکه"),
}


def read_weights(directory: Path) -> dict:
    """NDB number -> {measure description: grams} from WEIGHT.txt."""
    weights: dict = defaultdict(dict)
    with (directory / "WEIGHT.txt").open(encoding="latin-1") as handle:
        for line in handle:
            row = [field.strip("~") for field in line.rstrip("\r\n").split("^")]
            weights[row[0]].setdefault(row[3], float(row[4]))
    return weights


def piece_for(slug: str, ndb: str, weights: dict):
    rule = PIECE_RULES.get(slug)
    if rule is None:
        return None
    measure, label = rule
    grams = weights.get(ndb, {}).get(measure)
    if grams is None:
        sys.exit(f"{slug}: WEIGHT.txt has no measure {measure!r}")
    return label, grams


def read_sr28(directory: Path) -> tuple[dict, dict]:
    """Return (long description -> NDB number, NDB number -> {field: value})."""
    def rows(name: str):
        with (directory / name).open(encoding="latin-1") as handle:
            for line in handle:
                yield [field.strip("~") for field in line.rstrip("\r\n").split("^")]

    by_name: dict = {}
    for row in rows("FOOD_DES.txt"):
        by_name.setdefault(row[2], row[0])
    wanted = set(EXTRA_NUTRIENTS)
    values: dict = defaultdict(dict)
    for row in rows("NUT_DATA.txt"):
        if row[1] in wanted:
            values[row[0]][EXTRA_NUTRIENTS[row[1]]] = float(row[2])
    return by_name, values


def ndb_for(name: str, by_name: dict, slug: str) -> str:
    ndb = by_name.get(SR28_NAME_OVERRIDES.get(name, name))
    if ndb is None:
        sys.exit(f"{slug}: no SR28 entry for {name!r}")
    return ndb


def extras_for(ndb: str, values: dict) -> dict:
    found = values.get(ndb, {})
    return {field: found.get(field) for field in EXTRA_FIELDS}


def fmt(value):
    return "null" if value is None else str(round(value, 2))


def main() -> None:
    if len(sys.argv) != 3:
        sys.exit("usage: generate-nutrition-foods.py <USDA foods.en.json> <SR28 directory>")
    usda = {item["id"]: item for item in json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))}
    by_name, values = read_sr28(Path(sys.argv[2]))
    weights = read_weights(Path(sys.argv[2]))
    lines = [
        "/**",
        " * Foods a coach can put in a student's nutrition plan. Values are per 100 g.",
        " * Source: USDA FoodData Central, SR Legacy (public domain, CC0 1.0), via the copy in Kamesas/food-data.",
        " * Sugar, fiber, fats, sodium and minerals: USDA SR28 (public domain). null = USDA does not publish it.",
        " * Generated by scripts/generate-nutrition-foods.py. Edit the list there, then regenerate.",
        " */",
        "export type FoodGroup = \"protein\" | \"dairy\" | \"grain\" | \"fruit\" | \"vegetable\" | \"fat\" | \"sweet\" | \"drink\";",
        "",
        "export interface Food {",
        "  id: string;",
        "  name: string;",
        "  nameEn: string;",
        "  group: FoodGroup;",
        "  usdaId: number;",
        "  kcal: number;",
        "  protein: number;",
        "  fat: number;",
        "  carbs: number;",
        "  fiber: number | null;",
        "  sugar: number | null;",
        "  satFat: number | null;",
        "  cholesterol: number | null;",
        "  sodium: number | null;",
        "  calcium: number | null;",
        "  iron: number | null;",
        "  potassium: number | null;",
        "  piece: { label: string; grams: number } | null;",
        "}",
        "",
        "export const FOODS: Food[] = [",
    ]
    for slug, name, group, usda_id in FOODS:
        item = usda.get(usda_id)
        if item is None:
            sys.exit(f"USDA id {usda_id} for {slug} is missing from the input")
        for key in ("calories", "protein", "fat", "carb"):
            if item.get(key) is None:
                sys.exit(f"USDA id {usda_id} ({slug}) has no {key}")
        ndb = ndb_for(item["name"], by_name, slug)
        extra = extras_for(ndb, values)
        piece = piece_for(slug, ndb, weights)
        piece_text = "null" if piece is None else "{ label: " + json.dumps(piece[0], ensure_ascii=False) + ", grams: " + fmt(piece[1]) + " }"
        extra_text = ", ".join(f"{field}: {fmt(extra[field])}" for field in ["fiber", "sugar", "satFat", "cholesterol", "sodium", "calcium", "iron", "potassium"])
        lines.append(
            "  { "
            f"id: {json.dumps(slug)}, name: {json.dumps(name, ensure_ascii=False)}, nameEn: {json.dumps(item['name'], ensure_ascii=False)}, "
            f"group: {json.dumps(group)}, usdaId: {usda_id}, kcal: {round(item['calories'])}, protein: {round(item['protein'], 1)}, "
            f"fat: {round(item['fat'], 1)}, carbs: {round(item['carb'], 1)}, {extra_text}, piece: {piece_text} }},"
        )
    lines += ["];", "", "export const FOODS_BY_ID = new Map(FOODS.map((food) => [food.id, food]));", ""]
    out = Path(__file__).resolve().parent.parent / "shared" / "foods.ts"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {len(FOODS)} foods to {out}")


if __name__ == "__main__":
    main()
