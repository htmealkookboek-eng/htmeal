"""Shopping list and pantry utilities."""


class Pantry:
    def __init__(self, items=None):
        self.items = set(items or [])

    def has_item(self, ingredient):
        return ingredient.lower() in (item.lower() for item in self.items)

    def add_item(self, ingredient):
        self.items.add(ingredient)

    def remove_item(self, ingredient):
        self.items.discard(ingredient)


class ShoppingList:
    def __init__(self, items=None):
        self.items = items or []

    def add_item(self, item):
        self.items.append(item)

    def remove_item(self, item):
        self.items = [existing for existing in self.items if existing != item]
