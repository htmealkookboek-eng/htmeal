"""UI components for toolbar and search controls."""


class Toolbar:
    def __init__(self, search_query=""):
        self.search_query = search_query

    def render(self):
        return {
            "search_query": self.search_query,
            "placeholder": "Search recipes, ingredients, season, mood...",
        }
