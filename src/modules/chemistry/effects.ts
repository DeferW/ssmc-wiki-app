import type { ChemistryEffect, ChemistryReagent } from "./types";

export type EffectTier = "normal" | "overdose" | "critical";
export type EffectTone = "beneficial" | "harmful" | "warning" | "utility";

export type EffectDescription = {
  tier: EffectTier;
  text: string;
  tone: EffectTone;
};

const numberFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 });

const damageLabels: Record<string, string> = {
  Airloss: "урона от кислородного голодания",
  Asphyxiation: "урона от кислородного голодания",
  Bloodloss: "урона от кровопотери",
  Blunt: "тупого урона",
  Brute: "механического урона",
  Burn: "термического урона",
  Caustic: "кислотного урона",
  Cellular: "клеточного урона",
  Cold: "холодового урона",
  Genetic: "генетического урона",
  Heat: "ожогового урона",
  Piercing: "колотого урона",
  Poison: "токсического урона",
  Radiation: "радиационного урона",
  Slash: "режущего урона",
  Toxin: "токсического урона",
};

const statusLabels: Record<string, string> = {
  Jitter: "дрожь",
  RMCUnconscious: "потерю сознания",
  StatusEffectSeeingRainbow: "галлюцинации",
  Unconscious: "потерю сознания",
};

const emoteLabels: Record<string, string> = {
  Gasp: "судорожный вдох",
  Laugh: "смех",
  Scream: "крик",
  Yawn: "зевоту",
};

export const plantAttributeLabels: Record<string, string> = {
  PlantAdjustGrowth: "возраст растения",
  PlantAdjustHealth: "здоровье растения",
  PlantAdjustMutationLevel: "уровень мутации",
  PlantAdjustMutationMod: "модификатор мутации",
  PlantAdjustNutrition: "уровень питания",
  PlantAdjustPests: "уровень вредителей",
  PlantAdjustPotency: "эффективность растения",
  PlantAdjustToxins: "уровень токсинов",
  PlantAdjustWater: "уровень воды",
  PlantAdjustWeeds: "уровень сорняков",
  PlantAffectGrowth: "возраст растения",
};

function formatNumber(value: unknown) {
  return typeof value === "number" ? numberFormat.format(value) : String(value);
}

function formatAmount(value: unknown) {
  return formatNumber(value) + "u";
}

function tagName(effect?: ChemistryEffect) {
  return String(effect?.yamlTag ?? "").replace(/^!type:/, "");
}

function valueOf(effect?: ChemistryEffect) {
  return effect?.value ?? {};
}

function capitalize(value: string) {
  return value ? value.charAt(0).toLocaleUpperCase("ru-RU") + value.slice(1) : value;
}

function sentence(value: string) {
  const text = capitalize(value.trim());
  return !text || /[.!?]$/.test(text) ? text : text + ".";
}

function withChance(text: string, probability: unknown) {
  if (typeof probability !== "number" || probability >= 1) return sentence(text);
  const lowered = text ? text.charAt(0).toLocaleLowerCase("ru-RU") + text.slice(1) : text;
  return sentence(`С шансом ${formatNumber(probability * 100)}% ${lowered}`);
}

function conditionText(condition: ChemistryEffect) {
  const type = tagName(condition);
  const value = valueOf(condition);
  if (type === "ReagentThreshold") {
    const reagent = typeof value.reagent === "string" ? ` реагента «${value.reagent}»` : " реагента в организме";
    if (value.min !== undefined && value.max !== undefined) return `при количестве${reagent} от ${formatAmount(value.min)} до ${formatAmount(value.max)}`;
    if (value.min !== undefined) return `при количестве${reagent} от ${formatAmount(value.min)}`;
    if (value.max !== undefined) return `при количестве${reagent} до ${formatAmount(value.max)}`;
  }
  if (type === "Temperature") {
    if (value.min !== undefined && value.max !== undefined) return `при температуре от ${formatNumber(value.min)} до ${formatNumber(value.max)} K`;
    if (value.min !== undefined) return `при температуре не ниже ${formatNumber(value.min)} K`;
    if (value.max !== undefined) return `при температуре не выше ${formatNumber(value.max)} K`;
  }
  if (type === "MobStateCondition") return value.mobstate === "Critical" ? "в критическом состоянии" : `в состоянии «${value.mobstate ?? "неизвестно"}»`;
  if (type === "OrganType") return `${value.shouldHave === false ? "кроме" : "для"} организмов типа «${value.type ?? "неизвестно"}»`;
  return type ? `при условии «${type}»` : "";
}

function thresholdMinimum(effect: ChemistryEffect) {
  const conditions = valueOf(effect).conditions;
  if (!Array.isArray(conditions)) return null;
  let minimum: number | null = null;
  for (const condition of conditions as ChemistryEffect[]) {
    const value = valueOf(condition);
    if (tagName(condition) === "ReagentThreshold" && typeof value.min === "number") {
      minimum = minimum === null ? value.min : Math.max(minimum, value.min);
    }
  }
  return minimum;
}

function effectTier(effect: ChemistryEffect, reagent: ChemistryReagent): EffectTier {
  const minimum = thresholdMinimum(effect);
  if (minimum === null) return "normal";
  if (typeof reagent.properties?.criticalOverdose === "number" && minimum >= reagent.properties.criticalOverdose) return "critical";
  if (typeof reagent.properties?.overdose === "number" && minimum >= reagent.properties.overdose) return "overdose";
  return "normal";
}

function remainingConditions(effect: ChemistryEffect, reagent: ChemistryReagent) {
  const conditions = valueOf(effect).conditions;
  if (!Array.isArray(conditions)) return [];
  const tier = effectTier(effect, reagent);
  return (conditions as ChemistryEffect[]).map((condition) => (
    tagName(condition) === "ReagentThreshold" && tier !== "normal" ? "" : conditionText(condition)
  )).filter(Boolean);
}

function effectTone(text: string): EffectTone {
  const value = text.toLocaleLowerCase("ru-RU");
  const candidates = [
    { index: value.search(/полностью лечит|лечит|восстанавливает|возвращает|омолаживает|сокращает|удаляет|создаёт иммунитет/), tone: "beneficial" as const },
    { index: value.search(/наносит|вызывает|заражает|поджигает|уничтожает/), tone: "harmful" as const },
    { index: value.search(/расходует|замедляет|ожог|горюч|токсин/), tone: "warning" as const },
  ].filter(({ index }) => index >= 0).sort((left, right) => left.index - right.index);
  return candidates[0]?.tone ?? "utility";
}

function description(tier: EffectTier, text: string): EffectDescription {
  const completed = sentence(text);
  return { tier, text: completed, tone: effectTone(completed) };
}

function addDoseEffects(result: EffectDescription[], reagent: ChemistryReagent, overdose: string, critical: string) {
  if (reagent.properties?.overdose !== undefined && overdose) result.push(description("overdose", overdose));
  if (reagent.properties?.criticalOverdose !== undefined && critical) result.push(description("critical", critical));
}

function damageChanges(damage: unknown, equalGroups: boolean) {
  const entries: Array<{ id: string; amount: number }> = [];
  if (equalGroups && Array.isArray(damage)) {
    for (const group of damage) {
      if (!group || typeof group !== "object") continue;
      const [id] = Object.keys(group);
      const amount = id ? (group as Record<string, unknown>)[id] : undefined;
      if (id && typeof amount === "number") entries.push({ id, amount });
    }
  } else if (damage && typeof damage === "object") {
    const typed = damage as Record<string, unknown>;
    for (const key of ["groups", "types"]) {
      const values = typed[key];
      if (!values || typeof values !== "object") continue;
      for (const [id, amount] of Object.entries(values)) {
        if (typeof amount === "number") entries.push({ id, amount });
      }
    }
  }
  return entries.map(({ id, amount }) => `${amount < 0 ? "Лечит" : "Наносит"} ${formatNumber(Math.abs(amount))} ед. ${damageLabels[id] ?? `урона типа «${id}»`} за цикл метаболизма`);
}

function rmcDescriptions(type: string, value: Record<string, unknown>, reagent: ChemistryReagent) {
  const result: EffectDescription[] = [];
  const potency = Number(value.potency ?? 0);
  const actual = potency * 0.5;
  const perSecond = potency * 0.25;
  let healing: number;
  if (type === "Neogenetic") {
    healing = perSecond * (actual > 2 ? 1.5 : 1);
    result.push(description("normal", `Лечит ${formatNumber(healing)} ед. механического урона в секунду`));
    addDoseEffects(result, reagent, `Наносит ${formatNumber(perSecond)} ед. ожогового урона в секунду`, `Дополнительно наносит ${formatNumber(perSecond * 5)} ед. ожогового и ${formatNumber(perSecond * 2)} ед. токсического урона в секунду`);
  } else if (type === "Anticorrosive") {
    healing = perSecond * (actual > 2 ? 1.5 : 1);
    result.push(description("normal", `Лечит ${formatNumber(healing)} ед. термического урона в секунду`));
    addDoseEffects(result, reagent, `Наносит по ${formatNumber(perSecond)} ед. тупого и токсического урона в секунду`, `Дополнительно наносит по ${formatNumber(perSecond * 5)} ед. тупого и токсического урона в секунду`);
  } else if (type === "Biocidic") {
    result.push(description("normal", `Наносит ${formatNumber(perSecond)} ед. механического урона в секунду`));
    addDoseEffects(result, reagent, `Наносит ${formatNumber(perSecond * 2)} ед. механического урона в секунду`, `Дополнительно наносит ${formatNumber(perSecond * 5)} ед. механического урона в секунду`);
  } else if (type === "Antitoxic") {
    result.push(description("normal", `Лечит по ${formatNumber(perSecond * 2)} ед. токсического и генетического урона в секунду; удаляет 0,125u токсичных веществ из крови в секунду`));
    addDoseEffects(result, reagent, "", "Дополнительно даёт 5% шанс потерять сознание на 10 секунд");
  } else if (type === "Oxygenating") {
    result.push(description("normal", actual >= 3 ? `Полностью лечит урон от кислородного голодания и удаляет ${formatAmount(perSecond)} Лексорина из крови в секунду` : `Лечит ${formatNumber(perSecond)} ед. урона от кислородного голодания и удаляет ${formatAmount(perSecond)} Лексорина из крови в секунду`));
    addDoseEffects(result, reagent, `Наносит ${formatNumber(perSecond * 0.5)} ед. токсического урона в секунду`, `Дополнительно наносит ${formatNumber(perSecond)} ед. тупого и ${formatNumber(perSecond * 2)} ед. токсического урона в секунду`);
  } else if (type === "Electrogenetic") {
    result.push(description("normal", `При дефибрилляции лечит по ${formatNumber(potency * 10)} ед. механического, термического и токсического урона; расходует 1u препарата`));
  } else if (type === "Antihallucinogenic") {
    result.push(description("normal", `Удаляет по 2,5u токсина «Разрушитель разума» и космических наркотиков из крови; сокращает галлюцинации на ${formatNumber(perSecond * 10)} сек. каждую секунду`));
    addDoseEffects(result, reagent, `Наносит ${formatNumber(perSecond)} ед. токсического урона в секунду`, `Дополнительно наносит по ${formatNumber(perSecond)} ед. тупого и ожогового урона, а также ${formatNumber(perSecond * 3)} ед. токсического урона в секунду`);
  } else if (type === "Focusing") {
    result.push(description("normal", `Удаляет ${formatAmount(perSecond)} алкоголя из крови и сокращает опьянение, заикание и дрожь на ${formatNumber(perSecond * 2)} сек. каждую секунду${actual >= 3 ? "; также снимает немоту и слепоту" : ""}`));
    addDoseEffects(result, reagent, `Наносит ${formatNumber(perSecond)} ед. токсического урона в секунду`, `Дополнительно наносит ${formatNumber(perSecond * 3)} ед. токсического урона в секунду`);
  } else if (type === "Thermostabilizing") {
    result.push(description("normal", `Возвращает температуру тела к норме, изменяя её примерно на ${formatNumber(perSecond * 60)} K в секунду`));
    addDoseEffects(result, reagent, "Вызывает потерю сознания на 40 секунд", "Дополнительно даёт 5% шанс потерять сознание на 10 секунд");
  } else if (type === "Hemogenic") {
    result.push(description("normal", `Если персонаж не голоден, восстанавливает ${formatNumber(perSecond)} сл крови и расходует ${formatNumber(perSecond)} ед. питания в секунду`));
    if (actual > 3) result.push(description("normal", `При избытке крови наносит ${formatNumber(perSecond)} ед. тупого и ${formatNumber(perSecond * 2)} ед. урона от кислородного голодания в секунду, а также замедляет`));
    addDoseEffects(result, reagent, `Наносит ${formatNumber(perSecond)} ед. токсического урона в секунду`, `Дополнительно расходует ${formatNumber(perSecond * 5)} ед. питания в секунду`);
  } else if (type === "Ketogenic") {
    result.push(description("normal", `Расходует ${formatNumber(perSecond * 5)} ед. питания в секунду и ускоряет выведение алкоголя`));
    addDoseEffects(result, reagent, `Дополнительно расходует ${formatNumber(perSecond * 5)} ед. питания, наносит ${formatNumber(perSecond)} ед. токсического урона в секунду и даёт ${formatNumber(actual * 2.5)}% шанс рвоты`, "Вызывает потерю сознания на 40 секунд");
  } else if (type === "Nutritious") {
    const nutrition = ((Number(value.nutFactor ?? 0) * Number(value.nutMetabolism ?? 0)) + potency) * actual;
    result.push(description("normal", `Восстанавливает ${formatNumber(nutrition)} ед. питания за цикл метаболизма`));
  } else if (["Toxic", "Corrosive", "Carcinogenic"].includes(type)) {
    const damage = type === "Toxic" ? "токсического" : type === "Corrosive" ? "кислотного" : "клеточного";
    const normalFactor = type === "Carcinogenic" ? 0.5 : 1;
    result.push(description("normal", `Наносит ${formatNumber(perSecond * normalFactor)} ед. ${damage} урона в секунду`));
    addDoseEffects(result, reagent, `Наносит ${formatNumber(perSecond * 2)} ед. ${damage} урона в секунду`, `Дополнительно наносит ${formatNumber(perSecond * (type === "Toxic" ? 5 : 2))} ед. ${type === "Carcinogenic" ? "тупого" : damage} урона в секунду`);
  } else if (type === "Hypoxemic") {
    result.push(description("normal", `Наносит ${formatNumber(perSecond * 2)} ед. урона от кислородного голодания в секунду и даёт 10% шанс судорожного вдоха`));
    addDoseEffects(result, reagent, `Наносит по ${formatNumber(perSecond)} ед. тупого и токсического урона, а также ${formatNumber(perSecond * 5)} ед. урона от кислородного голодания в секунду`, `Дополнительно наносит ${formatNumber(perSecond * 5)} ед. тупого и ${formatNumber(perSecond * 2)} ед. токсического урона в секунду`);
  } else if (type === "Oxidizing") {
    result.push(description("normal", `Наносит ${formatNumber(perSecond)} ед. ожогового урона в секунду; в огненной смеси повышает интенсивность, но уменьшает длительность и радиус`));
    addDoseEffects(result, reagent, `Наносит ${formatNumber(perSecond * 2)} ед. ожогового урона в секунду`, `Дополнительно наносит ${formatNumber(perSecond * 5)} ед. ожогового урона в секунду`);
  } else if (type === "Fueling") {
    result.push(description("normal", `Повышает воспламеняемость тела на ${formatNumber(perSecond)} ед. в секунду; в огненной смеси увеличивает длительность и радиус, но снижает интенсивность`));
    addDoseEffects(result, reagent, `Повышает воспламеняемость тела на ${formatNumber(perSecond * 2)} ед. в секунду`, "Поджигает тело с высокой интенсивностью");
  } else if (type === "Flowing") {
    result.push(description("normal", "Делает огненную смесь более текучей: увеличивает радиус, но снижает интенсивность и длительность горения"));
  } else if (type === "Viscous") {
    result.push(description("normal", `Замедляет движение на ${formatNumber(perSecond)} сек. за каждый цикл и уменьшает радиус огненной смеси`));
    addDoseEffects(result, reagent, `Сильно замедляет движение на ${formatNumber(perSecond * 2)} сек. за каждый цикл`, `Практически останавливает движение на ${formatNumber(perSecond * 3)} сек. за каждый цикл`);
  } else return null;
  return result;
}

export function describeEffect(effect: ChemistryEffect, reagent: ChemistryReagent): EffectDescription[] {
  const type = tagName(effect);
  const value = valueOf(effect);
  if (value.probability === 0) return [];
  const rmc = rmcDescriptions(type, value, reagent);
  if (rmc) return rmc;
  const tier = effectTier(effect, reagent);
  const conditions = remainingConditions(effect, reagent);
  let text: string;
  if (type === "HealthChange" || type === "EqualHealthChange") text = damageChanges(value.damage, type === "EqualHealthChange").join("; ");
  else if (type === "AdjustReagent" && value.reagent) text = `${Number(value.amount ?? 0) >= 0 ? "Добавляет" : "Удаляет"} ${formatAmount(Math.abs(Number(value.amount ?? 0)))} реагента «${value.reagent}» за цикл метаболизма`;
  else if (type === "MovespeedModifier") text = `Изменяет скорость ходьбы на ${Math.round((Number(value.walkSpeedModifier ?? 1) - 1) * 100)}% и бега на ${Math.round((Number(value.sprintSpeedModifier ?? 1) - 1) * 100)}%`;
  else if (type === "GenericStatusEffect" || type === "ModifyStatusEffect") {
    const id = String(value.key ?? value.effectProto ?? "неизвестный статус");
    const status = statusLabels[id] ?? id;
    text = `${value.type === "Remove" ? "Сокращает" : "Вызывает"} ${status} на ${formatNumber(value.time ?? 2)} сек.`;
  } else if (type === "Jitter") text = `Вызывает дрожь на ${formatNumber(value.time ?? 2)} сек.`;
  else if (type === "Emote") text = `Вызывает ${emoteLabels[String(value.emote)] ?? `эмоцию «${value.emote ?? "неизвестно"}»`}`;
  else if (type === "ChemVomit") text = "Вызывает рвоту";
  else if (type === "Drunk") text = `Добавляет ${formatNumber(value.boozePower ?? 3)} сек. опьянения за цикл метаболизма`;
  else if (type === "SatiateHunger") text = `Восстанавливает ${formatNumber(value.factor ?? 3)} ед. насыщения за цикл метаболизма`;
  else if (type === "SatiateThirst") text = `Восстанавливает ${formatNumber(value.factor ?? 3)} ед. жажды за цикл метаболизма`;
  else if (type === "ChemHealEyeDamage") text = "Лечит повреждения глаз";
  else if (type === "CauseZombieInfection") text = "Заражает зомби-инфекцией";
  else if (type === "CureZombieInfection") text = value.innoculate ? "Лечит зомби-инфекцию и создаёт иммунитет" : "Лечит зомби-инфекцию";
  else if (type === "FlammableReaction") text = `Покрывает цель горючим; интенсивность — ${formatNumber(Number(value.multiplier ?? 1) * 100)}% от стандартной`;
  else if (type === "PopupMessage") text = Array.isArray(value.messages) && value.messages.includes("rmc-body-stings") ? "Вызывает болезненное жжение" : "Вызывает заметное субъективное ощущение";
  else {
    const readableFields: Record<string, string> = { potency: "эффективность", amount: "количество", probability: "шанс", factor: "коэффициент", reagent: "реагент" };
    const details = Object.entries(value).filter(([key, field]) => readableFields[key] && ["string", "number"].includes(typeof field)).map(([key, field]) => `${readableFields[key]}: ${formatNumber(field)}`);
    text = `Дополнительный игровой эффект «${type || "неизвестно"}»${details.length ? ` (${details.join(", ")})` : ""}`;
  }
  if (!text) text = `Дополнительный игровой эффект «${type || "неизвестно"}»`;
  if (conditions.length) text += ` (${conditions.join(", ")})`;
  const completed = withChance(text, value.probability);
  return [{ tier, text: completed, tone: effectTone(completed) }];
}

export function describePlantEffect(effect: ChemistryEffect): EffectDescription | null {
  const type = tagName(effect);
  const value = valueOf(effect);
  if (value.probability === 0) return null;
  const amount = Number(value.amount ?? 1);
  const attribute = plantAttributeLabels[type];
  let text: string;
  if (type === "PlantAdjustHealth") text = amount >= 0 ? `Восстанавливает здоровье растения на ${formatNumber(amount)}` : `Снижает здоровье растения на ${formatNumber(Math.abs(amount))}`;
  else if (attribute) text = `${amount >= 0 ? "Повышает" : "Снижает"} ${attribute} на ${formatNumber(Math.abs(amount))}`;
  else if (type === "PlantCryoxadone") text = "Омолаживает растение с учётом его возраста и времени роста";
  else if (type === "PlantPhalanximine") text = "Возвращает жизнеспособность растению, погибшему из-за мутации";
  else if (type === "PlantDiethylamine") text = "Повышает продолжительность жизни или базовое здоровье растения; шанс 10% на единицу реагента";
  else if (type === "PlantRestoreSeeds") text = "Восстанавливает семена растения";
  else if (type === "PlantDestroySeeds") text = "Уничтожает семена растения";
  else text = `Дополнительный растительный эффект «${type || "неизвестно"}»`;
  const completed = withChance(text, value.probability);
  return { tier: "normal", text: completed, tone: effectTone(completed) };
}
