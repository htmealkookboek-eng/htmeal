"""Gamification achievements system."""

ACHIEVEMENTS = {
    'account_created': {
        'id': 'account_created',
        'title': 'Welkom!',
        'description': 'Account gemaakt',
        'detail': 'Je bent erbij!',
        'icon': 'fas fa-user-plus',
        'rarity': 'common'
    },
    'first_recipe': {
        'id': 'first_recipe',
        'title': 'Eerste stap',
        'description': 'Je eerste recept opgeslagen',
        'detail': 'Congrats! Je hebt je eerste recept opgeslagen.',
        'icon': 'fas fa-user-chef',
        'rarity': 'common'
    },
    'recipe_lover': {
        'id': 'recipe_lover',
        'title': 'Receptenverzamelaar',
        'description': '5 recepten opgeslagen',
        'detail': 'Je hebt al 5 recepten verzameld! Je favoriete gerechten beginnen vorm te krijgen.',
        'icon': 'fas fa-book',
        'rarity': 'common'
    },
    'master_chef': {
        'id': 'master_chef',
        'title': 'Meesterkok',
        'description': '20 recepten opgeslagen',
        'detail': 'Wow! 20 recepten!',
        'icon': 'fas fa-hat-chef',
        'rarity': 'rare'
    },
    'cookbook_author': {
        'id': 'cookbook_author',
        'title': 'HTMeal-auteur',
        'description': '50 recepten opgeslagen',
        'detail': '50 recepten?',
        'icon': 'fas fa-book-open',
        'rarity': 'epic'
    },
    'legendary_collector': {
        'id': 'legendary_collector',
        'title': 'Legendarische verzamelaar',
        'description': '100 recepten opgeslagen',
        'detail': '100 recepten! Dit is absurd!',
        'icon': 'fas fa-trophy',
        'rarity': 'epic'
    },
    'world_journey_starter': {
        'id': 'world_journey_starter',
        'title': 'Wereldreis gestart',
        'description': 'Mijn wereldreis gemaakt',
        'detail': 'Je bent klaar om de wereld te ontdekken! Je eerste wereldreis is gemaakt.',
        'icon': 'fas fa-plane-departure',
        'rarity': 'common'
    },
    'three_continents': {
        'id': 'three_continents',
        'title': 'Continentenbezoekerder',
        'description': 'Recepten van 3 verschillende continenten',
        'detail': 'Je hebt al recepten van 3 continenten geprobeerd!',
        'icon': 'fas fa-earth-americas',
        'rarity': 'rare'
    },
    'full_continent': {
        'id': 'full_continent',
        'title': 'Continentmeester',
        'description': 'Alle landen van één continent bezocht',
        'detail': 'Ongelofelijk! Je hebt alle landen van een heel continent gekookt. Welkom, wereldburger!',
        'icon': 'fas fa-map',
        'rarity': 'epic'
    },
    'international_explorer': {
        'id': 'international_explorer',
        'title': 'Internationale verkenner',
        'description': 'Recepten van alle 6 continenten',
        'detail': 'Alle 6 continenten! Je bent een ware wereldreiziger.',
        'icon': 'fas fa-earth-europe',
        'rarity': 'epic'
    },
    'all_scandinavia': {
        'id': 'all_scandinavia',
        'title': 'Noors, Zweeds & Deens',
        'description': 'Recepten uit Noorwegen, Zweden en Denemarken',
        'detail': 'Scandinavië! Brrr, wat lekker!',
        'icon': 'fas fa-snowflake',
        'rarity': 'rare'
    },
    'letter_a_countries': {
        'id': 'letter_a_countries',
        'title': 'A-landverzamelaar',
        'description': 'Landen met letter A: Afghanistan, Argentinië, Australië, Algerije, Armenië',
        'detail': 'Je bent A-mazing! Je hebt alle landen die met A beginnen verzameld!',
        'icon': 'fas fa-award',
        'rarity': 'epic'
    },
    'disputed_territories': {
        'id': 'disputed_territories',
        'title': 'Geschikte grondgebieden',
        'description': '3 recepten uit betwiste gebieden',
        'detail': 'Je hebt 3 recepten uit betwiste gebieden geprobeerd.',
        'icon': 'fas fa-shield',
        'rarity': 'epic'
    },
    'favorite_lover': {
        'id': 'favorite_lover',
        'title': 'Favoritenfan',
        'description': '5 recepten als favoriet gemarkeerd',
        'detail': 'Je eerste 5 favorieten! Je weet duidelijk wat je lekker vindt.',
        'icon': 'fas fa-star',
        'rarity': 'common'
    },
    'favorite_collector': {
        'id': 'favorite_collector',
        'title': 'Favorieten verzamelaar',
        'description': '20 recepten als favoriet gemarkeerd',
        'detail': '20 favorieten!',
        'icon': 'fas fa-wand-magic-sparkles',
        'rarity': 'rare'
    },
    'collection_creator': {
        'id': 'collection_creator',
        'title': 'Collectie-maker',
        'description': 'Eerste collectie aangemaakt',
        'detail': 'Je eerste collectie! Je bent aan het organiseren. Dit ziet er netjes uit!',
        'icon': 'fas fa-palette',
        'rarity': 'common'
    },
    'collection_master': {
        'id': 'collection_master',
        'title': 'Collectie-meester',
        'description': '3 collecties aangemaakt',
        'detail': 'Drie collecties! Je bent echt aan het organiseren.',
        'icon': 'fas fa-image',
        'rarity': 'rare'
    },
    'cookbook_legacy': {
        'id': 'cookbook_legacy',
        'title': 'HTMeal erfenis',
        'description': 'Collectie met 20+ recepten',
        'detail': 'Een collectie met 20+ recepten!',
        'icon': 'fas fa-crown',
        'rarity': 'epic'
    },
    'cooking_mode_explorer': {
        'id': 'cooking_mode_explorer',
        'title': 'Kookmodus ontdekker',
        'description': 'Kookmodus gebruikt',
        'detail': 'Je hebt de kookmodus ontdekt!',
        'icon': 'fas fa-frying-pan',
        'rarity': 'common'
    },
    'cooking_streak': {
        'id': 'cooking_streak',
        'title': 'Kookstreak',
        'description': '5 verschillende recepten gekookt',
        'detail': '5 recepten gekookt! Je bent in een ritme!',
        'icon': 'fas fa-fire',
        'rarity': 'rare'
    },
    'speed_chef': {
        'id': 'speed_chef',
        'title': 'Snelle chef',
        'description': 'Recept gekookt in minder dan 15 minuten',
        'detail': 'Klaar in 15 minuten!',
        'icon': 'fas fa-bolt',
        'rarity': 'common'
    },
    'bulk_meal_prep': {
        'id': 'bulk_meal_prep',
        'title': 'Bulkvoorbereiding',
        'description': 'Recept voor 20+ personen gekookt',
        'detail': 'Dit is professioneel niveau! Je bent een ware catering-chef!',
        'icon': 'fas fa-pot-cooking',
        'rarity': 'rare'
    },
    'party_host': {
        'id': 'party_host',
        'title': 'Feestorganisator',
        'description': 'Recept voor 8+ personen gekookt',
        'detail': 'Een feest voor 8+? Je bent klaar voor de keuken!',
        'icon': 'fas fa-champagne-glasses',
        'rarity': 'rare'
    },
    'precision_master': {
        'id': 'precision_master',
        'title': 'Precisie-meester',
        'description': 'Recepten met 5 sterren beoordeeld',
        'detail': 'Je recepten verdienen 5 sterren! Dit zijn echt meesterwerken!',
        'icon': 'fas fa-bullseye',
        'rarity': 'rare'
    },
    'recipe_archive': {
        'id': 'recipe_archive',
        'title': 'Receptarchief',
        'description': '10 recepten favoriet gemarkeerd',
        'detail': '10 favorieten in je archief!!',
        'icon': 'fas fa-archive',
        'rarity': 'common'
    },
    'taste_tester': {
        'id': 'taste_tester',
        'title': 'Smaaktest meester',
        'description': '30 verschillende recepten beoordeeld',
        'detail': 'Je hebt 30 recepten getest!',
        'icon': 'fas fa-wine-glass',
        'rarity': 'epic'
    },
    'master_collection': {
        'id': 'master_collection',
        'title': 'Meester collectie',
        'description': 'Collectie met 10 recepten',
        'detail': 'Een collectie met 10 recepten!',
        'icon': 'fas fa-layer-group',
        'rarity': 'rare'
    },
    'notes_collector': {
        'id': 'notes_collector',
        'title': 'Notitiemaker',
        'description': '5 notities toegevoegd aan recepten',
        'detail': '5 persoonlijke notities!',
        'icon': 'fas fa-note-sticky',
        'rarity': 'common'
    },
    'notes_master': {
        'id': 'notes_master',
        'title': 'Notitie-meester',
        'description': '20 notities toegevoegd',
        'detail': '20 notities! Je bent echt alle recepten aan het personaliseren!',
        'icon': 'fas fa-file-lines',
        'rarity': 'rare'
    },
    'kitchen_scientist': {
        'id': 'kitchen_scientist',
        'title': 'Keuken wetenschapper',
        'description': '50 notities toegevoegd',
        'detail': '50 notities!',
        'icon': 'fas fa-flask',
        'rarity': 'epic'
    },
    'minimalist': {
        'id': 'minimalist',
        'title': 'Minimalist',
        'description': 'Recept met 3 ingrediënten of minder',
        'detail': 'Minder is meer!',
        'icon': 'fas fa-minimize',
        'rarity': 'common'
    },
    'midnight_cook': {
        'id': 'midnight_cook',
        'title': 'Nacht kok',
        'description': 'Recept gekookt na middernacht',
        'detail': 'Koken na middernacht? Je bent een echte nachtelijke chefkok! Slaap schort je niet af!',
        'icon': 'fas fa-moon',
        'rarity': 'rare'
    },
    'eco_warrior': {
        'id': 'eco_warrior',
        'title': 'Eco strijder',
        'description': 'Lokale ingrediënten gebruikt',
        'detail': 'Je bent milieubewust! Door lokale ingrediënten te gebruiken, help je de planeet. Dit is echt prachtig!',
        'icon': 'fas fa-leaf',
        'rarity': 'rare'
    },
    'social_foodie': {
        'id': 'social_foodie',
        'title': 'Sociale foodies',
        'description': 'Recepten of collecties gedeeld',
        'detail': 'Je hebt een recept gedeeld!',
        'icon': 'fas fa-share',
        'rarity': 'common'
    },
    'dietitian': {
        'id': 'dietitian',
        'title': 'Diëtetist',
        'description': 'Recepten met gezonde ingrediënten',
        'detail': 'Gezond eten hoeft niet saai te zijn!',
        'icon': 'fas fa-apple',
        'rarity': 'common'
    },
    'ten_recipes': {
        'id': 'ten_recipes',
        'title': 'Tien Gerechten',
        'description': '10 recepten opgeslagen',
        'detail': 'Tien recepten!',
        'icon': 'fas fa-thumbs-up',
        'rarity': 'common'
    },
    'perfect_pantry': {
        'id': 'perfect_pantry',
        'title': 'Perfecte Voorraadkast',
        'description': '100 favorieten gemarkeerd',
        'detail': 'Honderd favorieten!!!!',
        'icon': 'fas fa-heart',
        'rarity': 'epic'
    },
    'ultimate_traveler': {
        'id': 'ultimate_traveler',
        'title': 'Ultieme Reiziger',
        'description': '50 landen in wereldreis',
        'detail': 'Vijftig landen gekookt!',
        'icon': 'fas fa-suitcase',
        'rarity': 'epic'
    },
    'global_palate': {
        'id': 'global_palate',
        'title': 'Mondiale Smaak',
        'description': 'Recepten van alle zes continenten',
        'detail': 'Van Afrika tot in Amerika.',
        'icon': 'fas fa-globe',
        'rarity': 'epic'
    },
    'kitchen_wizard': {
        'id': 'kitchen_wizard',
        'title': 'Keukentovenaar',
        'description': 'Kookmodus 100 keer gebruikt',
        'detail': 'Honderd keer in de keuken met volledige focus!',
        'icon': 'fas fa-wand-magic-sparkles',
        'rarity': 'epic'
    },
    'seven_day_streak': {
        'id': 'seven_day_streak',
        'title': 'Weekstrijd',
        'description': '7 dagen achtereen kookmodus gebruikt',
        'detail': 'Een hele week lang elke dag gekookt! Je bent echt committed aan het keukengebeuren!',
        'icon': 'fas fa-fire',
        'rarity': 'epic'
    },
    'ingredient_diversity': {
        'id': 'ingredient_diversity',
        'title': 'Ingrediëntmeester',
        'description': '50+ unieke ingrediënten gebruikt',
        'detail': 'Vijftig verschillende ingrediënten! Je bent een echte ingrediëntenkenner. Wat een variatie!',
        'icon': 'fas fa-leaf',
        'rarity': 'epic'
    },
    'cuisine_explorer': {
        'id': 'cuisine_explorer',
        'title': 'Culinaire wereldtrekker',
        'description': 'Recepten van 10+ verschillende cuisines',
        'detail': 'Tien verschillende keukens! Je smaakpapillen hebben echt alles geproefd!',
        'icon': 'fas fa-utensils',
        'rarity': 'epic'
    },
    'speed_cook_challenge': {
        'id': 'speed_cook_challenge',
        'title': 'Snelkookkampioen',
        'description': '5 recepten onder de 15 minuten',
        'detail': 'Vijf blixemsnelle gerechten! Je bent een echte snelkook-expert. Soep is klaar!',
        'icon': 'fas fa-flash',
        'rarity': 'rare'
    },
    'weekend_warrior': {
        'id': 'weekend_warrior',
        'title': 'Weekend!',
        'description': 'Kookmodus gebruikt in het weekend!',
        'detail': 'Weekend chef!',
        'icon': 'fas fa-sun',
        'rarity': 'rare'
    },
    'rating_enthusiast': {
        'id': 'rating_enthusiast',
        'title': 'Recensent',
        'description': '25+ recepten beoordeeld',
        'detail': 'Vijfentwintig recepten beoordeeld!',
        'icon': 'fas fa-star',
        'rarity': 'common'
    },
    'comprehensive_kitchen': {
        'id': 'comprehensive_kitchen',
        'title': 'Documentatiemeester',
        'description': '10+ recepten met gedetailleerde notities',
        'detail': 'Tien recepten met aantekeningen!',
        'icon': 'fas fa-book',
        'rarity': 'rare'
    },
    'tag_master': {
        'id': 'tag_master',
        'title': 'LABELS',
        'description': '15+ verschillende tags gebruikt',
        'detail': 'Vijftien labels!',
        'icon': 'fas fa-tags',
        'rarity': 'rare'
    },
    'quick_breakfast': {
        'id': 'quick_breakfast',
        'title': 'Ontbijtkampioen',
        'description': '3+ ontbijt-recepten onder 10 minuten',
        'detail': 'Drie snelle ontbijtjes!',
        'icon': 'fas fa-mug-hot',
        'rarity': 'common'
    },
    'slow_cook_master': {
        'id': 'slow_cook_master',
        'title': 'Slow-cook meester',
        'description': '5+ recepten die 60+ minuten duren',
        'detail': 'Geduld is een deugd.',
        'icon': 'fas fa-hourglass-end',
        'rarity': 'rare'
    }
}

def get_achievement_by_id(achievement_id):
    """Get achievement details by ID."""
    return ACHIEVEMENTS.get(achievement_id, None)

def check_and_award_achievements(user_data, action, data=None):
    """
    Check if user qualifies for achievements based on action.
    Returns list of newly awarded achievement IDs.
    """
    if 'achievements' not in user_data:
        user_data['achievements'] = {}
    if 'stats' not in user_data:
        user_data['stats'] = {
            'recipes_created': 0,
            'favorites_count': 0,
            'collections_count': 0,
            'cooking_sessions': 0,
            'notes_count': 0
        }
    
    awarded = []
    
    # Account created achievement (awarded on first login/registration)
    if 'account_created' not in user_data['achievements'] and action == 'account_created':
        user_data['achievements']['account_created'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
        awarded.append('account_created')
    
    # Recipe-related achievements
    if action == 'recipe_created':
        user_data['stats']['recipes_created'] = user_data['stats'].get('recipes_created', 0) + 1
        count = user_data['stats']['recipes_created']
        
        if count == 1 and 'first_recipe' not in user_data['achievements']:
            user_data['achievements']['first_recipe'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('first_recipe')
        elif count == 5 and 'recipe_lover' not in user_data['achievements']:
            user_data['achievements']['recipe_lover'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('recipe_lover')
        elif count == 10 and 'ten_recipes' not in user_data['achievements']:
            user_data['achievements']['ten_recipes'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('ten_recipes')
        elif count == 20 and 'master_chef' not in user_data['achievements']:
            user_data['achievements']['master_chef'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('master_chef')
        elif count == 50 and 'cookbook_author' not in user_data['achievements']:
            user_data['achievements']['cookbook_author'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('cookbook_author')
    
    # Favorite achievements
    if action == 'recipe_favorited':
        user_data['stats']['favorites_count'] = user_data['stats'].get('favorites_count', 0) + 1
        count = user_data['stats']['favorites_count']
        
        if count == 5 and 'favorite_lover' not in user_data['achievements']:
            user_data['achievements']['favorite_lover'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('favorite_lover')
        elif count == 20 and 'favorite_collector' not in user_data['achievements']:
            user_data['achievements']['favorite_collector'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('favorite_collector')
        elif count == 100 and 'perfect_pantry' not in user_data['achievements']:
            user_data['achievements']['perfect_pantry'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('perfect_pantry')
    
    # Collection achievements
    if action == 'collection_created':
        user_data['stats']['collections_count'] = user_data['stats'].get('collections_count', 0) + 1
        count = user_data['stats']['collections_count']
        
        if count == 1 and 'collection_creator' not in user_data['achievements']:
            user_data['achievements']['collection_creator'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('collection_creator')
        elif count == 3 and 'collection_master' not in user_data['achievements']:
            user_data['achievements']['collection_master'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('collection_master')
    
    # Cooking mode achievements
    if action == 'cooking_session_started':
        user_data['stats']['cooking_sessions'] = user_data['stats'].get('cooking_sessions', 0) + 1
        
        if user_data['stats']['cooking_sessions'] == 1 and 'cooking_mode_explorer' not in user_data['achievements']:
            user_data['achievements']['cooking_mode_explorer'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('cooking_mode_explorer')
        elif user_data['stats']['cooking_sessions'] == 5 and 'cooking_streak' not in user_data['achievements']:
            user_data['achievements']['cooking_streak'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('cooking_streak')
        elif user_data['stats']['cooking_sessions'] == 7 and 'seven_day_streak' not in user_data['achievements']:
            user_data['achievements']['seven_day_streak'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('seven_day_streak')
        elif user_data['stats']['cooking_sessions'] == 100 and 'kitchen_wizard' not in user_data['achievements']:
            user_data['achievements']['kitchen_wizard'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('kitchen_wizard')
    
    # Cooking time achievements
    if action == 'recipe_cooking_time' and data:
        cooking_time = data.get('cooking_time', 999)
        if cooking_time < 15 and 'speed_chef' not in user_data['achievements']:
            user_data['achievements']['speed_chef'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('speed_chef')
    
    # Servings achievements
    if action == 'recipe_servings' and data:
        servings = data.get('servings', 0)
        if servings >= 8 and 'party_host' not in user_data['achievements']:
            user_data['achievements']['party_host'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('party_host')
        if servings >= 20 and 'bulk_meal_prep' not in user_data['achievements']:
            user_data['achievements']['bulk_meal_prep'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('bulk_meal_prep')
    
    # Notes achievements
    if action == 'note_added':
        user_data['stats']['notes_count'] = user_data['stats'].get('notes_count', 0) + 1
        count = user_data['stats']['notes_count']
        
        if count == 5 and 'notes_collector' not in user_data['achievements']:
            user_data['achievements']['notes_collector'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('notes_collector')
        elif count == 20 and 'notes_master' not in user_data['achievements']:
            user_data['achievements']['notes_master'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('notes_master')
        elif count == 50 and 'kitchen_scientist' not in user_data['achievements']:
            user_data['achievements']['kitchen_scientist'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('kitchen_scientist')
    
    # World journey achievement
    if action == 'world_journey_created' and 'world_journey_starter' not in user_data['achievements']:
        user_data['achievements']['world_journey_starter'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
        awarded.append('world_journey_starter')
    
    # Ultimate traveler achievement
    if action == 'world_journey_entry' and data:
        user_data['stats']['world_journey_count'] = user_data['stats'].get('world_journey_count', 0) + 1
        if user_data['stats']['world_journey_count'] == 50 and 'ultimate_traveler' not in user_data['achievements']:
            user_data['achievements']['ultimate_traveler'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('ultimate_traveler')
    
    # Minimalist achievement (recipes with ≤3 ingredients)
    if action == 'recipe_ingredients' and data:
        ingredient_count = data.get('ingredient_count', 0)
        if ingredient_count <= 3 and 'minimalist' not in user_data['achievements']:
            user_data['achievements']['minimalist'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('minimalist')
    
    # Midnight cook achievement (random, can be triggered by any recipe during late hours)
    if action == 'midnight_cook' and 'midnight_cook' not in user_data['achievements']:
        user_data['achievements']['midnight_cook'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
        awarded.append('midnight_cook')
    
    # Eco warrior achievement (can be triggered for eco-conscious cooking)
    if action == 'eco_cook' and 'eco_warrior' not in user_data['achievements']:
        user_data['achievements']['eco_warrior'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
        awarded.append('eco_warrior')
    
    # Dietitian achievement (can be triggered for healthy recipes)
    if action == 'healthy_recipe' and 'dietitian' not in user_data['achievements']:
        user_data['achievements']['dietitian'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
        awarded.append('dietitian')
    
    # Ingredient diversity achievement (50+ unique ingredients)
    if action == 'recipe_ingredients' and data:
        unique_ingredients = data.get('unique_ingredients', 0)
        if unique_ingredients >= 50 and 'ingredient_diversity' not in user_data['achievements']:
            user_data['achievements']['ingredient_diversity'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('ingredient_diversity')
    
    # Cuisine explorer achievement (10+ different cuisines)
    if action == 'recipe_cuisines' and data:
        cuisine_count = data.get('cuisine_count', 0)
        if cuisine_count >= 10 and 'cuisine_explorer' not in user_data['achievements']:
            user_data['achievements']['cuisine_explorer'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('cuisine_explorer')
    
    # Speed cook challenge (5 recipes under 15 minutes)
    if action == 'recipe_speed_cook' and data:
        speed_cook_count = data.get('speed_cook_count', 0)
        if speed_cook_count >= 5 and 'speed_cook_challenge' not in user_data['achievements']:
            user_data['achievements']['speed_cook_challenge'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('speed_cook_challenge')
    
    # Weekend warrior achievement (cook on 4+ weekends)
    if action == 'weekend_cooking' and 'weekend_warrior' not in user_data['achievements']:
        user_data['stats']['weekend_cooking_count'] = user_data['stats'].get('weekend_cooking_count', 0) + 1
        if user_data['stats']['weekend_cooking_count'] >= 4:
            user_data['achievements']['weekend_warrior'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('weekend_warrior')
    
    # Rating enthusiast (25+ recipes rated)
    if action == 'recipe_rated':
        user_data['stats']['recipes_rated'] = user_data['stats'].get('recipes_rated', 0) + 1
        if user_data['stats']['recipes_rated'] >= 25 and 'rating_enthusiast' not in user_data['achievements']:
            user_data['achievements']['rating_enthusiast'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('rating_enthusiast')
    
    # Comprehensive kitchen (10+ recipes with notes)
    if action == 'note_added':
        user_data['stats']['recipes_with_notes'] = user_data['stats'].get('recipes_with_notes', 0) + 1
        if user_data['stats']['recipes_with_notes'] >= 10 and 'comprehensive_kitchen' not in user_data['achievements']:
            user_data['achievements']['comprehensive_kitchen'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('comprehensive_kitchen')
    
    # Tag master (15+ different tags used)
    if action == 'recipe_tags' and data:
        tag_count = data.get('unique_tag_count', 0)
        if tag_count >= 15 and 'tag_master' not in user_data['achievements']:
            user_data['achievements']['tag_master'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('tag_master')
    
    # Quick breakfast (3+ breakfast recipes under 10 minutes)
    if action == 'quick_breakfast' and data:
        quick_breakfast_count = data.get('quick_breakfast_count', 0)
        if quick_breakfast_count >= 3 and 'quick_breakfast' not in user_data['achievements']:
            user_data['achievements']['quick_breakfast'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('quick_breakfast')
    
    # Slow cook master (5+ recipes over 60 minutes)
    if action == 'slow_cook' and data:
        slow_cook_count = data.get('slow_cook_count', 0)
        if slow_cook_count >= 5 and 'slow_cook_master' not in user_data['achievements']:
            user_data['achievements']['slow_cook_master'] = {'earned_at': __import__('datetime').datetime.now().isoformat()}
            awarded.append('slow_cook_master')
    
    return awarded

def get_user_achievements(user_data):
    """Get all achievements for a user with details."""
    if 'achievements' not in user_data:
        user_data['achievements'] = {}
    
    result = []
    for achievement_id in user_data['achievements']:
        achievement = get_achievement_by_id(achievement_id)
        if achievement:
            earned = user_data['achievements'][achievement_id]
            result.append({
                **achievement,
                'earned_at': earned.get('earned_at'),
                'earned': True
            })
    
    return sorted(result, key=lambda x: x.get('earned_at', ''), reverse=True)

def get_all_achievements(user_data):
    """Get all possible achievements with earned status."""
    if 'achievements' not in user_data:
        user_data['achievements'] = {}
    
    earned_ids = set(user_data['achievements'].keys())
    result = []
    
    for achievement_id, achievement in ACHIEVEMENTS.items():
        earned = achievement_id in earned_ids
        earned_at = user_data['achievements'].get(achievement_id, {}).get('earned_at') if earned else None
        result.append({
            **achievement,
            'earned_at': earned_at,
            'earned': earned
        })
    
    # Sort: earned first (by date), then unearned
    earned_list = [a for a in result if a['earned']]
    unearned_list = [a for a in result if not a['earned']]
    earned_list.sort(key=lambda x: x.get('earned_at', ''), reverse=True)
    
    return earned_list + unearned_list

def get_user_stats(user_data):
    """Get user statistics."""
    if 'stats' not in user_data:
        user_data['stats'] = {
            'recipes_created': 0,
            'favorites_count': 0,
            'collections_count': 0,
            'cooking_sessions': 0,
            'notes_count': 0
        }
    return user_data['stats']
