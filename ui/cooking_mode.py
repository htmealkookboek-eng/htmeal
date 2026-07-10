"""UI components for distraction-free cooking mode."""


class CookingMode:
    def __init__(self, recipe):
        self.recipe = recipe

    def render_step(self, step_index):
        steps = self.recipe.get("instructions", [])
        if step_index < 0 or step_index >= len(steps):
            return None
        return {
            "step": step_index + 1,
            "text": steps[step_index],
            "total_steps": len(steps),
        }
