/**
 * Bilingual concept layer.
 *
 * Dataset profiles are Chinese prose ("全身的毛大部分为褐色"), while a vision model
 * answers in English ("brown fur"). Matching those directly is hopeless, so both
 * sides are projected onto a shared set of concepts:
 *
 *   model text (EN/CN) --conceptsIn()--> concept ids
 *   dataset prose (CN)  --conceptsInChinese()--> concept ids
 *
 * An overlap of concept ids is a far stronger signal than raw substring hits.
 */

export interface Concept {
  /** Short Chinese label used in the "reasons" chips. */
  label: string
  /** Chinese surface forms searched for in dataset text. */
  forms: string[]
  /** Type implied by this concept, for when the model omits explicit types. */
  type?: string
}

/**
 * Compounds containing a misleading character. 猫头鹰 (owl) must not count as a
 * cat, and 蝙蝠 (bat) is not a rodent.
 */
const FALSE_FRIENDS: Array<[RegExp, string]> = [
  [/猫头鹰/g, '鸟'],
  [/蝙蝠/g, '飞行兽'],
  [/海马/g, '小鱼'],
  [/海星/g, '棘皮'],
  [/松鼠/g, '树木鼠'],
]

export function scrub(text: string): string {
  let out = text
  for (const [pattern, replacement] of FALSE_FRIENDS) out = out.replace(pattern, replacement)
  return out
}

export const CONCEPTS: Record<string, Concept> = {
  // ---- animal families --------------------------------------------------
  cat: { label: '猫科', forms: ['猫科', '家猫', '小猫', '猫形'] },
  dog: { label: '犬科', forms: ['犬科', '小狗', '犬形', '狗'] },
  fox: { label: '狐狸', forms: ['狐狸', '狐'] },
  rodent: { label: '鼠类', forms: ['老鼠', '鼠科', '小型鼠', '啮齿', '大型老鼠'] },
  rabbit: { label: '兔类', forms: ['兔子', '兔耳', '兔'] },
  bird: { label: '鸟类', forms: ['鸟类', '小鸟', '雏鸟', '雀'] },
  owl: { label: '猫头鹰', forms: ['猫头鹰'] },
  fish: { label: '鱼类', forms: ['鱼类', '鱼'] },
  snake: { label: '蛇类', forms: ['蛇'] },
  lizard: { label: '蜥蜴', forms: ['蜥蜴', '蜥'] },
  turtle: { label: '龟类', forms: ['乌龟', '龟甲', '龟'] },
  frog: { label: '蛙类', forms: ['青蛙', '蛙'] },
  insect: { label: '昆虫', forms: ['昆虫', '幼虫', '虫'] },
  bee: { label: '蜂类', forms: ['蜜蜂', '蜂'] },
  butterfly: { label: '蝶类', forms: ['蝴蝶', '蝶'] },
  spider: { label: '蜘蛛', forms: ['蜘蛛'] },
  crab: { label: '甲壳类', forms: ['螃蟹', '蟹', '虾'] },
  whale: { label: '鲸豚', forms: ['鲸', '海豚'] },
  bear: { label: '熊类', forms: ['熊'] },
  monkey: { label: '灵长类', forms: ['猴子', '猩猩', '猴'] },
  horse: { label: '马类', forms: ['马'] },
  bovine: { label: '牛羊', forms: ['牛', '羊'] },
  deer: { label: '鹿类', forms: ['鹿'] },
  elephant: { label: '象类', forms: ['大象'] },
  pig: { label: '猪类', forms: ['猪'] },
  dragon: { label: '龙类', forms: ['龙'] },
  plant: { label: '植物', forms: ['植物', '草木'] },
  mushroom: { label: '菌类', forms: ['蘑菇', '菌'] },
  flower: { label: '花朵', forms: ['花瓣', '花苞', '花'] },
  humanoid: { label: '人形', forms: ['人形', '拟人'] },
  ghost: { label: '幽灵', forms: ['幽灵', '亡灵'] },
  machine: { label: '机械', forms: ['机械', '机器人', '齿轮'] },

  // ---- anatomy ---------------------------------------------------------
  ears: { label: '耳朵', forms: ['耳朵', '耳'] },
  big_ears: { label: '大耳', forms: ['大耳', '长耳', '尖耳', '耳朵很长'] },
  tail: { label: '尾巴', forms: ['尾巴', '尾部', '尾'] },
  long_tail: { label: '长尾', forms: ['尾长', '长尾', '尾巴很长'] },
  wing: { label: '翅膀', forms: ['翅膀', '羽翼'] },
  horn: { label: '角', forms: ['犄角', '角'] },
  claw: { label: '爪子', forms: ['利爪', '爪', '脚趾'] },
  fang: { label: '尖牙', forms: ['尖牙', '獠牙', '牙齿'] },
  whiskers: { label: '胡须', forms: ['胡须', '触须'] },
  fur: { label: '毛发', forms: ['毛发', '毛皮', '皮毛', '绒毛', '毛'] },
  fluffy: { label: '蓬松', forms: ['蓬松', '毛茸茸', '松软'] },
  mane: { label: '鬃毛', forms: ['鬃毛', '颈毛', '披肩'] },
  scales: { label: '鳞片', forms: ['鳞片', '鳞'] },
  shell: { label: '甲壳', forms: ['甲壳', '龟壳', '壳'] },
  beak: { label: '喙', forms: ['喙', '尖嘴'] },
  big_eyes: { label: '大眼', forms: ['大眼睛', '大眼', '眼睛很大'] },
  blue_eyes: { label: '蓝眼', forms: ['蓝色的眼睛', '蓝眼'] },
  stripes: { label: '条纹', forms: ['条纹', '斑纹'] },
  spots: { label: '斑点', forms: ['斑点', '圆点'] },
  spikes: { label: '尖刺', forms: ['尖刺', '刺'] },
  fin: { label: '鳍', forms: ['鳍'] },
  tentacle: { label: '触手', forms: ['触手', '触角'] },
  cheeks: { label: '脸颊', forms: ['脸颊', '电袋', '电力袋'] },

  // ---- shape / posture -------------------------------------------------
  quadruped: { label: '四足', forms: ['四足', '四条腿', '四只脚'] },
  bipedal: { label: '双足', forms: ['双足', '两条腿', '直立'] },
  round: { label: '圆润', forms: ['圆润', '圆球', '球形', '圆滚滚', '呈圆形'] },
  slender: { label: '纤细', forms: ['细长', '纤细', '修长'] },
  small_body: { label: '体型小巧', forms: ['体型小', '身体小', '娇小'] },
  floating: { label: '漂浮', forms: ['漂浮', '悬浮'] },

  // ---- colours ---------------------------------------------------------
  yellow: { label: '黄色', forms: ['黄色', '鲜黄', '浅黄'] },
  red: { label: '红色', forms: ['红色', '红色'] },
  blue: { label: '蓝色', forms: ['蓝色'] },
  green: { label: '绿色', forms: ['绿色', '翠绿'] },
  black: { label: '黑色', forms: ['黑色', '漆黑'] },
  white: { label: '白色', forms: ['白色', '雪白'] },
  grey: { label: '灰色', forms: ['灰色', '银灰'] },
  brown: { label: '褐色', forms: ['褐色', '棕色', '茶色'] },
  pink: { label: '粉色', forms: ['粉红色', '粉色', '桃红'] },
  purple: { label: '紫色', forms: ['紫色', '淡紫'] },
  orange: { label: '橙色', forms: ['橙色', '橘色', '橙黄'] },
  cream: { label: '奶油色', forms: ['奶油色', '乳白', '米色'] },
  gold: { label: '金色', forms: ['金色', '金黄'] },

  // ---- elements --------------------------------------------------------
  fire: { label: '火焰', forms: ['火焰', '火苗', '燃烧', '熔岩'], type: '火' },
  water: { label: '水流', forms: ['水流', '泡沫', '游泳', '水中'], type: '水' },
  ice: { label: '冰', forms: ['冰晶', '冻结', '冰雪'], type: '冰' },
  electricity: { label: '电', forms: ['电流', '电力', '静电', '闪电', '发电'], type: '电' },
  leaf: { label: '叶片', forms: ['叶子', '叶片', '藤蔓', '种子'], type: '草' },
  psychic: { label: '超能力', forms: ['超能力', '念力', '精神', '催眠'], type: '超能力' },
  poison: { label: '毒', forms: ['毒液', '黏液', '有毒'], type: '毒' },
  metal: { label: '金属', forms: ['金属', '钢铁'], type: '钢' },
  sand: { label: '沙土', forms: ['沙地', '泥土', '沙'], type: '地面' },
  stone: { label: '岩石', forms: ['岩石', '石头', '矿物'], type: '岩石' },
  sound: { label: '声音', forms: ['声音', '叫声', '歌声'] },
  light: { label: '光', forms: ['光芒', '闪耀'] },
  shadow: { label: '阴影', forms: ['影子', '阴影', '黑暗'], type: '恶' },
}

/** English (and loose Chinese) words from the model -> concept id. */
export const EN_ALIASES: Record<string, string> = {
  // animals
  cat: 'cat', cats: 'cat', feline: 'cat', kitten: 'cat', kitty: 'cat', tabby_cat: 'cat',
  dog: 'dog', canine: 'dog', puppy: 'dog', hound: 'dog', wolf: 'dog',
  fox: 'fox', vixen: 'fox',
  rodent: 'rodent', mouse: 'rodent', mice: 'rodent', rat: 'rodent', squirrel: 'rodent',
  hamster: 'rodent', gerbil: 'rodent',
  rabbit: 'rabbit', bunny: 'rabbit', hare: 'rabbit',
  bird: 'bird', avian: 'bird', chick: 'bird', sparrow: 'bird', eagle: 'bird', parrot: 'bird',
  owl: 'owl',
  fish: 'fish', shark: 'fish', salmon: 'fish',
  snake: 'snake', serpent: 'snake',
  lizard: 'lizard', reptile: 'lizard', gecko: 'lizard', iguana: 'lizard', reptilian: 'lizard',
  turtle: 'turtle', tortoise: 'turtle',
  frog: 'frog', toad: 'frog', amphibian: 'frog',
  insect: 'insect', bug: 'insect', beetle: 'insect', caterpillar: 'insect', worm: 'insect', mantis: 'insect',
  bee: 'bee', wasp: 'bee', hornet: 'bee',
  butterfly: 'butterfly', moth: 'butterfly',
  spider: 'spider', arachnid: 'spider',
  crab: 'crab', lobster: 'crab', shrimp: 'crab', crustacean: 'crab',
  whale: 'whale', dolphin: 'whale', seal: 'whale', orca: 'whale',
  bear: 'bear', teddy: 'bear',
  monkey: 'monkey', ape: 'monkey', gorilla: 'monkey', primate: 'monkey',
  horse: 'horse', pony: 'horse', unicorn: 'horse',
  cow: 'bovine', bull: 'bovine', sheep: 'bovine', goat: 'bovine', ram: 'bovine',
  deer: 'deer', stag: 'deer', antelope: 'deer',
  elephant: 'elephant',
  pig: 'pig', boar: 'pig',
  dragon: 'dragon', draconic: 'dragon', wyvern: 'dragon',
  plant: 'plant', vegetable: 'plant', vine: 'plant', tree: 'plant', moss: 'plant',
  mushroom: 'mushroom', fungus: 'mushroom', toadstool: 'mushroom',
  flower: 'flower', floral: 'flower', petal: 'flower', bloom: 'flower', blossom: 'flower',
  humanoid: 'humanoid', human: 'humanoid', anthropomorphic: 'humanoid',
  ghost: 'ghost', spirit: 'ghost', phantom: 'ghost', specter: 'ghost', undead: 'ghost',
  machine: 'machine', robot: 'machine', mechanical: 'machine', robotic: 'machine',

  // anatomy
  ear: 'ears', ears: 'ears',
  'big ears': 'big_ears', 'long ears': 'big_ears', 'pointed ears': 'big_ears',
  'large ears': 'big_ears', 'large pointed ears': 'big_ears', 'big pointed ears': 'big_ears',
  tail: 'tail', tailed: 'tail',
  'long tail': 'long_tail', 'long thin tail': 'long_tail', 'thin tail': 'long_tail',
  wing: 'wing', wings: 'wing', winged: 'wing', feather: 'wing', feathers: 'wing', feathered: 'wing',
  horn: 'horn', horns: 'horn', antler: 'horn', antlers: 'horn',
  claw: 'claw', claws: 'claw', paw: 'claw', paws: 'claw',
  fang: 'fang', fangs: 'fang', teeth: 'fang', tooth: 'fang', tusk: 'fang', tusks: 'fang',
  whisker: 'whiskers', whiskers: 'whiskers',
  fur: 'fur', furry: 'fur', hair: 'fur', hairy: 'fur', coat: 'fur', pelt: 'fur',
  fluffy: 'fluffy', fluff: 'fluffy', downy: 'fluffy', plush: 'fluffy',
  mane: 'mane', ruff: 'mane', 'fluffy collar': 'mane', 'fur collar': 'mane',
  scale: 'scales', scales: 'scales', scaly: 'scales',
  shell: 'shell', carapace: 'shell',
  beak: 'beak', bill: 'beak',
  'big eyes': 'big_eyes', 'large eyes': 'big_eyes', 'big blue eyes': 'big_eyes',
  eyes: 'big_eyes',
  'blue eyes': 'blue_eyes',
  stripe: 'stripes', stripes: 'stripes', striped: 'stripes', tabby: 'stripes',
  spot: 'spots', spots: 'spots', spotted: 'spots',
  spike: 'spikes', spikes: 'spikes', spiky: 'spikes', quill: 'spikes', quills: 'spikes',
  fin: 'fin', fins: 'fin',
  tentacle: 'tentacle', tentacles: 'tentacle', antenna: 'tentacle', antennae: 'tentacle',
  cheeks: 'cheeks', 'red cheeks': 'cheeks',

  // shape / posture
  quadruped: 'quadruped', 'four legs': 'quadruped', 'four-legged': 'quadruped', fourlegged: 'quadruped',
  bipedal: 'bipedal', 'two legs': 'bipedal', standing: 'bipedal', upright: 'bipedal', biped: 'bipedal',
  round: 'round', rounded: 'round', sphere: 'round', spherical: 'round', chubby: 'round', plump: 'round',
  slender: 'slender', thin: 'slender', slim: 'slender', elongated: 'slender',
  'small body': 'small_body', tiny: 'small_body', petite: 'small_body',
  floating: 'floating', float: 'floating', hover: 'floating', hovering: 'floating',

  // colours
  yellow: 'yellow', red: 'red', blue: 'blue', green: 'green', black: 'black', white: 'white',
  grey: 'grey', gray: 'grey', silver: 'grey', brown: 'brown', tan: 'brown', beige: 'brown',
  pink: 'pink', magenta: 'pink', purple: 'purple', violet: 'purple', orange: 'orange',
  cream: 'cream', ivory: 'cream', golden: 'gold',

  // elements
  fire: 'fire', flame: 'fire', flames: 'fire', burning: 'fire', lava: 'fire', ember: 'fire',
  water: 'water', wet: 'water', bubble: 'water', bubbles: 'water', splash: 'water',
  ice: 'ice', icy: 'ice', snow: 'ice', frost: 'ice', frozen: 'ice', crystal: 'ice',
  electricity: 'electricity', electric: 'electricity', lightning: 'electricity',
  spark: 'electricity', sparks: 'electricity', thunder: 'electricity', static: 'electricity',
  leaf: 'leaf', leaves: 'leaf', vines: 'leaf', seed: 'leaf', grass: 'leaf',
  psychic: 'psychic', telekinesis: 'psychic', telekinetic: 'psychic', aura: 'psychic',
  poison: 'poison', toxic: 'poison', venom: 'poison', slime: 'poison',
  metal: 'metal', metallic: 'metal', steel: 'metal', iron: 'metal',
  sand: 'sand', dirt: 'sand', soil: 'sand', mud: 'sand', ground: 'sand', desert: 'sand',
  stone: 'stone', rock: 'stone', rocks: 'stone', rocky: 'stone', boulder: 'stone',
  sound: 'sound', song: 'sound', sonic: 'sound', music: 'sound',
  light: 'light', glow: 'light', glowing: 'light', shine: 'light', radiant: 'light',
  shadow: 'shadow', dark: 'shadow', darkness: 'shadow', evil: 'shadow',
}

/** Longest-first so "long tail" wins over "tail". */
const ALIAS_ENTRIES = Object.entries(EN_ALIASES).sort((a, b) => b[0].length - a[0].length)

const ASCII_ONLY = /^[a-z ]+$/
const ESCAPE_RE = /[.*+?^${}()|[\]\\]/g

/** Concept ids mentioned in free-form model text (English or Chinese). */
export function conceptsIn(text: string): Set<string> {
  const found = new Set<string>()
  if (!text) return found
  const lower = scrub(text).toLowerCase()

  for (const [needle, concept] of ALIAS_ENTRIES) {
    if (ASCII_ONLY.test(needle)) {
      const safe = needle.replace(ESCAPE_RE, '\\$&')
      if (new RegExp(`(^|[^a-z])${safe}([^a-z]|$)`).test(lower)) found.add(concept)
    } else if (lower.includes(needle)) {
      found.add(concept)
    }
  }
  return found
}

/** Concept ids whose Chinese forms literally appear in dataset prose. */
export function conceptsInChinese(text: string): Set<string> {
  const found = new Set<string>()
  if (!text) return found
  const target = scrub(text)
  for (const [id, concept] of Object.entries(CONCEPTS)) {
    for (const form of concept.forms) {
      if (form && target.includes(form)) {
        found.add(id)
        break
      }
    }
  }
  return found
}

/** Type names (EN or CN) -> the dataset's Chinese type names. */
export const TYPE_ALIASES: Record<string, string> = {
  normal: '一般', fighting: '格斗', flying: '飞行', poison: '毒', ground: '地面',
  rock: '岩石', bug: '虫', ghost: '幽灵', steel: '钢', fire: '火', water: '水',
  grass: '草', electric: '电', psychic: '超能力', ice: '冰', dragon: '龙',
  dark: '恶', fairy: '妖精',
  一般: '一般', 普通: '一般', 格斗: '格斗', 飞行: '飞行', 毒: '毒', 地面: '地面',
  岩石: '岩石', 虫: '虫', 幽灵: '幽灵', 钢: '钢', 火: '火', 水: '水', 草: '草',
  电: '电', 超能力: '超能力', 超能: '超能力', 冰: '冰', 龙: '龙', 恶: '恶',
  邪恶: '恶', 妖精: '妖精', 仙: '妖精',
}

export function normalizeType(raw: string): string | null {
  const trimmed = raw.trim()
  return TYPE_ALIASES[trimmed.toLowerCase()] ?? TYPE_ALIASES[trimmed] ?? null
}

/** Concept id -> implied Chinese type, used to infer types from appearance. */
export const CONCEPT_TYPE: Record<string, string> = Object.fromEntries(
  Object.entries(CONCEPTS)
    .filter(([, c]) => !!c.type)
    .map(([id, c]) => [id, c.type as string]),
)

export function conceptLabel(id: string): string {
  return CONCEPTS[id]?.label ?? id
}
