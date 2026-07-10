"""Filter utilities for recipe browsing."""


class RecipeFilters:
    def __init__(self, recipes):
        self.recipes = recipes

    def by_collection(self, collection_name):
        return [recipe for recipe in self.recipes if collection_name in recipe.get("collections", [])]

    def by_cuisine(self, cuisine_name):
        return [recipe for recipe in self.recipes if recipe.get("cuisine") == cuisine_name]

    def by_difficulty(self, difficulty):
        return [recipe for recipe in self.recipes if recipe.get("difficulty") == difficulty]
