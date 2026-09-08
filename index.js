/**
 * Storyboard — генератор промптов для картинок по готовому посту.
 *
 * Что делает: берёт текст уже написанного поста, отправляет его выбранной
 * модели вместе с инструкцией, получает SCENE_PROMPT и оборачивает его в
 * HTML-блок, который можно вставить в пост руками. Картинки НЕ генерирует —
 * этим занимается Frameweaver, когда блок уже вставлен.
 *
 * Расширение ничего не пишет в чаты и в сообщения. Единственная связь с
 * Frameweaver — чтение имён из слотов рефов (только чтение, см. sbGetCanonicalNames).
 *
 * Этап 1: каркас, настройки, выбор профиля подключения, кнопка на сообщениях.
 */

const MODULE_NAME = 'storyboard';

// Ключ настроек Frameweaver. Читаем оттуда эталонные написания имён, чтобы
// они совпадали с тем, по чему картинкоген матчит рефы. Только чтение.
// Если Frameweaver переименует свои ключи — sbGetCanonicalNames вернёт пустой
// список, и модель будет работать по карточке с персоной (мягкое падение).
const FRAMEWEAVER_MODULE_NAME = 'inline_image_gen';
const FRAMEWEAVER_CHAT_REFS_KEY = 'iig_refs';

const getContext = () => SillyTavern.getContext();

// ═══════════════════════════════════════════════════════════════════════
// Пресеты
// ═══════════════════════════════════════════════════════════════════════

/** Обёртка, в которую кладётся готовый промпт. Плейсхолдеры подставляются как есть. */
const DEFAULT_WRAPPER = `<div style="display:table;max-width:100%;width:fit-content;margin:28px auto;padding:12px;background:rgba(15,15,28,0.94);border:1px solid rgba(130,90,220,0.25);border-radius:20px;box-shadow:0 12px 40px rgba(0,0,0,0.75),0 0 30px rgba(120,80,210,0.18);backdrop-filter:blur(14px);">
  <img
   data-iig-instruction='{"prompt":"{{PROMPT}}","aspect_ratio":"{{ASPECT_RATIO}}","image_size":"{{IMAGE_SIZE}}"}'
    src="[IMG:GEN]"
    style="width:100%;height:auto;border-radius:12px;border:1px solid rgba(255,255,255,0.12);display:block;"
  >
</div>`;

const MANHWA_INSTRUCTION = `You are writing a SCENE_PROMPT for an image generator, based on the roleplay
post below. Output ONLY the prompt text. No HTML, no JSON, no quotes around it,
no explanation, no preamble.

OUTPUT STRUCTURE — plain sentences, in this exact order, nothing else:
  Horizontal spread, N panels, single continuous scene.   (N is 3 or 4)
  One sentence of setting: location, lighting, colour scheme.
  Panels: the chosen layout, gutter style, and where the chibi sits.
  Panel 1: shot type, then what happens in it.
  Panel 2: shot type, then what happens in it.
  Panel 3: shot type, then what happens in it.
  Chibi: the chibi description.

NEVER use square brackets anywhere in the output. Never emit a roster of
character descriptions as its own line, and never emit separate labelled lines
such as "Characters:", "Gaze per panel:", "Shots:", "Layout:" or "Speech:".
Everything not listed above belongs inside the panel lines.

1. NAMES (CRITICAL): Refer to every character by their exact name, spelled
   exactly as in the canonical name list provided above. Name each character
   before any pronoun. Never replace a name with a descriptor ("the young man",
   "the disciple", "the taller one"). Never output a template placeholder such
   as a name wrapped in double curly braces — always write out the actual name.

2. NO AMBIGUOUS PRONOUNS: when two or more characters are in the scene, do not
   write "he", "his", "him", "they" or "their" — repeat the name instead.
   Write "Derek eyes focused on the notes", not "green eyes focused on his
   notes". A pronoun is acceptable only inside a clause where exactly one
   character is present and is named in that same clause.

3. FIRST MENTION HAPPENS INSIDE THE PANEL: describe a character in full at the
   moment they first appear in a panel line — never in a separate roster above
   the panels. Use round parentheses, never square brackets:
   Name (sex, build, hair style and colour, eye colour, skin tone, wearing the
   exact outfit, plus animal ears and tail or merfolk traits if any)
   RULE OF ONCE: the full description appears only at the first appearance. In
   every later panel use the name alone, with no parentheses and no repeated
   description — but the name itself is never dropped (see rule 1).

4. CHARACTERS: appearance strictly from the character card and persona provided
   above, plus any clothing or appearance details mentioned in the post itself.
   Describe face, eyes, hair colour and style, exact body build, and the current
   outfit. Never generalize, never invent.

5. Anatomy Constraints:
   - Demi-humans are strictly humans with animal ears and tails, NOT furries or
     anthropomorphic animals. Always specify the ears and tail.
   - Merfolk have a fish tail as the lower body. Always specify the tail, scale
     and fin colours.
   - Male characters must have masculine features, broad shoulders, and flat
     chests (no female breasts, no feminine faces).

6. Safety wording:
   - Never use words implying underage characters (young boy, little, childlike,
     kid, teen, minor).
   - NEVER use words that trigger censorship (naked, nude, penis, balls,
     nipples). Use safe alternatives (bare skin, exposed chest, unbuttoned
     shirt, intimate embrace, heavy breathing).

7. CENSOR RULE: if male nudity below the waist is unavoidable — replace it with
   a glowing white elongated rectangle (soft luminous glow edges). Describe ONLY
   the rectangle and how the other character interacts with it. Base of the
   rectangle outside of frame. No body part names — geometry only.

8. PANELS: total visual frames must not exceed 4. Choose ONE layout: 2 to 3
   simple stacked panels, OR 2 main panels with one small inset overlapping one
   of them counted as part of the 3, OR one full-bleed panel plus one inset.
   Never combine layout types. Panels slightly angled or offset, black gutters,
   chibi in the gap between panels outside any frame.

9. SHOTS: each panel opens with its own shot type — wide, medium, close-up or
   ECU. No two consecutive panels use the same shot type. Include at least one
   close-up. Do not add a panel just to fit in another shot type.

10. COLOUR TINT where it helps the beat: red for anger, pink for embarrassment,
    cold blue for sadness, warm gold for tenderness. State it inside the panel
    line it applies to.

11. CHIBI: exactly 1, up to 2. Skipping the chibi is a critical error. The chibi
    must be one of the named characters and must be named, with an exaggerated
    emotional reaction to the scene.

12. FORBIDDEN WORDS: never write "manga", "manhwa", "comic", "graphic novel",
    "illustration", "drawing", "artwork", "anime" anywhere in the prompt.
    Describe only composition, lighting, poses, and characters.

LENGTH: max 250 words.`;

// Версия встроенных пресетов. Растёт, когда меняется текст инструкции: настройки
// уже сохранены у пользователя, и без этого он остался бы со старой редакцией.
// Редактора пресетов пока нет (этап 4), поэтому перезапись встроенных безопасна.
const SEED_VERSION = 7;

const ILLUSTRATION_INSTRUCTION = `You are writing a SCENE_PROMPT for an image generator, based on the roleplay
post below. Output ONLY the prompt text. No HTML, no JSON, no quotes around it,
no explanation, no preamble.

ONE single image, one frame. No panels, no borders, no gutters, no comic layout,
no inset frames, no chibi, no text, no speech bubbles, no split-screen, no
collage, no diptych.

Write ONE flowing paragraph of plain prose. NEVER use square brackets anywhere in
the output. Never emit the section names below as labels — "CAMERA:", "OUTFIT:",
"ENVIRONMENT:", "LIGHTING:" and the rest are instructions to you, not text to
print. Never emit a roster of character descriptions separated from the action.

1. NAMES (CRITICAL): Refer to every character by their exact name, spelled
   exactly as in the canonical name list provided above. Name each character
   before any pronoun. Never replace a name with a descriptor ("the young man",
   "the taller one"). Never output a template placeholder such as a name wrapped
   in double curly braces — always write out the actual name. First name only.

2. NO AMBIGUOUS PRONOUNS: when two or more characters are in the scene, do not
   write "he", "his", "him", "they" or "their" — repeat the name instead. Write
   "Derek eyes focused on the notes", not "green eyes focused on his notes". A
   pronoun is acceptable only inside a clause where exactly one character is
   present and is named in that same clause.

3. CHARACTER IDENTITY:
   - Every character description MUST begin in this order: Name, sex
     (male/female), then appearance.
   - Sex is MANDATORY for every character and MUST exactly match the character
     card or persona provided above.
   - Never infer sex from hairstyle, face, body shape, clothing, makeup,
     jewelry, pose, or expression. Long hair, delicate facial features, feminine
     fashion, painted nails, or makeup NEVER change a male character into female.
   - A male character may have waist length hair, a delicate face, soft features,
     jewelry, makeup, feminine clothing, painted nails, or a slim body. These
     traits NEVER imply female anatomy. Always depict male anatomy and masculine
     body structure unless the card explicitly states otherwise.
   - Appearance copied literally from the character card and persona above, plus
     any appearance details in the post. Never simplify, reinterpret, substitute
     or generalize.
   - Demi-humans are strictly humans with animal ears/tails, NOT furries or
     anthropomorphic animals. Always specify the ears/tails.
   - Merfolk have a fish tail as the lower body. Always specify the tail, scale
     and fin colors.
   - Never use words implying underage characters (young boy, little, childlike,
     kid, teen, minor).

4. FIRST MENTION FORMAT: When introducing a character for the first time, use
   round parentheses, never square brackets:
   Name (sex, build, hair style and colour, eye colour, skin tone, wearing the
   exact outfit, plus animal ears and tail or merfolk traits if any)
   RULE OF ONCE: apply the parenthesised description ONLY at the character first
   appearance. All later mentions use the Name alone, with no brackets and no
   repeated description — but the name itself is never dropped (see rule 1).

BUILD THE PROMPT as one dense English paragraph, in this order:

CAMERA: shot type + angle + lens + aperture.
ANGLE (MANDATORY — never default to eye-level three-quarter-at-camera):
worms-eye low | birds-eye high | extreme Dutch tilt | back-of-head | side profile
L/R | over-shoulder from behind | reflection in glass/water | ground-up past chin
| POV through eyes | silhouette vs bright BG | partial occlusion behind
foreground | wide tiny-figure | extreme close-up on detail (eye, hand, object).
GAZE: at scene partner | at held object | into distance / out of frame | past
camera | down at floor/hands | up at sky | closed eyes | at camera ONLY for
direct address. Never default to looking-at-camera.
Lens: close-up 85-135mm | medium 50-85mm | wide 24-35mm.
Choose the subject to suit the scene: one character, the other, or both.

CHARACTER: reference images set the base — but always reinforce explicitly.
Always include hair color + style (loose / up / half-up), eye color, skin tone,
face shape, build. If the generator ignores the reference, the text must carry
the full visual. Always allowed: distinguishing marks (tattoo + location, scars,
piercings, birthmarks, moles); hair state if scene-altered ("wet from rain",
"tied back"). All characters look attractive — romance story.

OUTFIT (context-locked, mandatory): carry forward exactly the outfit described in
the post. Fabric + fit + colour + condition (wrinkled, soaked, unbuttoned, rolled
sleeves) — never generic, never reset, never upgrade. Fuse into the name clause.
Apply only the rendering style to it — never swap in style-typical, period,
hero or fantasy wardrobe for what the character actually wears. Modern clothes
stay modern (jeans stay jeans).

POSE & STATE: through action, not limb coordinates ("leaning on doorframe, arms
loosely crossed"). Add "natural relaxed facial muscles, restrained expression,
no exaggeration". Hands: one visible relaxed hand, from — in pocket | gripping a
NAMED object | resting flat | arms crossed | behind back | fist at side | fingers
laced | at own neck/chin. State which leg or surface bears weight; say why any
limb is hidden. "Anatomically correct proportions, five fingers per visible hand."

ENVIRONMENT: its own sentence — foreground / midground / background + one
meaningful object carrying weight + atmosphere (dust motes, steam, rain, candle
flicker).

LIGHTING + 1-2 MOOD EFFECTS: key-light direction + colour temp, then pick from —
TENDER: soft focus | halation | golden warmth | fine grain | faded blacks
TENSE: Dutch angle | chromatic aberration | underexposure | hard rim light |
deep vignette
PASSIONATE: chiaroscuro | bloom on skin | lens flare | warm split-tone | Rembrandt
LONELY: blue hour | desaturated | silhouette | overcast flat | cold cast
CHAOTIC: motion blur | camera shake | bleach bypass | radial blur
DREAMY: double exposure | bokeh flood | soft gaussian | tilt-shift
MUNDANE: natural flat | high-key | minimal
NOIR: low-key | hard side-light | deep blacks | one surviving hue
Max 2 effects, matched to the emotional beat of the post.

MULTI-CHARACTER (2+): one name-first clause each — NAME + outfit + pose +
expression. Relational positioning ("beside Name", "chin on Name shoulder"),
repeat names not pronouns, environment its own sentence. Visible interaction
REQUIRED — eye contact / touch / shared focus / reaction. Disconnected
side-by-side = failed prompt.

SENSUAL (intimate scenes): flood the frame with 3+ non-skin elements (steam,
tangled silk sheets, water droplets, petals, blind shadows, candles, shot through
curtain or doorframe) and 2+ concealments (chiaroscuro shadow, draped fabric,
cropped at ribcage, shot from behind, lower body in bokeh and haze, strategic
pillow). Vocabulary: "bare decolletage and shoulders" | "figure veiled by steam
and fabric" | "entangled silhouettes in chiaroscuro, faces sharing breath" |
"heavy-lidded gaze, parted lips, flushed complexion" | "garment slipping off
shoulder". Escalation matches the narrative.

ALLOWED: bare skin, exposed chest, unbuttoned shirt, intimate embrace, tangled
limbs, pressing bodies, sweat-glistening skin, straddling, deep kiss, hands
gripping thighs, visible cleavage, bare midriff, thigh gap, lower back exposed,
curve of hips and waist, round buttocks (clothed or partial), inner thigh,
collarbone, soft belly, chest contour under fabric, bare legs, arched back, body
silhouette against light.

FORBIDDEN WORDS: never write "manga", "manhwa", "comic", "graphic novel",
"illustration", "drawing", "artwork", "anime" anywhere in the prompt. Describe
only composition, lighting, poses, and characters.

LENGTH: 130-180 words.`;

const defaultSettings = {
    seedVersion: SEED_VERSION,
    enabled: true,
    // '' = текущее подключение таверны. Иначе id профиля из Connection Manager.
    profileId: '',
    activePresetId: 'manhwa',
    // Размышления модели тратятся из того же бюджета, что и видимый ответ,
    // поэтому лимит щедрый: на скупом ответ обрывается на полуслове.
    maxTokens: 4000,
    // 'min' — просим думать по минимуму. Для Gemini 3.x Pro таверна всё равно
    // поднимет это до 'low': полностью отключить размышления Google не даёт.
    // 'auto' — отдать решение модели (она обычно думает много).
    reasoningEffort: 'min',
    // Убирать апострофы из промпта: Eli's legs -> Eli legs.
    stripApostrophes: true,
    // Встроенные пресеты, которые пользователь удалил: не возвращаем их обратно
    // при следующем обновлении расширения.
    removedBuiltIns: [],
    debug: false,
    presets: [
        {
            id: 'manhwa',
            name: 'Манхва',
            // Встроенный: обновляется вместе с расширением, пока его не правили.
            builtIn: true,
            instruction: MANHWA_INSTRUCTION,
            aspectRatio: '16:9',
            imageSize: '2K',
            wrapper: DEFAULT_WRAPPER,
        },
        {
            id: 'illustration',
            name: 'Иллюстрация',
            builtIn: true,
            instruction: ILLUSTRATION_INSTRUCTION,
            aspectRatio: '16:9',
            imageSize: '2K',
            wrapper: DEFAULT_WRAPPER,
        },
    ],
};

// ═══════════════════════════════════════════════════════════════════════
// Настройки и логи
// ═══════════════════════════════════════════════════════════════════════

/**
 * Свободный id для пресета. Работает со списком напрямую, а не через
 * getSettings: вызывается в том числе изнутри самого getSettings.
 */
function sbUniquePresetId(presets, base = 'preset') {
    const slug = String(base).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '') || 'preset';
    let id = slug;
    let n = 2;
    while (presets.some(p => p.id === id)) id = `${slug}-${n++}`;
    return id;
}

function sbLog(level, ...args) {
    const settings = getSettings();
    if (level === 'INFO' && !settings.debug) return;
    console.log(`[Storyboard][${level}]`, ...args);
}

function getSettings() {
    const context = getContext();
    if (!context.extensionSettings[MODULE_NAME]) {
        context.extensionSettings[MODULE_NAME] = structuredClone(defaultSettings);
    }
    const settings = context.extensionSettings[MODULE_NAME];
    // Дозаполняем недостающие ключи после обновления расширения.
    for (const [key, value] of Object.entries(defaultSettings)) {
        if (settings[key] === undefined) {
            settings[key] = structuredClone(value);
        }
    }
    if (!Array.isArray(settings.presets) || settings.presets.length === 0) {
        settings.presets = structuredClone(defaultSettings.presets);
    }
    if (settings.seedVersion !== SEED_VERSION) {
        const removed = Array.isArray(settings.removedBuiltIns) ? settings.removedBuiltIns : [];

        // Раньше правка встроенного пресета делала его «своим», и обновления
        // инструкции до него больше не доходили. Теперь встроенные только для
        // чтения, но уже правленые копии терять нельзя — отцепляем их в
        // самостоятельные пресеты, а встроенный возвращаем чистым.
        for (const preset of settings.presets) {
            if (!preset.builtIn || !preset.customized) continue;
            preset.id = sbUniquePresetId(settings.presets, `${preset.id}-my`);
            preset.name = `${preset.name} — моя версия`;
            delete preset.builtIn;
            delete preset.customized;
            sbLog('WARN', `Правленый пресет отцеплён как «${preset.name}»`);
        }

        for (const seeded of defaultSettings.presets) {
            if (removed.includes(seeded.id)) continue;
            const index = settings.presets.findIndex(p => p.id === seeded.id);
            if (index === -1) settings.presets.push(structuredClone(seeded));
            else settings.presets[index] = structuredClone(seeded);
        }
        // Старый лимит (900) не оставлял места под размышления модели.
        if (!settings.maxTokens || settings.maxTokens < 4000) {
            settings.maxTokens = defaultSettings.maxTokens;
        }
        settings.seedVersion = SEED_VERSION;
        sbLog('WARN', `Встроенные пресеты обновлены до версии ${SEED_VERSION}`);
    }
    return settings;
}

function saveSettings() {
    getContext().saveSettingsDebounced();
}

function getActivePreset() {
    const settings = getSettings();
    return settings.presets.find(p => p.id === settings.activePresetId) || settings.presets[0];
}

// ═══════════════════════════════════════════════════════════════════════
// Чтение эталонных имён из Frameweaver
// ═══════════════════════════════════════════════════════════════════════

/**
 * Достаёт имена из слотов рефов Frameweaver в том же порядке приоритета, что
 * использует он сам: в режиме per-chat — из chatMetadata текущего чата, иначе
 * из глобальных настроек. Любая неудача = пустой список, а не исключение:
 * Storyboard обязан работать и без Frameweaver.
 *
 * @returns {string[]} уникальные непустые имена
 */
function sbGetCanonicalNames() {
    try {
        const context = getContext();
        const fw = context.extensionSettings?.[FRAMEWEAVER_MODULE_NAME];
        if (!fw) return [];

        let source = fw;
        if (fw.refScope === 'per-chat') {
            const chatId = context.chatId ?? context.getCurrentChatId?.();
            const chatRefs = context.chatMetadata?.[FRAMEWEAVER_CHAT_REFS_KEY];
            const chatLoaded = chatId !== undefined && chatId !== null && chatId !== '';
            if (chatLoaded && chatRefs) source = chatRefs;
        }

        const names = [];
        const push = (ref) => {
            const name = String(ref?.name || '').trim();
            if (name && !names.includes(name)) names.push(name);
        };
        push(source.charRef);
        push(source.userRef);
        for (const npc of (source.npcReferences || [])) push(npc);

        sbLog('INFO', `Имена из Frameweaver: ${names.join(', ') || '(пусто)'}`);
        return names;
    } catch (error) {
        sbLog('WARN', 'Не удалось прочитать имена из Frameweaver:', error?.message);
        return [];
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Подготовка текста поста
// ═══════════════════════════════════════════════════════════════════════

/** Сколько символов поста отдаём модели. Режем с начала, оставляя финал сцены. */
const MAX_POST_CHARS = 6000;

/**
 * Превращает сырой текст поста в чистую прозу: выкидывает блоки с картинками,
 * остатки тегов генерации и всю разметку.
 *
 * Разбираем через DOMParser, а не регулярками: блоки вложенные, кавычки внутри
 * data-iig-instruction экранированы по-разному, и регулярка на этом рано или
 * поздно срежет половину поста. Заодно бесплатно отваливаются HTML-комментарии
 * (вроде блока THREADS) — textContent их не возвращает.
 */
function sbCleanPostText(raw) {
    let text = String(raw || '');
    if (!text.trim()) return '';

    try {
        const doc = new DOMParser().parseFromString(text, 'text/html');
        // Картинка/видео вместе с их обёрткой-дивом — это наш собственный мусор,
        // а не часть сцены.
        for (const el of doc.querySelectorAll('img, video')) {
            const wrapper = el.closest('div');
            (wrapper && wrapper.parentElement ? wrapper : el).remove();
        }
        // <br> и блочные теги должны превращаться в переносы, иначе абзацы слипнутся.
        for (const br of doc.querySelectorAll('br')) br.replaceWith('\n');
        for (const block of doc.querySelectorAll('p, div, li, h1, h2, h3, h4, blockquote')) {
            block.append('\n');
        }
        text = doc.body.textContent || '';
    } catch (error) {
        sbLog('WARN', 'DOMParser не справился, чищу регулярками:', error?.message);
        text = text.replace(/<[^>]+>/g, ' ');
    }

    text = text
        .replace(/\[(?:IMG|VID):[^\]]*\]/gi, ' ')   // [IMG:GEN], [IMG:GEN:{...}], [VID:GEN]
        .replace(/\[IMG:[✓✔][^\]]*\]/gi, ' ')
        .replace(/[ \t\u00a0]+/g, ' ')
        .replace(/ ?\n ?/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    if (text.length > MAX_POST_CHARS) {
        text = text.slice(-MAX_POST_CHARS);
        // Не начинаем с обрубка слова.
        const cut = text.indexOf('\n');
        if (cut > 0 && cut < 300) text = text.slice(cut + 1);
        sbLog('INFO', `Пост обрезан до ${text.length} символов`);
    }
    return text;
}

/** Описание карточки персонажа. В группе собираем всех участников. */
function sbGetCharacterCard() {
    const context = getContext();
    const parts = [];
    const describe = (character) => {
        if (!character) return;
        const chunks = [character.description, character.personality]
            .map(s => String(s || '').trim())
            .filter(Boolean);
        if (chunks.length) parts.push(`${character.name}:\n${chunks.join('\n')}`);
    };

    if (context.groupId) {
        const group = (context.groups || []).find(g => g.id === context.groupId);
        for (const member of (group?.members || [])) {
            describe((context.characters || []).find(c => c.avatar === member));
        }
    } else if (context.characterId !== undefined && context.characterId !== null) {
        describe(context.characters?.[context.characterId]);
    }
    return parts.join('\n\n');
}

/** Описание персоны пользователя. */
function sbGetPersona() {
    const context = getContext();
    return String(context.powerUserSettings?.persona_description || '').trim();
}

/**
 * Собирает пользовательскую часть запроса. Макросы подставляем здесь сами,
 * чтобы оба пути отправки (профиль и текущее подключение) видели одно и то же:
 * generateRaw подставляет их сам, а sendRequest — нет.
 */
function sbBuildContextBlock(message) {
    const context = getContext();
    const substitute = (text) => {
        try { return context.substituteParams(text); } catch (_) { return text; }
    };

    const names = sbGetCanonicalNames();
    const card = substitute(sbGetCharacterCard());
    const persona = substitute(sbGetPersona());
    const post = substitute(sbCleanPostText(message?.mes));

    const sections = [];
    if (names.length) {
        sections.push(`Canonical character names (use these exact spellings): ${names.join(', ')}`);
    }
    if (card) sections.push(`CHARACTER CARD:\n${card}`);
    if (persona) sections.push(`USER PERSONA:\n${persona}`);
    sections.push(`POST:\n${post}`);

    return { text: sections.join('\n\n'), post, names };
}

// ═══════════════════════════════════════════════════════════════════════
// Вызов модели
// ═══════════════════════════════════════════════════════════════════════

/**
 * Срезает вступление модели («Okay, here is the prompt:») и обрамляющие кавычки.
 * Подход одолжен у авто-описания гардероба Frameweaver — там он себя оправдал.
 */
function sbStripPreamble(text) {
    let out = String(text || '').trim();

    // Блок рассуждений, если модель его отдала в открытую.
    out = out.replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, '').trim();
    // Обёртка в тройные кавычки.
    out = out.replace(/^```[a-z]*\s*\n?/i, '').replace(/\n?```$/, '').trim();

    const preamble = /^(Okay|Alright|Sure|Here(?:'s| is)|Certainly|Of course|I'll|Let me|Understood)\b[^\n]*[:\n]/i;
    if (preamble.test(out)) {
        const paragraphs = out.split(/\n{2,}/);
        if (paragraphs.length > 1) out = paragraphs.slice(1).join('\n\n').trim();
        else out = out.replace(preamble, '').trim();
    }

    out = out.replace(/^["'`]+|["'`]+$/g, '').trim();

    // Схлопываем в один абзац. Не косметика: живой перенос строки внутри
    // JSON-строки в data-iig-instruction недопустим, JSON.parse на нём падает.
    // Ловим все виды разделителей, а не только \n: модели присылают и одиночный
    // \r, и юникодные U+2028/U+2029, и вертикальную табуляцию.
    return out
        .replace(/[\r\n\u2028\u2029\u0085\v\f]+/g, ' ')
        .replace(/[ \t\u00a0]{2,}/g, ' ')
        .trim();
}

/**
 * Отправляет запрос выбранным профилем или текущим подключением таверны.
 * @returns {Promise<string>} текст промпта
 */
async function sbRequestPrompt(instruction, contextText) {
    const context = getContext();
    const settings = getSettings();
    const maxTokens = settings.maxTokens || defaultSettings.maxTokens;

    if (settings.profileId) {
        const messages = [
            { role: 'system', content: instruction },
            { role: 'user', content: contextText },
        ];
        // includePreset: false — пресет профиля заточен под ролевую игру и
        // притащил бы в служебный запрос свой системный промпт и джейлбрейк.
        // Обратная сторона: вместе с пресетом отваливается и настройка
        // размышлений, а на 'auto' модель съедает бюджет думаньем и ответ
        // обрывается. Поэтому задаём уровень явно.
        const overridePayload = {};
        if (settings.reasoningEffort && settings.reasoningEffort !== 'auto') {
            overridePayload.reasoning_effort = settings.reasoningEffort;
        }
        const result = await context.ConnectionManagerRequestService.sendRequest(
            settings.profileId,
            messages,
            maxTokens,
            { includePreset: false, extractData: true },
            overridePayload,
        );
        return String(result?.content ?? result ?? '');
    }

    const raw = await context.generateRaw({
        prompt: [{ role: 'user', content: contextText }],
        systemPrompt: instruction,
        responseLength: maxTokens,
    });
    return typeof raw === 'string' ? raw : String(raw?.content || raw?.text || raw || '');
}

// ═══════════════════════════════════════════════════════════════════════
// Сборка готового блока
// ═══════════════════════════════════════════════════════════════════════

/**
 * Готовит текст к вставке внутрь data-iig-instruction='{"prompt":"..."}'.
 *
 * Два слоя экранирования, порядок важен:
 *  1. JSON — кавычки и обратные слэши (JSON.stringify, снимаем внешние кавычки);
 *  2. HTML-атрибут в одинарных кавычках — сначала &, потом '.
 *
 * Апостроф превращается в &#39;, и это не костыль: парсер Frameweaver
 * (normalizeInstructionPayload) разворачивает сущности обратно перед JSON.parse.
 * Поэтому запрет апострофов в инструкции модели больше не нужен.
 *
 * А вот < и > намеренно НЕ трогаем: тот же парсер их обратно не разворачивает
 * (в его списке сущностей только &quot; &apos; &#39; &#34; &amp;), и «<harness>»
 * доехал бы до генератора картинок как «&lt;harness&gt;». Внутри атрибута,
 * закрытого кавычками, угловые скобки легальны, а Frameweaver считает скобки
 * JSON, а не ищет конец тега, — так что оставить их как есть безопасно.
 */
function sbEscapeForInstruction(text) {
    const jsonInner = JSON.stringify(String(text || '')).slice(1, -1);
    return jsonInner
        .replace(/&/g, '&amp;')
        .replace(/'/g, '&#39;');
}

/** Если модель всё-таки прислала готовый блок — достаём из него сам промпт. */
function sbExtractPromptFromHtml(text) {
    const raw = String(text || '');
    if (!raw.includes('data-iig-instruction')) return null;
    const match = raw.match(/data-iig-instruction\s*=\s*(['"])([\s\S]*?)\1/i);
    if (!match) return null;
    const payload = match[2]
        .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
        .replace(/&#39;/g, "'").replace(/&#34;/g, '"')
        .replace(/&amp;/g, '&');
    try {
        const parsed = JSON.parse(payload);
        if (parsed?.prompt) return String(parsed.prompt);
    } catch (_) {
        const promptMatch = payload.match(/"prompt"\s*:\s*"([\s\S]*?)"\s*[,}]/);
        if (promptMatch) return promptMatch[1];
    }
    return null;
}

/**
 * Убирает апострофы из промпта, чтобы в готовом блоке не было &#39;.
 *
 * Делается кодом, а не правилом в инструкции: модели такие запреты нарушают
 * регулярно, а замена здесь не забудет никогда — и экономит место в промпте.
 *
 * Порядок важен. Сначала раскрываем сокращения (иначе don&#39;t превратится
 * в dont), потом снимаем притяжательные: Eli&#39;s legs -> Eli legs.
 */
const CONTRACTIONS = [
    [/\bcan['’]t\b/gi, 'cannot'], [/\bwon['’]t\b/gi, 'will not'],
    [/n['’]t\b/gi, ' not'], [/\b(he|she|it|that|there|who|what)['’]s\b/gi, '$1 is'],
    [/\b(i|you|we|they)['’]re\b/gi, '$1 are'], [/\b(i|you|we|they|he|she|it)['’]ll\b/gi, '$1 will'],
    [/\b(i|you|we|they|he|she|it)['’]ve\b/gi, '$1 have'], [/\b(i|you|we|they|he|she|it)['’]d\b/gi, '$1 would'],
    [/\bi['’]m\b/gi, 'I am'], [/\blet['’]s\b/gi, 'let us'],
];

function sbRemoveApostrophes(text) {
    let out = String(text || '').replace(/[’‘`´]/g, "'");

    for (const [pattern, replacement] of CONTRACTIONS) {
        out = out.replace(pattern, replacement);
    }

    out = out
        .replace(/(\w)'s\b/g, '$1')      // Eli's legs -> Eli legs
        .replace(/(\w)s'(?!\w)/g, '$1s') // the twins' hands -> the twins hands
        .replace(/'/g, '');              // всё, что осталось

    return out.replace(/[ \t]{2,}/g, ' ').trim();
}

/** Подставляет промпт и параметры пресета в шаблон обёртки. */
function sbBuildBlock(promptText, preset) {
    let flat = String(promptText || '')
        .replace(/[\r\n\u2028\u2029\u0085\v\f]+/g, ' ')
        .replace(/[ \t\u00a0]{2,}/g, ' ')
        .trim();

    // Ещё раз на случай, если апострофы вернулись при ручной правке промпта.
    if (getSettings().stripApostrophes !== false) flat = sbRemoveApostrophes(flat);

    const template = preset?.wrapper || DEFAULT_WRAPPER;
    return template
        .replace('{{PROMPT}}', sbEscapeForInstruction(flat))
        .replace('{{ASPECT_RATIO}}', preset?.aspectRatio || '16:9')
        .replace('{{IMAGE_SIZE}}', preset?.imageSize || '2K');
}

// ═══════════════════════════════════════════════════════════════════════
// Попап с результатом
// ═══════════════════════════════════════════════════════════════════════

function sbClosePopup() {
    document.getElementById('sb_popup_overlay')?.remove();
}

function sbOpenPopup(messageId) {
    sbClosePopup();

    const overlay = document.createElement('div');
    overlay.id = 'sb_popup_overlay';
    overlay.className = 'sb-popup-ov';
    overlay.innerHTML = `
        <div class="sb-popup" role="dialog" aria-label="Промпт для картинки">
            <div class="sb-popup-head">
                <div class="sb-popup-title">⊹ Промпт для картинки ⊹</div>
                <button class="sb-popup-x" type="button" aria-label="Закрыть"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="sb-popup-meta"></div>
            <div class="sb-popup-body"></div>
            <div class="sb-popup-btns"></div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector('.sb-popup-x').addEventListener('click', sbClosePopup);
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) sbClosePopup(); });

    const onKey = (e) => {
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        sbClosePopup();
        document.removeEventListener('keydown', onKey, true);
    };
    document.addEventListener('keydown', onKey, true);

    overlay.dataset.messageId = String(messageId);
    return overlay;
}

function sbRenderLoading(overlay, note) {
    overlay.querySelector('.sb-popup-meta').textContent = note || '';
    overlay.querySelector('.sb-popup-body').innerHTML =
        `<div class="sb-loading"><i class="fa-solid fa-spinner fa-spin"></i> Читаю пост...</div>`;
    overlay.querySelector('.sb-popup-btns').innerHTML = '';
}

function sbRenderError(overlay, messageId, error) {
    const message = String(error?.message || error || 'неизвестная ошибка');
    const is401 = /401|unauthor|api key|secret/i.test(message);
    overlay.querySelector('.sb-popup-body').innerHTML = `
        <div class="sb-error">
            <div>Модель не ответила: ${message.replace(/</g, '&lt;')}</div>
            ${is401 ? '<div class="sb-hint" style="margin-top:6px;">Похоже на проблему с ключом профиля. Известный баг таверны: ключ профиля читается по активному провайдеру. Переключись на того же провайдера, нажми Update у профиля — и попробуй снова.</div>' : ''}
        </div>`;
    const buttons = overlay.querySelector('.sb-popup-btns');
    buttons.innerHTML = `<button class="sb-btn primary" data-act="retry">Попробовать снова</button>
                         <button class="sb-btn" data-act="close">Закрыть</button>`;
    buttons.querySelector('[data-act="retry"]').addEventListener('click', () => sbGeneratePrompt(messageId, overlay));
    buttons.querySelector('[data-act="close"]').addEventListener('click', sbClosePopup);
}

function sbRenderResult(overlay, messageId, promptText) {
    // Модель, упёршаяся в лимит токенов, обрывается на полуслове. Явного
    // признака в ответе нет, поэтому судим по хвосту: нормальный промпт
    // заканчивается точкой или закрытой скобкой.
    const looksTruncated = !/[.!?)\]]\s*$/.test(promptText);
    const preset = getActivePreset();

    overlay.querySelector('.sb-popup-body').innerHTML = `
        ${looksTruncated ? '<div class="sb-warn">Похоже, ответ обрезан по лимиту токенов. Увеличь лимит в настройках или поставь «Размышления модели: Минимум».</div>' : ''}
        <label class="sb-field-label">Промпт — можно править, блок пересоберётся сам</label>
        <textarea class="sb-result text_pole" spellcheck="false"></textarea>
        <label class="sb-field-label">Готовый блок — это и копируется</label>
        <pre class="sb-block-preview"></pre>`;

    const textarea = overlay.querySelector('.sb-result');
    const preview = overlay.querySelector('.sb-block-preview');
    textarea.value = promptText;

    const rebuild = () => {
        preview.textContent = sbBuildBlock(textarea.value, preset);
    };
    rebuild();
    textarea.addEventListener('input', rebuild);

    const buttons = overlay.querySelector('.sb-popup-btns');
    buttons.innerHTML = `
        <button class="sb-btn primary" data-act="copy-block">Копировать блок</button>
        <button class="sb-btn" data-act="copy-prompt">Только промпт</button>
        <button class="sb-btn" data-act="again">Переписать заново</button>
        <button class="sb-btn ghost" data-act="close">Закрыть</button>`;

    const copy = async (text, label) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (_) {
            // Резерв для http-подключений, где clipboard API недоступен.
            const scratch = document.createElement('textarea');
            scratch.value = text;
            scratch.style.position = 'fixed';
            scratch.style.opacity = '0';
            document.body.appendChild(scratch);
            scratch.select();
            document.execCommand('copy');
            scratch.remove();
        }
        toastr.success(label, 'Storyboard', { timeOut: 1500 });
    };

    buttons.querySelector('[data-act="copy-block"]').addEventListener('click',
        () => copy(sbBuildBlock(textarea.value, preset), 'Блок скопирован'));
    buttons.querySelector('[data-act="copy-prompt"]').addEventListener('click',
        () => copy(textarea.value, 'Промпт скопирован'));
    buttons.querySelector('[data-act="again"]').addEventListener('click', () => sbGeneratePrompt(messageId, overlay));
    buttons.querySelector('[data-act="close"]').addEventListener('click', sbClosePopup);
}

// ═══════════════════════════════════════════════════════════════════════
// Основной сценарий
// ═══════════════════════════════════════════════════════════════════════

const _sbInFlight = new Set();

async function sbGeneratePrompt(messageId, existingOverlay = null) {
    if (_sbInFlight.has(messageId)) {
        sbLog('WARN', `Запрос для сообщения ${messageId} уже идёт`);
        return;
    }

    const context = getContext();
    const message = context.chat?.[messageId];
    if (!message) {
        toastr.error('Не нашла это сообщение', 'Storyboard');
        return;
    }

    const preset = getActivePreset();
    if (!preset?.instruction) {
        toastr.error('У пресета нет инструкции', 'Storyboard');
        return;
    }

    const overlay = existingOverlay || sbOpenPopup(messageId);
    const built = sbBuildContextBlock(message);

    if (!built.post || built.post.length < 20) {
        overlay.querySelector('.sb-popup-body').innerHTML =
            `<div class="sb-error">В посте нет текста, который можно проиллюстрировать.</div>`;
        overlay.querySelector('.sb-popup-btns').innerHTML =
            `<button class="sb-btn" data-act="close">Закрыть</button>`;
        overlay.querySelector('[data-act="close"]').addEventListener('click', sbClosePopup);
        return;
    }

    const profileName = (() => {
        const settings = getSettings();
        if (!settings.profileId) return 'текущее подключение';
        const profiles = context.extensionSettings?.connectionManager?.profiles || [];
        return profiles.find(p => p.id === settings.profileId)?.name || 'профиль не найден';
    })();

    sbRenderLoading(overlay, `Пресет: ${preset.name} · ${preset.aspectRatio || '16:9'} · ${preset.imageSize || '2K'} · ${profileName} · ${built.post.length} символов поста`);
    sbLog('INFO', `Запрос к модели, сообщение ${messageId}\n${built.text.slice(0, 800)}`);

    _sbInFlight.add(messageId);
    try {
        const raw = await sbRequestPrompt(preset.instruction, built.text);
        // Модель иногда игнорирует «только текст» и присылает блок целиком.
        // Достаём из него промпт и пересобираем по своему шаблону, чтобы
        // обёртка и параметры всегда были из пресета, а не из фантазии модели.
        let cleaned = sbExtractPromptFromHtml(raw) || sbStripPreamble(raw);
        // Чистим здесь же, чтобы в поле было ровно то, что уйдёт в блок.
        if (getSettings().stripApostrophes !== false) cleaned = sbRemoveApostrophes(cleaned);
        if (!cleaned) throw new Error('пустой ответ');
        // Попап могли закрыть, пока модель думала.
        if (!document.body.contains(overlay)) return;
        sbRenderResult(overlay, messageId, cleaned);
        sbLog('INFO', `Готовый промпт (${cleaned.length} символов)`);
    } catch (error) {
        sbLog('WARN', 'Запрос не удался:', error?.message);
        if (document.body.contains(overlay)) sbRenderError(overlay, messageId, error);
    } finally {
        _sbInFlight.delete(messageId);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Кнопка на сообщении
// ═══════════════════════════════════════════════════════════════════════

function addStoryboardButton(messageElement, messageId) {
    if (messageElement.querySelector('.sb-prompt-btn')) return;

    const extraMesButtons = messageElement.querySelector('.extraMesButtons');
    if (!extraMesButtons) return;

    const btn = document.createElement('div');
    btn.className = 'mes_button sb-prompt-btn fa-solid fa-paintbrush interactable';
    btn.title = 'Промпт для картинки';
    btn.tabIndex = 0;
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        sbGeneratePrompt(messageId);
    });

    extraMesButtons.appendChild(btn);
}

/** Навешивает кнопку на все сообщения, которые сейчас в DOM. */
function addButtonsToAllMessages() {
    if (!getSettings().enabled) return;
    const messageElements = document.querySelectorAll('#chat .mes');
    let added = 0;
    for (const messageElement of messageElements) {
        const mesId = messageElement.getAttribute('mesid');
        if (mesId === null) continue;
        if (messageElement.querySelector('.sb-prompt-btn')) continue;
        addStoryboardButton(messageElement, parseInt(mesId, 10));
        added++;
    }
    if (added) sbLog('INFO', `Кнопка добавлена на ${added} сообщений`);
}

/**
 * Таверна подгружает старые сообщения в DOM по мере прокрутки вверх, и никакого
 * события об этом не шлёт. Без наблюдателя кнопка была бы только на том куске
 * чата, что прогрузился изначально — а ходить по старым постам это ровно то,
 * ради чего расширение и делается.
 */
let _sbObserver = null;
function watchChatForNewMessages() {
    const chatContainer = document.getElementById('chat');
    if (!chatContainer) return;
    if (_sbObserver) _sbObserver.disconnect();

    let scheduled = false;
    _sbObserver = new MutationObserver((mutations) => {
        const gotMessages = mutations.some(m =>
            [...m.addedNodes].some(n => n.nodeType === 1 && (n.classList?.contains('mes') || n.querySelector?.('.mes')))
        );
        if (!gotMessages || scheduled) return;
        // Схлопываем пачку вставок в один проход — при прокрутке их прилетает много.
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            addButtonsToAllMessages();
        });
    });
    _sbObserver.observe(chatContainer, { childList: true, subtree: true });
    sbLog('INFO', 'Наблюдатель за чатом запущен');
}

// ═══════════════════════════════════════════════════════════════════════
// Редактор пресетов
// ═══════════════════════════════════════════════════════════════════════

function sbNewPresetId(base = 'preset') {
    return sbUniquePresetId(getSettings().presets, base);
}

function sbEscapeHtml(text) {
    return String(text ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Перерисовывает селект пресетов в панели настроек после правок. */
function sbRefreshPresetSelect() {
    const select = document.getElementById('sb_preset');
    if (!select) return;
    const settings = getSettings();
    select.innerHTML = settings.presets
        .map(p => `<option value="${sbEscapeHtml(p.id)}" ${p.id === settings.activePresetId ? 'selected' : ''}>${sbEscapeHtml(p.name)}</option>`)
        .join('');
}

function sbOpenPresetManager() {
    document.getElementById('sb_presets_overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sb_presets_overlay';
    overlay.className = 'sb-popup-ov';
    overlay.innerHTML = `
        <div class="sb-popup sb-presets" role="dialog" aria-label="Пресеты">
            <div class="sb-popup-head">
                <div class="sb-popup-title">⊹ Пресеты ⊹</div>
                <button class="sb-popup-x" type="button" aria-label="Закрыть"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="sb-presets-cols">
                <div class="sb-presets-side">
                    <div class="sb-presets-list"></div>
                    <div class="sb-presets-side-btns">
                        <button class="sb-btn" data-act="new">Новый</button>
                        <button class="sb-btn" data-act="duplicate">Дублировать</button>
                        <button class="sb-btn" data-act="delete">Удалить</button>
                    </div>
                </div>
                <div class="sb-presets-form"></div>
            </div>
            <div class="sb-popup-btns">
                <button class="sb-btn primary" data-act="save">Сохранить</button>
                <button class="sb-btn" data-act="export">Экспорт</button>
                <button class="sb-btn" data-act="import">Импорт</button>
                <button class="sb-btn ghost" data-act="close">Закрыть</button>
            </div>
            <input type="file" accept="application/json,.json" class="sb-import-input" hidden>
        </div>`;
    document.body.appendChild(overlay);

    // id пресета, открытого в форме. Правки живут в форме до «Сохранить».
    let editingId = getActivePreset()?.id || getSettings().presets[0]?.id;

    const listEl = overlay.querySelector('.sb-presets-list');
    const formEl = overlay.querySelector('.sb-presets-form');

    const close = () => {
        overlay.remove();
        document.removeEventListener('keydown', onKey, true);
    };
    const onKey = (e) => {
        if (e.key === 'Escape') { e.stopPropagation(); close(); }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.querySelector('.sb-popup-x').addEventListener('click', close);
    overlay.querySelector('[data-act="close"]').addEventListener('click', close);
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });

    function renderList() {
        const settings = getSettings();
        listEl.innerHTML = settings.presets.map(p => `
            <div class="sb-preset-item ${p.id === editingId ? 'active' : ''}" data-id="${sbEscapeHtml(p.id)}">
                <span class="sb-preset-name">${sbEscapeHtml(p.name)}</span>
                ${p.builtIn ? '<span class="sb-preset-tag">встроенный</span>' : ''}
            </div>`).join('');
        for (const item of listEl.querySelectorAll('.sb-preset-item')) {
            item.addEventListener('click', () => {
                editingId = item.dataset.id;
                renderList();
                renderForm();
            });
        }
        // Последний пресет удалять нельзя — расширению нечем будет работать.
        overlay.querySelector('[data-act="delete"]').disabled = settings.presets.length <= 1;
    }

    function renderForm() {
        const preset = getSettings().presets.find(p => p.id === editingId);
        if (!preset) { formEl.innerHTML = ''; return; }
        // Встроенные пресеты обновляются вместе с расширением, поэтому правки
        // в них всё равно были бы затёрты. Правится копия, а не оригинал.
        const locked = !!preset.builtIn;
        const ro = locked ? 'readonly disabled' : '';

        formEl.innerHTML = `
            ${locked ? '<div class="sb-warn">Встроенный пресет — только для чтения, чтобы до него доходили обновления. Нажми «Дублировать» и правь копию.</div>' : ''}
            <label class="sb-field-label">Название</label>
            <input type="text" class="text_pole" data-f="name" value="${sbEscapeHtml(preset.name)}" ${ro}>

            <div class="sb-form-row">
                <div>
                    <label class="sb-field-label">aspect_ratio</label>
                    <input type="text" class="text_pole" data-f="aspectRatio" value="${sbEscapeHtml(preset.aspectRatio || '')}" placeholder="16:9" ${ro}>
                </div>
                <div>
                    <label class="sb-field-label">image_size</label>
                    <input type="text" class="text_pole" data-f="imageSize" value="${sbEscapeHtml(preset.imageSize || '')}" placeholder="2K" ${ro}>
                </div>
            </div>

            <label class="sb-field-label">Инструкция для модели</label>
            <textarea class="text_pole sb-ta-big" data-f="instruction" spellcheck="false" ${ro}>${sbEscapeHtml(preset.instruction || '')}</textarea>

            <label class="sb-field-label">Шаблон обёртки — обязателен плейсхолдер {{PROMPT}}</label>
            <textarea class="text_pole sb-ta-small" data-f="wrapper" spellcheck="false" ${ro}>${sbEscapeHtml(preset.wrapper || DEFAULT_WRAPPER)}</textarea>
            <div class="sb-hint">Доступные плейсхолдеры: {{PROMPT}}, {{ASPECT_RATIO}}, {{IMAGE_SIZE}}</div>`;

        const saveBtn = overlay.querySelector('[data-act="save"]');
        if (saveBtn) {
            saveBtn.disabled = locked;
            saveBtn.title = locked ? 'Встроенный пресет не редактируется — сделай копию' : '';
        }
    }

    function collectForm() {
        const out = {};
        for (const field of formEl.querySelectorAll('[data-f]')) {
            out[field.dataset.f] = field.value;
        }
        return out;
    }

    function save() {
        const settings = getSettings();
        const preset = settings.presets.find(p => p.id === editingId);
        if (!preset) return;
        if (preset.builtIn) {
            toastr.info('Встроенный пресет не редактируется — нажми «Дублировать»', 'Storyboard', { timeOut: 3500 });
            return;
        }
        const values = collectForm();

        if (!String(values.name || '').trim()) {
            toastr.error('У пресета должно быть название', 'Storyboard');
            return;
        }
        if (!String(values.wrapper || '').includes('{{PROMPT}}')) {
            toastr.error('В шаблоне обёртки нет {{PROMPT}} — блок будет пустым', 'Storyboard', { timeOut: 5000 });
            return;
        }

        Object.assign(preset, {
            name: values.name.trim(),
            instruction: values.instruction,
            aspectRatio: values.aspectRatio.trim() || '16:9',
            imageSize: values.imageSize.trim() || '2K',
            wrapper: values.wrapper,
        });

        saveSettings();
        renderList();
        sbRefreshPresetSelect();
        toastr.success('Пресет сохранён', 'Storyboard', { timeOut: 1500 });
    }

    overlay.querySelector('[data-act="save"]').addEventListener('click', save);

    overlay.querySelector('[data-act="new"]').addEventListener('click', () => {
        const settings = getSettings();
        const id = sbNewPresetId('preset');
        settings.presets.push({
            id,
            name: 'Новый пресет',
            instruction: '',
            aspectRatio: '16:9',
            imageSize: '2K',
            wrapper: DEFAULT_WRAPPER,
        });
        editingId = id;
        saveSettings();
        renderList();
        renderForm();
        sbRefreshPresetSelect();
    });

    overlay.querySelector('[data-act="duplicate"]').addEventListener('click', () => {
        const settings = getSettings();
        const source = settings.presets.find(p => p.id === editingId);
        if (!source) return;
        const copy = structuredClone(source);
        copy.id = sbNewPresetId(source.name);
        copy.name = `${source.name} — копия`;
        // Копия всегда своя, даже если оригинал встроенный.
        delete copy.builtIn;
        delete copy.customized;
        settings.presets.push(copy);
        editingId = copy.id;
        saveSettings();
        renderList();
        renderForm();
        sbRefreshPresetSelect();
    });

    overlay.querySelector('[data-act="delete"]').addEventListener('click', () => {
        const settings = getSettings();
        if (settings.presets.length <= 1) return;
        const index = settings.presets.findIndex(p => p.id === editingId);
        if (index === -1) return;
        const [removedPreset] = settings.presets.splice(index, 1);

        if (removedPreset.builtIn) {
            if (!Array.isArray(settings.removedBuiltIns)) settings.removedBuiltIns = [];
            if (!settings.removedBuiltIns.includes(removedPreset.id)) {
                settings.removedBuiltIns.push(removedPreset.id);
            }
        }
        if (settings.activePresetId === removedPreset.id) {
            settings.activePresetId = settings.presets[0].id;
        }
        editingId = settings.presets[0].id;
        saveSettings();
        renderList();
        renderForm();
        sbRefreshPresetSelect();
        toastr.info(`Пресет «${removedPreset.name}» удалён`, 'Storyboard', { timeOut: 2000 });
    });

    overlay.querySelector('[data-act="export"]').addEventListener('click', () => {
        const payload = JSON.stringify({
            storyboardPresets: 1,
            presets: getSettings().presets,
        }, null, 2);
        const blob = new Blob([payload], { type: 'application/json' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `storyboard-presets-${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    });

    const importInput = overlay.querySelector('.sb-import-input');
    overlay.querySelector('[data-act="import"]').addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const parsed = JSON.parse(await file.text());
            const incoming = Array.isArray(parsed) ? parsed : parsed?.presets;
            if (!Array.isArray(incoming) || incoming.length === 0) throw new Error('в файле нет пресетов');

            const settings = getSettings();
            let added = 0;
            for (const raw of incoming) {
                if (!raw || typeof raw !== 'object' || !raw.instruction) continue;
                // Импорт всегда добавляет, а не заменяет: свои пресеты дороже.
                const preset = {
                    id: sbNewPresetId(raw.name || raw.id || 'imported'),
                    name: String(raw.name || 'Импортированный'),
                    instruction: String(raw.instruction || ''),
                    aspectRatio: String(raw.aspectRatio || '16:9'),
                    imageSize: String(raw.imageSize || '2K'),
                    wrapper: String(raw.wrapper || DEFAULT_WRAPPER),
                };
                settings.presets.push(preset);
                editingId = preset.id;
                added++;
            }
            if (!added) throw new Error('ни один пресет не подошёл по формату');
            saveSettings();
            renderList();
            renderForm();
            sbRefreshPresetSelect();
            toastr.success(`Импортировано пресетов: ${added}`, 'Storyboard', { timeOut: 2500 });
        } catch (error) {
            toastr.error(`Не удалось импортировать: ${error?.message}`, 'Storyboard', { timeOut: 5000 });
        } finally {
            importInput.value = '';
        }
    });

    renderList();
    renderForm();
}

// ═══════════════════════════════════════════════════════════════════════
// Панель настроек
// ═══════════════════════════════════════════════════════════════════════

function buildSettingsPanel() {
    const container = document.getElementById('extensions_settings');
    if (!container) return;
    if (document.getElementById('sb_settings_root')) return;

    const settings = getSettings();
    const presetOptions = settings.presets
        .map(p => `<option value="${p.id}" ${p.id === settings.activePresetId ? 'selected' : ''}>${p.name}</option>`)
        .join('');

    const html = `
        <div id="sb_settings_root" class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b><i class="fa-solid fa-paintbrush" style="margin-right: 6px;"></i>⊹ STORYBOARD ⊹</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <div class="sb-settings">
                    <p class="sb-intro">Просит модель написать промпт для картинки по уже готовому посту. Кнопка с кистью — в меню кнопок под каждым сообщением.</p>

                    <label class="checkbox_label">
                        <input type="checkbox" id="sb_enabled" ${settings.enabled ? 'checked' : ''}>
                        <span>Включено</span>
                    </label>

                    <label for="sb_profile" style="margin-top: 10px; display: block;">Профиль подключения</label>
                    <select id="sb_profile" class="text_pole"></select>
                    <div class="sb-hint" id="sb_profile_hint">Пусто — используется текущее подключение таверны.</div>

                    <label for="sb_preset" style="margin-top: 10px; display: block;">Пресет</label>
                    <select id="sb_preset" class="text_pole">${presetOptions}</select>
                    <div class="menu_button menu_button_icon" id="sb_manage_presets" style="margin-top: 6px;">
                        <i class="fa-solid fa-sliders"></i>
                        <span>Управление пресетами</span>
                    </div>

                    <label for="sb_max_tokens" style="margin-top: 10px; display: block;">Лимит токенов ответа</label>
                    <input type="number" id="sb_max_tokens" class="text_pole" min="500" max="16000" step="250" value="${settings.maxTokens}">
                    <div class="sb-hint">Размышления модели тратятся из этого же лимита. Если промпт обрывается на полуслове — увеличь.</div>

                    <label for="sb_reasoning" style="margin-top: 10px; display: block;">Размышления модели</label>
                    <select id="sb_reasoning" class="text_pole">
                        <option value="min" ${settings.reasoningEffort === 'min' ? 'selected' : ''}>Минимум</option>
                        <option value="auto" ${settings.reasoningEffort === 'auto' ? 'selected' : ''}>На усмотрение модели</option>
                    </select>
                    <div class="sb-hint">Работает только при выбранном профиле подключения. Gemini 3.x Pro всё равно думает минимум на уровне low — Google не даёт отключить полностью.</div>

                    <label class="checkbox_label" style="margin-top: 10px;">
                        <input type="checkbox" id="sb_strip_apostrophes" ${settings.stripApostrophes !== false ? 'checked' : ''}>
                        <span>Убирать апострофы (Eli's legs → Eli legs)</span>
                    </label>

                    <label class="checkbox_label" style="margin-top: 10px;">
                        <input type="checkbox" id="sb_debug" ${settings.debug ? 'checked' : ''}>
                        <span>Подробные логи в консоль</span>
                    </label>
                </div>
            </div>
        </div>`;

    container.insertAdjacentHTML('beforeend', html);

    document.getElementById('sb_enabled')?.addEventListener('change', (e) => {
        getSettings().enabled = !!e.target.checked;
        saveSettings();
        if (e.target.checked) addButtonsToAllMessages();
    });

    document.getElementById('sb_preset')?.addEventListener('change', (e) => {
        getSettings().activePresetId = e.target.value;
        saveSettings();
    });

    document.getElementById('sb_max_tokens')?.addEventListener('change', (e) => {
        const value = parseInt(e.target.value, 10);
        getSettings().maxTokens = Number.isFinite(value) ? value : defaultSettings.maxTokens;
        saveSettings();
    });

    document.getElementById('sb_reasoning')?.addEventListener('change', (e) => {
        getSettings().reasoningEffort = e.target.value === 'auto' ? 'auto' : 'min';
        saveSettings();
    });

    document.getElementById('sb_strip_apostrophes')?.addEventListener('change', (e) => {
        getSettings().stripApostrophes = !!e.target.checked;
        saveSettings();
    });

    document.getElementById('sb_debug')?.addEventListener('change', (e) => {
        getSettings().debug = !!e.target.checked;
        saveSettings();
    });

    document.getElementById('sb_manage_presets')?.addEventListener('click', sbOpenPresetManager);

    setupProfileDropdown();
}

/**
 * Выпадающий список профилей рисует сама таверна — она же следит за созданием,
 * переименованием и удалением профилей. Если Connection Manager отключён,
 * handleDropdown бросает исключение: тогда прячем селект и работаем на текущем
 * подключении.
 */
function setupProfileDropdown() {
    const context = getContext();
    const hint = document.getElementById('sb_profile_hint');
    try {
        context.ConnectionManagerRequestService.handleDropdown(
            '#sb_profile',
            getSettings().profileId,
            (profile) => {
                getSettings().profileId = profile?.id || '';
                saveSettings();
                sbLog('INFO', `Выбран профиль: ${profile?.name || 'текущее подключение'}`);
            },
        );
    } catch (error) {
        sbLog('WARN', 'Профили подключений недоступны:', error?.message);
        const select = document.getElementById('sb_profile');
        if (select) select.style.display = 'none';
        if (hint) hint.textContent = 'Connection Manager отключён — будет использовано текущее подключение таверны.';
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Запуск
// ═══════════════════════════════════════════════════════════════════════

jQuery(async () => {
    const context = getContext();

    getSettings();
    buildSettingsPanel();

    context.eventSource.on(context.event_types.APP_READY, () => {
        addButtonsToAllMessages();
        watchChatForNewMessages();
    });

    context.eventSource.on(context.event_types.CHAT_CHANGED, () => {
        // Таверна перерисовывает чат целиком, поэтому наблюдатель перевешивается.
        setTimeout(() => {
            addButtonsToAllMessages();
            watchChatForNewMessages();
        }, 200);
    });

    context.eventSource.on(context.event_types.CHARACTER_MESSAGE_RENDERED, addButtonsToAllMessages);
    context.eventSource.on(context.event_types.USER_MESSAGE_RENDERED, addButtonsToAllMessages);
    if (context.event_types.MESSAGE_SWIPED) {
        context.eventSource.on(context.event_types.MESSAGE_SWIPED, () => setTimeout(addButtonsToAllMessages, 100));
    }

    // Первый проход на случай, если APP_READY уже прошёл до загрузки расширения.
    setTimeout(() => {
        addButtonsToAllMessages();
        watchChatForNewMessages();
    }, 1000);

    console.log('[Storyboard] Расширение загружено, версия 0.5.1');
});
