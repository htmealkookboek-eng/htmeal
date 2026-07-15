import re
import json
import urllib.request
import html

def strip_emojis(text):
    if not isinstance(text, str):
        return text
    # Remove emoji unicode blocks and variation selectors/keycaps
    pattern = re.compile(
        r'['
        r'\U0001f600-\U0001f64f'  # emoticons
        r'\U0001f300-\U0001f5ff'  # symbols & pictographs
        r'\U0001f680-\U0001f6ff'  # transport & map symbols
        r'\U0001f1e0-\U0001f1ff'  # flags (iOS)
        r'\U00002702-\U000027b0'
        r'\U000024c2-\U0001f251'
        r'\u2600-\u26FF'          # misc symbols
        r'\u2700-\u27BF'          # dingbats
        r'\uFE0F'                 # Variation Selector-16
        r'\u20E3'                 # Combining Enclosing Keycap
        r']+', re.UNICODE)
    return pattern.sub('', text)

def parse_ingredient_line(line):
    parts = line.strip().split(' ', 2)
    amount = ""
    unit = ""
    ingredient = line.strip()
    if len(parts) >= 2:
        if parts[0].replace('.', '', 1).replace('/', '', 1).isdigit():
            amount = parts[0]
            if len(parts) >= 3 and len(parts[1]) <= 4:
                unit = parts[1]
                ingredient = parts[2]
            else:
                ingredient = " ".join(parts[1:])
    return {"amount": amount, "unit": unit, "name": ingredient, "preparation": ""}

def extract_ld_json_recipe(html_text, url):
    # Find all ld+json script blocks
    blocks = re.findall(r'<script type="application/ld\+json"[^>]*>([\s\S]*?)</script>', html_text, re.IGNORECASE)
    for block in blocks:
        try:
            data = json.loads(block)
            # Sometimes it's a list or a graph
            items = []
            if isinstance(data, list): items = data
            elif '@graph' in data: items = data['@graph']
            else: items = [data]
            
            for item in items:
                if item.get('@type') == 'Recipe' or 'Recipe' in item.get('@type', []):
                    # Found a recipe!
                    title = strip_emojis(html.unescape(item.get('name', 'Imported Recipe')))
                    desc = strip_emojis(html.unescape(item.get('description', '')))
                    
                    # Image
                    image = ""
                    img_data = item.get('image')
                    if isinstance(img_data, str): image = img_data
                    elif isinstance(img_data, list) and len(img_data) > 0:
                        if isinstance(img_data[0], str): image = img_data[0]
                        elif isinstance(img_data[0], dict): image = img_data[0].get('url', '')
                    elif isinstance(img_data, dict): image = img_data.get('url', '')
                    
                    if not image:
                        img_match = re.search(r'<meta property="og:image" content="([^"]+)"', html_text)
                        if img_match: image = img_match.group(1)
                        else:
                            img_match = re.search(r'<img[^>]*class="[^"]*recipe-image_image[^"]*"[^>]*src="([^"]+)"', html_text)
                            if img_match: image = img_match.group(1)
                            else:
                                img_match = re.search(r'<img[^>]*class="[^"]*wp-post-image[^"]*"[^>]*src="([^"]+)"', html_text)
                                if img_match: image = img_match.group(1)
                        
                    # Time
                    time_str = item.get('totalTime', '')
                    cooking_time = 0
                    if time_str and time_str.startswith('PT'):
                        mins = re.search(r'(\d+)M', time_str)
                        hrs = re.search(r'(\d+)H', time_str)
                        if mins: cooking_time += int(mins.group(1))
                        if hrs: cooking_time += int(hrs.group(1)) * 60
                        
                    # Ingredients
                    ingredients = item.get('recipeIngredient', [])
                    if isinstance(ingredients, str): ingredients = [ingredients]
                    ingredients = [strip_emojis(html.unescape(i)) for i in ingredients]
                    
                    # Instructions
                    instructions = []
                    instr_data = item.get('recipeInstructions', [])
                    if isinstance(instr_data, str):
                        instructions = [html.unescape(instr_data)]
                    elif isinstance(instr_data, list):
                        for step in instr_data:
                            if isinstance(step, str):
                                instructions.append(strip_emojis(html.unescape(step)))
                            elif isinstance(step, dict):
                                text = step.get('text', '')
                                if text: instructions.append(strip_emojis(html.unescape(text)))
                                
                    # Tags
                    tags = []
                    kw = item.get('keywords', '')
                    if isinstance(kw, str): tags = [t.strip() for t in kw.split(',')]
                    elif isinstance(kw, list): tags = kw
                    
                    category = item.get('recipeCategory')
                    if isinstance(category, str): tags.append(category)
                    elif isinstance(category, list): tags.extend(category)
                    
                    return {
                        "title": title,
                        "description": desc,
                        "image": image,
                        "source": url,
                        "ingredients": ingredients,
                        "instructions": [re.sub(r'<[^>]+>', '', i).strip() for i in instructions],
                        "servings": item.get('recipeYield', 4),
                        "cooking_time": cooking_time or 30,
                        "collections": [],
                        "tags": list(set(t for t in tags if t))
                    }
        except Exception:
            continue
    return None

def parse_ah_allerhande_html(html_text, url):
    title_match = re.search(r'<h1[^>]*data-testid="header-title"[^>]*>([\s\S]*?)</h1>', html_text)
    title = strip_emojis(re.sub(r'<[^>]+>', '', title_match.group(1)).strip()) if title_match else "Imported Recipe"

    desc_match = re.search(r'<p[^>]*data-testid="recipe-description"[^>]*>([\s\S]*?)</p>', html_text)
    desc = strip_emojis(re.sub(r'<[^>]+>', '', desc_match.group(1)).strip()) if desc_match else ""

    image = ""
    img_match = re.search(r'<meta property="og:image" content="([^"]+)"', html_text)
    if img_match:
        image = img_match.group(1)
    else:
        img_match = re.search(r'<img[^>]*class="[^"]*image_root[^"]*"[^>]*src="([^"]+)"', html_text)
        if img_match:
            image = img_match.group(1)
        else:
            img_match = re.search(r'<img[^>]*class="[^"]*wp-post-image[^"]*"[^>]*src="([^"]+)"', html_text)
            if img_match:
                image = img_match.group(1)

    cooking_time = 30
    time_match = re.search(r'<span[^>]*class="[^"]*timespan[^"]*"[^>]*>([\s\S]*?)</span>', html_text)
    if time_match:
        digits = re.search(r'\d+', time_match.group(1))
        if digits:
            cooking_time = int(digits.group(0))

    ingredients = []
    ing_matches = re.finditer(r'<b[^>]*class="[^"]*unit[^"]*"[^>]*>([\s\S]*?)</b>\s*<span[^>]*class="[^"]*name[^"]*"[^>]*>([\s\S]*?)</span>', html_text)
    for match in ing_matches:
        amt_unit = re.sub(r'<[^>]+>', '', match.group(1)).strip()
        name = re.sub(r'<[^>]+>', '', match.group(2)).strip()
        parts = amt_unit.split(' ', 1)
        amt = parts[0]
        unit = parts[1] if len(parts) > 1 else ""
        ingredients.append(strip_emojis(f"{amt} {unit} {name}".strip()))

    instructions = []
    step_matches = re.finditer(r'<p[^>]*class="[^"]*stepText[^"]*"[^>]*>([\s\S]*?)</p>', html_text)
    for match in step_matches:
        instructions.append(strip_emojis(re.sub(r'<[^>]+>', '', match.group(1)).strip()))

    return {
        "title": title,
        "description": desc,
        "image": image,
        "source": url,
        "ingredients": ingredients,
        "instructions": instructions,
        "servings": 4,
        "cooking_time": cooking_time,
        "collections": [],
        "tags": []
    }


def clean_html_text(html_content):
    html_content = re.sub(r'(?i)<br\s*/?>', '\n', html_content)
    html_content = re.sub(r'<[^>]+>', '', html_content)
    return html.unescape(html_content).strip()


def extract_html_block(html_text, heading_regex):
    match = re.search(heading_regex, html_text, flags=re.IGNORECASE)
    if not match:
        return ''
    start = match.end()
    next_heading = re.search(r'<h[1-6][^>]*>', html_text[start:], flags=re.IGNORECASE)
    end = start + next_heading.start() if next_heading else len(html_text)
    return html_text[start:end]


def extract_html_list_items(html_block):
    items = []
    for match in re.finditer(r'<li[^>]*>([\s\S]*?)</li>', html_block, flags=re.IGNORECASE):
        item = clean_html_text(match.group(1))
        if item:
            items.append(item)
    return items


def extract_html_paragraphs(html_block, min_length=10):
    items = []
    for match in re.finditer(r'<p[^>]*>([\s\S]*?)</p>', html_block, flags=re.IGNORECASE):
        text = clean_html_text(match.group(1))
        if text and len(text) >= min_length:
            items.append(text)
    return items


def extract_pinterest_ingredients(html_text):
    ingredients = []
    for match in re.finditer(r'<li[^>]*data-test-id=["\']recipe-ingredient["\'][^>]*>([\s\S]*?)</li>', html_text, flags=re.IGNORECASE):
        item = clean_html_text(match.group(1))
        if item:
            ingredients.append(item)
    if not ingredients:
        for match in re.finditer(r'itemprop=["\']recipeIngredient["\'][^>]*>([^<]+)<', html_text, flags=re.IGNORECASE):
            item = clean_html_text(match.group(1))
            if item:
                ingredients.append(item)
    return ingredients


def extract_pinterest_description(html_text):
    desc_match = re.search(r'<div[^>]+data-test-id=["\']structured-description["\'][^>]*>([\s\S]*?)</div>', html_text, flags=re.IGNORECASE)
    if desc_match:
        return clean_html_text(desc_match.group(1))
    desc_match = re.search(r'<div[^>]+data-test-id=["\']product-description-preview["\'][^>]*>([\s\S]*?)</div>', html_text, flags=re.IGNORECASE)
    if desc_match:
        return clean_html_text(desc_match.group(1))
    return ''


def extract_html_block_by_keyword(html_text, keywords):
    for keyword in keywords:
        escaped = re.escape(keyword)
        pattern = r'(<(?:div|section|article|aside|header|footer)[^>]*(?:class|id)=["\"][^"\"]*' + escaped + r'[^"\"]*["\"][^>]*>[\s\S]*?</(?:div|section|article|aside|header|footer)>)'
        match = re.search(pattern, html_text, flags=re.IGNORECASE)
        if match:
            return match.group(1)
    return ''


def extract_html_block_by_heading_or_text(html_text, heading_regex):
    block = extract_html_block(html_text, heading_regex)
    if block:
        return block
    return ''


def extract_list_or_paragraph_items(html_block, min_paragraph_length=10):
    items = extract_html_list_items(html_block)
    if items:
        return items
    return extract_html_paragraphs(html_block, min_length=min_paragraph_length)


def parse_iso_duration(duration):
    if not duration:
        return 0
    hours = re.search(r'([0-9]+)H', duration)
    mins = re.search(r'([0-9]+)M', duration)
    total = 0
    if hours:
        total += int(hours.group(1)) * 60
    if mins:
        total += int(mins.group(1))
    return total


def parse_recipe_time_fields(html_text):
    prep_time = 0
    cook_time = 0
    total_time = 0
    for name in ['prepTime', 'cookTime', 'totalTime']:
        match = re.search(r'<time[^>]*itemprop=["\"]%s["\"][^>]*datetime=["\"]([^"\"]+)["\"]' % name, html_text, flags=re.IGNORECASE)
        if match:
            value = parse_iso_duration(match.group(1))
            if name == 'prepTime':
                prep_time = value
            elif name == 'cookTime':
                cook_time = value
            else:
                total_time = value

    if total_time:
        return total_time
    if cook_time or prep_time:
        return cook_time + prep_time if cook_time and prep_time else cook_time or prep_time

    match = re.search(r'itemprop=["\"]totalTime["\"][^>]*content=["\"]([^"\"]+)["\"]', html_text, flags=re.IGNORECASE)
    if match:
        return parse_iso_duration(match.group(1))

    return 0


def parse_recipe_yield(html_text):
    match = re.search(r'itemprop=["\"]recipeYield["\"][^>]*content=["\"]([^"\"]+)["\"]', html_text, flags=re.IGNORECASE)
    if match:
        yield_text = match.group(1)
        num = re.search(r'([0-9]+)', yield_text)
        if num:
            return int(num.group(1))

    match = re.search(r'itemprop=["\"]recipeYield["\"][^>]*>([\s\S]*?)<', html_text, flags=re.IGNORECASE)
    if match:
        yield_text = clean_html_text(match.group(1))
        num = re.search(r'([0-9]+)', yield_text)
        if num:
            return int(num.group(1))

    match = re.search(r'([0-9]{1,2})\s*(?:personen|pp|porties|porties|pers|servings?)\b', html_text, flags=re.IGNORECASE)
    if match:
        return int(match.group(1))

    return 4


def remove_emojis(text):
    if not text:
        return text
    emoji_pattern = re.compile(
        '['
        '\U0001F300-\U0001F5FF'
        '\U0001F600-\U0001F64F'
        '\U0001F680-\U0001F6FF'
        '\U0001F1E0-\U0001F1FF'
        '\U00002700-\U000027BF'
        '\U0001F900-\U0001F9FF'
        '\U00002600-\U000026FF'
        '\U0000200D'
        '\U00002300-\U000023FF'
        '\U000024C2-\U0001F251'
        ']+', flags=re.UNICODE)
    return emoji_pattern.sub('', text)


def normalize_recipe_text(text):
    if not text:
        return text
    text = text.replace('\r\n', '\n').replace('\r', '\n')
    text = re.sub(r'[ \t]+\n', '\n', text)
    text = re.sub(r'\n{3,}', '\n\n', text)
    text = remove_emojis(text)
    return text.strip()


def sanitize_recipe(recipe):
    cleaned = {}
    for key, value in recipe.items():
        if isinstance(value, str):
            cleaned[key] = normalize_recipe_text(value)
        elif isinstance(value, list):
            cleaned[key] = [normalize_recipe_text(item) if isinstance(item, str) else item for item in value]
        else:
            cleaned[key] = value
    return cleaned


def clean_instagram_caption(text):
    if not text:
        return text
    text = text.strip()

    # Remove common Instagram metadata prefix like "244K likes, 613 comments - user on June 29, 2026:"
    text = re.sub(
        r'^\s*["“”]?\s*[\d.,KMkm]+\s*likes?,\s*[\d.,KMkm]+\s*comments?\s*-\s*[^:]+?:\s*',
        '',
        text,
        flags=re.IGNORECASE
    )
    text = re.sub(
        r'^\s*["“”]?\s*[^:\n]+?\s+on\s+[^:\n]+?:\s*',
        '',
        text,
        flags=re.IGNORECASE
    )

    # Remove trailing hashtag blocks
    text = re.sub(r'\s*(?:#\w[\w-]*\s*)+$', '', text, flags=re.IGNORECASE)

    # Trim matching quotes around the whole caption
    text = text.strip()
    if (text.startswith('"') and text.endswith('"')) or (text.startswith('“') and text.endswith('”')):
        text = text[1:-1].strip()

    return text


def extract_instagram_image(html_text):
    # Prefer the actual poster image for Instagram video posts. The generic og:image
    # metadata often points to a play-button thumbnail, which is the wrong visual for
    # the recipe card/banner.
    poster_patterns = [
        r'<video[^>]+poster="([^"]+)"',
        r'<meta[^>]+property="og:image:secure_url"[^>]+content="([^"]+)"',
        r'<meta[^>]+property="og:image"[^>]+content="([^"]+)"',
        r'<img[^>]+src="([^"]+)"'
    ]
    for pattern in poster_patterns:
        match = re.search(pattern, html_text, re.IGNORECASE)
        if match:
            candidate = html.unescape(match.group(1)).strip()
            if candidate and not candidate.startswith('blob:') and not candidate.endswith('.mp4'):
                return candidate
    return ''


def is_instagram_html(html_text, url):
    if url and 'instagram.com' in url.lower():
        return True
    if re.search(r'<meta[^>]+property=["\"]og:site_name["\"][^>]*content=["\"]Instagram["\"]', html_text, re.IGNORECASE):
        return True
    if re.search(r'<script[^>]+>[^<]*window\._sharedData', html_text, re.IGNORECASE):
        return True
    if re.search(r'instagram\.com/(p|reel|tv)/', html_text, re.IGNORECASE):
        return True
    return False


def extract_instagram_caption(html_text):
    # Try JSON-LD first
    for block in re.findall(r'<script type="application/ld\+json"[^>]*>([\s\S]*?)</script>', html_text, re.IGNORECASE):
        try:
            data = json.loads(block)
            if isinstance(data, dict):
                caption = data.get('caption') or data.get('description') or data.get('name')
                if caption:
                    return clean_instagram_caption(html.unescape(caption))
            elif isinstance(data, list):
                for item in data:
                    if isinstance(item, dict):
                        caption = item.get('caption') or item.get('description') or item.get('name')
                        if caption:
                            return clean_instagram_caption(html.unescape(caption))
        except Exception:
            continue

    h1_match = re.search(r'<h1[^>]*class="[^"]*\b_ap3a\b[^"]*"[^>]*>([\s\S]*?)</h1>', html_text, re.IGNORECASE)
    if h1_match:
        return clean_instagram_caption(clean_html_text(h1_match.group(1)))

    og_desc = re.search(r'<meta[^>]+property="og:description"[^>]+content="([^"]+)"', html_text, re.IGNORECASE)
    if og_desc:
        return clean_instagram_caption(html.unescape(og_desc.group(1)))

    title_match = re.search(r'<meta[^>]+property="og:title"[^>]+content="([^"]+)"', html_text, re.IGNORECASE)
    if title_match:
        return clean_instagram_caption(html.unescape(title_match.group(1)))

    return ''


def parse_instagram_post(html_text, url):
    if not is_instagram_html(html_text, url):
        return None
    caption = extract_instagram_caption(html_text)
    if not caption:
        return None

    caption = caption.replace('\r', '')
    caption = caption.replace('\u2019', "'")
    caption_lines = [line.strip() for line in caption.split('\n') if line.strip()]
    title = 'Imported Instagram recipe'
    ingredients = []
    instructions = []
    tags = []

    # find hashtags and add them as tags
    tags = re.findall(r'#([A-Za-z0-9_\-]+)', caption)

    parsing_mode = 'title'
    found_ingredients = False
    found_instructions = False
    collected_title = []
    for line in caption_lines:
        low = line.lower()
        if 'ingredient' in low and not found_ingredients:
            parsing_mode = 'ingredients'
            found_ingredients = True
            continue
        if any(marker in low for marker in ['method', 'bereiding', 'instruction', 'step', 'cook', 'bake']) and not found_instructions:
            parsing_mode = 'instructions'
            found_instructions = True
            continue
        if parsing_mode == 'title' and not found_ingredients and not found_instructions:
            if not collected_title and not line.startswith('#'):
                collected_title.append(line)
            continue
        if parsing_mode == 'ingredients':
            if line.startswith('#'):
                continue
            if len(line) > 2:
                ing = parse_ingredient_line(re.sub(r'^[\-*•]\s*', '', line))
                ingredients.append(f"{ing['amount']} {ing['unit']} {ing['name']}".strip())
            continue
        if parsing_mode == 'instructions':
            if line.startswith('#'):
                continue
            if len(line) > 5:
                instructions.append(re.sub(r'^[\-*•]\s*', '', line))
            continue

    if collected_title:
        title = collected_title[0]
    elif caption_lines:
        title = caption_lines[0]

    image = extract_instagram_image(html_text)

    if not instructions and found_ingredients and not found_instructions:
        # maybe caption has an ingredients section and then text instructions without explicit header
        after_ing = False
        for line in caption_lines:
            if after_ing and len(line) > 5 and not line.startswith('#') and 'ingredient' not in line.lower():
                instructions.append(re.sub(r'^[\-*•]\s*', '', line))
            if 'ingredient' in line.lower():
                after_ing = True
        if instructions and ingredients:
            pass

    tags = list(dict.fromkeys([tag.lower() for tag in tags if tag]))

    return {
        'title': title,
        'description': caption,
        'image': image,
        'source': url,
        'ingredients': ingredients,
        'instructions': instructions,
        'servings': 4,
        'cooking_time': 30,
        'collections': [],
        'tags': tags
    }


def parse_generic_webpage(html_text, url):
    title = ''
    desc = ''
    image = ''

    title_match = re.search(r'<meta property="og:title" content="([^"]+)"', html_text)
    if title_match:
        title = html.unescape(title_match.group(1).strip())
    else:
        title_match = re.search(r'<h1[^>]*>([^<]+)</h1>', html_text)
        if title_match:
            title = html.unescape(title_match.group(1).strip())

    desc_match = re.search(r'<meta property="og:description" content="([^"]+)"', html_text)
    if desc_match:
        desc = html.unescape(desc_match.group(1).strip())
    else:
        p_match = re.search(r'<p[^>]*>([^<]{30,})</p>', html_text)
        if p_match:
            desc = html.unescape(p_match.group(1).strip())

    img_match = re.search(r'<meta property="og:image" content="([^"]+)"', html_text)
    if img_match:
        image = img_match.group(1)
    else:
        img_match = re.search(r'<img[^>]+src="([^"]+)"', html_text)
        if img_match:
            image = img_match.group(1)

    content_block = extract_html_block_by_keyword(html_text, [
        'entry-content', 'post-content', 'recipe-content', 'content-body', 'article-body', 'post-body', 'entry-body', 'recipe-body', 'post-entry'
    ])
    if content_block:
        html_text = content_block

    ingredient_heading = r'<h[1-6][^>]*>(?:[^<]*(?:ingred[iï]nt|ingrediënt|ingrediënten|ingredienten|ingredients|ingredient)[^<]*)</h[1-6]>'
    instruction_heading = r'<h[1-6][^>]*>(?:[^<]*(?:bereiding|bereidingswijze|method|methods|instruction|instructions|procedure|how to|directions|preparation|guide|step|steps|aanpak|stap|bereidings|bereiden)[^<]*)</h[1-6]>'

    ingredients = []
    ingredient_block = extract_html_block(html_text, ingredient_heading)
    if ingredient_block:
        ingredients = extract_list_or_paragraph_items(ingredient_block)
        if not ingredients:
            ingredients = extract_html_paragraphs(ingredient_block)

    if not ingredients:
        ingredients = []
        for match in re.finditer(r'itemprop=["\"]recipeIngredient["\"][^>]*content=["\"]([^"\"]+)["\"]', html_text, flags=re.IGNORECASE):
            items = [clean_html_text(i) for i in match.group(1).split(',') if clean_html_text(i)]
            ingredients.extend(items)
        if not ingredients:
            ingredients = re.findall(r'itemprop=["\"]recipeIngredient["\"][^>]*>([^<]+)<', html_text, flags=re.IGNORECASE)
            ingredients = [clean_html_text(i) for i in ingredients if clean_html_text(i)]

    if not ingredients:
        ingredients = []
        for match in re.finditer(r'(<(?:ul|ol)[^>]*>)([\s\S]{20,}?)(</(?:ul|ol)>)', html_text, flags=re.IGNORECASE):
            block = match.group(2)
            if re.search(r'ingred', block, flags=re.IGNORECASE) or re.search(r'\b(?:beans|tomato|salt|pepper|herb|oil|garlic|onion)\b', block, flags=re.IGNORECASE):
                ingredients = extract_html_list_items(block)
                if ingredients:
                    break

    instructions = []
    instruction_block = extract_html_block(html_text, instruction_heading)
    if instruction_block:
        instructions = extract_list_or_paragraph_items(instruction_block, min_paragraph_length=15)

    if not instructions:
        instructions = re.findall(r'itemprop=["\"]recipeInstructions["\"][^>]*>([\s\S]*?)<\/[^>]+>', html_text, flags=re.IGNORECASE)
        if instructions:
            step_texts = []
            for inst in instructions:
                step_texts += extract_html_list_items(inst) or extract_html_paragraphs(inst, min_length=20)
            instructions = [clean_html_text(i) for i in step_texts if clean_html_text(i)]

    if not instructions and not instruction_block:
        instruction_block = extract_html_block_by_keyword(html_text, ['directions', 'instructions', 'method', 'preparation', 'how-to', 'recipe-instructions', 'cooking-method'])
    if not instructions and instruction_block:
        instructions = extract_list_or_paragraph_items(instruction_block, min_paragraph_length=15)

    if not instructions:
        fallback = clean_html_text(instruction_block or html_text)
        instructions = [line.strip() for line in re.split(r'\n{1,2}', fallback) if len(line.strip()) >= 25]
    if not ingredients:
        ingredient_block = extract_html_block(html_text, r'<h[1-6][^>]*>[^<]*(?:ingre|ingredient|ingrediënten|ingredienten)[^<]*</h[1-6]>')
        if ingredient_block:
            ingredients = extract_html_list_items(ingredient_block) or extract_html_paragraphs(ingredient_block)

    if not ingredients:
        cleaned_text = clean_html_text(html_text)
        ingredient_lines = re.findall(r'^(?:[\-•*\s]*[0-9¼½¾]+[^\n]+)$', cleaned_text, flags=re.MULTILINE)
        for candidate in ingredient_lines:
            candidate = candidate.strip()
            if candidate and candidate not in ingredients:
                ingredients.append(candidate)

    cooking_time = parse_recipe_time_fields(html_text) or 30

    servings = parse_recipe_yield(html_text)

    return {
        "title": title or 'Imported recipe',
        "description": desc,
        "image": image,
        "source": url,
        "ingredients": ingredients,
        "instructions": instructions,
        "servings": servings,
        "cooking_time": cooking_time,
        "collections": [],
        "tags": []
    }


def parse_pinterest_pin(html_text, url):
    dest_match = re.search(r'data-test-id=["\']visit-site-button["\'][^>]*>\s*<a[^>]+href=["\']([^"\']+)["\']', html_text)
    if not dest_match:
        dest_match = re.search(r'data-test-id=["\']visit-button["\'][^>]*href=["\']([^"\']+)["\']', html_text)
    if not dest_match:
        dest_match = re.search(r'<a[^>]+href=["\']([^"\']+)["\'][^>]+data-test-id=["\']image-link["\']', html_text)
    if not dest_match:
        dest_match = re.search(r'<a[^>]+href=["\']([^"\']+)["\'][^>]*>(?:[\s\S]*?Naar website[\s\S]*?)</a>', html_text, re.IGNORECASE)
    destination = dest_match.group(1) if dest_match else None

    title = ''
    title_match = re.search(r'<h1[^>]*data-hook=["\']post-title["\'][^>]*>([^<]+)</h1>', html_text)
    if not title_match:
        title_match = re.search(r'<h1[^>]*>([^<]+)</h1>', html_text)
    if title_match:
        title = html.unescape(title_match.group(1).strip())
    else:
        og_title = re.search(r'<meta property="og:title" content="([^"]+)"', html_text)
        if og_title:
            title = html.unescape(og_title.group(1).strip())

    desc = extract_pinterest_description(html_text)
    if not desc:
        og_desc = re.search(r'<meta property="og:description" content="([^"]+)"', html_text)
        if og_desc:
            desc = html.unescape(og_desc.group(1).strip())

    image = ''
    img_match = re.search(r'data-pin-media=["\']([^"\']+)["\']', html_text)
    if not img_match:
        img_match = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', html_text)
    if img_match:
        image = img_match.group(1)

    pin_ingredients = extract_pinterest_ingredients(html_text)
    pin_instructions = []

    if destination:
        try:
            req = urllib.request.Request(destination, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req) as response:
                dest_html = response.read().decode('utf-8', errors='ignore')
            ld_recipe = extract_ld_json_recipe(dest_html, destination)
            if ld_recipe:
                if image:
                    ld_recipe['image'] = image
                if not ld_recipe.get('title'):
                    ld_recipe['title'] = title or ld_recipe.get('title', 'Pinned recipe')
                if not ld_recipe.get('description'):
                    ld_recipe['description'] = desc
                if pin_ingredients and not ld_recipe.get('ingredients'):
                    ld_recipe['ingredients'] = pin_ingredients
                return ld_recipe
            if 'allerhande' in destination.lower():
                result = parse_ah_allerhande_html(dest_html, destination)
                if image:
                    result['image'] = image
                if not result.get('title'):
                    result['title'] = title or result.get('title', 'Pinned recipe')
                if not result.get('description'):
                    result['description'] = desc
                if pin_ingredients and not result.get('ingredients'):
                    result['ingredients'] = pin_ingredients
                return result
            result = parse_generic_webpage(dest_html, destination)
            if image:
                result['image'] = image
            if not result.get('title'):
                result['title'] = title or result.get('title', 'Pinned recipe')
            if not result.get('description'):
                result['description'] = desc
            if pin_ingredients and not result.get('ingredients'):
                result['ingredients'] = pin_ingredients
            return result
        except Exception:
            pass

    if pin_ingredients:
        return {
            "title": title or 'Pinned recipe',
            "description": desc,
            "image": image,
            "source": destination or url,
            "ingredients": pin_ingredients,
            "instructions": pin_instructions,
            "servings": 4,
            "cooking_time": 30,
            "collections": [],
            "tags": []
        }

    return {
        "title": title or 'Pinned recipe',
        "description": desc,
        "image": image,
        "source": destination or url,
        "ingredients": [],
        "instructions": [],
        "servings": 4,
        "cooking_time": 30,
        "collections": [],
        "tags": []
    }


def parse_generic_css_classes(html_text, url):
    ingredients_classes = r'vc_acf ingredienten-lijst|wprm-recipe-ingredients|tasty-recipes-ingredients|mv-create-ingredients|recipe-ingredients|ingredient-list|ingredients-list'
    instructions_classes = r'vc_acf recept-beschrijving|wprm-recipe-instructions|tasty-recipes-instructions|mv-create-instructions|recipe-instructions|instruction-list|instructions-list'
    
    if not re.search(ingredients_classes, html_text, re.IGNORECASE) and not re.search(instructions_classes, html_text, re.IGNORECASE):
        return None
    title = ""
    title_match = re.search(r'<h1[^>]*>.*?<span>(.*?)</span>.*?</h1>', html_text, re.IGNORECASE | re.DOTALL)
    if not title_match:
        title_match = re.search(r'<h1[^>]*>(.*?)</h1>', html_text, re.IGNORECASE | re.DOTALL)
    if title_match:
        title = clean_html_text(title_match.group(1))
        
    desc = ""
    desc_match = re.search(r'<div class="uncode_text_column[^>]*>(.*?)</div>\s*</div>\s*</div>\s*</div>\s*<script', html_text, re.IGNORECASE | re.DOTALL)
    if not desc_match:
        desc_match = re.search(r'<meta property="og:description" content="([^"]+)"', html_text)
    if desc_match:
        desc = clean_html_text(desc_match.group(1))

    image = ""
    img_match = re.search(r'<div class="uncode-single-media-wrapper[^>]*>.*?<img[^>]*src="([^"]+)"', html_text, re.IGNORECASE | re.DOTALL)
    if not img_match:
        img_match = re.search(r'<meta property="og:image" content="([^"]+)"', html_text)
    if img_match:
        image = img_match.group(1)

    ingredients = []
    ingr_match = re.search(rf'<div[^>]*class="[^"]*(?:{ingredients_classes})[^"]*"[^>]*>(.*?)</div>', html_text, re.IGNORECASE | re.DOTALL)
    if not ingr_match:
        ingr_match = re.search(rf'<ul[^>]*class="[^"]*(?:{ingredients_classes})[^"]*"[^>]*>(.*?)</ul>', html_text, re.IGNORECASE | re.DOTALL)
    if ingr_match:
        ingredients = extract_html_list_items(ingr_match.group(1)) or extract_html_paragraphs(ingr_match.group(1))

    instructions = []
    instr_match = re.search(rf'<div[^>]*class="[^"]*(?:{instructions_classes})[^"]*"[^>]*>(.*?)</div>', html_text, re.IGNORECASE | re.DOTALL)
    if not instr_match:
        instr_match = re.search(rf'<ol[^>]*class="[^"]*(?:{instructions_classes})[^"]*"[^>]*>(.*?)</ol>', html_text, re.IGNORECASE | re.DOTALL)
    if not instr_match:
        instr_match = re.search(rf'<ul[^>]*class="[^"]*(?:{instructions_classes})[^"]*"[^>]*>(.*?)</ul>', html_text, re.IGNORECASE | re.DOTALL)
    if instr_match:
        instructions = extract_html_list_items(instr_match.group(1)) or extract_html_paragraphs(instr_match.group(1))

    cooking_time = 30
    time_match = re.search(r'<div class="[^"]*vc_acf recept-tijd[^"]*">.*?(\d+).*?</div>', html_text, re.IGNORECASE | re.DOTALL)
    if time_match:
        try:
            cooking_time = int(time_match.group(1))
        except ValueError:
            pass

    servings = 4
    serv_match = re.search(r'<div class="[^"]*vc_acf h3[^"]*">.*?(\d+).*?personen.*?</div>', html_text, re.IGNORECASE | re.DOTALL)
    if serv_match:
        try:
            servings = int(serv_match.group(1))
        except ValueError:
            pass

    tags = []
    for tag_match in re.finditer(r'<div class="[^"]*vc_acf recept-bullets[^"]*">(.*?)</div>', html_text, re.IGNORECASE | re.DOTALL):
        tag = clean_html_text(tag_match.group(1))
        if tag:
            tags.append(tag)

    if not ingredients and not instructions:
        return None

    return {
        "title": title or "Imported Recipe",
        "description": desc,
        "image": image,
        "source": url,
        "ingredients": ingredients,
        "instructions": instructions,
        "servings": servings,
        "cooking_time": cooking_time,
        "collections": [],
        "tags": tags
    }

def extract_recipe_from_text(text):
    text = text.strip()
    url = ""
    if text.startswith('http://') or text.startswith('https://'):
        url = text
        try:
            req = urllib.request.Request(text, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
            with urllib.request.urlopen(req) as response:
                text = response.read().decode('utf-8', errors='ignore')
        except Exception as e:
            print("Failed to fetch URL:", e)
            
    # Instagram posts have their own caption & poster extraction
    instagram_recipe = parse_instagram_post(text, url)
    if instagram_recipe:
        return sanitize_recipe(instagram_recipe)

    css_recipe = parse_generic_css_classes(text, url)
    if css_recipe:
        return sanitize_recipe(css_recipe)

    # Try LD+JSON first (works for 90% of blogs including miljuschka)
    ld_recipe = extract_ld_json_recipe(text, url)
    if ld_recipe:
        return sanitize_recipe(ld_recipe)
            
    if 'pinterest.com/pin' in url.lower() or 'pinterest.com/pin' in text.lower():
        return sanitize_recipe(parse_pinterest_pin(text, url))
    
    # Fallback to AH specific
    if "data-testid=\"header-title\"" in text or "typography_" in text or "allerhande" in text.lower():
        return sanitize_recipe(parse_ah_allerhande_html(text, url))
    # Try generic webpage parse for other blogs
    generic_recipe = parse_generic_webpage(text, url)
    if generic_recipe and (generic_recipe.get('ingredients') or generic_recipe.get('instructions') or generic_recipe.get('description') or generic_recipe.get('image')):
        return sanitize_recipe(generic_recipe)

    # Basic mock extraction
    lines = [l.strip() for l in text.split('\n') if l.strip()]
    if not lines:
        return {}
    
    title = lines[0]
    ingredients = []
    instructions = []
    
    parsing_mode = "desc"
    for line in lines[1:]:
        l_lower = line.lower()
        if "ingrediënt" in l_lower or "ingredient" in l_lower:
            parsing_mode = "ingredients"
            continue
        if "bereiding" in l_lower or "instruction" in l_lower or "stap" in l_lower or "step" in l_lower:
            parsing_mode = "instructions"
            continue
            
        if parsing_mode == "ingredients":
            if len(line) > 2:
                ing = parse_ingredient_line(line)
                ingredients.append(f"{ing['amount']} {ing['unit']} {ing['name']}".strip())
        elif parsing_mode == "instructions":
            if len(line) > 5:
                instructions.append(line)
                
    return sanitize_recipe({
        "title": title,
        "ingredients": ingredients,
        "instructions": instructions,
        "servings": 4,
        "cooking_time": 30,
        "collections": [],
        "tags": []
    }
    )