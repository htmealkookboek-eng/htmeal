"""Ingredient utilities for tags and pantry matching."""


class IngredientIndex:
    def __init__(self, recipes):
        self.index = self._build_index(recipes)

    def _build_index(self, recipes):
        index = {}
        for recipe in recipes:
            for ingredient in recipe.get("ingredients", []):
                normalized = ingredient.strip().lower()
                index.setdefault(normalized, set()).add(recipe["title"])
        return index

    def recipes_for(self, ingredient_name):
        return sorted(self.index.get(ingredient_name.strip().lower(), []))

    def ingredient_summary(self, ingredient_name):
        recipes = self.recipes_for(ingredient_name)
        return {
            "ingredient": ingredient_name,
            "recipe_count": len(recipes),
            "recipes": recipes,
        }
