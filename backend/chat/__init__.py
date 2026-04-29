"""Chat package. Import submodules directly to avoid eager loading.

Eager re-export of ChatManager would force RAG/qdrant/LangChain imports on any
`import chat.foo`, which makes lighter submodules (e.g. `chat.tool_dispatch`)
hard to load in tests or scripts that don't need the full stack.
"""
