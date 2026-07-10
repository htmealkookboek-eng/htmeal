"""UI components for navigation and collections."""


class Sidebar:
    def __init__(self, collections, tags):
        self.collections = collections
        self.tags = tags

    def render(self):
        return {
            "collections": self.collections,
            "tags": self.tags,
        }
