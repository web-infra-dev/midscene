## Troubleshooting model service connectivity issues

Midscene includes a built-in model verify command for troubleshooting model service connectivity issues and basic compatibility issues.

Put your model configuration in a `.env` file, then run the following model verify command to verify whether the current model configuration can support Midscene:

```bash
# If the current project has @midscene/cli installed, use the local midscene command
npx midscene model verify

# If the current project does not have @midscene/cli installed, or you want to use the latest version
npx @midscene/cli@latest model verify
```

The command reads the `.env` file in the current working directory. Dotenv debug logging is enabled by default, and values from `.env` override existing shell environment variables.

To isolate basic model service connectivity issues, you can also run the following minimal `curl` request.

```bash
MIDSCENE_MODEL_BASE_URL='replace with your baseUrl'
MIDSCENE_MODEL_API_KEY='replace with your API key'
MIDSCENE_MODEL_NAME='replace with your model name'

curl -X POST "${MIDSCENE_MODEL_BASE_URL%/}/chat/completions" \
  -H "Authorization: Bearer ${MIDSCENE_MODEL_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "'"${MIDSCENE_MODEL_NAME}"'",
  "messages": [
    {
      "role": "user",
      "content": "What is 1+1?"
    }
  ]
}'
```
