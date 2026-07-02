import time


class Budget:
    def __init__(self, max_steps=4, max_tool_calls=4, timeout_ms=60000):
        self.max_steps = int(max_steps or 4)
        self.max_tool_calls = int(max_tool_calls or 4)
        self.step_timeout_ms = int(timeout_ms or 60000)
        self.timeout_ms = self.step_timeout_ms * max(1, self.max_steps) + 15000 * max(0, self.max_tool_calls)
        self.started = time.time()
        self.tool_calls = 0

    def elapsed_ms(self):
        return int((time.time() - self.started) * 1000)

    def step_allowed(self, step):
        return step < self.max_steps

    def tool_allowed(self):
        return self.tool_calls < self.max_tool_calls and self.elapsed_ms() <= self.timeout_ms

    def count_tool(self):
        self.tool_calls += 1

    def as_dict(self):
        return {"steps": self.max_steps, "toolCalls": self.tool_calls, "ms": self.elapsed_ms()}
