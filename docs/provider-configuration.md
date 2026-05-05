# Provider Configuration

The Kivo image delegates provider bootstrap to the OpenClaw CLI during container startup.

## Runtime contract

The Helm chart only needs to pass:
- `MODEL_PROVIDER`
- `MODEL_ID`
- provider API key env (`OPENAI_API_KEY` or `GEMINI_API_KEY`)
- `OPENCLAW_GATEWAY_TOKEN`

The image entrypoint then runs:
- `openclaw setup --mode local --non-interactive --workspace ...`
- `openclaw onboard --non-interactive --auth-choice ... --secret-input-mode ref ...`
- `openclaw models set <provider/model>`

This keeps provider auth and model configuration aligned with native OpenClaw behavior instead of hand-authoring internal state files.

## Provider envs

- OpenAI: `OPENAI_API_KEY`
- Gemini: `GEMINI_API_KEY`

## Helm values example

```yaml
model:
  provider: gemini
  name: google/gemini-2.5-flash
  credentials:
    secretName: alice-gemini
    key: GEMINI_API_KEY
```
