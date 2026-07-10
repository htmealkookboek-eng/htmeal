"""Search utilities for recipe discovery."""

import re


VEGETABLE_SEARCH_SYNONYMS = {
    'tomaat': ['tomaat', 'tomaten', 'tomato', 'tomatoes', 'toma'],
    'paprika': ['paprika', 'paprikaes', 'paprikas', 'bell pepper', 'bell peppers', 'sweet pepper', 'sweet peppers', 'pepper', 'peppers'],
    'courgette': ['courgette', 'courgettes', 'zucchini', 'zucchinis'],
    'komkommer': ['komkommer', 'komkommers', 'cucumber', 'cucumbers'],
    'aubergine': ['aubergine', 'aubergines', 'eggplant', 'eggplants'],
    'sperzieboon': ['sperzieboon', 'sperziebonen', 'green bean', 'green beans', 'string bean', 'string beans', 'snap bean', 'snap beans'],
    'snijboon': ['snijboon', 'snijbonen', 'runner bean', 'runner beans'],
    'boerenkool': ['boerenkool', 'kale'],
    'spruiten': ['spruiten', 'brussels sprout', 'brussels sprouts'],
    'asperge': ['asperge', 'asperges', 'asparagus'],
    'prei': ['prei', 'leek', 'leeks'],
    'witlof': ['witlof', 'chicory', 'endive', 'endives'],
    'pastinaak': ['pastinaak', 'parsnip', 'parsley root'],
    'maïs': ['maïs', 'mais', 'corn', 'maize']
}

class RecipeSearch:
    def __init__(self, recipes):
        self.recipes = recipes

    def _normalize(self, value):
        return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()

    def _search_terms(self, query):
        normalized = self._normalize(query)
        for canonical, synonyms in VEGETABLE_SEARCH_SYNONYMS.items():
            if normalized in {self._normalize(s) for s in synonyms}:
                return list(dict.fromkeys([canonical] + synonyms))
        return [normalized]

    def search(self, query):
        if not query:
            return self.recipes
        terms = self._search_terms(query)

        def recipe_matches(recipe):
            searchable_texts = [
                recipe.get("title", ""),
                recipe.get("description", ""),
                recipe.get("source", "")
            ]
            searchable_texts.extend([str(tag) for tag in recipe.get("tags", [])])
            searchable_texts.extend([str(ingredient) for ingredient in recipe.get("ingredients", [])])
            searchable = "\n".join(text.lower() for text in searchable_texts)
            return any(term in searchable for term in terms)

        return [recipe for recipe in self.recipes if recipe_matches(recipe)]
