# 模型 Logo 来源

这些文件只用于内部定位测评报告展示。使用时仍需遵守各品牌自己的商标和品牌使用规则。

| 文件 | 来源 |
| --- | --- |
| `doubao.png` | 用户提供的豆包 logo 本地文件：`/Users/zzy/Downloads/doubao.png` |
| `deepseek.svg` | DeepSeek 官方 GitHub 仓库：`https://github.com/deepseek-ai/DeepSeek-VL/blob/main/images/logo.svg`；报告图标保留原 SVG 左侧鲸鱼标识。 |
| `gemini.svg` | Gemini 官网：`https://gemini.google.com/` 页面引用的 `https://www.gstatic.com/lamda/images/gemini_sparkle_aurora_33f86dc0c0257da337c63.svg` |
| `kimi.png` | Kimi 官方静态资源：`https://statics.moonshot.cn/kimi-web-seo/assets/kimi-logo-CegIMkbU.png` |
| `minimax.png` | MiniMax 官网：`https://www.minimaxi.com/` 页面声明的 `og:image`：`https://filecdn.minimax.chat/public/58eca777-e31f-448a-9823-e2220e49b426.png` |
| `nvidia.png` | NVIDIA Blog 作者页：`https://blogs.nvidia.com/blog/author/nvidianewsroom/` 页面引用的 `https://blogs.nvidia.com/wp-content/uploads/2025/03/cropped-cropped-nvidia-logo-vert-rgb-blk-for-screen.png` |
| `openai.svg` | OpenAI 官方品牌页：`https://openai.com/brand/` 返回页面中的 OpenAI logo SVG |
| `qwen.svg` | Qwen 官网：`https://qwen.ai/` 页面声明的 `og:image`：`https://img.alicdn.com/imgextra/i1/O1CN013ltlI61OTOnTStXfj_!!6000000001706-55-tps-330-327.svg` |
| `stepfun.png` | 阶跃星辰官方宽版中文 logo：`https://mintcdn.com/stepfun/bQqj0mPZbQmnFN-G/images/brand/stepfun-logo-zh-wide-light.svg`；报告图标裁取左侧方形标识。 |
| `xiaomi.png` | 小米 2021 logo：`https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Xiaomi_logo_%282021-%29.svg/1280px-Xiaomi_logo_%282021-%29.svg.png` |
| `zhipu.svg` | Z.ai 官网：`https://z.ai/` 页面引用的 `https://z-cdn.chatglm.cn/z-ai/static/logo.svg` |

`logo-manifest.ts` 会在构建 report template 时自动扫描这个目录，并按仓库相对路径生成 logo 映射。Report template 的 Rsbuild 配置会把 100KB 以内的图片和 SVG 内联进单文件 HTML 报告。
