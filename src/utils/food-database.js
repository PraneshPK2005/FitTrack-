/**
 * FitTrack AI — Central Food Database
 * All foods stored per-serving with scaling support
 * Includes AI estimation fallback for unknown foods
 */

// ─────────────────────────────────────────────────────────────
// Food Database
// per: reference quantity | unit: 'g', 'ml', 'piece', 'tbsp', 'scoop', etc.
// ─────────────────────────────────────────────────────────────
export const FOOD_DB = [
  // ── Grains & Starches ──────────────────────────────────────
  { id:'rice',         name:'Rice (cooked)',         aliases:['rice','white rice','steamed rice','boiled rice','chawal'],                  per:100, unit:'g',     category:'grain',   calories:130, protein:2.7,  carbs:28,   fats:0.3, fibre:0.4 },
  { id:'brown_rice',   name:'Brown Rice (cooked)',   aliases:['brown rice'],                                                               per:100, unit:'g',     category:'grain',   calories:111, protein:2.6,  carbs:23,   fats:0.9, fibre:1.8 },
  { id:'chapati',      name:'Chapati / Roti',        aliases:['chapati','roti','chapatti','phulka','wheat roti','fulka'],                   per:1,   unit:'piece', category:'grain',   calories:120, protein:3.1,  carbs:20,   fats:3.7, fibre:2.0 },
  { id:'bread',        name:'Bread Slice',           aliases:['bread','toast','white bread','brown bread','bread slice'],                  per:1,   unit:'slice', category:'grain',   calories:75,  protein:2.7,  carbs:14,   fats:1.0, fibre:1.2 },
  { id:'oats',         name:'Oats (dry)',            aliases:['oats','oatmeal','porridge','rolled oats'],                                  per:100, unit:'g',     category:'grain',   calories:389, protein:17,   carbs:66,   fats:7, fibre:10.6   },
  { id:'pasta',        name:'Pasta (dry)',           aliases:['pasta','spaghetti','penne','macaroni'],                                     per:100, unit:'g',     category:'grain',   calories:350, protein:12,   carbs:71,   fats:1.5, fibre:2.5 },
  { id:'idli',         name:'Idli',                  aliases:['idli','idly'],                                                              per:1,   unit:'piece', category:'grain',   calories:58,  protein:2,    carbs:12,   fats:0.4, fibre:0.5 },
  { id:'dosa',         name:'Dosa',                  aliases:['dosa','dosai'],                                                             per:1,   unit:'piece', category:'grain',   calories:133, protein:3,    carbs:18,   fats:5, fibre:1.0   },
  { id:'poha',         name:'Poha',                  aliases:['poha','flattened rice','beaten rice','avalakki'],                           per:100, unit:'g',     category:'grain',   calories:110, protein:2,    carbs:24,   fats:0.2, fibre:1.5 },
  { id:'quinoa',       name:'Quinoa (cooked)',       aliases:['quinoa'],                                                                   per:100, unit:'g',     category:'grain',   calories:120, protein:4.4,  carbs:21.3, fats:1.9, fibre:2.8 },
  { id:'khichdi',      name:'Khichdi',               aliases:['khichdi','kitchdi','khichri'],                                              per:100, unit:'g',     category:'grain',   calories:120, protein:4,    carbs:22,   fats:1.5, fibre:1.5 },
  { id:'upma',         name:'Upma',                  aliases:['upma','rava upma','semolina upma'],                                         per:100, unit:'g',     category:'grain',   calories:145, protein:3.5,  carbs:24,   fats:4.5, fibre:1.8 },
  { id:'paratha',      name:'Paratha',               aliases:['paratha','aloo paratha','stuffed paratha'],                                 per:1,   unit:'piece', category:'grain',   calories:200, protein:4,    carbs:28,   fats:8, fibre:2.5   },
  { id:'puri',         name:'Puri',                  aliases:['puri','poori'],                                                             per:1,   unit:'piece', category:'grain',   calories:135, protein:2.8,  carbs:18,   fats:6, fibre:0.8   },
  { id:'samosa',       name:'Samosa',                aliases:['samosa'],                                                                   per:1,   unit:'piece', category:'grain',   calories:262, protein:5,    carbs:30,   fats:14, fibre:2.0  },
  { id:'vada',         name:'Medu Vada',             aliases:['vada','medu vada','urad vada'],                                            per:1,   unit:'piece', category:'grain',   calories:97,  protein:3,    carbs:14,   fats:3.5, fibre:1.5 },
  { id:'sweet_potato', name:'Sweet Potato',          aliases:['sweet potato','shakarkandi'],                                              per:100, unit:'g',     category:'grain',   calories:86,  protein:1.6,  carbs:20,   fats:0.1, fibre:3.0 },

  // ── Proteins ───────────────────────────────────────────────
  { id:'chicken_br',   name:'Chicken Breast (cooked)', aliases:['chicken breast','chicken','grilled chicken','boiled chicken'],           per:100, unit:'g',     category:'protein', calories:165, protein:31,   carbs:0,    fats:3.6, fibre:0 },
  { id:'chicken_leg',  name:'Chicken Leg',           aliases:['chicken leg','drumstick','chicken thigh','leg piece'],                    per:1,   unit:'piece', category:'protein', calories:190, protein:25,   carbs:0,    fats:10, fibre:0  },
  { id:'egg',          name:'Egg (whole)',            aliases:['egg','eggs','boiled egg','fried egg','scrambled egg','anda'],             per:1,   unit:'egg',   category:'protein', calories:70,  protein:6,    carbs:0.6,  fats:5, fibre:0   },
  { id:'egg_white',    name:'Egg White',             aliases:['egg white','egg whites'],                                                  per:1,   unit:'white', category:'protein', calories:17,  protein:3.6,  carbs:0.2,  fats:0, fibre:0   },
  { id:'salmon',       name:'Salmon',                aliases:['salmon','grilled salmon','baked salmon'],                                  per:100, unit:'g',     category:'protein', calories:208, protein:20,   carbs:0,    fats:13, fibre:0  },
  { id:'tuna',         name:'Tuna (canned)',         aliases:['tuna','canned tuna','tuna fish'],                                         per:100, unit:'g',     category:'protein', calories:116, protein:26,   carbs:0,    fats:1, fibre:0   },
  { id:'mutton',       name:'Mutton',                aliases:['mutton','lamb','mutton curry','gosht'],                                    per:100, unit:'g',     category:'protein', calories:294, protein:25,   carbs:0,    fats:21, fibre:0  },
  { id:'dal',          name:'Dal (cooked)',          aliases:['dal','dhal','lentils','lentil','masoor dal','toor dal','moong dal'],       per:100, unit:'g',     category:'protein', calories:116, protein:9,    carbs:20,   fats:0.4, fibre:3.0 },
  { id:'paneer',       name:'Paneer',                aliases:['paneer','cottage cheese'],                                                 per:100, unit:'g',     category:'protein', calories:265, protein:18,   carbs:1.2,  fats:20, fibre:0  },
  { id:'tofu',         name:'Tofu',                  aliases:['tofu','soy tofu'],                                                         per:100, unit:'g',     category:'protein', calories:76,  protein:8,    carbs:1.9,  fats:4.8, fibre:0.3 },
  { id:'whey',         name:'Whey Protein',          aliases:['whey','protein shake','whey protein','protein powder'],                   per:1,   unit:'scoop', category:'protein', calories:120, protein:25,   carbs:3,    fats:1.5, fibre:1.0 },
  { id:'kidney_bean',  name:'Kidney Beans (Rajma)',  aliases:['kidney beans','rajma','beans'],                                           per:100, unit:'g',     category:'protein', calories:127, protein:8.7,  carbs:22.8, fats:0.5, fibre:5.0 },
  { id:'soya_chunks',  name:'Soya Chunks (dry)',     aliases:['soya chunks','soya','soy chunks','nutrela'],                              per:100, unit:'g',     category:'protein', calories:345, protein:52,   carbs:33,   fats:0.5, fibre:13.0 },
  { id:'black_chick',  name:'Black Chickpea (kala chana)', aliases:['black chickpea','kala chana','kala channa','chana'],               per:100, unit:'g',     category:'protein', calories:164, protein:9,    carbs:27,   fats:2.6, fibre:8.0 },
  { id:'green_gram',   name:'Green Gram (Moong)',    aliases:['green gram','moong','mung','moong beans','sprouted moong'],               per:100, unit:'g',     category:'protein', calories:105, protein:7,    carbs:19,   fats:0.4, fibre:7.6 },
  { id:'roasted_gram', name:'Roasted Gram (Chana)',  aliases:['roasted gram','chana','roasted chana','bhuna chana','puttu kadalai'],    per:100, unit:'g',     category:'protein', calories:370, protein:22,   carbs:60,   fats:6, fibre:10.0   },

  // ── Dairy ──────────────────────────────────────────────────
  { id:'milk',         name:'Milk',                  aliases:['milk','cow milk','full fat milk','dudh'],                                 per:100, unit:'ml',    category:'dairy',   calories:61,  protein:3.2,  carbs:4.8,  fats:3.3, fibre:0 },
  { id:'curd',         name:'Curd / Yogurt',         aliases:['curd','yogurt','dahi','greek yogurt','plain yogurt'],                    per:100, unit:'g',     category:'dairy',   calories:61,  protein:3.5,  carbs:4.7,  fats:3.3, fibre:0 },
  { id:'cheese',       name:'Cheese Slice',          aliases:['cheese','cheese slice','cheddar'],                                        per:1,   unit:'slice', category:'dairy',   calories:100, protein:6,    carbs:1,    fats:8, fibre:0   },
  { id:'ghee',         name:'Ghee',                  aliases:['ghee','clarified butter'],                                                per:1,   unit:'tbsp',  category:'fat',     calories:112, protein:0,    carbs:0,    fats:12.5, fibre:0 },
  { id:'butter',       name:'Butter',                aliases:['butter','makhan'],                                                        per:1,   unit:'tbsp',  category:'fat',     calories:102, protein:0.1,  carbs:0,    fats:11.5, fibre:0 },

  // ── Fruits ─────────────────────────────────────────────────
  { id:'banana',       name:'Banana',                aliases:['banana','kela'],                                                           per:1,   unit:'medium',category:'fruit',  calories:105, protein:1.3,  carbs:27,   fats:0.3, fibre:3.1 },
  { id:'apple',        name:'Apple',                 aliases:['apple','seb'],                                                             per:1,   unit:'medium',category:'fruit',  calories:52,  protein:0.3,  carbs:14,   fats:0.2, fibre:4.4 },
  { id:'orange',       name:'Orange',                aliases:['orange','narangi','mosambi'],                                             per:1,   unit:'medium',category:'fruit',  calories:47,  protein:0.9,  carbs:12,   fats:0.1, fibre:3.1 },
  { id:'mango',        name:'Mango',                 aliases:['mango','aam'],                                                             per:100, unit:'g',     category:'fruit',  calories:60,  protein:0.8,  carbs:15,   fats:0.4, fibre:1.6 },
  { id:'avocado',      name:'Avocado',               aliases:['avocado'],                                                                 per:100, unit:'g',     category:'fruit',  calories:160, protein:2,    carbs:9,    fats:15, fibre:6.7  },
  { id:'date_fruit',   name:'Date',                  aliases:['date','dates','khajoor','khajur'],                                        per:1,   unit:'piece', category:'fruit',  calories:20,  protein:0.2,  carbs:5.3,  fats:0, fibre:0.6   },
  { id:'papaya',       name:'Papaya',                aliases:['papaya','papita'],                                                         per:100, unit:'g',     category:'fruit',  calories:43,  protein:0.5,  carbs:11,   fats:0.3, fibre:1.7 },
  { id:'guava',        name:'Guava',                 aliases:['guava','amrood'],                                                          per:1,   unit:'medium',category:'fruit',  calories:37,  protein:1.4,  carbs:8,    fats:0.5, fibre:5.0 },
  { id:'pomegranate',  name:'Pomegranate',           aliases:['pomegranate','anar'],                                                     per:100, unit:'g',     category:'fruit',  calories:83,  protein:1.7,  carbs:19,   fats:1.2, fibre:4.0 },

  // ── Nuts & Seeds ───────────────────────────────────────────
  { id:'almond',       name:'Almond',                aliases:['almond','almonds','badam'],                                               per:1,   unit:'piece', category:'nut',    calories:7,   protein:0.25, carbs:0.25, fats:0.6, fibre:0.1 },
  { id:'cashew',       name:'Cashew',                aliases:['cashew','kaju'],                                                           per:1,   unit:'piece', category:'nut',    calories:9,   protein:0.3,  carbs:0.5,  fats:0.7, fibre:0.1 },
  { id:'walnut',       name:'Walnut',                aliases:['walnut','akhrot'],                                                         per:1,   unit:'half',  category:'nut',    calories:13,  protein:0.3,  carbs:0.3,  fats:1.3, fibre:0.2 },
  { id:'almonds_g',    name:'Almonds (by weight)',   aliases:['almonds 30g'],                                                            per:30,  unit:'g',     category:'nut',    calories:174, protein:6,    carbs:6,    fats:15, fibre:3.5  },
  { id:'peanuts',      name:'Peanuts',               aliases:['peanut','peanuts','groundnut','moongfali'],                              per:100, unit:'g',     category:'nut',    calories:567, protein:26,   carbs:16,   fats:49, fibre:8.5  },
  { id:'pb',           name:'Peanut Butter',         aliases:['peanut butter','pb'],                                                     per:1,   unit:'tbsp',  category:'nut',    calories:95,  protein:4,    carbs:3,    fats:8, fibre:1.0   },
  { id:'olive_oil',    name:'Olive Oil',             aliases:['olive oil'],                                                               per:1,   unit:'tbsp',  category:'fat',    calories:120, protein:0,    carbs:0,    fats:14, fibre:0  },

  // ── Beverages ──────────────────────────────────────────────
  { id:'water',        name:'Water',                 aliases:['water','paani'],                                                           per:100, unit:'ml',    category:'drink',  calories:0,   protein:0,    carbs:0,    fats:0, fibre:0   },
  { id:'coffee',       name:'Black Coffee',          aliases:['coffee','black coffee','espresso','filter coffee'],                       per:1,   unit:'cup',   category:'drink',  calories:5,   protein:0.3,  carbs:0,    fats:0, fibre:0   },
  { id:'tea',          name:'Tea / Green Tea',       aliases:['tea','green tea','herbal tea'],                                           per:1,   unit:'cup',   category:'drink',  calories:2,   protein:0,    carbs:0.4,  fats:0, fibre:0   },
  { id:'masala_chai',  name:'Masala Chai',           aliases:['masala chai','chai with milk','chai'],                                   per:1,   unit:'cup',   category:'drink',  calories:60,  protein:2,    carbs:8,    fats:2, fibre:0   },
  { id:'coconut_water',name:'Coconut Water',         aliases:['coconut water','nariyal pani','tender coconut'],                         per:100, unit:'ml',    category:'drink',  calories:19,  protein:0.7,  carbs:3.7,  fats:0.2, fibre:0 },

  // ── Indian Main Course ─────────────────────────────────────
  { id:'dal_rice',     name:'Dal Rice (meal)',       aliases:['dal rice','dal chawal'],                                                  per:250, unit:'g',     category:'meal',   calories:350, protein:13,   carbs:63,   fats:4, fibre:4.0   },
  { id:'chole',        name:'Chole (Chickpea Curry)',aliases:['chole','chhole','chickpea curry'],                                       per:100, unit:'g',     category:'meal',   calories:140, protein:7,    carbs:22,   fats:3.5, fibre:5.0 },
  { id:'butter_chkn',  name:'Butter Chicken',       aliases:['butter chicken','murgh makhani'],                                        per:100, unit:'g',     category:'meal',   calories:162, protein:15,   carbs:7,    fats:9, fibre:0.5   },
  { id:'biryani',      name:'Chicken Biryani',      aliases:['biryani','chicken biryani','veg biryani'],                               per:200, unit:'g',     category:'meal',   calories:290, protein:16,   carbs:42,   fats:7, fibre:2.0   },
  { id:'sambhar',      name:'Sambar',                aliases:['sambhar','sambar'],                                                       per:100, unit:'ml',    category:'meal',   calories:53,  protein:3.5,  carbs:8,    fats:1, fibre:2.0   },
  { id:'rasam',        name:'Rasam',                 aliases:['rasam'],                                                                  per:100, unit:'ml',    category:'meal',   calories:25,  protein:1.5,  carbs:4,    fats:0.5, fibre:0.5 },
  { id:'curd_rice',    name:'Curd Rice',             aliases:['curd rice','thayir sadam','mosaranna'],                                  per:200, unit:'g',     category:'meal',   calories:230, protein:7,    carbs:38,   fats:6, fibre:0.8   },
  { id:'egg_curry',    name:'Egg Curry',             aliases:['egg curry','anda curry','egg masala'],                                   per:150, unit:'g',     category:'meal',   calories:200, protein:15,   carbs:8,    fats:13, fibre:1.5  },
  { id:'paneer_curry', name:'Paneer Curry',          aliases:['paneer curry','paneer masala','paneer sabzi'],                           per:150, unit:'g',     category:'meal',   calories:310, protein:15,   carbs:10,   fats:23, fibre:2.0  },
  { id:'rajma_rice',   name:'Rajma Chawal',          aliases:['rajma rice','rajma chawal'],                                             per:300, unit:'g',     category:'meal',   calories:420, protein:18,   carbs:72,   fats:5, fibre:7.0   },
  { id:'aloo_sabzi',   name:'Aloo Sabzi',            aliases:['aloo sabzi','potato curry','aloo'],                                      per:100, unit:'g',     category:'meal',   calories:105, protein:2.5,  carbs:17,   fats:4, fibre:2.0   },
  { id:'palak_paneer', name:'Palak Paneer',          aliases:['palak paneer','spinach paneer'],                                         per:150, unit:'g',     category:'meal',   calories:260, protein:14,   carbs:8,    fats:19, fibre:3.0  },

  // ── Indian Snacks & Breakfast ─────────────────────────────
  { id:'peanut_chikki',name:'Peanut Chikki',         aliases:['chikki','peanut chikki','groundnut chikki'],                            per:1,   unit:'piece', category:'snack',  calories:80,  protein:2,    carbs:11,   fats:3.5, fibre:0.8 },
  { id:'besan_chilla', name:'Besan Chilla',           aliases:['besan chilla','gram flour pancake','chilla'],                          per:1,   unit:'piece', category:'snack',  calories:135, protein:7,    carbs:18,   fats:4.5, fibre:2.0 },
  { id:'sprouts',      name:'Mixed Sprouts',          aliases:['sprouts','mixed sprouts','moong sprouts'],                              per:100, unit:'g',     category:'snack',  calories:57,  protein:4,    carbs:10,   fats:0.4, fibre:4.0 },
  { id:'dhokla',       name:'Dhokla',                 aliases:['dhokla','khaman dhokla'],                                              per:2,   unit:'piece', category:'snack',  calories:190, protein:8,    carbs:30,   fats:5, fibre:1.5   },
  { id:'bhel_puri',    name:'Bhel Puri',              aliases:['bhel puri','bhel'],                                                    per:100, unit:'g',     category:'snack',  calories:130, protein:3,    carbs:25,   fats:3, fibre:3.0   },
  { id:'masala_oats',  name:'Masala Oats (cooked)',   aliases:['masala oats'],                                                         per:1,   unit:'bowl',  category:'grain',  calories:185, protein:6,    carbs:32,   fats:5, fibre:5.0   },
];

// ─────────────────────────────────────────────────────────────
// Scaling — macros for any quantity
// ─────────────────────────────────────────────────────────────
export function scaleMacros(food, quantity) {
  const qty = Number(quantity) || 0;
  const ratio = food.per > 0 ? qty / food.per : 0;
  return {
    calories: Math.round(food.calories * ratio),
    protein:  Math.round(food.protein  * ratio * 10) / 10,
    carbs:    Math.round(food.carbs    * ratio * 10) / 10,
    fats:     Math.round(food.fats     * ratio * 10) / 10,
    fibre:    Math.round((food.fibre ?? 0) * ratio * 10) / 10,
  };
}

// ─────────────────────────────────────────────────────────────
// Search — ranked by match quality
// ─────────────────────────────────────────────────────────────
export function searchFood(query, customFoods = []) {
  if (!query || query.trim().length < 1) return [];
  const q = query.toLowerCase().trim();
  const results = [];

  // Custom foods first
  for (const cf of customFoods) {
    const n = (cf.name || '').toLowerCase();
    if (n.includes(q)) {
      results.push({ ...cf, isCustom: true, score: n.startsWith(q) ? 10 : 5 });
    }
  }

  // Built-in DB
  for (const food of FOOD_DB) {
    let score = 0;
    const name = food.name.toLowerCase();
    if (name === q)                                                          score = 20;
    else if (name.startsWith(q))                                             score = 15;
    else if (name.includes(q))                                               score = 10;
    else if (food.aliases.some(a => a.toLowerCase() === q))                 score = 18;
    else if (food.aliases.some(a => a.toLowerCase().startsWith(q)))         score = 13;
    else if (food.aliases.some(a => a.toLowerCase().includes(q)))           score = 8;
    if (score > 0) results.push({ ...food, isCustom: false, score });
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);
}

// ─────────────────────────────────────────────────────────────
// Parse natural language — "3 eggs", "250g rice", "2 scoops whey"
// ─────────────────────────────────────────────────────────────
const WORD_NUMS = {
  one:1, two:2, three:3, four:4, five:5, six:6, seven:7,
  eight:8, nine:9, ten:10, half:0.5, a:1, an:1,
};

export function parseNaturalFood(text, customFoods = []) {
  const results = [];
  const segments = text.toLowerCase().split(/\band\b|,|\bwith\b|\bplus\b|\balso\b|\bthen\b/);

  for (const seg of segments) {
    const trimmed = seg.trim();
    if (!trimmed) continue;

    let qty = 1;
    const numMatch = trimmed.match(/(\d+\.?\d*)/);
    if (numMatch) {
      qty = parseFloat(numMatch[1]);
    } else {
      for (const [word, val] of Object.entries(WORD_NUMS)) {
        if (new RegExp(`\\b${word}\\b`).test(trimmed)) { qty = val; break; }
      }
    }

    const unitMatch = trimmed.match(/\d+\.?\d*\s*(g|ml|kg|l|lb|oz|scoop[s]?|cup[s]?|tbsp|tsp|piece[s]?|slice[s]?)/i);
    const unitRaw = unitMatch ? unitMatch[1].toLowerCase().replace(/s$/, '') : null;
    if (unitRaw === 'kg') qty *= 1000;

    let matched = null;
    for (const cf of customFoods) {
      if (trimmed.includes(cf.name.toLowerCase())) { matched = cf; break; }
    }
    if (!matched) {
      for (const food of FOOD_DB) {
        const allNames = [food.name.toLowerCase(), ...food.aliases.map(a => a.toLowerCase())];
        if (allNames.some(n => trimmed.includes(n))) { matched = food; break; }
      }
    }

    if (matched) {
      let effectiveQty = qty;
      if (unitRaw === 'g' && matched.unit !== 'g' && matched.unit !== 'ml') {
        const temp = { ...matched, per: 100, unit: 'g' };
        const macros = scaleMacros(temp, effectiveQty);
        results.push({ id: `nl_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, name: `${qty}g ${matched.name}`, ...macros });
        continue;
      }
      const macros = scaleMacros(matched, effectiveQty);
      results.push({ id: `nl_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, name: `${qty}${matched.unit !== 'g' ? 'x ' : 'g '}${matched.name}`, ...macros });
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// AI Estimation for unknown foods
// ─────────────────────────────────────────────────────────────
const CATEGORY_ESTIMATES = {
  vegetable: { calories:35,  protein:2,   carbs:7,  fats:0.3, fibre:2.5 },
  fruit:     { calories:60,  protein:0.8, carbs:15, fats:0.3, fibre:2.5 },
  grain:     { calories:150, protein:4,   carbs:30, fats:1.5, fibre:3   },
  legume:    { calories:120, protein:8,   carbs:20, fats:0.5, fibre:6   },
  protein:   { calories:180, protein:25,  carbs:0,  fats:8,   fibre:0   },
  dairy:     { calories:100, protein:6,   carbs:8,  fats:4,   fibre:0   },
  nut:       { calories:600, protein:20,  carbs:15, fats:50,  fibre:8   },
  fried:     { calories:300, protein:8,   carbs:30, fats:18,  fibre:2   },
  sweet:     { calories:380, protein:4,   carbs:65, fats:12,  fibre:1   },
  drink:     { calories:50,  protein:1,   carbs:12, fats:0,   fibre:0.5 },
  default:   { calories:200, protein:8,   carbs:25, fats:6,   fibre:2   },
};

const CATEGORY_KEYWORDS = {
  vegetable: ['salad','broccoli','spinach','carrot','tomato','cucumber','cabbage','lettuce','onion','cauliflower','vegetable','sabji','sabzi','bhindi','methi','palak'],
  fruit:     ['fruit','berry','strawberry','grape','melon','papaya','guava','pear','peach','plum'],
  grain:     ['bread','rice','roti','wheat','flour','noodle','pasta','oat','cereal','barley','millet','idli','dosa','paratha'],
  legume:    ['bean','pea','chickpea','lentil','dal','soy','rajma','chana','moong','urad'],
  protein:   ['chicken','fish','meat','beef','pork','prawn','shrimp','egg','turkey','tofu'],
  dairy:     ['milk','cheese','butter','cream','yogurt','curd','ghee','paneer','dahi'],
  nut:       ['nut','cashew','walnut','almond','pistachio','pecan','seed','sesame','peanut'],
  fried:     ['fried','fry','pakora','samosa','chips','crispy','vada','puri'],
  sweet:     ['sweet','dessert','chocolate','cake','cookie','biscuit','halwa','kheer','ladoo','mithai'],
  drink:     ['juice','smoothie','shake','coffee','tea','soda','water','chai'],
};

export function estimateFibrePer100g(foodName) {
  const lower = String(foodName || '').toLowerCase();
  let category = 'default';
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) { category = cat; break; }
  }
  return CATEGORY_ESTIMATES[category].fibre;
}

export function estimateMacros(foodName, quantity = 100) {
  const lower = foodName.toLowerCase();
  let category = 'default';
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) { category = cat; break; }
  }
  const base = CATEGORY_ESTIMATES[category];
  const ratio = quantity / 100;
  return {
    estimated: true,
    category,
    calories: Math.round(base.calories * ratio),
    protein:  Math.round(base.protein  * ratio * 10) / 10,
    carbs:    Math.round(base.carbs    * ratio * 10) / 10,
    fats:     Math.round(base.fats     * ratio * 10) / 10,
    fibre:    Math.round(base.fibre    * ratio * 10) / 10,
  };
}