"""UI components for modals and overlays."""


class Modal:
    def __init__(self, title, content):
        self.title = title
        self.content = content

    def render(self):
        return {
            "title": self.title,
            "content": self.content,
        }
