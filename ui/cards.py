"""UI components for recipe cards and layout."""


class RecipeCardGrid:
    def __init__(self, recipes):
        self.recipes = recipes

    def render(self):
        return [RecipeCard(recipe).render() for recipe in self.recipes]


class RecipeCard:
    def __init__(self, recipe):
        self.recipe = recipe

    def render(self):
        return {
            "title": self.recipe.get("title"),
            "image": self.recipe.get("image"),
            "cooking_time": self.recipe.get("cooking_time"),
            "difficulty": self.recipe.get("difficulty"),
            "cuisine": self.recipe.get("cuisine"),
            "collections": self.recipe.get("collections", []),
            "rating": self.recipe.get("rating"),
        }
