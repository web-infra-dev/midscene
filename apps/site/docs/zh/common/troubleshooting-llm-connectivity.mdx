## 模型服务连接问题排查

Midscene 内置了一个模型验证命令，用于排查模型服务的连通性问题和基础的兼容性问题。

将你的模型配置放在 `.env` 文件中，然后运行下面的模型验证命令，验证当前模型配置是否能支撑 Midscene 正常运行：

```bash
# 如果当前项目已安装 @midscene/cli，可以使用本地的 midscene 命令
npx midscene model verify

# 如果当前项目未安装 @midscene/cli，或想要使用最新版
npx @midscene/cli@latest model verify
```

这个命令会读取当前工作目录下的 `.env` 文件，同时打开 Dotenv 的 debug 日志，且 `.env` 中的变量会覆盖已有的 shell 环境变量。

为了单独排查模型服务的基础连接性问题，你也可以直接运行下面这段最小化的 `curl` 请求。

```bash
MIDSCENE_MODEL_BASE_URL='替换为你的 baseUrl'
MIDSCENE_MODEL_API_KEY='替换为你的 API Key'
MIDSCENE_MODEL_NAME='替换为你的 model name'

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
