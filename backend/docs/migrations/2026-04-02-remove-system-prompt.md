## Remove `system_prompt` from `bot_config`

Date: `2026-04-02`

Purpose: remove the legacy `system_prompt` field from MongoDB after deleting it from the application code. The real runtime prompt remains driven by `BASE_PROMPT_TEMPLATE`, `BOT_PERSONALITY`, and `ui_prompt_extra`.

Mongo migration:

```javascript
db.bot_config.updateMany({}, {$unset: {system_prompt: ""}})
```

Expected result:

- All documents in `bot_config` no longer contain `system_prompt`.
- No runtime behavior changes for the LLM prompt path.
