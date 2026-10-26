export const ALLERGEN_INFER_RULES = [
  { code: 1, pattern: /계란|달걀|오므라이스|에그|메추리알/ },
  { code: 2, pattern: /우유|요거트|치즈|버터|크림|라떼/ },
  { code: 5, pattern: /된장|두부|콩나물|콩고기/ },
  { code: 6, pattern: /국수|우동|칼국수|만두|빵|쿠키|카츠|까스|튀김|크로칸|파스타|수제비|떡볶이/ },
  { code: 8, pattern: /게살|꽃게|게장/ },
  { code: 9, pattern: /새우/ },
  { code: 10, pattern: /돼지|돈육|돈까스|돈가스|제육|삼겹|목살|베이컨|소시지|소세지|탕수육|돈갈비|동파육|햄(?!버거)/ },
  { code: 12, pattern: /토마토|케첩/ },
  { code: 15, pattern: /닭|치킨|깐풍기/ },
  { code: 16, pattern: /소고기|한우|소갈비|육우/ },
  { code: 17, pattern: /오징어|주꾸미/ },
  { code: 18, pattern: /골뱅이|바지락|조개|홍합|전복/ },
];

export function extractAllergenCodes(rawDish) {
  return [...String(rawDish || "").matchAll(/\(([\d.]+)\)/g)]
    .flatMap((match) => match[1].split("."))
    .map((value) => Number(value))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= 19);
}

export function inferAllergenCodes(name) {
  const text = String(name || "");
  const codes = [];
  for (const rule of ALLERGEN_INFER_RULES) {
    if (rule.pattern.test(text)) codes.push(rule.code);
  }
  return [...new Set(codes)].sort((left, right) => left - right);
}

export function annotateDishName(rawDish) {
  const text = String(rawDish || "").trim();
  if (!text) return text;
  if (extractAllergenCodes(text).length > 0) return text;
  const inferred = inferAllergenCodes(text);
  if (inferred.length === 0) return text;
  return `${text} (${inferred.join(".")})`;
}
