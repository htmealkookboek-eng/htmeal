"""Collection utilities for editorial recipe collections."""


class RecipeCollection:
    def __init__(self, recipes):
        self._collections = self._build_collections(recipes)

    def _build_collections(self, recipes):
        collections = {}
        for recipe in recipes:
            for collection_name in recipe.get("collections", []):
                collections.setdefault(collection_name, []).append(recipe)
        return collections

    def collection_names(self):
        return sorted(self._collections.keys())

    def recipes_for(self, collection_name):
        return self._collections.get(collection_name, [])
