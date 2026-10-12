"""
Builds shared/foods.ts from the USDA FoodData Central SR Legacy data.

USDA FoodData Central is public domain (CC0 1.0). The input is the USDA SR Legacy
food list as published in JSON (e.g. the copy in Kamesas/food-data, dist/foods.en.json).
Run: python3 scripts/generate-nutrition-foods.py path/to/foods.en.json
Every value is per 100 g of the edible food, as USDA lists it.
"""
import json
import sys
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


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("usage: generate-nutrition-foods.py <USDA foods.en.json>")
    usda = {item["id"]: item for item in json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))}
    lines = [
        "/**",
        " * Foods a coach can put in a student's nutrition plan. Values are per 100 g.",
        " * Source: USDA FoodData Central, SR Legacy (public domain, CC0 1.0), via the copy in Kamesas/food-data.",
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
        lines.append(
            "  { "
            f"id: {json.dumps(slug)}, name: {json.dumps(name, ensure_ascii=False)}, nameEn: {json.dumps(item['name'], ensure_ascii=False)}, "
            f"group: {json.dumps(group)}, usdaId: {usda_id}, kcal: {round(item['calories'])}, protein: {round(item['protein'], 1)}, "
            f"fat: {round(item['fat'], 1)}, carbs: {round(item['carb'], 1)} }},"
        )
    lines += ["];", "", "export const FOODS_BY_ID = new Map(FOODS.map((food) => [food.id, food]));", ""]
    out = Path(__file__).resolve().parent.parent / "shared" / "foods.ts"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {len(FOODS)} foods to {out}")


if __name__ == "__main__":
    main()
